"""会议室工具 handler 注册与 session 绑定。"""

from __future__ import annotations

from unittest.mock import MagicMock

from synapse.rd_meeting.agent_session import (
    bind_meeting_agent_session,
    clear_meeting_agent_session,
    ensure_host_session,
    host_session_id,
    prepare_host_for_meeting_run,
    release_meeting_pool_agent,
)
from synapse.tools.handlers.meeting_room import create_meeting_room_handler


def test_create_meeting_room_handler_registers_tool():
    agent = MagicMock()
    agent.handler_registry = __import__(
        "synapse.tools.handlers", fromlist=["SystemHandlerRegistry"]
    ).SystemHandlerRegistry()
    handle = create_meeting_room_handler(agent)
    agent.handler_registry.register("meeting_room", handle)
    assert agent.handler_registry.has_tool("submit_meeting_work_plan")


def test_host_session_id_and_bind():
    sid = host_session_id("room-abc")
    assert sid == "rd_meeting:room-abc:host"
    session = ensure_host_session("room-abc", "default")
    assert session.id == sid
    assert session.context.agent_profile_id == "default"

    agent = MagicMock()
    agent.agent_state = MagicMock()
    bind_meeting_agent_session(agent, session)
    assert agent._current_session is session
    assert agent._current_session_id == sid
    clear_meeting_agent_session(agent)
    assert agent._current_session is None


def test_clear_meeting_session_does_not_restore_full_tools():
    """同一节点多轮 _run_host：轮次间只清 session，不恢复全量工具。"""
    agent = MagicMock()
    agent._tools = [{"name": "run_shell"}, {"name": "delegate_to_agent"}]
    agent._meeting_orig_tools = [
        {"name": "run_shell"},
        {"name": "delegate_to_agent"},
        {"name": "list_skills"},
    ]
    agent.agent_state = MagicMock()

    clear_meeting_agent_session(agent)

    assert len(agent._tools) == 2
    assert agent._meeting_orig_tools is not None


def test_prepare_host_reapplies_slim_after_restore():
    agent = MagicMock()
    agent._tools = [
        {"name": "run_shell"},
        {"name": "create_todo"},
        {"name": "list_skills"},
        {"name": "delegate_to_agent"},
        {"name": "browser_navigate"},
    ]
    agent._meeting_orig_tools = list(agent._tools)
    agent.tool_catalog = MagicMock()
    agent.prompt_assembler = None
    agent.agent_state = MagicMock()

    prepare_host_for_meeting_run(agent)

    names = {t["name"] for t in agent._tools}
    assert "list_skills" not in names
    assert "browser_navigate" not in names
    assert "delegate_to_agent" in names
    assert agent._org_context is True


def test_release_meeting_pool_agent_restores_full_tools():
    agent = MagicMock()
    agent._tools = [{"name": "run_shell"}]
    agent._meeting_orig_tools = [
        {"name": "run_shell"},
        {"name": "list_skills"},
    ]
    agent.tool_catalog = MagicMock()
    agent.prompt_assembler = None
    agent.agent_state = MagicMock()
    agent._org_context = True

    release_meeting_pool_agent(agent)

    assert len(agent._tools) == 2
    assert agent._meeting_orig_tools is None
    assert agent._org_context is False
    assert agent._current_session is None
