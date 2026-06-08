"""会议室：用户上下文队列与 intervene 续跑约定。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.room_runtime import load_room_state, save_room_state
from synapse.rd_meeting.service import MeetingRoomService


@pytest.fixture
def synapse_work_home(monkeypatch: pytest.MonkeyPatch, tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    cfg_dir = work / "_rd_meeting_cfg"
    cfg_dir.mkdir(parents=True)

    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: work)
    monkeypatch.setattr("synapse.rd_meeting.config_store.rd_meeting_config_dir", lambda: cfg_dir)
    return work


def test_intervene_chat_queues_without_resume(synapse_work_home, monkeypatch):
    scheduled: list[str] = []

    def _fake_schedule(**kwargs):
        scheduled.append(kwargs.get("scope_id", ""))

    monkeypatch.setattr("synapse.rd_meeting.service.schedule_run_node", _fake_schedule)

    scope_id = "21883510"
    save_room_state(
        scope_id,
        {
            "room_id": "mr_chat",
            "status": "processing",
            "scope": {"type": "demand", "id": scope_id},
        },
    )
    from synapse.rd_meeting.dev_status import load_or_create_dev_status, save_dev_status

    save_dev_status(
        scope_id,
        load_or_create_dev_status(scope_id, scope_type="demand"),
    )
    dev = load_or_create_dev_status(scope_id, scope_type="demand")
    dev["meeting_room"] = {"room_id": "mr_chat", "active": True}
    save_dev_status(scope_id, dev)

    svc = MeetingRoomService()
    svc.intervene("mr_chat", text="用户旁注一句", message_type="chat", resume_run=False)

    assert scheduled == []
    rs = load_room_state(scope_id)
    assert rs is not None
    pending = rs.get("user_context_pending")
    assert isinstance(pending, list) and pending[-1] == "用户旁注一句"


def test_intervene_hitl_form_forces_resume(synapse_work_home, monkeypatch):
    scheduled: list[str] = []

    def _fake_schedule(**kwargs):
        scheduled.append(kwargs.get("scope_id", ""))

    monkeypatch.setattr("synapse.rd_meeting.service.schedule_run_node", _fake_schedule)

    scope_id = "21883511"
    save_room_state(
        scope_id,
        {
            "room_id": "mr_hitl",
            "status": "human_intervention",
            "hitl_form_schema": {"type": "questionnaire", "questions": [{"id": "q1", "type": "text", "title": "t"}]},
            "pending_delivery": {
                "report_body": "# 进展\n",
                "await_confirm": False,
            },
        },
    )
    from synapse.rd_meeting.dev_status import load_or_create_dev_status, save_dev_status

    dev = load_or_create_dev_status(scope_id, scope_type="demand")
    dev["meeting_room"] = {"room_id": "mr_hitl", "active": True}
    save_dev_status(scope_id, dev)

    svc = MeetingRoomService()
    svc.intervene(
        "mr_hitl",
        text="[人工确认表单]\nq1: 答案A",
        message_type="instruction",
        resume_run=False,
    )

    assert scheduled == [scope_id]
    rs = load_room_state(scope_id)
    assert rs is not None
    assert rs.get("status") == "processing"
    assert rs.get("hitl_form_schema") is None
