"""工单整点同步：合并规则与系统任务执行。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from synapse.api.routes.dev_iwhalecloud import (
    OwnerOrderSyncError,
    _apply_local_process_state_on_new_demand_insert,
    _merge_demand_record,
    _merge_owned_work_item_record,
    _merge_owned_work_items,
    _merge_owner_order_lists,
    _refresh_local_state_from_demand_status,
    sync_owner_orders_from_devcloud,
)
from synapse.scheduler import ScheduledTask, TriggerType
from synapse.scheduler.executor import TaskExecutor
from synapse.scheduler.task import TaskType


def test_merge_owned_work_item_preserves_local_extensions():
    old = {
        "task_no": "T1",
        "task_title": "旧标题",
        "state": "开发完成",
        "portal_task_id": 9001,
        "feature_id": "feat-T1",
        "sop_node": "任务执行",
        "local_process_state": "处理中",
        "task_exec_status": "done",
        "task_exec_tokens": 1200,
    }
    new = {
        "task_no": "T1",
        "task_title": "新标题",
        "task_desc": "门户说明",
        "created_date": "2026-06-11",
        "sccb_work_hours": 2.5,
        "state": "已完成",
        "product_module_id": 10,
        "product_module_name": "ZMDB",
        "repo_url": "https://example.com/repo.git",
    }

    merged = _merge_owned_work_item_record(old, new)

    assert merged["task_title"] == "新标题"
    assert merged["state"] == "开发完成"
    assert merged["task_desc"] == "门户说明"
    assert merged["portal_task_id"] == 9001
    assert merged["feature_id"] == "feat-T1"
    assert "sop_node" not in merged
    assert "local_process_state" not in merged
    assert merged["task_exec_status"] == "done"
    assert merged["task_exec_tokens"] == 1200


def test_merge_owned_work_items_appends_new_and_drops_non_completed_orphan():
    old_items = [
        {
            "task_no": "T-old",
            "task_title": "仅本地",
            "feature_id": "feat-old",
            "state": "开发中",
        }
    ]
    new_items = [
        {
            "task_no": "T-new",
            "task_title": "门户新单",
            "state": "待处理",
        }
    ]

    merged = _merge_owned_work_items(old_items, new_items)
    by_no = {x["task_no"]: x for x in merged}

    assert set(by_no) == {"T-new"}
    assert by_no["T-new"]["task_title"] == "门户新单"


def test_merge_owned_work_items_keeps_completed_orphan():
    old_items = [
        {
            "task_no": "T-done",
            "task_title": "已完成孤儿",
            "state": "已完成",
            "sop_node": "任务执行",
        }
    ]
    new_items: list[dict] = []

    merged = _merge_owned_work_items(old_items, new_items)
    assert len(merged) == 1
    assert merged[0]["task_no"] == "T-done"
    assert merged[0]["state"] == "已完成"
    assert "sop_node" not in merged[0]


def test_refresh_local_state_only_for_pending_and_review():
    assert _refresh_local_state_from_demand_status("待处理") == ("预备中", "")
    assert _refresh_local_state_from_demand_status("需求评审") == ("待处理", "等待调度")
    assert _refresh_local_state_from_demand_status("需求设计") is None
    assert _refresh_local_state_from_demand_status("需求开发") is None


def test_new_demand_insert_sets_full_manual_for_late_stages():
    for stage in ("需求设计", "需求开发", "需求测试"):
        row = _apply_local_process_state_on_new_demand_insert(
            {"demand_no": "D-new", "demand_status": stage},
        )
        assert row["local_process_state"] == "全人工"
        assert row["sop_node"] == ""


def test_merge_owner_orders_preserves_local_sop_state():
    old = [
        {
            "demand_no": "D1",
            "demand_status": "需求评审",
            "demand_designer": "旧设计",
            "sop_node": "需求澄清",
            "local_process_state": "处理中",
            "prod": "my-product",
            "owned_work_items": [
                {
                    "task_no": "T-old",
                    "task_title": "旧单",
                    "feature_id": "feat-old",
                    "sop_node": "任务执行",
                }
            ],
        }
    ]
    new = [
        {
            "demand_no": "D1",
            "demand_status": "需求设计",
            "demand_designer": "新设计[0001]",
            "sop_node": "应被忽略",
            "local_process_state": "应被忽略",
            "prod": "应被忽略",
            "owned_work_items": [
                {
                    "task_no": "T-new",
                    "task_title": "新单",
                    "state": "待处理",
                }
            ],
        },
        {
            "demand_no": "D2",
            "demand_status": "需求设计",
            "sop_node": "",
            "local_process_state": "",
            "owned_work_items": [],
        },
    ]

    merged, cleanup = _merge_owner_order_lists(old, new)

    assert cleanup == []
    assert len(merged) == 2
    d1 = next(x for x in merged if x["demand_no"] == "D1")
    assert d1["demand_status"] == "需求设计"
    assert d1["demand_designer"] == "新设计[0001]"
    assert d1["sop_node"] == "需求澄清"
    assert d1["local_process_state"] == "处理中"
    assert d1["prod"] == "my-product"
    by_task = {x["task_no"]: x for x in d1["owned_work_items"]}
    assert set(by_task) == {"T-new"}
    assert by_task["T-new"]["task_title"] == "新单"
    assert by_task["T-new"]["state"] == "待处理"

    d2 = next(x for x in merged if x["demand_no"] == "D2")
    assert d2["local_process_state"] == "全人工"
    assert d2["sop_node"] == ""


def test_merge_owner_orders_refreshes_local_state_for_pending_and_review():
    old = [
        {
            "demand_no": "D-pending",
            "demand_status": "需求评审",
            "local_process_state": "待处理",
            "sop_node": "等待调度",
            "owned_work_items": [],
        },
        {
            "demand_no": "D-review",
            "demand_status": "待处理",
            "local_process_state": "预备中",
            "sop_node": "",
            "owned_work_items": [],
        },
    ]
    new = [
        {
            "demand_no": "D-pending",
            "demand_status": "待处理",
            "owned_work_items": [],
        },
        {
            "demand_no": "D-review",
            "demand_status": "需求评审",
            "owned_work_items": [],
        },
    ]

    merged, cleanup = _merge_owner_order_lists(old, new)
    assert cleanup == []
    by_no = {x["demand_no"]: x for x in merged}
    assert by_no["D-pending"]["local_process_state"] == "预备中"
    assert by_no["D-pending"]["sop_node"] == ""
    assert by_no["D-review"]["local_process_state"] == "待处理"
    assert by_no["D-review"]["sop_node"] == "等待调度"


def test_merge_demand_record_keeps_local_sop_during_review_refresh():
    """需求评审进行中刷新：门户仍为需求评审时不重置本地 sop_node / local_process_state。"""
    old = {
        "demand_no": "D-review-active",
        "demand_status": "需求评审",
        "demand_title": "旧标题",
        "sop_node": "需求澄清",
        "local_process_state": "处理中",
        "owned_work_items": [],
    }
    new = {
        "demand_no": "D-review-active",
        "demand_status": "需求评审",
        "demand_title": "门户新标题",
        "sop_node": "",
        "local_process_state": "",
        "owned_work_items": [],
    }

    merged = _merge_demand_record(old, new)

    assert merged["demand_title"] == "门户新标题"
    assert merged["sop_node"] == "需求澄清"
    assert merged["local_process_state"] == "处理中"


def test_merge_owner_order_keeps_completed_orphan_only():
    old = [
        {"demand_no": "D-done", "local_process_state": "已完成", "demand_title": "已完成单"},
        {"demand_no": "D-stale", "local_process_state": "处理中", "demand_title": "下架单"},
        {"demand_no": "D-pending", "local_process_state": "待处理", "demand_title": "待处理下架"},
    ]
    merged, cleanup = _merge_owner_order_lists(old, [])
    dns = {x["demand_no"] for x in merged}
    assert dns == {"D-done"}
    assert set(cleanup) == {"D-stale", "D-pending"}


@pytest.mark.asyncio
async def test_sync_owner_orders_from_devcloud_syncs_rd_view(monkeypatch):
    async def fake_fetch(**_kwargs):
        return (
            [{"demand_no": "D1", "local_process_state": "处理中", "demand_title": "t1"}],
            1,
        )

    persist_calls: list[dict] = []

    def fake_persist(*, out_list):
        persist_calls.append({"out_list": out_list})
        return {"removed_demands": ["D-old"], "cleaned_work_dirs": ["D-old"]}

    view_sync_calls: list[list] = []

    async def fake_view_sync(*, demands=None, timeout=60.0):
        view_sync_calls.append(list(demands or []))
        return {"status": "ok", "synced": len(demands or []), "failed": 0, "errors": []}

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.load_owner_info_cipher_from_file",
        lambda: "cipher",
    )
    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.load_owner_order_snapshot_from_file",
        lambda: {"list": [{"demand_no": "D1", "local_process_state": "处理中"}]},
    )
    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.fetch_owner_orders_from_devcloud",
        fake_fetch,
    )
    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.persist_owner_order_snapshot_to_file",
        fake_persist,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.owner_order_refresh.sync_userwork_view_to_unified_service",
        fake_view_sync,
    )

    result = await sync_owner_orders_from_devcloud()

    assert result["merged_list_size"] == 1
    assert result["removed_demands"] == ["D-old"]
    assert result["view_sync"]["synced"] == 1
    assert len(view_sync_calls) == 1
    assert view_sync_calls[0][0]["demand_no"] == "D1"


@pytest.mark.asyncio
async def test_system_sync_owner_orders_skips_without_userinfo(monkeypatch):
    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.load_owner_info_cipher_from_file",
        lambda: None,
    )
    executor = TaskExecutor()
    task = ScheduledTask(
        id="system_sync_owner_orders",
        name="工单同步",
        trigger_type=TriggerType.CRON,
        trigger_config={"cron": "0 * * * *"},
        action="system:sync_owner_orders",
        prompt="",
        description="",
        task_type=TaskType.TASK,
        enabled=True,
        deletable=False,
    )

    success, message = await executor._system_sync_owner_orders()

    assert success is True
    assert "跳过" in message


@pytest.mark.asyncio
async def test_system_sync_owner_orders_success(monkeypatch):
    async def fake_sync(**_kwargs):
        return {
            "total_from_cloud": 3,
            "fetched": 3,
            "previous_list_size": 2,
            "merged_list_size": 4,
        }

    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.sync_owner_orders_from_devcloud",
        fake_sync,
    )
    executor = TaskExecutor()

    success, message = await executor._system_sync_owner_orders()

    assert success is True
    assert "合并后本地 4 条" in message


@pytest.mark.asyncio
async def test_register_system_tasks_adds_owner_order_sync(monkeypatch):
    from synapse.core.agent import Agent

    class FakeTracker:
        def __init__(self, *_args, **_kwargs):
            pass

        def is_onboarding(self, _days):
            return False

    added: list[ScheduledTask] = []

    class FakeScheduler:
        def list_tasks(self):
            return []

        def get_task(self, _task_id):
            return None

        async def add_task(self, task):
            added.append(task)
            return task.id

        async def save(self):
            return None

        async def update_task(self, *_args, **_kwargs):
            return True

        async def disable_task(self, *_args, **_kwargs):
            return True

        async def enable_task(self, *_args, **_kwargs):
            return True

    monkeypatch.setattr(
        "synapse.scheduler.consolidation_tracker.ConsolidationTracker",
        FakeTracker,
    )
    monkeypatch.setattr(
        "synapse.workspace.backup.read_backup_settings",
        lambda _path: {"enabled": False},
    )
    scheduler = FakeScheduler()
    agent = SimpleNamespace(task_scheduler=scheduler)

    await Agent._register_system_tasks(agent)

    owner_task = next((t for t in added if t.id == "system_sync_owner_orders"), None)
    assert owner_task is not None
    assert owner_task.action == "system:sync_owner_orders"
    assert owner_task.trigger_config == {"cron": "0 * * * *"}


@pytest.mark.asyncio
async def test_sync_owner_orders_raises_without_cipher(monkeypatch):
    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud.load_owner_info_cipher_from_file",
        lambda: None,
    )
    with pytest.raises(OwnerOrderSyncError) as exc:
        await sync_owner_orders_from_devcloud()
    assert exc.value.status_code == 404
