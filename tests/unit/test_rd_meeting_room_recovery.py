"""会议室服务重启后的节点处理恢复。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synapse.rd_meeting.paths import room_state_path
from synapse.rd_meeting.room_recovery import assess_node_recovery, recover_stopped_node
from synapse.rd_meeting.room_runtime import load_room_state, mark_room_stopped


def _write_room_state(work: Path, scope_id: str, payload: dict) -> None:
    scope_dir = work / scope_id
    scope_dir.mkdir(parents=True, exist_ok=True)
    room_state_path(scope_id).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


@pytest.fixture
def work_scope(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    work = tmp_path / "work"
    work.mkdir()
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: work)
    monkeypatch.setattr("synapse.rd_meeting.room_recovery.load_room_state", lambda sid: json.loads(
        room_state_path(sid).read_text(encoding="utf-8")
    ))
    monkeypatch.setattr(
        "synapse.rd_meeting.room_recovery.save_room_state",
        lambda sid, rs: _write_room_state(work, sid, rs) or rs,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.load_room_state",
        lambda sid: json.loads(room_state_path(sid).read_text(encoding="utf-8"))
        if room_state_path(sid).is_file()
        else None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.save_room_state",
        lambda sid, rs: _write_room_state(work, sid, rs) or rs,
    )
    monkeypatch.setattr("synapse.rd_meeting.room_recovery.append_history_event", lambda *a, **k: None)
    return work, "DEMO-001"


def test_mark_room_stopped_records_prev_status(work_scope) -> None:
    _work, sid = work_scope
    _write_room_state(_work, sid, {"room_id": "r1", "status": "human_intervention", "current_node_id": "req_clarify"})
    mark_room_stopped(sid, reason="server_restart")
    rs = load_room_state(sid)
    assert rs is not None
    assert rs["status"] == "stopped"
    assert rs["stopped_reason"] == "server_restart"
    assert rs["stopped_prev_status"] == "human_intervention"


def test_assess_recoverable_hitl_gate(work_scope) -> None:
    _work, sid = work_scope
    _write_room_state(
        _work,
        sid,
        {
            "room_id": "r1",
            "status": "stopped",
            "stopped_reason": "server_restart",
            "stopped_prev_status": "human_intervention",
            "current_node_id": "req_clarify",
            "intervention_kind": "interactive",
            "hitl_form_schema": {"questions": [{"id": "q1", "label": "确认?"}]},
        },
    )
    out = assess_node_recovery(sid)
    assert out["recoverable"] is True
    assert out["intervention_panel"] == "hitl"


def test_assess_recoverable_node_review(work_scope) -> None:
    _work, sid = work_scope
    _write_room_state(
        _work,
        sid,
        {
            "room_id": "r1",
            "status": "stopped",
            "stopped_reason": "server_restart",
            "stopped_prev_status": "human_intervention",
            "current_node_id": "req_clarify",
            "intervention_kind": "result_confirm",
            "pending_delivery": {
                "node_id": "req_clarify",
                "await_confirm": True,
                "review_payload": {"node_id": "req_clarify", "report_body": "总结"},
            },
        },
    )
    out = assess_node_recovery(sid)
    assert out["recoverable"] is True
    assert out["intervention_panel"] == "node_review"


def test_assess_not_recoverable_agent_still_running(work_scope) -> None:
    _work, sid = work_scope
    _write_room_state(
        _work,
        sid,
        {
            "room_id": "r1",
            "status": "stopped",
            "stopped_reason": "server_restart",
            "stopped_prev_status": "processing",
            "current_node_id": "req_clarify",
        },
    )
    out = assess_node_recovery(sid)
    assert out["recoverable"] is False
    assert out["reason_code"] == "agent_still_running"


def test_assess_not_recoverable_user_stop(work_scope) -> None:
    _work, sid = work_scope
    _write_room_state(
        _work,
        sid,
        {
            "room_id": "r1",
            "status": "stopped",
            "stopped_reason": "user_stop",
            "stopped_prev_status": "human_intervention",
            "current_node_id": "req_clarify",
            "hitl_form_schema": {"questions": [{"id": "q1"}]},
            "intervention_kind": "interactive",
        },
    )
    out = assess_node_recovery(sid)
    assert out["recoverable"] is False
    assert out["reason_code"] == "not_server_restart"


def test_recover_restores_human_intervention(work_scope) -> None:
    _work, sid = work_scope
    _write_room_state(
        _work,
        sid,
        {
            "room_id": "r1",
            "status": "stopped",
            "stopped_reason": "server_restart",
            "stopped_prev_status": "human_intervention",
            "current_node_id": "solution_review",
            "intervention_kind": "solution_review",
            "pending_delivery": {
                "node_id": "solution_review",
                "solution_review_payload": {"node_id": "solution_review"},
            },
        },
    )
    recover_stopped_node(sid, room_id="r1")
    rs = load_room_state(sid)
    assert rs is not None
    assert rs["status"] == "human_intervention"
    assert "stopped_at" not in rs
    assert "stopped_reason" not in rs
    assert rs["pending_delivery"]["solution_review_payload"]
