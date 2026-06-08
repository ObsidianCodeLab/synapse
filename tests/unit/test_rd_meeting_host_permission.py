"""会议室 Host 委派工具权限自动放行。"""

from __future__ import annotations

from unittest.mock import MagicMock

from synapse.core.tool_executor import ToolExecutor
from synapse.rd_meeting.agent_session import ensure_host_session
from synapse.tools.handlers import SystemHandlerRegistry
from synapse.tools.handlers.meeting_room import create_meeting_room_handler


def test_rd_meeting_host_bypasses_delegate_confirm() -> None:
    reg = SystemHandlerRegistry()
    executor = ToolExecutor(reg)
    agent = MagicMock()
    agent._org_context = True
    session = ensure_host_session("room-perm", "default")
    agent._current_session = session
    agent._current_session_id = session.id
    executor._agent_ref = agent

    decision = executor.check_permission(
        "delegate_to_agent",
        {"agent_id": "worker-a", "message": "task"},
    )
    assert decision.behavior == "allow"
    assert decision.policy_name == "rd_meeting"


def test_rd_meeting_bypasses_submit_hitl_questionnaire() -> None:
    reg = SystemHandlerRegistry()
    executor = ToolExecutor(reg)
    agent = MagicMock()
    agent._org_context = True
    session = ensure_host_session("room-hitl", "default")
    agent._current_session = session
    agent._current_session_id = session.id
    executor._agent_ref = agent

    decision = executor.check_permission(
        "submit_hitl_questionnaire",
        {"kind": "interactive", "questions": [{"id": "q1", "title": "t"}]},
    )
    assert decision.behavior == "allow"
    assert decision.policy_name == "rd_meeting"


def test_submit_hitl_questionnaire_classified_interactive() -> None:
    from synapse.core.policy_v2.adapter import evaluate_via_v2
    from synapse.core.policy_v2.enums import DecisionAction

    reg = SystemHandlerRegistry()
    agent = MagicMock()
    handle = create_meeting_room_handler(agent)
    reg.register("meeting_room", handle)

    from synapse.core.policy_v2.global_engine import rebuild_engine_v2

    rebuild_engine_v2(explicit_lookup=reg.get_tool_class)

    decision = evaluate_via_v2(
        "submit_hitl_questionnaire",
        {"kind": "interactive", "questions": []},
    )
    assert decision.action == DecisionAction.ALLOW
    assert decision.approval_class.value == "interactive"


def test_rd_meeting_bypasses_run_shell() -> None:
    reg = SystemHandlerRegistry()
    executor = ToolExecutor(reg)
    agent = MagicMock()
    agent._org_context = True
    session = ensure_host_session("room-shell", "default")
    agent._current_session = session
    agent._current_session_id = session.id
    executor._agent_ref = agent

    decision = executor.check_permission(
        "run_shell",
        {"command": "mkdir foo", "description": "test"},
    )
    assert decision.behavior == "allow"
    assert decision.policy_name == "rd_meeting"


def test_meeting_room_whitelist_tools_never_unknown() -> None:
    """会议室白名单内工具不得落入 UNKNOWN（否则会误弹 SecurityConfirm）。"""
    from synapse.core.policy_v2.adapter import evaluate_via_v2
    from synapse.core.policy_v2.enums import ApprovalClass
    from synapse.core.policy_v2.global_engine import rebuild_engine_v2
    from synapse.rd_meeting.agent_runtime import meeting_tool_names_for_role

    reg = SystemHandlerRegistry()
    agent = MagicMock()
    handle = create_meeting_room_handler(agent)
    reg.register("meeting_room", handle)
    # im_channel：Worker 交付 deliver_artifacts
    from synapse.tools.handlers.im_channel import create_handler as create_im_handler

    reg.register("im_channel", create_im_handler(agent))

    rebuild_engine_v2(explicit_lookup=reg.get_tool_class)

    unknown: list[str] = []
    for role in ("host", "worker"):
        for tool in meeting_tool_names_for_role(role):
            decision = evaluate_via_v2(tool, {})
            if decision.approval_class == ApprovalClass.UNKNOWN:
                unknown.append(f"{role}:{tool}")
    assert not unknown, f"meeting room tools must not be UNKNOWN: {unknown}"


def test_non_meeting_session_still_uses_policy() -> None:
    reg = SystemHandlerRegistry()
    executor = ToolExecutor(reg)
    agent = MagicMock()
    agent._org_context = True
    agent._current_session = None
    agent._current_session_id = "desktop:abc"
    executor._agent_ref = agent

    decision = executor.check_permission(
        "delegate_to_agent",
        {"agent_id": "worker-a", "message": "task"},
    )
    assert decision.behavior != "allow" or decision.policy_name != "rd_meeting"
