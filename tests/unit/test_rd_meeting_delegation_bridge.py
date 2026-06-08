"""rd_meeting delegation_bridge 与 Orchestrator.delegate 门控接线。"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from synapse.rd_meeting.delegation_bridge import begin_rd_meeting_delegation


def test_begin_delegation_passes_outside_meeting() -> None:
    assert begin_rd_meeting_delegation("desktop:abc", from_agent="host", to_agent="w") is None


def test_begin_delegation_blocks_without_plan() -> None:
    session = "rd_meeting:room-bridge:host"
    err = begin_rd_meeting_delegation(
        session, from_agent="default", to_agent="worker-a"
    )
    assert err is not None
    assert err.startswith("❌")


@pytest.mark.asyncio
async def test_orchestrator_delegate_returns_gate_error() -> None:
    from synapse.agents.orchestrator import AgentOrchestrator

    orch = AgentOrchestrator()
    orch._profile_store = MagicMock()
    orch._profile_store.get.return_value = None

    session = MagicMock()
    session.id = "rd_meeting:room-orch:host"
    session.context = MagicMock()
    session.context.handoff_events = []
    session.chat_id = session.id

    with patch.object(orch, "_ensure_deps"):
        with patch.object(orch, "_dispatch", new_callable=AsyncMock) as mock_dispatch:
            result = await orch.delegate(
                session=session,
                from_agent="default",
                to_agent="worker-a",
                message="do task",
            )
            mock_dispatch.assert_not_called()
    assert result is not None
    assert "❌" in result or "计划" in result or "工作安排" in result
