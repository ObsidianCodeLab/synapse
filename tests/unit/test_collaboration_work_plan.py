"""无协作智能体时工作安排计划与委派门禁。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.work_plan import check_delegation_allowed, submit_work_plan


@pytest.fixture
def solo_meeting_scope(tmp_path, monkeypatch):
    scope_id = "solo-scope"
    work = tmp_path / scope_id
    work.mkdir(parents=True)
    (work / "dev.status").write_text(
        json.dumps(
            {
                "meeting_room": {"room_id": "room-solo", "active": True},
                "current_node_id": "boundary",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (work / "room_state.json").write_text("{}", encoding="utf-8")
    (work / "room_history.jsonl").write_text("", encoding="utf-8")

    binding = {
        "host_profile_id": "default",
        "worker_profile_ids": ["default"],
        "node_id": "boundary",
    }
    monkeypatch.setattr(
        "synapse.rd_meeting.work_plan.scope_id_for_room_id",
        lambda rid: scope_id if rid == "room-solo" else None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.work_plan.resolve_node_binding",
        lambda *a, **k: binding,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.work_plan.load_dev_status",
        lambda sid: {"current_node_id": "boundary"},
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.room_state_path",
        lambda s: work / "room_state.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.room_history_path",
        lambda s, node_id="pending": work / "agents" / node_id / "room_history.jsonl",
    )
    return scope_id


def test_solo_skips_delegation_plan_gate(solo_meeting_scope: str) -> None:
    session = "rd_meeting:room-solo:host"
    assert check_delegation_allowed(session, agent_id="worker-a") is None


def test_solo_rejects_work_plan_submit(solo_meeting_scope: str) -> None:
    session = "rd_meeting:room-solo:host"
    with pytest.raises(ValueError, match="无需 submit_meeting_work_plan"):
        submit_work_plan(
            session_id=session,
            goal_summary="独立执行",
            items=[{"agent_id": "default", "task": "t", "reason": "r"}],
        )
