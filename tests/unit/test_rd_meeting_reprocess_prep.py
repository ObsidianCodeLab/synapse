"""重新处理：清理当前节点归档、room_state 与 pipeline 缓存。"""

from __future__ import annotations

import json

from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path, scope_dir
from synapse.rd_meeting.pipeline import (
    _clear_node_for_reprocess,
    clear_current_node_reprocess_artifacts,
    clear_room_state_for_node_reprocess,
    clear_room_state_for_revision_resume,
)
from synapse.rd_sop.nodes import stage_name_for_id


def test_clear_current_node_reprocess_artifacts_removes_archive_and_pipeline(
    tmp_path, monkeypatch
):
    scope = "reproc-scope"
    node_id = "req_clarify"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    stage_name = stage_name_for_id(1)
    archive = archive_node_dir(scope, stage_name, node_id)
    archive.mkdir(parents=True)
    (archive / "需求澄清.md").write_text("# 需求澄清\n\n旧内容", encoding="utf-8")

    root = scope_dir(scope)
    (root / "host_prompt_snapshot.md").write_text("snapshot", encoding="utf-8")
    (root / "hitl.flag.json").write_text("{}", encoding="utf-8")

    pipe_path = meeting_pipeline_path(scope)
    pipe_path.write_text(
        json.dumps(
            {
                "phase": "result_gate",
                "context": {
                    "node_review": {node_id: {"report_body": "old"}},
                    "host_prompt": {"meeting_prompt": "cached"},
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    clear_current_node_reprocess_artifacts(scope, node_id, stage_id=1)

    assert not archive.is_dir()
    assert not (root / "host_prompt_snapshot.md").is_file()
    assert not (root / "hitl.flag.json").is_file()

    raw = json.loads(pipe_path.read_text(encoding="utf-8"))
    assert raw["phase"] == "running"
    assert node_id not in raw.get("context", {}).get("node_review", {})
    assert "host_prompt" not in raw.get("context", {})


def test_clear_room_state_for_node_reprocess(monkeypatch):
    store: dict[str, dict] = {}

    def _load(sid: str):
        return dict(store.get(sid, {}))

    def _save(sid: str, rs: dict):
        store[sid] = dict(rs)

    monkeypatch.setattr("synapse.rd_meeting.pipeline.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.pipeline.save_room_state", _save)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.save_room_state", _save)

    scope = "rs-scope"
    node_id = "req_clarify"
    store[scope] = {
        "status": "stopped",
        "phase": "clarify_gate",
        "host_prompt_cache": {"node_id": node_id, "meeting_prompt": "x"},
        "node_metrics": {node_id: {"tokens": 99}, "other": {"tokens": 1}},
        "participants": [{"profile_id": "default"}],
        "pending_host_llm_begin_kind": "start_work",
        "stopped_at": "t",
        "stopped_reason": "user_stop",
        "hitl_locked": True,
        "current_work_plan": {
            "node_id": node_id,
            "delegation_started": True,
            "delegated_item_ids": ["t1"],
        },
        "reprocess_reason": "上次重处理要求",
        "reprocess_until_node_id": node_id,
    }

    clear_room_state_for_node_reprocess(scope, node_id)

    rs = store[scope]
    assert rs["status"] == "processing"
    assert rs["phase"] == "running"
    assert "host_prompt_cache" not in rs
    nm_entry = rs.get("node_metrics", {}).get(node_id, {})
    assert nm_entry.get("carry_tokens") == 99
    assert nm_entry.get("tokens") == 99
    assert "completed_at" not in nm_entry
    assert "other" in rs.get("node_metrics", {})
    assert "participants" not in rs
    assert "stopped_at" not in rs
    assert "hitl_locked" not in rs
    assert "current_work_plan" not in rs
    assert "reprocess_reason" not in rs
    assert "reprocess_until_node_id" not in rs


def test_clear_room_state_for_node_reprocess_keeps_other_node_work_plan(monkeypatch):
    store: dict[str, dict] = {}

    def _load(sid: str):
        return dict(store.get(sid, {}))

    def _save(sid: str, rs: dict):
        store[sid] = dict(rs)

    monkeypatch.setattr("synapse.rd_meeting.pipeline.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.pipeline.save_room_state", _save)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.save_room_state", _save)

    scope = "rs-scope-2"
    node_id = "req_clarify"
    other_plan = {"node_id": "module_func", "delegation_started": True}
    store[scope] = {"current_work_plan": other_plan}

    clear_room_state_for_node_reprocess(scope, node_id)

    assert store[scope]["current_work_plan"] == other_plan


def test_clear_room_state_for_node_reprocess_preserves_frozen_carry(monkeypatch):
    store: dict[str, dict] = {}

    def _load(sid: str):
        return dict(store.get(sid, {}))

    def _save(sid: str, rs: dict):
        store[sid] = dict(rs)

    monkeypatch.setattr("synapse.rd_meeting.pipeline.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.pipeline.save_room_state", _save)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.save_room_state", _save)

    scope = "rs-carry"
    node_id = "func_solution"
    store[scope] = {
        "node_metrics": {
            node_id: {
                "carry_tokens": 5000,
                "tokens": 5000,
                "started_at": "2026-06-05T10:00:00",
                "completed_at": "2026-06-05T11:00:00",
                "seconds": 3600,
            }
        },
        "metrics": {"tokens": 5000},
    }

    clear_room_state_for_node_reprocess(scope, node_id)

    entry = store[scope]["node_metrics"][node_id]
    assert entry["carry_tokens"] == 5000
    assert entry["tokens"] == 5000
    assert "completed_at" not in entry
    assert "seconds" not in entry
    assert store[scope]["metrics"]["tokens"] == 5000


def test_clear_room_state_for_revision_resume_preserves_carry(monkeypatch):
    store: dict[str, dict] = {}

    def _load(sid: str):
        return dict(store.get(sid, {}))

    def _save(sid: str, rs: dict):
        store[sid] = dict(rs)

    monkeypatch.setattr("synapse.rd_meeting.pipeline.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.pipeline.save_room_state", _save)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.save_room_state", _save)

    scope = "rs-rev-carry"
    node_id = "func_solution"
    store[scope] = {
        "node_metrics": {
            node_id: {"carry_tokens": 3200, "tokens": 3200, "completed_at": "2026-06-05T12:00:00"},
        },
        "metrics": {"tokens": 3200},
    }

    clear_room_state_for_revision_resume(scope, node_id)

    entry = store[scope]["node_metrics"][node_id]
    assert entry["carry_tokens"] == 3200
    assert entry["tokens"] == 3200
    assert "completed_at" not in entry


def test_clear_node_for_reprocess_freezes_task_exec_tokens_before_archive_delete(
    tmp_path, monkeypatch
):
    """task_exec token 存于归档 task_exec_result.json；须在删归档前 freeze，否则重处理 carry 归零。"""
    from synapse.rd_meeting.room_runtime import default_room_state, load_room_state, save_room_state
    from synapse.rd_meeting.task_exec import NODE_ID, RESULT_JSON

    scope = "task-exec-reproc-carry"
    node_id = NODE_ID
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    stage_name = stage_name_for_id(4)
    archive = tmp_path / "work" / scope / "archive" / stage_name / node_id
    archive.mkdir(parents=True)
    (archive / RESULT_JSON).write_text(
        json.dumps(
            {
                "summary": {"total_tokens": 8800, "total_duration_sec": 120},
                "tasks": [{"task_no": "T-1", "tokens_used": 8800, "status": "ok"}],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    rs = default_room_state(
        room_id="room-task-exec-reproc",
        scope_type="demand",
        scope_id=scope,
        stage_id=4,
        current_node_id=node_id,
    )
    rs["node_metrics"] = {node_id: {"tokens": 8800, "started_at": "2026-06-16T10:00:00"}}
    save_room_state(scope, rs)

    _clear_node_for_reprocess(scope, node_id, stage_id=4)

    assert not archive.is_dir()
    after = load_room_state(scope)
    assert after is not None
    entry = after["node_metrics"][node_id]
    assert entry["carry_tokens"] == 8800
    assert entry["tokens"] == 8800


def test_clear_meeting_todo_sessions_on_reprocess(monkeypatch):
    closed: list[str] = []

    def _force_close(session_id: str) -> bool:
        closed.append(session_id)
        return True

    monkeypatch.setattr("synapse.tools.handlers.todo_state.force_close_plan", _force_close)

    scope = "todo-scope"
    monkeypatch.setattr(
        "synapse.rd_meeting.pipeline.load_room_state",
        lambda sid: {
            "room_id": "mr_d_todo_s1",
            "current_node_binding": {"worker_profile_ids": ["whalecloud-design-expert"]},
            "participants": [
                {"profile_id": "default", "role": "host"},
                {"profile_id": "whalecloud-design-expert", "role": "worker"},
            ],
        },
    )
    monkeypatch.setattr("synapse.rd_meeting.pipeline.save_room_state", lambda sid, rs: None)
    monkeypatch.setattr(
        "synapse.rd_meeting.host_prompt_cache.load_room_state",
        lambda sid: {},
    )
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.save_room_state", lambda sid, rs: None)

    from synapse.rd_meeting.pipeline import _clear_meeting_todo_sessions

    _clear_meeting_todo_sessions(scope)

    assert "rd_meeting:mr_d_todo_s1:host" in closed
    assert "rd_meeting:mr_d_todo_s1:whalecloud-design-expert" in closed
