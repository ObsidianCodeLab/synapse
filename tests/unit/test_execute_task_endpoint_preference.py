"""execute_task 应应用 Agent._preferred_endpoint（会议室主控等路径）。"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from synapse.core.agent import Agent
from synapse.core.ralph import Task, TaskResult
from synapse.rd_meeting.orchestrator import MeetingRoomOrchestrator


def _minimal_agent() -> Agent:
    agent = Agent.__new__(Agent)
    object.__setattr__(agent, "_preferred_endpoint", None)
    object.__setattr__(agent, "_endpoint_policy", "prefer")
    agent._apply_endpoint_override_for_turn = MagicMock(return_value={})
    return agent


def test_apply_preferred_endpoint_for_execute_task_skips_default():
    agent = _minimal_agent()
    object.__setattr__(agent, "_preferred_endpoint", "default")

    agent._apply_preferred_endpoint_for_execute_task(
        conversation_id="rd_meeting:room-1:host",
        session_id="rd_meeting:room-1:host",
    )

    agent._apply_endpoint_override_for_turn.assert_not_called()


def test_apply_preferred_endpoint_for_execute_task_applies_named_endpoint():
    agent = _minimal_agent()
    object.__setattr__(agent, "_preferred_endpoint", "iwhalecloud-LOCAL-MiniMax-M2.7主")
    object.__setattr__(agent, "_endpoint_policy", "require")

    agent._apply_preferred_endpoint_for_execute_task(
        conversation_id="rd_meeting:room-1:host",
        session_id="rd_meeting:room-1:host",
    )

    agent._apply_endpoint_override_for_turn.assert_called_once_with(
        endpoint_override="iwhalecloud-LOCAL-MiniMax-M2.7主",
        endpoint_policy="require",
        session=None,
        conversation_id="rd_meeting:room-1:host",
        session_id="rd_meeting:room-1:host",
        reason="execute_task endpoint preference: iwhalecloud-LOCAL-MiniMax-M2.7主",
    )


def test_configure_meeting_agent_clears_preferred_endpoint_when_default():
    agent = SimpleNamespace(_preferred_endpoint="stale-endpoint")
    binding = {
        "host_llm_endpoint_key": "default",
        "worker_llm_endpoint_key": "default",
        "host_profile_id": "default",
        "worker_profile_ids": [],
        "node_id": "req_clarify",
        "stage_id": 1,
        "stage_name": "需求分析",
    }

    MeetingRoomOrchestrator._configure_meeting_agent(
        agent,
        role="host",
        binding=binding,
        scope_type="demand",
        scope_id="scope-1",
        ticket_title="",
        scope_path="/tmp/scope-1",
    )

    assert agent._preferred_endpoint is None


def test_configure_meeting_agent_sets_worker_preferred_endpoint():
    agent = SimpleNamespace(_preferred_endpoint=None)
    binding = {
        "host_llm_endpoint_key": "host-ep",
        "worker_llm_endpoint_key": "worker-ep",
        "host_profile_id": "default",
        "worker_profile_ids": ["worker-a"],
        "node_id": "req_clarify",
        "stage_id": 1,
        "stage_name": "需求分析",
    }

    MeetingRoomOrchestrator._configure_meeting_agent(
        agent,
        role="worker",
        binding=binding,
        scope_type="demand",
        scope_id="scope-1",
        ticket_title="",
        scope_path="/tmp/scope-1",
        self_profile_id="worker-a",
    )

    assert agent._preferred_endpoint == "worker-ep"


@pytest.mark.asyncio
async def test_execute_task_invokes_preferred_endpoint_hook(monkeypatch):
    calls: list[tuple[str, str | None]] = []

    def _spy(self, *, conversation_id, session_id):
        calls.append((conversation_id, session_id))

    monkeypatch.setattr(Agent, "_apply_preferred_endpoint_for_execute_task", _spy)

    agent = Agent.__new__(Agent)
    agent._initialized = True
    object.__setattr__(agent, "_preferred_endpoint", "meeting-host-ep")
    agent._context = SimpleNamespace(system="")
    agent._tools = []
    agent._is_sub_agent_call = False
    agent._agent_tool_names = set()
    agent.agent_state = None
    agent.brain = SimpleNamespace(
        model="test-model",
        max_tokens=1000,
        get_fallback_model=lambda _session_id=None: None,
        restore_default_model=lambda **_kwargs: None,
    )

    async def _fake_llm(*_args, **_kwargs):
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text="done")],
            stop_reason="end_turn",
            usage=SimpleNamespace(input_tokens=1, output_tokens=1),
        )

    agent._cancellable_llm_call = _fake_llm
    agent._compress_context = AsyncMock(side_effect=lambda msgs, **_: msgs)

    task = Task(id="t1", description="run node", session_id="rd_meeting:room-1:host")
    result = await agent.execute_task(task)

    assert calls == [("rd_meeting:room-1:host", "rd_meeting:room-1:host")]
    assert isinstance(result, TaskResult)
    assert result.success is True
