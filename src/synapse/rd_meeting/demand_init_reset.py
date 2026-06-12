"""需求单工单处理初始化：停跑 → 删除 work 目录 → 研发云回需求评审 → 回写 userwork。"""

from __future__ import annotations

import logging
import re
from typing import Any

from synapse.api.routes.dev_iwhalecloud import (
    TransferDemandToAuditRequest,
    transfer_demand_to_audit,
)
from synapse.rd_meeting.dev_status import load_dev_status, save_dev_status
from synapse.rd_meeting.live import scope_id_for_room_id
from synapse.rd_meeting.orchestrator import cancel_room_run
from synapse.rd_meeting.paths import scope_dir
from synapse.rd_meeting.sandbox_assets import _force_remove_path
from synapse.rd_meeting.userwork_sync import patch_userwork_summary

logger = logging.getLogger(__name__)

_ROOM_DEMAND_ID_RE = re.compile(r"^mr_d_(?P<scope>[^_]+)_s\d+$", re.IGNORECASE)


def resolve_demand_scope_id(*, room_id: str, scope_id: str | None = None) -> str | None:
    """解析需求单 scope_id；优先显式入参，其次 work 目录，最后 room_id 命名规则。"""
    sid = (scope_id or "").strip()
    if sid:
        return sid
    rid = (room_id or "").strip()
    if not rid:
        return None
    from_work = scope_id_for_room_id(rid)
    if from_work:
        return from_work
    m = _ROOM_DEMAND_ID_RE.match(rid)
    if m:
        return str(m.group("scope") or "").strip() or None
    return None


def deactivate_meeting_listing(scope_id: str) -> bool:
    """将 dev.status 标为非活跃，使会议室列表立即不再展示该工单。"""
    sid = (scope_id or "").strip()
    if not sid:
        return False
    dev = load_dev_status(sid)
    if not isinstance(dev, dict):
        return False
    patched = dict(dev)
    patched["local_process_state"] = "待处理"
    patched["pipeline_enabled"] = False
    mr = patched.get("meeting_room")
    if isinstance(mr, dict):
        patched["meeting_room"] = {**mr, "active": False}
    else:
        patched["meeting_room"] = {"active": False, "room_id": ""}
    save_dev_status(sid, patched)
    return True


async def reset_demand_work_to_audit(
    scope_id: str,
    *,
    room_id: str | None = None,
    comments: str = "",
) -> dict[str, Any]:
    """工单处理初始化（需求单专用）。"""
    sid = (scope_id or "").strip()
    if not sid:
        raise ValueError("scope_id required")

    rid = (room_id or "").strip()
    if not rid:
        dev = load_dev_status(sid)
        if isinstance(dev, dict):
            mr = dev.get("meeting_room")
            if isinstance(mr, dict):
                rid = str(mr.get("room_id") or "").strip()

    cancelled = False
    if rid:
        cancelled = cancel_room_run(rid)

    listing_deactivated = deactivate_meeting_listing(sid)

    work_path = scope_dir(sid)
    work_removed = False
    if work_path.exists():
        work_removed = _force_remove_path(work_path)
        if not work_removed:
            raise ValueError("work_dir_remove_failed")

    remark = (comments or "").strip() or "Synapse 工单处理初始化：回退至需求评审"
    transfer_resp = await transfer_demand_to_audit(
        TransferDemandToAuditRequest(demandNo=sid, comments=remark)
    )
    if not isinstance(transfer_resp, dict) or transfer_resp.get("errorcode") not in (None, 0):
        msg = ""
        if isinstance(transfer_resp, dict):
            msg = str(transfer_resp.get("message") or transfer_resp.get("msg") or "")
        raise ValueError(msg or "transfer_demand_to_audit_failed")

    userwork_applied = patch_userwork_summary(
        scope_type="demand",
        scope_id=sid,
        demand_status="需求评审",
        sop_node="等待调度",
        local_process_state="待处理",
    )
    if not userwork_applied:
        logger.warning("demand_init_reset: userwork patch skipped demand=%s", sid)

    logger.info(
        "demand_init_reset ok demand=%s room=%s cancelled=%s work_removed=%s",
        sid,
        rid or "-",
        cancelled,
        work_removed,
    )
    return {
        "scope_id": sid,
        "room_id": rid or None,
        "run_cancelled": cancelled,
        "listing_deactivated": listing_deactivated,
        "work_dir_removed": work_removed,
        "userwork_applied": userwork_applied,
        "portal_transfer": transfer_resp.get("data"),
    }
