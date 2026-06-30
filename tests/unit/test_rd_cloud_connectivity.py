"""研发云连通性统一检测。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.rd_cloud_connectivity import (
    check_rd_cloud_connectivity,
    context_for_node_id,
    require_rd_cloud_connectivity,
)
from synapse.rd_meeting.sop_stage_hooks import (
    cross_stage_hook_required,
    planned_demand_stage_hook,
    run_sop_stage_transition_hook,
)


def test_context_for_node_id_mapping():
    assert context_for_node_id("auto_split") == "auto_split"
    assert context_for_node_id("exception_check") == "code_commit"
    assert context_for_node_id("diff_analysis") == "flight_optimize"
    assert context_for_node_id("leader_review") == "leader_review"
    assert context_for_node_id("req_clarify") is None


def test_planned_demand_stage_hook():
    assert planned_demand_stage_hook(1, 2) == "transfer_demand_to_designing"
    assert planned_demand_stage_hook(2, 3) == "transfer_demand_to_developing"
    assert planned_demand_stage_hook(1, 3) is None


def test_cross_stage_hook_required():
    assert cross_stage_hook_required(scope_type="demand", from_stage=1, to_stage=2) is True
    assert cross_stage_hook_required(scope_type="task", from_stage=1, to_stage=2) is False
    assert cross_stage_hook_required(scope_type="demand", from_stage=1, to_stage=1) is False


def test_check_rd_cloud_connectivity_missing_userinfo(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.rd_cloud_connectivity._check_portal_credentials",
        lambda: (False, "未找到 userinfo.encryption"),
    )
    result = check_rd_cloud_connectivity(context="auto_split")
    assert result.ok is False
    assert "自动拆单" in result.message
    assert "userinfo" in result.message


def test_check_rd_cloud_connectivity_all_ok(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.rd_cloud_connectivity._check_portal_credentials",
        lambda: (True, ""),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.rd_cloud_connectivity._check_portal_http",
        lambda **_: (True, ""),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.rd_cloud_connectivity._check_devservice",
        lambda **_: (True, "", "10.0.0.1", [{"port": 10001, "ok": True}], []),
    )
    result = check_rd_cloud_connectivity(context="code_commit")
    assert result.ok is True
    assert require_rd_cloud_connectivity(context="code_commit", node_id="exception_check") is None


def test_check_rd_cloud_connectivity_devservice_ports_failed(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.rd_cloud_connectivity._check_portal_credentials",
        lambda: (True, ""),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.rd_cloud_connectivity._check_portal_http",
        lambda **_: (True, ""),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.rd_cloud_connectivity._check_devservice",
        lambda **_: (
            False,
            "产品公共服务端口不可达（10001）",
            "10.0.0.1",
            [{"port": 10001, "ok": False, "error": "refused"}],
            [10001],
        ),
    )
    err = require_rd_cloud_connectivity(context="flight_optimize", node_id="diff_analysis")
    assert err is not None
    assert "试飞优化" in err or "diff_analysis" in err or "10001" in err


@pytest.mark.asyncio
async def test_run_sop_stage_hook_blocks_on_connectivity(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.rd_cloud_connectivity.require_rd_cloud_connectivity",
        lambda **_: "跨阶段转单前研发云不可达",
    )
    outcome = await run_sop_stage_transition_hook(
        scope_type="demand",
        scope_id="D-001",
        from_stage=1,
        to_stage=2,
        completed_node_id="req_risk",
        next_node_id="func_assign",
    )
    assert outcome["status"] == "connectivity_error"
    assert "不可达" in str(outcome.get("message") or "")
