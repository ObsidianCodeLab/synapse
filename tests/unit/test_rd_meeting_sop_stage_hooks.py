"""SOP 跨阶段转单钩子。"""

from __future__ import annotations

import asyncio
import json

import pytest

from synapse.rd_meeting.sop_stage_hooks import (
    run_sop_stage_transition_hook,
    schedule_sop_stage_transition_hook,
)


def _patch_userwork_paths(monkeypatch: pytest.MonkeyPatch, tmp_path, initial_status: str = "需求评审"):
    uw_path = tmp_path / "userwork.json"
    uw_path.write_text(
        json.dumps(
            {
                "list": [
                    {
                        "demand_no": "DEM-001",
                        "demand_status": initial_status,
                        "sop_node": "需求风险",
                        "local_process_state": "处理中",
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.userwork_sync._owner_order_file_name",
        lambda: uw_path,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.userwork_sync._owner_order_file_lock_path",
        lambda: tmp_path / "userwork.lock",
    )
    return uw_path


@pytest.mark.asyncio
async def test_demand_analysis_to_designing_calls_api(monkeypatch: pytest.MonkeyPatch, tmp_path):
    calls: list[dict] = []

    async def _fake_designing(body):
        calls.append({"demandNo": body.demandNo, "comments": body.comments})
        return {"errorcode": 0, "message": "success"}

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.transfer_demand_to_designing",
        _fake_designing,
    )
    uw_path = _patch_userwork_paths(monkeypatch, tmp_path)

    out = await run_sop_stage_transition_hook(
        scope_type="demand",
        scope_id="DEM-001",
        from_stage=1,
        to_stage=2,
        completed_node_id="req_risk",
        next_node_id="func_assign",
    )
    assert out["status"] == "ok"
    assert out["hook"] == "transfer_demand_to_designing"
    assert out["userwork_applied"]["demand_status"] == "需求设计"
    assert len(calls) == 1
    assert calls[0]["demandNo"] == "DEM-001"
    assert "需求分析" in calls[0]["comments"]
    assert "需求设计" in calls[0]["comments"]

    saved = json.loads(uw_path.read_text(encoding="utf-8"))
    assert saved["list"][0]["demand_status"] == "需求设计"


@pytest.mark.asyncio
async def test_demand_design_to_developing_calls_api(monkeypatch: pytest.MonkeyPatch, tmp_path):
    calls: list[dict] = []

    async def _fake_developing(body):
        calls.append({"demandNo": body.demandNo, "comments": body.comments})
        return {"errorcode": 0}

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.transfer_demand_to_developing",
        _fake_developing,
    )
    uw_path = tmp_path / "userwork.json"
    uw_path.write_text(
        json.dumps(
            {
                "list": [
                    {
                        "demand_no": "DEM-002",
                        "demand_status": "需求设计",
                        "sop_node": "方案评审",
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.userwork_sync._owner_order_file_name",
        lambda: uw_path,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.userwork_sync._owner_order_file_lock_path",
        lambda: tmp_path / "userwork.lock",
    )

    out = await run_sop_stage_transition_hook(
        scope_type="demand",
        scope_id="DEM-002",
        from_stage=2,
        to_stage=3,
        completed_node_id="solution_review",
        next_node_id="auto_split",
    )
    assert out["status"] == "ok"
    assert out["hook"] == "transfer_demand_to_developing"
    assert out["userwork_applied"]["demand_status"] == "需求开发"
    assert calls[0]["demandNo"] == "DEM-002"

    saved = json.loads(uw_path.read_text(encoding="utf-8"))
    assert saved["list"][0]["demand_status"] == "需求开发"


@pytest.mark.asyncio
async def test_hook_api_error_does_not_update_userwork(monkeypatch: pytest.MonkeyPatch, tmp_path):
    async def _fake_designing(_body):
        return {"errorcode": -1, "message": "fail"}

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.transfer_demand_to_designing",
        _fake_designing,
    )
    uw_path = _patch_userwork_paths(monkeypatch, tmp_path, initial_status="需求评审")

    out = await run_sop_stage_transition_hook(
        scope_type="demand",
        scope_id="DEM-001",
        from_stage=1,
        to_stage=2,
        completed_node_id="req_risk",
        next_node_id="func_assign",
    )
    assert out["status"] == "api_error"
    assert out["userwork_applied"] == {}

    saved = json.loads(uw_path.read_text(encoding="utf-8"))
    assert saved["list"][0]["demand_status"] == "需求评审"


@pytest.mark.asyncio
async def test_unimplemented_transition_returns_todo():
    out = await run_sop_stage_transition_hook(
        scope_type="demand",
        scope_id="DEM-003",
        from_stage=3,
        to_stage=4,
        completed_node_id="env_pregen",
        next_node_id="task_exec",
    )
    assert out["status"] == "todo"
    assert out["hook"] is None
    assert "尚未实现" in out["message"]


@pytest.mark.asyncio
async def test_task_scope_returns_todo():
    out = await run_sop_stage_transition_hook(
        scope_type="task",
        scope_id="TASK-1",
        from_stage=1,
        to_stage=2,
        completed_node_id="req_risk",
        next_node_id="func_assign",
    )
    assert out["status"] == "todo"
    assert "任务单" in out["message"]


@pytest.mark.asyncio
async def test_schedule_hook_from_worker_thread(monkeypatch: pytest.MonkeyPatch, tmp_path):
    """pipeline to_thread 场景：后台线程应能把钩子投递回主事件循环。"""
    calls: list[str] = []
    history_events: list[dict] = []

    async def _fake_designing(body):
        calls.append(body.demandNo)
        return {"errorcode": 0, "message": "success"}

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.transfer_demand_to_designing",
        _fake_designing,
    )
    _patch_userwork_paths(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "synapse.rd_meeting.sop_stage_hooks.append_history_event",
        lambda _sid, event: history_events.append(event),
    )

    from synapse.rd_meeting.orchestrator import _remember_scheduler_loop

    _remember_scheduler_loop(asyncio.get_running_loop())

    def _invoke_from_worker_thread() -> None:
        schedule_sop_stage_transition_hook(
            scope_type="demand",
            scope_id="DEM-001",
            from_stage=1,
            to_stage=2,
            completed_node_id="req_risk",
            next_node_id="func_assign",
        )

    await asyncio.to_thread(_invoke_from_worker_thread)
    await asyncio.sleep(0.05)

    assert calls == ["DEM-001"]
    assert len(history_events) == 1
    assert history_events[0]["event"] == "sop_stage_transition_hook"
    assert history_events[0]["hook_status"] == "ok"
