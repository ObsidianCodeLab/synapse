"""门户下架（老有新无）且 SOP 已进入任务执行阶段时的「工单丢失」处理。"""

from __future__ import annotations

import logging
from typing import Any

from synapse.api.routes.dev_iwhalecloud import _snapshot_norm_id
from synapse.rd_meeting.dev_status import ensure_room_id, load_dev_status, save_dev_status
from synapse.rd_meeting.orchestrator import cancel_room_run
from synapse.rd_meeting.owner_order_archive import is_archived_local_state
from synapse.rd_meeting.room_runtime import mark_room_stopped
from synapse.rd_sop.nodes import is_at_or_after_node_id, resolve_sop_raw_to_node_id

logger = logging.getLogger(__name__)

LOST_LOCAL_STATE = "工单丢失"
TASK_EXEC_NODE_ID = "task_exec"


def is_lost_local_state(local_process_state: str) -> bool:
    return _snapshot_norm_id(local_process_state) == LOST_LOCAL_STATE


def resolve_demand_sop_node_id(demand: dict[str, Any]) -> str | None:
    """从 userwork 需求单或 ``dev.status`` 解析当前 SOP 节点 id。"""
    node_id = resolve_sop_raw_to_node_id(str(demand.get("sop_node") or ""))
    if node_id:
        return node_id
    dn = _snapshot_norm_id(demand.get("demand_no"))
    if not dn:
        return None
    dev = load_dev_status(dn)
    if not isinstance(dev, dict):
        return None
    resolved = str(dev.get("current_node_id") or "").strip()
    return resolved or None


def is_demand_sop_at_or_after_task_exec(demand: dict[str, Any]) -> bool:
    node_id = resolve_demand_sop_node_id(demand)
    if not node_id:
        return False
    return is_at_or_after_node_id(node_id, TASK_EXEC_NODE_ID)


def should_mark_orphan_demand_lost(demand: dict[str, Any]) -> bool:
    """门户已下架且 SOP 处于任务执行及之后：保留目录并标记工单丢失。"""
    local = _snapshot_norm_id(demand.get("local_process_state"))
    if local == LOST_LOCAL_STATE or local == "已完成" or is_archived_local_state(local):
        return False
    return is_demand_sop_at_or_after_task_exec(demand)


def apply_work_order_lost(scope_id: str) -> None:
    """回写 ``dev.status`` / ``room_state``，终止在途 pipeline。"""
    sid = _snapshot_norm_id(scope_id)
    if not sid:
        return
    dev = load_dev_status(sid)
    if not isinstance(dev, dict):
        logger.warning("apply_work_order_lost: missing dev.status for %s", sid)
        return

    dev = dict(dev)
    dev["local_process_state"] = LOST_LOCAL_STATE
    dev["pipeline_enabled"] = False

    mr = dev.get("meeting_room")
    if isinstance(mr, dict):
        rid = str(mr.get("room_id") or "").strip()
        if rid:
            try:
                cancel_room_run(rid)
            except Exception as exc:
                logger.warning("apply_work_order_lost: cancel_room_run failed %s: %s", rid, exc)

    save_dev_status(sid, ensure_room_id(dev))
    mark_room_stopped(sid, reason="work_order_lost")
    logger.info("apply_work_order_lost: scope=%s marked as %s", sid, LOST_LOCAL_STATE)


def assert_scope_operable(scope_id: str) -> None:
    """工单丢失时禁止会议室继续操作。"""
    sid = _snapshot_norm_id(scope_id)
    if not sid:
        return
    dev = load_dev_status(sid)
    if isinstance(dev, dict) and is_lost_local_state(str(dev.get("local_process_state") or "")):
        raise ValueError("work_order_lost")
