"""工单刷新后续：门户下架清理、rd_view 在途同步。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synapse.rd_meeting.owner_order_refresh import (
    build_rd_view_demand_save_payload,
    cleanup_orphan_work_directories,
    resolve_run_status,
    should_keep_orphan_demand,
    sync_userwork_view_to_unified_service,
)


def test_should_keep_orphan_only_when_completed():
    assert should_keep_orphan_demand({"local_process_state": "已完成"}) is True
    assert should_keep_orphan_demand({"local_process_state": "处理中"}) is False
    assert should_keep_orphan_demand({"local_process_state": "待处理"}) is False


def test_build_rd_view_demand_save_payload_maps_sop_fields(monkeypatch, tmp_path):
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh._load_assignee_id",
        lambda: "E001",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh.load_dev_status",
        lambda _dn: {"current_node_id": "req_clarify"},
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh.run_status_slug_for_demand",
        lambda *_a, **_k: "running",
    )

    demand = {
        "demand_no": "21878317",
        "demand_title": "测试需求",
        "demand_desc": "说明",
        "demand_create_time": "2026-04-29T16:37:45+08:00",
        "local_process_state": "处理中",
        "prod": "billing-core",
    }
    payload = build_rd_view_demand_save_payload(demand, assignee_id="E001")

    assert payload["demand_no"] == "21878317"
    assert payload["sop_node_id"] == "req_clarify"
    assert payload["stage"] == "analysis"
    assert payload["seq_id"] == 1
    assert payload["name"] == "需求澄清"
    assert payload["assignee_id"] == "E001"
    assert payload["product_name"] == "billing-core"
    assert payload["processing_mode"] == "ai"
    assert payload["run_status"] == "running"
    assert payload["comments"] == []


def test_build_rd_view_processing_mode():
    assert (
        build_rd_view_demand_save_payload(
            {"demand_no": "1", "local_process_state": "全人工"},
            assignee_id="x",
        )["processing_mode"]
        == "人工"
    )
    assert (
        build_rd_view_demand_save_payload(
            {"demand_no": "1", "local_process_state": "预备中"},
            assignee_id="x",
        )["processing_mode"]
        == "待定"
    )


def test_resolve_run_status_from_room_state(monkeypatch, tmp_path):
    dn = "D100"
    work = tmp_path / "work" / dn
    work.mkdir(parents=True)
    (work / "room_state.json").write_text(
        json.dumps({"status": "human_intervention"}, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr("synapse.rd_meeting.owner_order_refresh.scope_dir", lambda sid: tmp_path / "work" / sid)
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh.meeting_pipeline_path",
        lambda sid: tmp_path / "work" / sid / "meeting_pipeline.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh.load_room_state",
        lambda sid: json.loads((tmp_path / "work" / sid / "room_state.json").read_text(encoding="utf-8")),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh.read_json_file",
        lambda _p: None,
    )

    assert resolve_run_status(dn) == "待人工"


def test_cleanup_orphan_work_directories(monkeypatch, tmp_path):
    dn = "D999"
    work_dir = tmp_path / "work" / dn
    work_dir.mkdir(parents=True)
    (work_dir / "dev.status").write_text("{}", encoding="utf-8")

    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh.scope_dir",
        lambda sid: tmp_path / "work" / sid,
    )

    cleaned = cleanup_orphan_work_directories([dn, ""])
    assert cleaned == [dn]
    assert not work_dir.exists()


@pytest.mark.asyncio
async def test_sync_userwork_view_posts_each_demand(monkeypatch):
    calls: list[dict] = []

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"code": 0, "message": "ok", "data": {"demand_no": "1"}}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def post(self, url, json=None):
            calls.append({"url": url, "json": json})
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh.unified_service_base_url",
        lambda: "http://127.0.0.1:10001",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh._load_assignee_id",
        lambda: "E001",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh.build_rd_view_demand_save_payload",
        lambda demand, assignee_id: {"demand_no": demand["demand_no"], "assignee_id": assignee_id},
    )
    monkeypatch.setattr("synapse.rd_meeting.owner_order_refresh.httpx.AsyncClient", FakeClient)

    result = await sync_userwork_view_to_unified_service(
        demands=[
            {"demand_no": "A1", "local_process_state": "处理中"},
            {"demand_no": "A2", "local_process_state": "已完成"},
        ],
    )

    assert result["synced"] == 2
    assert result["failed"] == 0
    assert len(calls) == 2
    assert calls[0]["url"].endswith("/dev/iwhalecloud/synapse/rd_view_demand_save")
    assert calls[0]["json"]["demand_no"] == "A1"
