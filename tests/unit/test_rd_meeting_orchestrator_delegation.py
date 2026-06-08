"""研发会议室委派回归：Orchestrator 必须使用 Worker 池化键并补配会议室 prompt。

上游合并若回退 ``_run_with_progress_timeout`` 里对
``resolve_rd_meeting_pool_session_id`` / ``ensure_meeting_agent_configured`` 的调用，
会导致协作智能体无法接到任务（与 prewarm 键 ``rd_meeting:{room}:{profile}`` 不一致）。
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from synapse.agents.fallback import FallbackResolver
from synapse.agents.orchestrator import AgentOrchestrator
from synapse.agents.profile import AgentProfile, AgentType, ProfileStore
from synapse.sessions.session import Session, SessionConfig, SessionContext

HOST_SESSION_ID = "rd_meeting:room-regression-test:host"
WORKER_PROFILE_ID = "whalecloud-design-expert"
EXPECTED_POOL_SESSION_ID = f"rd_meeting:room-regression-test:{WORKER_PROFILE_ID}"


def _completed_task(coro, *, result: str):
    """替代 asyncio.create_task：立即完成，并关闭未执行的协程以免 ResourceWarning。"""
    if asyncio.iscoroutine(coro):
        coro.close()
    fut = asyncio.get_running_loop().create_future()
    fut.set_result(result)
    return fut


def _meeting_host_session() -> Session:
    ctx = SessionContext(agent_profile_id="default")
    return Session(
        id=HOST_SESSION_ID,
        channel="rd_meeting",
        chat_id="room-regression-test",
        user_id="meeting_room",
        context=ctx,
        config=SessionConfig(),
    )


@pytest.fixture
def orchestrator_with_worker_profile(tmp_path: Path) -> AgentOrchestrator:
    store = ProfileStore(tmp_path / "agents")
    store.save(AgentProfile(id="default", name="Host", type=AgentType.SYSTEM))
    store.save(
        AgentProfile(
            id=WORKER_PROFILE_ID,
            name="Design Expert",
            type=AgentType.CUSTOM,
        )
    )

    mock_agent = MagicMock()
    mock_agent._is_sub_agent_call = False
    mock_agent._agent_profile = None
    mock_agent._last_finalized_trace = []
    mock_agent.agent_state = None
    mock_agent.reasoning_engine = None

    pool = MagicMock()
    pool.get_or_create = AsyncMock(return_value=mock_agent)

    orch = AgentOrchestrator()
    orch._profile_store = store
    orch._pool = pool
    orch._fallback = FallbackResolver(store)
    orch._log_dir = tmp_path / "delegation_logs"
    orch._log_dir.mkdir(parents=True, exist_ok=True)
    return orch


@pytest.mark.asyncio
async def test_run_with_progress_timeout_uses_worker_pool_session_for_meeting_delegation(
    orchestrator_with_worker_profile: AgentOrchestrator,
):
    """depth>0 委派协作智能体时，get_or_create 必须使用 rd_meeting:{room}:{profile}。"""
    orch = orchestrator_with_worker_profile
    session = _meeting_host_session()
    worker_profile = orch._profile_store.get(WORKER_PROFILE_ID)

    with (
        patch(
            "synapse.rd_meeting.agent_prompt.ensure_meeting_agent_configured",
        ) as mock_ensure,
        patch(
            "synapse.agents.orchestrator.asyncio.create_task",
            side_effect=lambda c: _completed_task(c, result="worker done"),
        ),
    ):
        result = await orch._run_with_progress_timeout(
            session,
            "委派任务",
            WORKER_PROFILE_ID,
            depth=1,
        )

    assert result == "worker done"
    orch._pool.get_or_create.assert_awaited_once_with(EXPECTED_POOL_SESSION_ID, worker_profile)
    mock_ensure.assert_called_once()
    ensure_kwargs = mock_ensure.call_args.kwargs
    assert ensure_kwargs["session_id"] == EXPECTED_POOL_SESSION_ID
    assert ensure_kwargs["agent_profile_id"] == WORKER_PROFILE_ID
    assert ensure_kwargs["depth"] == 1


@pytest.mark.asyncio
async def test_run_with_progress_timeout_host_depth_zero_keeps_host_pool_key(
    orchestrator_with_worker_profile: AgentOrchestrator,
):
    """主控 depth=0 仍使用 host 会话键，但应触发会议室 ensure（绑定当前节点 prompt）。"""
    orch = orchestrator_with_worker_profile
    session = _meeting_host_session()
    host_profile = orch._profile_store.get("default")

    with (
        patch(
            "synapse.rd_meeting.agent_prompt.ensure_meeting_agent_configured",
        ) as mock_ensure,
        patch(
            "synapse.agents.orchestrator.asyncio.create_task",
            side_effect=lambda c: _completed_task(c, result="host done"),
        ),
    ):
        result = await orch._run_with_progress_timeout(
            session,
            "主控任务",
            "default",
            depth=0,
        )

    assert result == "host done"
    orch._pool.get_or_create.assert_awaited_once_with(HOST_SESSION_ID, host_profile)
    mock_ensure.assert_called_once()
    assert mock_ensure.call_args.kwargs["session_id"] == HOST_SESSION_ID
    assert mock_ensure.call_args.kwargs["depth"] == 0


@pytest.mark.asyncio
async def test_run_with_progress_timeout_skips_meeting_ensure_for_non_meeting_session(
    orchestrator_with_worker_profile: AgentOrchestrator,
):
    """非研发会议室会话不得调用 ensure_meeting_agent_configured。"""
    orch = orchestrator_with_worker_profile
    ctx = SessionContext(agent_profile_id="helper")
    session = Session(
        id="desktop:chat-1",
        channel="cli",
        chat_id="chat-1",
        user_id="user-1",
        context=ctx,
        config=SessionConfig(),
    )
    helper_profile = orch._profile_store.get("default")

    with (
        patch(
            "synapse.rd_meeting.agent_prompt.ensure_meeting_agent_configured",
        ) as mock_ensure,
        patch(
            "synapse.agents.orchestrator.asyncio.create_task",
            side_effect=lambda c: _completed_task(c, result="cli done"),
        ),
    ):
        await orch._run_with_progress_timeout(session, "hello", "default", depth=0)

    orch._pool.get_or_create.assert_awaited_once_with("desktop:chat-1", helper_profile)
    mock_ensure.assert_not_called()


@pytest.mark.asyncio
async def test_call_agent_uses_pool_session_id_for_worker_todo_isolation(
    orchestrator_with_worker_profile: AgentOrchestrator,
):
    """Worker 委派时 chat_with_session 须用池化 session_id，不可复用 Host session.id。"""
    orch = orchestrator_with_worker_profile
    session = _meeting_host_session()
    worker_agent = MagicMock()
    worker_agent.chat_with_session = AsyncMock(return_value="worker done")
    worker_agent._execution_lock = asyncio.Lock()
    worker_agent._agent_profile = orch._profile_store.get(WORKER_PROFILE_ID)
    worker_agent._agent_profile_id = WORKER_PROFILE_ID
    worker_agent.reasoning_engine = None

    result = await AgentOrchestrator._call_agent(
        worker_agent,
        session,
        "委派任务",
        is_sub_agent=True,
        pool_session_id=EXPECTED_POOL_SESSION_ID,
    )

    assert "worker done" in result
    worker_agent.chat_with_session.assert_awaited_once()
    assert worker_agent.chat_with_session.call_args.kwargs["session_id"] == EXPECTED_POOL_SESSION_ID
    assert worker_agent.chat_with_session.call_args.kwargs["session_id"] != HOST_SESSION_ID


@pytest.mark.asyncio
async def test_run_with_progress_timeout_tracks_worker_pool_session_progress(
    orchestrator_with_worker_profile: AgentOrchestrator,
    monkeypatch: pytest.MonkeyPatch,
):
    """进度指纹须用 pool session id；用 Host session.id 会永远读不到 Worker 任务。"""
    orch = orchestrator_with_worker_profile
    session = _meeting_host_session()
    worker_profile = orch._profile_store.get(WORKER_PROFILE_ID)

    class _FakeTask:
        iteration = 2
        status = type("S", (), {"value": "running"})()
        tools_executed = ["read_file", "create_todo"]

    class _FakeState:
        def get_task_for_session(self, sid: str):
            if sid == EXPECTED_POOL_SESSION_ID:
                return _FakeTask()
            return None

        current_task = None

    worker_agent = MagicMock()
    worker_agent.agent_state = _FakeState()
    worker_agent.chat_with_session = AsyncMock(return_value="worker done")
    worker_agent._execution_lock = asyncio.Lock()
    worker_agent._agent_profile = worker_profile
    worker_agent._agent_profile_id = WORKER_PROFILE_ID
    worker_agent.reasoning_engine = None
    orch._pool.get_or_create = AsyncMock(return_value=worker_agent)

    progress_events: list[tuple[int, int]] = []

    async def _slow_chat(*args, **kwargs):
        await asyncio.sleep(0.35)
        return "worker done"

    worker_agent.chat_with_session = _slow_chat

    from synapse.config import settings as app_settings

    monkeypatch.setattr(app_settings, "progress_timeout_seconds", 600)
    monkeypatch.setattr(app_settings, "hard_timeout_seconds", 0)

    real_log = orch._log_delegation

    def _capture_log(payload: dict) -> None:
        if payload.get("event") == "progress":
            progress_events.append((payload.get("iter", -1), payload.get("tools_count", 0)))
        real_log(payload)

    monkeypatch.setattr(orch, "_log_delegation", _capture_log)

    with patch("synapse.rd_meeting.agent_prompt.ensure_meeting_agent_configured"):
        result = await orch._run_with_progress_timeout(
            session,
            "委派任务",
            WORKER_PROFILE_ID,
            depth=1,
        )

    assert "worker done" in result
    assert progress_events, "expected progress fingerprint updates from worker pool session"
    assert progress_events[0][0] == 2
    assert progress_events[0][1] == 2
