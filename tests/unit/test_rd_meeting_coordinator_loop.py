"""会议室协调 loop：run_node 优先调度到 engine loop。"""

from __future__ import annotations

import asyncio
import threading
from unittest.mock import AsyncMock

import pytest

from synapse.core.engine_bridge import set_api_loop, set_engine_loop
from synapse.rd_meeting.orchestrator import (
    _running_tasks,
    schedule_run_node,
)


@pytest.mark.asyncio
async def test_schedule_run_node_from_api_loop_uses_engine_loop(monkeypatch, tmp_path):
    """API loop 调用 schedule_run_node 时，task 应创建在 engine loop 上。"""
    scope_id = "coord-engine-1"
    room_id = "mr_coord_engine"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    api_loop = asyncio.get_running_loop()
    engine_loop = asyncio.new_event_loop()
    ready = threading.Event()

    def _engine_thread() -> None:
        asyncio.set_event_loop(engine_loop)
        ready.set()
        engine_loop.run_forever()

    thread = threading.Thread(target=_engine_thread, daemon=True, name="test-engine")
    thread.start()
    ready.wait(timeout=5)

    set_engine_loop(engine_loop)
    set_api_loop(api_loop)

    run_gate = asyncio.Event()

    async def _slow_run(*_args, **_kwargs) -> None:
        await run_gate.wait()

    run_mock = AsyncMock(side_effect=_slow_run)
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.load_room_state",
        lambda _sid: {"pending_host_llm_begin_kind": "start_work"},
    )
    monkeypatch.setattr("synapse.rd_meeting.orchestrator.save_room_state", lambda *_a, **_k: None)
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.MeetingRoomOrchestrator.run_current_node",
        run_mock,
    )

    _running_tasks.pop(room_id, None)

    schedule_run_node(
        scope_type="demand",
        scope_id=scope_id,
        room_id=room_id,
        ticket_title="t",
        agent_pool=None,
    )

    for _ in range(500):
        task = _running_tasks.get(room_id)
        if task is not None:
            assert task.get_loop() is engine_loop
            break
        await asyncio.sleep(0.01)
    else:
        engine_loop.call_soon_threadsafe(engine_loop.stop)
        thread.join(timeout=5)
        pytest.fail("run_current_node task was not scheduled on engine loop")

    task = _running_tasks.get(room_id)
    assert task is not None
    engine_loop.call_soon_threadsafe(run_gate.set)
    engine_loop.call_soon_threadsafe(task.cancel)
    engine_loop.call_soon_threadsafe(engine_loop.stop)
    thread.join(timeout=5)


@pytest.mark.asyncio
async def test_schedule_node_finish_from_api_loop_uses_caller_loop(monkeypatch, tmp_path):
    """API loop 调用 schedule_node_finish 时，task 应创建在调用方 loop 而非 engine loop。"""
    scope_id = "coord-finish-1"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    api_loop = asyncio.get_running_loop()
    engine_loop = asyncio.new_event_loop()
    ready = threading.Event()

    def _engine_thread() -> None:
        asyncio.set_event_loop(engine_loop)
        ready.set()
        engine_loop.run_forever()

    thread = threading.Thread(target=_engine_thread, daemon=True, name="test-engine-finish")
    thread.start()
    ready.wait(timeout=5)

    set_engine_loop(engine_loop)
    set_api_loop(api_loop)

    work = tmp_path / "work" / scope_id
    work.mkdir(parents=True)
    from synapse.rd_meeting.dev_status import default_dev_status, save_dev_status
    from synapse.rd_meeting.pipeline import MeetingPipeline, STEP_WAITING, schedule_node_finish

    dev = default_dev_status(
        scope_type="demand",
        scope_id=scope_id,
        current_node_id="module_func",
        stage_id=1,
    )
    dev["meeting_room"] = {"active": True, "room_id": "mr_finish"}
    save_dev_status(scope_id, dev)
    pipe = MeetingPipeline.create(scope_id, scope_type="demand", flow_step=STEP_WAITING)
    pipe._data["room_id"] = "mr_finish"
    pipe.save()

    advance_called = asyncio.Event()

    monkeypatch.setattr(
        "synapse.rd_meeting.pipeline.run_pipeline_until_waiting",
        lambda *_a, **_k: advance_called.set(),
    )

    scheduled_tasks: list[asyncio.Task[None]] = []
    original_create_task = api_loop.create_task

    def _capture_create_task(coro, *, name=None, context=None):
        task = original_create_task(coro, name=name, context=context)
        scheduled_tasks.append(task)
        return task

    monkeypatch.setattr(api_loop, "create_task", _capture_create_task)

    schedule_node_finish(
        scope_type="demand",
        scope_id=scope_id,
        last_node_id="req_clarify",
    )

    assert scheduled_tasks, "schedule_node_finish should create task on API loop"
    assert scheduled_tasks[0].get_loop() is api_loop

    await asyncio.wait_for(advance_called.wait(), timeout=2.0)

    engine_loop.call_soon_threadsafe(engine_loop.stop)
    thread.join(timeout=5)
