"""room_state.node_metrics 归档逻辑。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.agent_activity import aggregate_node_activity_tokens, aggregate_room_activity_tokens
from synapse.rd_meeting.dev_status import load_dev_status, save_dev_status
from synapse.rd_meeting.paths import agent_node_dir
from synapse.rd_meeting.room_runtime import (
    DEFAULT_NODE_TOKEN_BUDGET,
    DEFAULT_TOKEN_BUDGET,
    compute_node_metrics_seconds,
    compute_room_token_budget,
    compute_stage_elapsed_seconds,
    build_meeting_summary_nodes,
    default_room_state,
    ensure_metrics_token_budget,
    finalize_node_metrics,
    freeze_node_carry_tokens,
    load_room_state,
    refresh_node_metrics,
    reset_node_metrics_for_rerun,
    resolve_node_seconds,
    resolve_node_token_budget,
    save_room_state,
    sum_node_metrics_tokens,
    sync_metrics_tokens_from_node_metrics,
)


def _write_activity(scope: str, node_id: str, profile_id: str, rows: list[dict]) -> None:
    path = agent_node_dir(scope, profile_id, node_id) / "activity.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows),
        encoding="utf-8",
    )


@pytest.fixture(autouse=True)
def _isolate_work(monkeypatch, tmp_path):
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")


def test_compute_stage_elapsed_seconds_wall_clock() -> None:
    assert (
        compute_stage_elapsed_seconds("2026-06-05T10:00:00", end_at="2026-06-05T10:05:30") == 330
    )


def test_compute_node_metrics_seconds_wall_clock() -> None:
    assert (
        compute_node_metrics_seconds("2026-06-05T10:00:00", "2026-06-05T10:05:30") == 330
    )


def test_resolve_node_seconds_from_timestamps_not_stored_seconds() -> None:
    """展示耗时只认 completed_at − started_at，忽略 node_metrics.seconds 占位。"""
    nm_completed = {
        "started_at": "2026-06-05T10:00:00",
        "completed_at": "2026-06-05T10:02:00",
        "seconds": 9999,
    }
    assert resolve_node_seconds(nm_completed) == 120

    nm_processing = {
        "started_at": "2026-06-05T10:00:00",
        "seconds": 9999,
    }
    assert resolve_node_seconds(nm_processing, node_status="processing") == compute_stage_elapsed_seconds(
        "2026-06-05T10:00:00"
    )


def test_build_meeting_summary_nodes_deal_seconds_from_timestamps() -> None:
    scope_id = "nm_summary_seconds"
    node_id = "boundary"
    rs = default_room_state(
        room_id="room-sec",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id=node_id,
    )
    rs["node_metrics"] = {
        node_id: {
            "started_at": "2026-06-05T10:00:00",
            "completed_at": "2026-06-05T10:03:30",
            "seconds": 60,
            "tokens": 100,
        }
    }
    nodes = build_meeting_summary_nodes(None, rs, scope_id=scope_id)
    boundary = next(n for n in nodes if n["node_id"] == node_id)
    assert boundary["metrics"]["deal_seconds"] == 210


def test_finalize_node_metrics_activity_tokens_and_completed_at() -> None:
    scope_id = "nm_archive_01"
    node_id = "boundary"

    _write_activity(
        scope_id,
        node_id,
        "default",
        [{"seq": 1, "ts": "2026-06-05T10:01:00", "category": "llm_usage", "total_tokens": 1200}],
    )
    _write_activity(
        scope_id,
        node_id,
        "worker-a",
        [{"seq": 1, "ts": "2026-06-05T10:01:30", "category": "llm_usage", "total_tokens": 800}],
    )

    assert aggregate_node_activity_tokens(scope_id, node_id) == 2000

    room_state = default_room_state(
        room_id="room-nm",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id=node_id,
    )
    room_state["node_metrics"] = {
        node_id: {"started_at": "2026-06-05T10:00:00", "seconds": 0, "tokens": 0},
    }

    entry = finalize_node_metrics(
        room_state,
        scope_id=scope_id,
        node_id=node_id,
        completed_at="2026-06-05T10:02:00",
    )
    assert entry["completed_at"] == "2026-06-05T10:02:00"
    assert entry["seconds"] == 120
    assert entry["tokens"] == 2000
    assert room_state["node_metrics"][node_id]["tokens"] == 2000


def test_aggregate_room_activity_tokens_sums_all_nodes() -> None:
    scope_id = "nm_room_total"
    _write_activity(
        scope_id,
        "boundary",
        "default",
        [{"seq": 1, "ts": "2026-06-05T10:01:00", "category": "llm_usage", "total_tokens": 1200}],
    )
    _write_activity(
        scope_id,
        "req_clarify",
        "default",
        [{"seq": 1, "ts": "2026-06-05T10:02:00", "category": "llm_usage", "total_tokens": 800}],
    )
    assert aggregate_room_activity_tokens(scope_id) == 2000


def test_refresh_node_metrics_writes_node_tokens() -> None:
    scope_id = "nm_refresh_01"
    node_id = "boundary"
    _write_activity(
        scope_id,
        node_id,
        "default",
        [{"seq": 1, "ts": "2026-06-05T10:01:00", "category": "llm_usage", "total_tokens": 3000}],
    )
    rs = default_room_state(
        room_id="room-refresh",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id=node_id,
    )
    save_room_state(scope_id, rs)

    tokens = refresh_node_metrics(scope_id, node_id)
    assert tokens == 3000
    after = load_room_state(scope_id)
    assert after is not None
    assert int(after["node_metrics"][node_id]["tokens"]) == 3000
    assert DEFAULT_TOKEN_BUDGET == 20_000_000
    assert DEFAULT_NODE_TOKEN_BUDGET == 3_000_000


def test_refresh_node_metrics_includes_carry_baseline() -> None:
    scope_id = "nm_refresh_carry"
    node_id = "func_solution"
    _write_activity(
        scope_id,
        node_id,
        "default",
        [{"seq": 1, "ts": "2026-06-05T10:01:00", "category": "llm_usage", "total_tokens": 800}],
    )
    rs = default_room_state(
        room_id="room-refresh-carry",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=2,
        current_node_id=node_id,
    )
    rs["node_metrics"] = {
        node_id: {"carry_tokens": 5000, "tokens": 5000, "started_at": "2026-06-05T10:00:00"},
    }
    save_room_state(scope_id, rs)

    tokens = refresh_node_metrics(scope_id, node_id)
    assert tokens == 5800
    after = load_room_state(scope_id)
    assert after is not None
    assert int(after["node_metrics"][node_id]["tokens"]) == 5800
    assert int(after["node_metrics"][node_id]["carry_tokens"]) == 5000


def test_reset_node_metrics_for_rerun_drops_zero_carry() -> None:
    nm = reset_node_metrics_for_rerun(
        {"req_clarify": {"tokens": 0}, "boundary": {"tokens": 1200}},
        ["req_clarify", "boundary"],
        now="2026-06-05T13:00:00",
    )
    assert "req_clarify" not in nm
    assert nm["boundary"]["carry_tokens"] == 1200
    assert nm["boundary"]["started_at"] == "2026-06-05T13:00:00"


def test_freeze_then_reset_preserves_cumulative_tokens() -> None:
    scope_id = "nm_freeze_reset"
    node_id = "func_solution"
    _write_activity(
        scope_id,
        node_id,
        "default",
        [{"seq": 1, "ts": "2026-06-05T10:01:00", "category": "llm_usage", "total_tokens": 1500}],
    )
    rs = default_room_state(
        room_id="room-freeze",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=2,
        current_node_id=node_id,
    )
    rs["node_metrics"] = {
        node_id: {
            "carry_tokens": 2000,
            "tokens": 3500,
            "started_at": "2026-06-05T09:00:00",
            "completed_at": "2026-06-05T10:00:00",
        },
    }
    save_room_state(scope_id, rs)

    carry = freeze_node_carry_tokens(scope_id, node_id)
    assert carry == 3500

    after_freeze = load_room_state(scope_id)
    assert after_freeze is not None
    nm = reset_node_metrics_for_rerun(
        after_freeze["node_metrics"],
        [node_id],
        now="2026-06-05T10:05:00",
    )
    entry = nm[node_id]
    assert entry["carry_tokens"] == 3500
    assert entry["tokens"] == 3500
    assert "completed_at" not in entry


def test_build_meeting_summary_nodes_prefers_activity_over_legacy_256() -> None:
    scope_id = "nm_summary_legacy"
    node_id = "boundary"

    _write_activity(
        scope_id,
        node_id,
        "default",
        [{"seq": 1, "ts": "2026-06-05T10:01:00", "category": "llm_usage", "total_tokens": 4200}],
    )

    rs = default_room_state(
        room_id="room-legacy",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id=node_id,
    )
    rs["node_metrics"] = {
        node_id: {
            "started_at": "2026-06-05T10:00:00",
            "completed_at": "2026-06-05T10:02:00",
            "seconds": 120,
            "tokens": 256,
        }
    }
    save_room_state(scope_id, rs)

    nodes = build_meeting_summary_nodes(None, rs, scope_id=scope_id)
    boundary = next(n for n in nodes if n["node_id"] == node_id)
    assert boundary["metrics"]["tokens"] == 4200


def test_build_meeting_summary_nodes_drops_legacy_256_without_activity() -> None:
    scope_id = "nm_summary_zero"
    node_id = "boundary"

    rs = default_room_state(
        room_id="room-zero",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id=node_id,
    )
    rs["node_metrics"] = {
        node_id: {
            "started_at": "2026-06-05T10:00:00",
            "completed_at": "2026-06-05T10:02:00",
            "seconds": 120,
            "tokens": 256,
        }
    }
    save_room_state(scope_id, rs)

    nodes = build_meeting_summary_nodes(None, rs, scope_id=scope_id)
    boundary = next(n for n in nodes if n["node_id"] == node_id)
    assert boundary["metrics"]["tokens"] == 0


def test_mark_human_gate_exception_finalizes_node_metrics() -> None:
    from synapse.rd_meeting.orchestrator import MeetingRoomOrchestrator

    scope_id = "nm_exc_01"
    node_id = "boundary"

    dev = load_dev_status(scope_id) or {
        "scope_type": "demand",
        "scope_id": scope_id,
        "stage_id": 1,
        "current_node_id": node_id,
        "local_process_state": "处理中",
    }
    dev["current_node_id"] = node_id
    save_dev_status(scope_id, dev)

    rs = default_room_state(
        room_id="room-exc",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id=node_id,
        status="processing",
    )
    rs["node_metrics"] = {node_id: {"started_at": "2026-06-05T11:00:00", "seconds": 0, "tokens": 0}}
    save_room_state(scope_id, rs)

    _write_activity(
        scope_id,
        node_id,
        "default",
        [{"seq": 1, "ts": "2026-06-05T11:01:00", "category": "llm_usage", "total_tokens": 500}],
    )

    orch = MeetingRoomOrchestrator()
    orch.mark_human_gate(
        scope_type="demand",
        scope_id=scope_id,
        room_id="room-exc",
        node_id=node_id,
        intervention_kind="exception",
    )

    after = load_room_state(scope_id)
    assert after is not None
    nm = after["node_metrics"][node_id]
    assert nm.get("completed_at")
    assert int(nm.get("tokens") or 0) == 500
    assert int(nm.get("seconds") or 0) >= 1
    assert int(after["metrics"]["tokens"]) == 500


def test_sync_metrics_tokens_from_node_metrics_sums_nodes() -> None:
    scope_id = "nm_sync_tokens"
    rs = default_room_state(
        room_id="room-sync",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=2,
        current_node_id="func_solution",
        status="failed",
    )
    rs["metrics"] = {"tokens": 0, "token_budget": DEFAULT_TOKEN_BUDGET}
    rs["node_metrics"] = {
        "req_clarify": {"tokens": 1000, "completed_at": "2026-06-05T10:00:00"},
        "module_func": {"tokens": 2000, "completed_at": "2026-06-05T11:00:00"},
    }
    sync_metrics_tokens_from_node_metrics(rs, scope_id)
    assert rs["metrics"]["tokens"] == 3000
    assert rs["metrics"]["token_budget"] == DEFAULT_NODE_TOKEN_BUDGET * 2
    assert sum_node_metrics_tokens(rs, scope_id) == 3000


def test_finalize_node_metrics_syncs_room_metrics_tokens() -> None:
    scope_id = "nm_finalize_sync"
    node_id = "boundary"
    _write_activity(
        scope_id,
        node_id,
        "default",
        [{"seq": 1, "ts": "2026-06-05T10:01:00", "category": "llm_usage", "total_tokens": 1500}],
    )
    room_state = default_room_state(
        room_id="room-finalize-sync",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id=node_id,
    )
    room_state["metrics"] = {"tokens": 0, "token_budget": DEFAULT_TOKEN_BUDGET}
    room_state["node_metrics"] = {node_id: {"started_at": "2026-06-05T10:00:00"}}

    finalize_node_metrics(
        room_state,
        scope_id=scope_id,
        node_id=node_id,
        completed_at="2026-06-05T10:02:00",
    )
    assert room_state["metrics"]["tokens"] == 1500


def test_load_room_state_repairs_stale_metrics_tokens() -> None:
    scope_id = "nm_load_repair"
    rs = default_room_state(
        room_id="room-repair",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id="boundary",
    )
    rs["metrics"] = {"tokens": 0, "token_budget": DEFAULT_TOKEN_BUDGET}
    rs["node_metrics"] = {
        "boundary": {"tokens": 4200, "completed_at": "2026-06-05T10:00:00"},
    }
    save_room_state(scope_id, rs)

    loaded = load_room_state(scope_id)
    assert loaded is not None
    assert loaded["metrics"]["tokens"] == 4200


def test_resolve_node_token_budget_defaults_and_system() -> None:
    assert resolve_node_token_budget("req_clarify") == DEFAULT_NODE_TOKEN_BUDGET
    assert resolve_node_token_budget("auto_split") is None


def test_compute_room_token_budget_sums_started_sop_nodes_only() -> None:
    rs = default_room_state(
        room_id="room-budget",
        scope_type="demand",
        scope_id="budget_scope",
        stage_id=1,
        current_node_id="req_clarify",
    )
    rs["node_metrics"] = {
        "req_clarify": {"started_at": "2026-06-05T10:00:00", "tokens": 100},
        "module_func": {"started_at": "2026-06-05T11:00:00", "tokens": 200},
        "auto_split": {"started_at": "2026-06-05T12:00:00", "tokens": 0},
    }
    assert compute_room_token_budget(rs) == DEFAULT_NODE_TOKEN_BUDGET * 2


def test_ensure_metrics_token_budget_recomputes_from_started_nodes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from synapse.rd_meeting import room_runtime

    monkeypatch.setattr(
        room_runtime,
        "load_meeting_room_config",
        lambda: {
            "node_overrides": {
                "req_clarify": {"token_budget": 5_000_000},
                "module_func": {"token_budget": 2_000_000},
            }
        },
    )
    scope_id = "budget_ensure_scope"
    rs = default_room_state(
        room_id="room-ensure-budget",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id="req_clarify",
    )
    rs["metrics"]["token_budget"] = DEFAULT_TOKEN_BUDGET
    rs["node_metrics"] = {
        "req_clarify": {"started_at": "2026-06-05T10:00:00"},
        "module_func": {"started_at": "2026-06-05T11:00:00"},
    }
    save_room_state(scope_id, rs)

    ensure_metrics_token_budget(scope_id)
    after = load_room_state(scope_id)
    assert after is not None
    assert after["metrics"]["token_budget"] == 7_000_000


def test_finalize_node_metrics_includes_task_exec_tool_tokens(tmp_path, monkeypatch) -> None:
    from synapse.rd_meeting.task_exec import NODE_ID, RESULT_JSON

    scope_id = "nm_task_exec_tools"
    node_id = NODE_ID
    archive = tmp_path / "work" / scope_id / "archive" / "开发中" / node_id
    archive.mkdir(parents=True)
    (archive / RESULT_JSON).write_text(
        json.dumps(
            {
                "summary": {"total_tokens": 4200, "total_duration_sec": 90},
                "tasks": [{"task_no": "T-1", "tokens_used": 4200, "status": "ok"}],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.task_exec.archive_node_dir",
        lambda sid, stage, nid: archive,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.task_exec.stage_name_for_id",
        lambda _stage: "开发中",
    )

    room_state = default_room_state(
        room_id="room-task-exec",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=4,
        current_node_id=node_id,
    )
    room_state["node_metrics"] = {
        node_id: {"started_at": "2026-06-05T10:00:00", "tokens": 0},
    }

    entry = finalize_node_metrics(
        room_state,
        scope_id=scope_id,
        node_id=node_id,
        completed_at="2026-06-05T10:05:00",
    )
    assert entry["tokens"] == 4200
    assert int((room_state.get("metrics") or {}).get("tokens") or 0) == 4200


def test_refresh_node_metrics_task_exec_human_intervention(tmp_path, monkeypatch) -> None:
    from synapse.rd_meeting.task_exec import NODE_ID, RESULT_JSON

    scope_id = "nm_task_exec_live"
    node_id = NODE_ID
    archive = tmp_path / "work" / scope_id / "archive" / "开发中" / node_id
    archive.mkdir(parents=True)
    (archive / RESULT_JSON).write_text(
        json.dumps({"summary": {"total_tokens": 1800}, "tasks": []}, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.task_exec.archive_node_dir",
        lambda sid, stage, nid: archive,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.task_exec.stage_name_for_id",
        lambda _stage: "开发中",
    )

    rs = default_room_state(
        room_id="room-task-exec-live",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=4,
        current_node_id=node_id,
        status="human_intervention",
    )
    rs["node_metrics"] = {node_id: {"started_at": "2026-06-05T10:00:00", "tokens": 0}}
    save_room_state(scope_id, rs)

    tokens = refresh_node_metrics(scope_id, node_id, current_node_id=node_id)
    assert tokens == 1800
    saved = load_room_state(scope_id) or {}
    assert int((saved.get("node_metrics") or {}).get(node_id, {}).get("tokens") or 0) == 1800
