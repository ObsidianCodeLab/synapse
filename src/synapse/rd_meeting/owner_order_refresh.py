"""工单刷新后续：门户下架清理、统一服务 rd_view 在途同步。"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from synapse.api.routes.dev_iwhalecloud import (
    _load_userinfo_plain,
    _snapshot_norm_id,
    load_owner_order_snapshot_from_file,
)
from synapse.rd_meeting.dev_status import load_dev_status
from synapse.rd_meeting.owner_order_archive import (
    ARCHIVED_LOCAL_STATE,
    is_archived_local_state,
)
from synapse.rd_meeting.devservice import unified_service_base_url
from synapse.rd_meeting.paths import meeting_pipeline_path, scope_dir
from synapse.rd_meeting.room_runtime import load_room_state, read_meeting_pipeline_json
from synapse.rd_meeting.sandbox_assets import _force_remove_path
from synapse.rd_sop.manifest import NODE_TYPES
from synapse.rd_sop.nodes import (
    node_display_name,
    resolve_sop_raw_to_node_id,
    seq_index_for_node_id,
    stage_id_for_node_id,
)

logger = logging.getLogger(__name__)

RD_VIEW_DEMAND_SAVE_PATH = "/dev/iwhalecloud/synapse/rd_view_demand_save"

# 统一服务 rd_view 阶段 slug（与 stage_id 对齐）
_STAGE_ID_TO_SLUG: dict[int, str] = {
    0: "pending",
    1: "analysis",
    2: "design",
    3: "rd",
    4: "developing",
    5: "code_review",
}

# resolve_run_status 中文 → 统一服务 run_status slug
_RUN_STATUS_TO_SLUG: dict[str, str] = {
    "处理中": "running",
    "待人工": "human_intervention",
    "已完成": "completed",
    "已归档": "archived",
    "archived": "archived",  # resolve_run_status 历史返回值兼容
    "异常": "failed",
    "已停止": "stopped",
    "待处理": "pending",
    "全人工": "full_manual",
    "待定": "pending",
}

_ROOM_STATUS_TO_RUN_STATUS = {
    "processing": "处理中",
    "human_intervention": "待人工",
    "completed": "已完成",
    "failed": "异常",
    "stopped": "已停止",
}

_PIPELINE_PHASE_TO_RUN_STATUS = {
    "clarify_gate": "待人工",
    "result_gate": "待人工",
    "exception_gate": "待人工",
    "completed": "已完成",
    "running": "处理中",
}


def stage_slug_for_id(stage_id: int) -> str:
    return _STAGE_ID_TO_SLUG.get(stage_id, "pending")


def run_status_slug_for_demand(demand_no: str, *, local_process_state: str = "") -> str:
    cn = resolve_run_status(demand_no, local_process_state=local_process_state)
    return _RUN_STATUS_TO_SLUG.get(cn, "pending")


def should_keep_orphan_demand(demand: dict[str, Any]) -> bool:
    """门户已下架（老有新无）时：``已完成`` 待归档、``已归档`` 条目均保留。"""
    local = _snapshot_norm_id(demand.get("local_process_state"))
    return local == "已完成" or is_archived_local_state(local)


def _should_archive_orphan_demand(demand: dict[str, Any]) -> bool:
    """门户已下架且本地已完成、尚未归档时触发归档。"""
    local = _snapshot_norm_id(demand.get("local_process_state"))
    if is_archived_local_state(local):
        return False
    return local == "已完成"


def should_keep_orphan_work_item(task: dict[str, Any]) -> bool:
    """门户已删研发单（老有新无）时：仅 ``state=已完成`` 保留待归档。"""
    from synapse.api.routes.dev_iwhalecloud import OWNED_WORK_ITEM_STATE_COMPLETED

    return _snapshot_norm_id(task.get("state")) == OWNED_WORK_ITEM_STATE_COMPLETED


def cleanup_orphan_work_directories(demand_nos: list[str]) -> list[str]:
    """回收 ``work/<demand_no>/`` 残留目录；返回实际删除成功的 demand_no。"""
    cleaned: list[str] = []
    for raw in demand_nos:
        dn = _snapshot_norm_id(raw)
        if not dn:
            continue
        path = scope_dir(dn)
        if not path.exists():
            continue
        if _force_remove_path(path):
            cleaned.append(dn)
            logger.info("owner_order_refresh: removed work dir %s", path)
        else:
            logger.warning("owner_order_refresh: failed to remove work dir %s", path)
    return cleaned


def _processing_mode_for_demand(demand: dict[str, Any]) -> str:
    """工单当前 SOP 节点的类型（``human`` / ``ai`` / ``ai_human`` / ``system`` 等）。"""
    node_id = _resolve_sop_node_id(demand)
    return NODE_TYPES.get(node_id, "ai")


def _resolve_sop_node_id(demand: dict[str, Any]) -> str:
    dn = _snapshot_norm_id(demand.get("demand_no"))
    dev = load_dev_status(dn) if dn else None
    if isinstance(dev, dict):
        nid = str(dev.get("current_node_id") or "").strip()
        if nid:
            return nid

    local = str(demand.get("local_process_state") or "").strip()
    if local == "待处理":
        return "pending"

    sop_raw = str(demand.get("sop_node") or "").strip()
    return resolve_sop_raw_to_node_id(sop_raw) or "pending"


def resolve_run_status(demand_no: str, *, local_process_state: str = "") -> str:
    """从工单目录 ``room_state`` / ``meeting_pipeline`` 解析当前 SOP 节点运行态。"""
    dn = _snapshot_norm_id(demand_no)
    if dn:
        rs = load_room_state(dn)
        if isinstance(rs, dict):
            st = str(rs.get("status") or "").strip()
            if st in _ROOM_STATUS_TO_RUN_STATUS:
                return _ROOM_STATUS_TO_RUN_STATUS[st]

        pipe = read_meeting_pipeline_json(dn)
        if isinstance(pipe, dict):
            phase = str(pipe.get("phase") or "").strip()
            if phase in _PIPELINE_PHASE_TO_RUN_STATUS:
                return _PIPELINE_PHASE_TO_RUN_STATUS[phase]

    local = (local_process_state or "").strip()
    if local == "已完成":
        return "已完成"
    if is_archived_local_state(local):
        return ARCHIVED_LOCAL_STATE
    if local == "处理中":
        return "处理中"
    if local == "全人工":
        return "全人工"
    if local == "待处理":
        return "待处理"
    return "待定"


def build_rd_view_demand_save_payload(
    demand: dict[str, Any],
    *,
    assignee_id: str,
) -> dict[str, Any]:
    """组装统一服务 ``rd_view_demand_save`` 请求体。"""
    dn = _snapshot_norm_id(demand.get("demand_no"))
    local = str(demand.get("local_process_state") or "").strip()
    node_id = _resolve_sop_node_id(demand)
    stage_id = stage_id_for_node_id(node_id)

    return {
        "demand_no": dn,
        "demand_title": str(demand.get("demand_title") or ""),
        "demand_desc": str(demand.get("demand_desc") or ""),
        "demand_create_time": str(demand.get("demand_create_time") or ""),
        "sop_node_id": node_id,
        "stage": stage_slug_for_id(stage_id),
        "seq_id": seq_index_for_node_id(node_id),
        "name": node_display_name(node_id),
        "local_process_state": local,
        "run_status": run_status_slug_for_demand(dn, local_process_state=local),
        "priority": "高",
        "assignee_id": (assignee_id or "").strip(),
        "product_name": str(demand.get("prod") or "").strip(),
        "processing_mode": _processing_mode_for_demand(demand),
        "llm_estimated_hours": None,
        "llm_estimate_model": None,
        "feedback_type": None,
        "feedback_at": None,
        "comments": [],
    }


def _load_assignee_id() -> str:
    try:
        data = _load_userinfo_plain() or {}
    except (ValueError, OSError):
        return ""
    return str(data.get("employee_id") or "").strip()


async def sync_userwork_view_to_unified_service(
    *,
    demands: list[dict[str, Any]] | None = None,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """将 ``userwork.json`` 在途工单同步到研发统一服务 rd_view。"""
    base = unified_service_base_url()
    if not base:
        return {"status": "skipped", "reason": "missing_devservice_ip", "synced": 0, "failed": 0}

    if demands is None:
        snap = load_owner_order_snapshot_from_file()
        raw_list = snap.get("list") if isinstance(snap, dict) else None
        demands = [x for x in (raw_list or []) if isinstance(x, dict)]

    assignee_id = _load_assignee_id()
    url = f"{base}{RD_VIEW_DEMAND_SAVE_PATH}"
    synced = 0
    failed = 0
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=timeout) as client:
        for demand in demands:
            dn = _snapshot_norm_id(demand.get("demand_no"))
            if not dn:
                continue
            payload = build_rd_view_demand_save_payload(demand, assignee_id=assignee_id)
            try:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                body = resp.json()
            except Exception as exc:
                failed += 1
                msg = f"{dn}: {exc}"
                errors.append(msg)
                logger.warning("rd_view_demand_save failed %s", msg)
                continue

            code = body.get("code") if isinstance(body, dict) else None
            if code not in (0, "0", None):
                failed += 1
                message = ""
                if isinstance(body, dict):
                    message = str(body.get("message") or body.get("msg") or "")
                msg = f"{dn}: {message or f'code={code}'}"
                errors.append(msg)
                logger.warning("rd_view_demand_save rejected %s", msg)
                continue

            synced += 1

            if _should_archive_orphan_demand(demand):
                from synapse.rd_meeting.owner_order_archive import archive_completed_demand_if_needed

                await archive_completed_demand_if_needed(demand_no=dn)

    return {
        "status": "ok" if failed == 0 else "partial",
        "synced": synced,
        "failed": failed,
        "errors": errors[:20],
    }
