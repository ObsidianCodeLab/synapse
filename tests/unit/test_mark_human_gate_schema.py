"""mark_human_gate 应清除残留的 hitl_form_schema。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.orchestrator import MeetingRoomOrchestrator
@pytest.fixture
def gate_scope(tmp_path, monkeypatch):
    scope_id = "gate-scope"
    work = tmp_path / scope_id
    work.mkdir(parents=True)
    state_path = work / "room_state.json"
    state_path.write_text(
        json.dumps(
            {
                "hitl_form_schema": {"title": "旧问卷", "questions": []},
                "status": "processing",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.load_room_state",
        lambda sid: json.loads(state_path.read_text(encoding="utf-8"))
        if sid == scope_id
        else {},
    )

    saved: list[dict] = []

    def _save(sid: str, rs: dict) -> None:
        saved.append(dict(rs))
        state_path.write_text(json.dumps(rs, ensure_ascii=False), encoding="utf-8")

    monkeypatch.setattr("synapse.rd_meeting.orchestrator.save_room_state", _save)
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.append_history_event",
        lambda *a, **k: None,
    )
    return scope_id, state_path


def test_mark_human_gate_clears_hitl_schema(gate_scope: tuple[str, object]) -> None:
    scope_id, state_path = gate_scope
    orch = MeetingRoomOrchestrator()
    orch.mark_human_gate(
        scope_type="demand",
        scope_id=scope_id,
        room_id="room-g",
        node_id="solution_review",
        hitl_form_schema=None,
        intervention_kind="solution_review",
        pending_delivery={"solution_review_payload": {}},
    )
    rs = json.loads(state_path.read_text(encoding="utf-8"))
    assert "hitl_form_schema" not in rs
    assert rs.get("intervention_kind") == "solution_review"
