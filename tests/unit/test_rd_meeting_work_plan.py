"""研发会议室工作安排计划单测。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.room_runtime import history_to_chat_logs
from synapse.rd_meeting.work_plan import (
    check_delegation_allowed,
    check_host_hitl_gate,
    clear_work_plan,
    mark_delegation_completed,
    mark_delegation_started,
    mark_plan_hitl_submitted,
    plan_awaiting_hitl,
    submit_work_plan,
)


@pytest.fixture
def meeting_scope(tmp_path, monkeypatch):
    scope_id = "plan-scope"
    work = tmp_path / scope_id
    work.mkdir(parents=True)
    dev_path = work / "dev.status"
    dev_path.write_text(
        json.dumps(
            {
                "meeting_room": {"room_id": "room-plan", "active": True},
                "current_node_id": "req_clarify",
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    state_path = work / "room_state.json"
    state_path.write_text("{}", encoding="utf-8")
    history_path = work / "room_history.jsonl"
    history_path.write_text("", encoding="utf-8")

    monkeypatch.setattr(
        "synapse.rd_meeting.live.scope_id_for_room_id",
        lambda rid: scope_id if rid == "room-plan" else None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.paths.scope_dir",
        lambda s: work if s == scope_id else tmp_path / s,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.room_state_path",
        lambda s: work / "room_state.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.room_history_path",
        lambda s, node_id="pending": work / "agents" / node_id / "room_history.jsonl",
    )

    binding = {
        "host_profile_id": "default",
        "worker_profile_ids": ["worker-a", "worker-b"],
        "node_id": "req_clarify",
    }
    monkeypatch.setattr(
        "synapse.rd_meeting.work_plan.scope_id_for_room_id",
        lambda rid: scope_id if rid == "room-plan" else None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.work_plan.resolve_node_binding",
        lambda *a, **k: binding,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.work_plan.load_dev_status",
        lambda sid: {"current_node_id": "req_clarify"},
    )
    return scope_id


def test_check_delegation_blocked_without_plan(meeting_scope: str) -> None:
    err = check_delegation_allowed("rd_meeting:room-plan:host", agent_id="worker-a")
    assert err is not None
    assert "submit_meeting_work_plan" in err


def test_check_delegation_ignored_outside_meeting() -> None:
    assert check_delegation_allowed("desktop:abc", agent_id="worker-a") is None


def test_submit_and_delegate_gate(meeting_scope: str) -> None:
    session = "rd_meeting:room-plan:host"
    assert check_delegation_allowed(session, agent_id="worker-a") is not None

    plan = submit_work_plan(
        session_id=session,
        goal_summary="澄清需求边界",
        items=[
            {
                "id": "t1",
                "agent_id": "worker-a",
                "task": "列出澄清问题",
                "reason": "需求专家",
            }
        ],
    )
    assert plan["type"] == "meeting_work_plan"
    assert len(plan["items"]) == 1

    assert check_delegation_allowed(session, agent_id="worker-a", plan_item_id="t1") is None
    assert check_delegation_allowed(session, agent_id="worker-c") is not None

    mark_delegation_started(session, agent_id="worker-a", plan_item_id="t1")
    with pytest.raises(ValueError, match="已开始委派"):
        submit_work_plan(
            session_id=session,
            goal_summary="改计划",
            items=[
                {
                    "agent_id": "worker-a",
                    "task": "x",
                    "reason": "y",
                }
            ],
        )


def test_history_includes_work_plan_event() -> None:
    logs = history_to_chat_logs(
        [
            {
                "event": "work_plan_submitted",
                "text": "# 工作安排计划\n\n**任务分配**：",
                "agent_id": "default",
                "ts": "2026-05-21T10:00:00",
            }
        ]
    )
    assert len(logs) == 1
    assert "工作安排" in logs[0]["text"]
    assert logs[0].get("nodeId") is None


def test_chat_logs_carry_node_id() -> None:
    logs = history_to_chat_logs(
        [
            {
                "event": "node_started",
                "node_id": "req_clarify",
                "text": "节点初始化\n\n已加载。",
                "agent_id": "default",
                "ts": "2026-05-21T10:00:00",
            }
        ]
    )
    assert len(logs) == 1
    assert logs[0]["nodeId"] == "req_clarify"


def test_clear_work_plan(meeting_scope: str, monkeypatch: pytest.MonkeyPatch) -> None:
    session = "rd_meeting:room-plan:host"
    submit_work_plan(
        session_id=session,
        goal_summary="g",
        items=[{"agent_id": "worker-a", "task": "t", "reason": "r"}],
    )
    clear_work_plan(meeting_scope)
    assert check_delegation_allowed(session, agent_id="worker-a") is not None


def test_human_confirm_requires_closing_step_in_plan(meeting_scope: str, monkeypatch: pytest.MonkeyPatch) -> None:
    binding = {
        "host_profile_id": "default",
        "worker_profile_ids": ["worker-a"],
        "node_id": "req_clarify",
        "human_confirm": True,
    }
    monkeypatch.setattr(
        "synapse.rd_meeting.work_plan.resolve_node_binding",
        lambda *a, **k: binding,
    )
    session = "rd_meeting:room-plan:host"
    plan = submit_work_plan(
        session_id=session,
        goal_summary="澄清",
        items=[{"id": "t1", "agent_id": "worker-a", "task": "调研", "reason": "专家"}],
    )
    assert isinstance(plan.get("closing_step"), dict)
    assert plan["closing_step"]["action"] == "submit_hitl"
    assert plan["hitl_submitted"] is False


def test_batch_complete_awaiting_hitl_gate(meeting_scope: str, monkeypatch: pytest.MonkeyPatch) -> None:
    binding = {
        "host_profile_id": "default",
        "worker_profile_ids": ["worker-a", "worker-b"],
        "node_id": "req_clarify",
        "human_confirm": True,
    }
    monkeypatch.setattr(
        "synapse.rd_meeting.work_plan.resolve_node_binding",
        lambda *a, **k: binding,
    )
    session = "rd_meeting:room-plan:host"
    submit_work_plan(
        session_id=session,
        goal_summary="澄清",
        items=[
            {"id": "t1", "agent_id": "worker-a", "task": "a", "reason": "r"},
            {"id": "t2", "agent_id": "worker-b", "task": "b", "reason": "r"},
        ],
    )
    assert plan_awaiting_hitl(meeting_scope) is False
    mark_delegation_completed(session, agent_id="worker-a", plan_item_id="t1")
    assert plan_awaiting_hitl(meeting_scope) is False
    hint = mark_delegation_completed(session, agent_id="worker-b", plan_item_id="t2")
    assert plan_awaiting_hitl(meeting_scope) is True
    assert "submit_hitl_questionnaire" in hint
    err = check_host_hitl_gate(session, "deliver_artifacts")
    assert err is not None
    mark_plan_hitl_submitted(meeting_scope, kind="interactive")
    assert plan_awaiting_hitl(meeting_scope) is False
    assert check_host_hitl_gate(session, "deliver_artifacts") is None


def test_redelegate_resets_hitl_until_batch_complete_again(
    meeting_scope: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    binding = {
        "host_profile_id": "default",
        "worker_profile_ids": ["worker-a"],
        "node_id": "req_clarify",
        "human_confirm": True,
    }
    monkeypatch.setattr(
        "synapse.rd_meeting.work_plan.resolve_node_binding",
        lambda *a, **k: binding,
    )
    session = "rd_meeting:room-plan:host"
    submit_work_plan(
        session_id=session,
        goal_summary="g",
        items=[{"id": "t1", "agent_id": "worker-a", "task": "t", "reason": "r"}],
    )
    mark_delegation_completed(session, agent_id="worker-a", plan_item_id="t1")
    mark_plan_hitl_submitted(meeting_scope, kind="interactive")
    assert plan_awaiting_hitl(meeting_scope) is False
    mark_delegation_started(session, agent_id="worker-a", plan_item_id="t1")
    assert plan_awaiting_hitl(meeting_scope) is False
    mark_plan_hitl_submitted(meeting_scope, kind="interactive")
    assert plan_awaiting_hitl(meeting_scope) is False

    from synapse.rd_meeting.room_runtime import load_room_state

    rs = load_room_state(meeting_scope) or {}
    rs["hitl_locked"] = True
    from synapse.rd_meeting.room_runtime import save_room_state

    save_room_state(meeting_scope, rs)
    mark_delegation_started(session, agent_id="worker-a", plan_item_id="t1")
    rs2 = load_room_state(meeting_scope) or {}
    assert not rs2.get("hitl_locked")
    mark_delegation_completed(session, agent_id="worker-a", plan_item_id="t1")
    assert plan_awaiting_hitl(meeting_scope) is True
