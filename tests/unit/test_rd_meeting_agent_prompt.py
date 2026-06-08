"""会议室 Agent 提示词绑定（跳过 AGENTS.md）。"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from synapse.rd_meeting.agent_prompt import (
    MEETING_PROMPT_MARKER,
    clear_meeting_prompt_binding,
    ensure_meeting_agent_configured,
    get_meeting_prompt_node_id,
    is_meeting_agent_configured,
    is_meeting_room_system_prompt,
    resolve_rd_meeting_pool_session_id,
    set_meeting_prompt_node_id,
)
from synapse.rd_meeting.prewarm_coordinator import (
    bump_meeting_prewarm_generation,
    is_meeting_prewarm_generation_current,
    reset_meeting_prewarm_generations,
)


def test_is_meeting_room_system_prompt():
    assert is_meeting_room_system_prompt(f"{MEETING_PROMPT_MARKER}\n\n- **当前角色**")
    assert not is_meeting_room_system_prompt("## Project Guidelines (AGENTS.md)")


def test_is_meeting_agent_configured_requires_matching_node():
    agent = MagicMock()
    agent._org_context = True
    agent._context.system = f"{MEETING_PROMPT_MARKER}\n"
    set_meeting_prompt_node_id(agent, "req_clarify")

    assert is_meeting_agent_configured(agent, expected_node_id="req_clarify")
    assert not is_meeting_agent_configured(agent, expected_node_id="req_design")

    agent._org_context = False
    assert not is_meeting_agent_configured(agent, expected_node_id="req_clarify")


def test_clear_meeting_prompt_binding():
    agent = MagicMock()
    agent._org_context = True
    set_meeting_prompt_node_id(agent, "req_clarify")
    clear_meeting_prompt_binding(agent)
    assert get_meeting_prompt_node_id(agent) == ""
    assert agent._org_context is False


def test_resolve_rd_meeting_pool_session_id_for_worker_delegation():
    host_sid = "rd_meeting:room-abc:host"
    assert resolve_rd_meeting_pool_session_id(host_sid, "whalecloud-design-expert", depth=1) == (
        "rd_meeting:room-abc:whalecloud-design-expert"
    )
    assert resolve_rd_meeting_pool_session_id(host_sid, "default", depth=0) == host_sid
    assert resolve_rd_meeting_pool_session_id("desktop:abc", "default", depth=1) == "desktop:abc"


def test_ensure_meeting_agent_configured_reconfigures_on_node_change():
    agent = MagicMock()
    agent._org_context = True
    agent._context.system = f"{MEETING_PROMPT_MARKER}\n"
    set_meeting_prompt_node_id(agent, "req_clarify")

    with (
        patch(
            "synapse.rd_meeting.agent_prompt.scope_id_for_room_id",
            return_value="scope-1",
        ),
        patch(
            "synapse.rd_meeting.agent_prompt.load_dev_status",
            return_value={
                "current_node_id": "req_design",
                "scope_type": "demand",
            },
        ),
        patch(
            "synapse.rd_meeting.agent_prompt.resolve_node_binding",
            return_value={"node_id": "req_design", "host_profile_id": "default"},
        ),
        patch(
            "synapse.rd_meeting.orchestrator.MeetingRoomOrchestrator._configure_meeting_agent",
        ) as mock_configure,
        patch("synapse.rd_meeting.agent_prompt._refresh_meeting_activity_binding"),
    ):
        ensure_meeting_agent_configured(
            agent,
            session_id="rd_meeting:room-abc:host",
            agent_profile_id="worker-a",
            depth=1,
        )

    mock_configure.assert_called_once()
    call_kwargs = mock_configure.call_args.kwargs
    assert call_kwargs["binding"]["node_id"] == "req_design"
    assert call_kwargs["role"] == "worker"


def test_prewarm_generation_invalidates_stale_tasks():
    reset_meeting_prewarm_generations()
    g1 = bump_meeting_prewarm_generation("room-x")
    assert is_meeting_prewarm_generation_current("room-x", g1)
    g2 = bump_meeting_prewarm_generation("room-x")
    assert not is_meeting_prewarm_generation_current("room-x", g1)
    assert is_meeting_prewarm_generation_current("room-x", g2)
