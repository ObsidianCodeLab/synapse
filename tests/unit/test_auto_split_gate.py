"""自动拆单：已有任务单时的用户选择门控。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.auto_split_gate import (
    bootstrap_auto_split_reuse_existing,
    clear_auto_split_choice_gate,
    existing_owned_tasks,
    maybe_enter_auto_split_choice_gate,
    resolve_auto_split_choice,
    set_auto_split_choice,
    should_prompt_auto_split_choice,
)
from synapse.rd_meeting.pipeline import MeetingPipeline, PipelineRunContext, STEP_WAITING
from synapse.rd_meeting.room_runtime import load_room_state, save_room_state


def _patch_userwork(monkeypatch: pytest.MonkeyPatch, tmp_path, rows: list[dict]) -> None:
    uw_path = tmp_path / "userwork.json"
    uw_path.write_text(json.dumps({"list": rows}, ensure_ascii=False), encoding="utf-8")
    lock_path = tmp_path / "userwork.lock"
    for mod in (
        "synapse.rd_meeting.userwork_sync",
        "synapse.api.routes.dev_iwhalecloud",
    ):
        monkeypatch.setattr(f"{mod}._owner_order_file_name", lambda: uw_path)
        monkeypatch.setattr(f"{mod}._owner_order_file_lock_path", lambda: lock_path)


def _make_pipe(scope_id: str) -> MeetingPipeline:
    from synapse.rd_meeting.pipeline import default_pipeline_state

    return MeetingPipeline(
        scope_id,
        default_pipeline_state(scope_type="demand", scope_id=scope_id),
    )


def test_existing_owned_tasks_from_userwork(monkeypatch, tmp_path):
    scope_id = "D100"
    _patch_userwork(
        monkeypatch,
        tmp_path,
        [
            {
                "demand_no": scope_id,
                "owned_work_items": [
                    {"task_no": "T1", "task_title": "子单1"},
                    {"task_no": "", "task_title": "无效"},
                ],
            }
        ],
    )
    tasks = existing_owned_tasks("demand", scope_id)
    assert len(tasks) == 1
    assert tasks[0]["task_no"] == "T1"


def test_should_prompt_when_existing_and_no_choice(monkeypatch, tmp_path):
    scope_id = "D101"
    _patch_userwork(
        monkeypatch,
        tmp_path,
        [{"demand_no": scope_id, "owned_work_items": [{"task_no": "T9", "task_title": "x"}]}],
    )
    assert should_prompt_auto_split_choice("demand", scope_id, pipe=None) is True

    pipe = _make_pipe(scope_id)
    set_auto_split_choice(pipe, "reuse_existing")
    assert should_prompt_auto_split_choice("demand", scope_id, pipe=pipe) is False


def test_maybe_enter_auto_split_choice_gate_pauses_pipeline(monkeypatch, tmp_path):
    scope_id = "D102"
    _patch_userwork(
        monkeypatch,
        tmp_path,
        [{"demand_no": scope_id, "owned_work_items": [{"task_no": "T2", "task_title": "已有"}]}],
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.auto_split_gate.append_history_event",
        lambda *_a, **_k: None,
    )

    pipe = _make_pipe(scope_id)
    pipe.set_flow_step("system_node_exec", reason="test")
    ctx = PipelineRunContext(scope_type="demand", scope_id=scope_id)

    paused = maybe_enter_auto_split_choice_gate(
        pipe, ctx, room_id="room-1", run_node="auto_split",
    )
    assert paused is True
    assert pipe.flow_step == STEP_WAITING
    rs = load_room_state(scope_id) or {}
    assert rs.get("intervention_kind") == "auto_split_choice"
    assert rs.get("auto_split_choice_payload", {}).get("existing_task_count") == 1


def test_bootstrap_auto_split_reuse_existing(monkeypatch, tmp_path):
    scope_id = "D103"
    _patch_userwork(
        monkeypatch,
        tmp_path,
        [
            {
                "demand_no": scope_id,
                "owned_work_items": [
                    {
                        "task_no": "T-OLD",
                        "task_title": "沿用子单",
                        "product_module_name": "MOD",
                    }
                ],
            }
        ],
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.auto_split_assets._load_split_plan_tasks",
        lambda _sid: [{"taskTitle": "沿用子单", "productModuleName": "MOD"}],
    )

    assets = bootstrap_auto_split_reuse_existing("demand", scope_id)
    assert assets["status"] == "ok"
    assert assets.get("reuse_existing") is True
    assert assets["create_task_results"][0]["task_no"] == "T-OLD"
    assert assets["create_task_results"][0].get("reused_existing") is True
    assert assets["create_task_results"][0]["work_item"]["feature_id"] == "T-OLD"
    assert assets["userwork_added_task_nos"] == []


def test_clear_auto_split_choice_gate():
    scope_id = "clear-gate-test"
    save_room_state(
        scope_id,
        {
            "status": "human_intervention",
            "intervention_kind": "auto_split_choice",
            "intervention_panel": "auto_split_choice",
            "auto_split_choice_payload": {"existing_tasks": []},
        },
    )
    clear_auto_split_choice_gate(scope_id)
    rs = load_room_state(scope_id) or {}
    assert rs.get("status") == "processing"
    assert "intervention_kind" not in rs


def test_resolve_auto_split_choice_from_pipe():
    pipe = _make_pipe("choice-scope")
    assert resolve_auto_split_choice(pipe) is None
    set_auto_split_choice(pipe, "continue")
    assert resolve_auto_split_choice(pipe) == "continue"
