"""工单整点同步：合并规则与系统任务执行。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from synapse.api.routes.dev_iwhalecloud import (
    OwnerOrderSyncError,
    _merge_owner_order_lists,
    sync_owner_orders_from_devcloud,
)
from synapse.scheduler import ScheduledTask, TriggerType
from synapse.scheduler.executor import TaskExecutor
from synapse.scheduler.task import TaskType


def test_merge_owner_orders_preserves_local_sop_state():
    old = [
        {
            "demand_no": "D1",
            "demand_status": "需求评审",
            "sop_node": "需求澄清",
            "local_process_state": "处理中",
            "owned_work_items": [{"task_no": "T-old", "task_title": "旧单"}],
        }
    ]
    new = [
        {
            "demand_no": "D1",
            "demand_status": "需求设计",
            "sop_node": "应被忽略",
            "local_process_state": "应被忽略",
            "owned_work_items": [{"task_no": "T-new", "task_title": "新单"}],
        },
        {
            "demand_no": "D2",
            "demand_status": "需求设计",
            "owned_work_items": [],
        },
    ]

    merged = _merge_owner_order_lists(old, new)

    assert len(merged) == 2
    d1 = next(x for x in merged if x["demand_no"] == "D1")
    assert d1["demand_status"] == "需求设计"
    assert d1["sop_node"] == "需求澄清"
    assert d1["local_process_state"] == "处理中"
    task_nos = {x["task_no"] for x in d1["owned_work_items"]}
    assert task_nos == {"T-old", "T-new"}

    d2 = next(x for x in merged if x["demand_no"] == "D2")
    assert d2["local_process_state"] == "全人工"
    assert d2["sop_node"] == ""


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
