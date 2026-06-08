"""SOP 跨阶段转单钩子。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.sop_stage_hooks import run_sop_stage_transition_hook


@pytest.mark.asyncio
async def test_demand_analysis_to_designing_calls_api(monkeypatch: pytest.MonkeyPatch):
    calls: list[dict] = []

    async def _fake_designing(body):
        calls.append({"demandNo": body.demandNo, "comments": body.comments})
        return {"errorcode": 0, "message": "success"}

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.transfer_demand_to_designing",
        _fake_designing,
    )

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
    assert len(calls) == 1
    assert calls[0]["demandNo"] == "DEM-001"
    assert "需求分析" in calls[0]["comments"]
    assert "需求设计" in calls[0]["comments"]


@pytest.mark.asyncio
async def test_demand_design_to_developing_calls_api(monkeypatch: pytest.MonkeyPatch):
    calls: list[dict] = []

    async def _fake_developing(body):
        calls.append({"demandNo": body.demandNo, "comments": body.comments})
        return {"errorcode": 0}

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.transfer_demand_to_developing",
        _fake_developing,
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
    assert calls[0]["demandNo"] == "DEM-002"


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
