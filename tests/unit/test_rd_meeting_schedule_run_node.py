"""schedule_run_node 跨线程调度：node_finish 在 worker 线程内不得静默跳过。"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from synapse.rd_meeting.orchestrator import (
    _remember_scheduler_loop,
    _running_tasks,
    retry_pending_run_node_if_needed,
    schedule_run_node,
)
from synapse.rd_meeting.pipeline import STEP_WAITING, MeetingPipeline


@pytest.mark.asyncio
async def test_schedule_run_node_from_worker_thread_uses_main_loop(monkeypatch, tmp_path):
    """Worker 线程调用 schedule_run_node 应通过 call_soon_threadsafe 在协调 loop 上建 task。"""
    scope_id = "sched-thread-1"
    room_id = "mr_sched_thread"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    work = tmp_path / "work" / scope_id
    work.mkdir(parents=True)
    MeetingPipeline.create(scope_id, scope_type="demand")
    pipe = MeetingPipeline.load(scope_id)
    pipe._data["room_id"] = room_id
    pipe.set_flow_step(STEP_WAITING, reason="test")
    pipe.save()

    rs_calls: list[dict] = []

    def _fake_load_room_state(_sid: str):
        return {"pending_host_llm_begin_kind": "start_work"}

    def _fake_save_room_state(_sid: str, rs: dict):
        rs_calls.append(dict(rs))

    monkeypatch.setattr("synapse.rd_meeting.orchestrator.load_room_state", _fake_load_room_state)
    monkeypatch.setattr("synapse.rd_meeting.orchestrator.save_room_state", _fake_save_room_state)

    run_mock = AsyncMock()
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.MeetingRoomOrchestrator.run_current_node",
        run_mock,
    )

    _remember_scheduler_loop(asyncio.get_running_loop())

    def _call_from_worker() -> None:
        schedule_run_node(
            scope_type="demand",
            scope_id=scope_id,
            room_id=room_id,
            ticket_title="t",
            agent_pool=None,
        )

    await asyncio.to_thread(_call_from_worker)
    for _ in range(200):
        if run_mock.await_count > 0:
            break
        await asyncio.sleep(0.01)
    else:
        pytest.fail("run_current_node was not scheduled from worker thread")

    run_mock.assert_awaited_once()


def test_retry_pending_run_node_if_needed_schedules_when_waiting(monkeypatch, tmp_path):
    scope_id = "sched-retry-1"
    room_id = "mr_retry"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    (tmp_path / "work" / scope_id).mkdir(parents=True)
    MeetingPipeline.create(scope_id, scope_type="demand")
    pipe = MeetingPipeline.load(scope_id)
    pipe._data["room_id"] = room_id
    pipe.set_flow_step(STEP_WAITING, reason="test")
    pipe.save()

    scheduled: list[dict] = []

    def _fake_schedule(**kwargs):
        scheduled.append(kwargs)
        return room_id

    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.load_room_state",
        lambda _s: {"pending_host_llm_begin_kind": "start_work"},
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.load_dev_status",
        lambda _s: {
            "scope_type": "demand",
            "meeting_room": {"room_id": room_id},
            "ticket_title": "工单",
        },
    )
    monkeypatch.setattr("synapse.rd_meeting.orchestrator.is_room_run_in_progress", lambda _k: False)
    monkeypatch.setattr("synapse.rd_meeting.orchestrator.schedule_run_node", _fake_schedule)

    assert retry_pending_run_node_if_needed(scope_id) is True
    assert len(scheduled) == 1
    assert scheduled[0]["scope_id"] == scope_id
    assert scheduled[0]["room_id"] == room_id
