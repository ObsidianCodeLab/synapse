"""工单完成归档：SOP/产出/仓库写入 rd_view 与本地 archived 状态。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synapse.rd_meeting.dev_status import default_dev_status, should_list_in_meeting_rooms
from synapse.rd_meeting.owner_order_archive import (
    ARCHIVED_LOCAL_STATE,
    archive_completed_demand_if_needed,
    collect_node_output_items,
    collect_repo_output_items,
    collect_sop_node_items,
)
from synapse.rd_meeting.owner_order_refresh import should_keep_orphan_demand, _should_archive_orphan_demand


def test_should_keep_orphan_completed_or_archived():
    assert should_keep_orphan_demand({"local_process_state": "已完成"}) is True
    assert should_keep_orphan_demand({"local_process_state": ARCHIVED_LOCAL_STATE}) is True
    assert should_keep_orphan_demand({"local_process_state": "处理中"}) is False


def test_should_archive_orphan_only_completed():
    assert _should_archive_orphan_demand({"local_process_state": "已完成"}) is True
    assert _should_archive_orphan_demand({"local_process_state": ARCHIVED_LOCAL_STATE}) is False
    assert _should_archive_orphan_demand({"local_process_state": "处理中"}) is False


def test_should_list_excludes_archived():
    data = default_dev_status(scope_type="demand", scope_id="D1", local_process_state="已归档")
    data["pipeline_enabled"] = True
    data["meeting_room"] = {"active": True}
    assert should_list_in_meeting_rooms(data) is False


def test_collect_sop_node_items_from_room_state(monkeypatch, tmp_path):
    dn = "21890001"
    work = tmp_path / "work" / dn
    work.mkdir(parents=True)
    (work / "room_state.json").write_text(
        json.dumps(
            {
                "node_metrics": {
                    "req_clarify": {
                        "started_at": "2026-06-01T10:00:00",
                        "completed_at": "2026-06-01T11:00:00",
                        "seconds": 3600,
                        "tokens": 1200,
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr("synapse.rd_meeting.owner_order_archive.scope_dir", lambda sid: tmp_path / "work" / sid)
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_archive.load_room_state",
        lambda sid: json.loads((tmp_path / "work" / sid / "room_state.json").read_text(encoding="utf-8")),
    )
    monkeypatch.setattr("synapse.rd_meeting.owner_order_archive._resolve_node_model", lambda *_a, **_k: "claude-test")

    items = collect_sop_node_items(demand_no=dn, scope_id=dn)
    assert len(items) == 1
    assert items[0]["demand_no"] == dn
    assert items[0]["sop_node_id"] == "req_clarify"
    assert items[0]["stage"] == "analysis"
    assert items[0]["tokens"] == 1200
    assert items[0]["model"] == "claude-test"


def test_collect_node_output_items(monkeypatch, tmp_path):
    dn = "21890002"
    work = tmp_path / "work" / dn
    archive_dir = work / "archive" / "需求分析" / "req_clarify"
    archive_dir.mkdir(parents=True)
    (archive_dir / "需求澄清.md").write_text("# 澄清", encoding="utf-8")

    monkeypatch.setattr("synapse.rd_meeting.owner_order_archive.scope_dir", lambda sid: tmp_path / "work" / sid)
    monkeypatch.setattr("synapse.rd_meeting.paths.scope_dir", lambda sid: tmp_path / "work" / sid)

    items = collect_node_output_items(
        demand_no=dn,
        scope_id=dn,
        node_id_map={"req_clarify": 11},
    )
    assert len(items) == 1
    assert items[0]["node_id"] == 11
    assert items[0]["label"] == "需求澄清.md"
    assert items[0]["url"].endswith("archive/需求分析/req_clarify/需求澄清.md")


def test_collect_repo_output_items(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_archive.collect_repo_branch_stats",
        lambda path, **kwargs: {
            "lines_added": 120,
            "lines_deleted": 30,
            "commit_count": 3,
        },
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_archive._sandbox_path_for_task",
        lambda scope_id, task_no, product_module: "/tmp/sandbox/repo",
    )
    demand = {
        "owned_work_items": [
            {
                "task_no": "T1",
                "repo_url": "https://git.example.com/group/billing-core.git",
                "product_module_name": "billing-core",
                "feature_id": "feat-001",
            }
        ]
    }
    items = collect_repo_output_items(
        demand_no="D100",
        demand=demand,
        node_id_map={"exception_check": 22},
    )
    assert len(items) == 1
    assert items[0]["node_id"] == 22
    assert items[0]["repo_name"] == "billing-core"
    assert items[0]["branch"] == "feat-001"
    assert items[0]["lines_added"] == 120
    assert items[0]["lines_deleted"] == 30
    assert items[0]["commit_count"] == 3


@pytest.mark.asyncio
async def test_archive_completed_demand_if_needed_marks_archived(monkeypatch, tmp_path):
    dn = "21890003"
    work = tmp_path / "work" / dn
    work.mkdir(parents=True)
    (work / "room_state.json").write_text(
        json.dumps({"node_metrics": {"req_clarify": {"started_at": "2026-06-01T10:00:00", "seconds": 60, "tokens": 10}}}),
        encoding="utf-8",
    )
    (work / "dev.status").write_text(
        json.dumps(
            {
                "scope": {"type": "demand", "id": dn},
                "local_process_state": "已完成",
                "pipeline_enabled": True,
                "meeting_room": {"active": True, "room_id": f"mr_d_{dn}_s1"},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    userwork = tmp_path / "work" / "userwork.json"
    userwork.write_text(
        json.dumps(
            {
                "list": [
                    {
                        "demand_no": dn,
                        "demand_title": "归档测试",
                        "demand_desc": "desc",
                        "demand_create_time": "2026-06-01T09:00:00",
                        "local_process_state": "已完成",
                        "prod": "billing",
                    }
                ]
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    calls: list[tuple[str, dict]] = []

    class FakeResp:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def post(self, url, json=None):
            calls.append((url, json or {}))
            if url.endswith("rd_view_sop_node_insert"):
                return FakeResp({"code": 0, "data": {"items": [{"id": 1, "demand_no": dn, "sop_node_id": "req_clarify"}]}})
            return FakeResp({"code": 0, "message": "ok"})

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

    monkeypatch.setattr("synapse.rd_meeting.owner_order_archive.scope_dir", lambda sid: tmp_path / "work" / sid)
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_archive.load_room_state",
        lambda sid: json.loads((tmp_path / "work" / sid / "room_state.json").read_text(encoding="utf-8")),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_archive.load_owner_order_snapshot_from_file",
        lambda: json.loads(userwork.read_text(encoding="utf-8")),
    )
    monkeypatch.setattr("synapse.rd_meeting.owner_order_archive.unified_service_base_url", lambda: "http://127.0.0.1:10001")
    monkeypatch.setattr("synapse.rd_meeting.owner_order_refresh._load_assignee_id", lambda: "E001")
    monkeypatch.setattr("synapse.rd_meeting.owner_order_archive.httpx.AsyncClient", FakeClient)
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_archive.patch_userwork_summary",
        lambda **kwargs: {"local_process_state": kwargs.get("local_process_state", "")},
    )

    saved: list[dict] = []

    def _save_dev_status(scope_id, payload):
        saved.append(payload)
        return payload

    monkeypatch.setattr("synapse.rd_meeting.owner_order_archive.save_dev_status", _save_dev_status)
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_archive.load_dev_status",
        lambda sid: json.loads((tmp_path / "work" / sid / "dev.status").read_text(encoding="utf-8")),
    )

    result = await archive_completed_demand_if_needed(demand_no=dn)

    assert result["archived"] is True
    assert result["status"] == "ok"
    assert any(url.endswith("rd_view_sop_node_insert") for url, _ in calls)
    assert any(url.endswith("rd_view_demand_save") for url, payload in calls if payload.get("local_process_state") == ARCHIVED_LOCAL_STATE)
    assert saved and saved[0]["local_process_state"] == ARCHIVED_LOCAL_STATE
    assert saved[0]["pipeline_enabled"] is False
