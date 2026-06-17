"""代码提交（exception_check）节点：专用重处理（清理归档 + 回退子单状态 + 调度 system_node_exec）。"""

from __future__ import annotations

import logging
from typing import Any, Literal

from synapse.api.routes.dev_iwhalecloud import (
    OWNED_WORK_ITEM_STATE_COMMIT_DONE,
    OWNED_WORK_ITEM_STATE_DEV_DONE,
)
from synapse.rd_meeting.dev_status import load_dev_status, save_dev_status
from synapse.rd_meeting.paths import scope_dir
from synapse.rd_meeting.pipeline import (
    clear_nodes_for_historical_reprocess,
    clear_room_state_for_node_reprocess,
)
from synapse.rd_meeting.room_runtime import (
    load_room_state,
    read_meeting_pipeline_json,
    save_meeting_pipeline,
    save_room_state,
    sync_room_state_from_dev,
)
from synapse.rd_meeting.userwork_sync import (
    _load_userwork_list,
    patch_owned_work_item_state,
    patch_userwork_summary,
)
from synapse.rd_sop.nodes import ALL_NODES, node_display_name, stage_id_for_node_id

logger = logging.getLogger(__name__)

ScopeType = Literal["demand", "task"]

CODE_COMMIT_NODE_ID = "exception_check"

_PIPELINE_CONTEXT_KEYS = (
    "code_commit_assets",
    "task_check_assets",
    "last_system_node_result",
    "last_finished_node_id",
    "last_transition_reason",
    "reprocess_node_ids",
    "reprocess_historical_target",
    "reprocess_reason",
    "reprocess_until_node_id",
    "ai_processing_blocked",
)

_PIPELINE_STEPS_DROP = frozenset({"system_node_exec", "node_finish", "node_review"})

_ROOM_STATE_KEYS_TO_CLEAR = (
    "pending_delivery",
    "intervention_kind",
    "reprocess_reason",
    "reprocess_until_node_id",
    "current_work_plan",
    "host_prompt_cache",
    "agents_active",
    "stopped_prev_status",
    "stopped_at",
    "stopped_reason",
    "hitl_form_schema",
    "hitl_locked",
    "hitl_submission",
    "escalate_reason",
    "task_exec_blocked",
    "downstream_blocked",
    "downstream_block_reason",
    "redirect_to_node",
    "task_check_blocked",
)


def is_code_commit_reprocess_target(node_id: str) -> bool:
    return (node_id or "").strip() == CODE_COMMIT_NODE_ID


def code_commit_reprocess_node_range(current_node_id: str) -> list[str]:
    """从代码提交到当前光标（含）的节点 id 列表。"""
    ids = [str(n["id"]) for n in ALL_NODES]
    start = ids.index(CODE_COMMIT_NODE_ID)
    current = (current_node_id or "").strip()
    if not current:
        raise ValueError("code_commit_reprocess_invalid_cursor")
    end = ids.index(current)
    if end < start:
        raise ValueError("code_commit_reprocess_invalid_cursor")
    if stage_id_for_node_id(CODE_COMMIT_NODE_ID) != stage_id_for_node_id(current):
        raise ValueError("cross_stage_reprocess_forbidden")
    return ids[start : end + 1]


def revert_commit_done_work_items(demand_no: str) -> list[str]:
    """将需求单下 state=提交完成 的子单回退为 开发完成。"""
    dn = (demand_no or "").strip()
    if not dn:
        return []
    reverted: list[str] = []
    for demand in _load_userwork_list():
        if str(demand.get("demand_no") or "").strip() != dn:
            continue
        owned = demand.get("owned_work_items")
        if not isinstance(owned, list):
            break
        for item in owned:
            if not isinstance(item, dict):
                continue
            if str(item.get("state") or "").strip() != OWNED_WORK_ITEM_STATE_COMMIT_DONE:
                continue
            tn = str(item.get("task_no") or "").strip()
            if not tn:
                continue
            if patch_owned_work_item_state(
                demand_no=dn,
                task_no=tn,
                state=OWNED_WORK_ITEM_STATE_DEV_DONE,
            ):
                reverted.append(tn)
        break
    return reverted


def prepare_code_commit_reprocess(
    scope_id: str,
    *,
    scope_type: ScopeType,
    node_range: list[str],
    reason: str = "",
) -> dict[str, Any]:
    """落盘回退到代码提交节点：清理区间产物、重置 room/pipeline/dev（不刷新产品资产）。"""
    sid = (scope_id or "").strip()
    if not sid or not node_range or node_range[0] != CODE_COMMIT_NODE_ID:
        raise ValueError("code_commit_reprocess_invalid_range")

    dev = load_dev_status(sid) or {}
    mr = dev.get("meeting_room") if isinstance(dev.get("meeting_room"), dict) else {}
    room_id = str(mr.get("room_id") or f"mr_d_{sid}_s1").strip()

    stage_id = stage_id_for_node_id(CODE_COMMIT_NODE_ID)
    sop_display = node_display_name(CODE_COMMIT_NODE_ID)

    clear_nodes_for_historical_reprocess(sid, list(node_range))

    raw = read_meeting_pipeline_json(sid)
    if isinstance(raw, dict):
        ctx = raw.get("context")
        if not isinstance(ctx, dict):
            ctx = {}
        for key in _PIPELINE_CONTEXT_KEYS:
            ctx.pop(key, None)
        if reason.strip():
            ctx["code_commit_reprocess_reason"] = reason.strip()
        else:
            ctx.pop("code_commit_reprocess_reason", None)
        raw["context"] = ctx
        nr = raw.get("node_results")
        if isinstance(nr, dict):
            for nid in node_range:
                nr.pop(nid, None)
        steps = raw.get("steps_completed") or []
        raw["steps_completed"] = [s for s in steps if s not in _PIPELINE_STEPS_DROP]
        raw["current_node_id"] = CODE_COMMIT_NODE_ID
        raw["phase"] = "running"
        save_meeting_pipeline(sid, raw)

    dev["current_node_id"] = CODE_COMMIT_NODE_ID
    dev["stage_id"] = stage_id
    dev["sop_node_display"] = sop_display
    if str(dev.get("local_process_state") or "").strip() not in ("处理中",):
        dev["local_process_state"] = "处理中"
    save_dev_status(sid, dev)

    sync_room_state_from_dev(
        sid,
        room_id=room_id,
        scope_type=scope_type,
        stage_id=stage_id,
        current_node_id=CODE_COMMIT_NODE_ID,
        local_process_state=str(dev.get("local_process_state") or "处理中"),
    )
    extra = [n for n in node_range if n != CODE_COMMIT_NODE_ID]
    clear_room_state_for_node_reprocess(
        sid,
        CODE_COMMIT_NODE_ID,
        extra_node_ids=extra or None,
    )

    rs = dict(load_room_state(sid) or {})
    rs["current_node_id"] = CODE_COMMIT_NODE_ID
    rs["stage_id"] = stage_id
    rs["status"] = "processing"
    rs["phase"] = "running"
    for key in _ROOM_STATE_KEYS_TO_CLEAR:
        rs.pop(key, None)
    nm = rs.get("node_metrics")
    if isinstance(nm, dict):
        for nid in node_range:
            nm.pop(nid, None)
        rs["node_metrics"] = nm
    rs.pop("current_node_binding", None)
    if reason.strip():
        rs["reprocess_reason"] = reason.strip()
        rs["reprocess_until_node_id"] = CODE_COMMIT_NODE_ID
    save_room_state(sid, rs)

    patch_userwork_summary(
        scope_type=scope_type,
        scope_id=sid,
        sop_node=sop_display,
    )

    reverted = revert_commit_done_work_items(sid)

    snap = scope_dir(sid) / "host_prompt_snapshot.md"
    if snap.is_file():
        snap.unlink()

    logger.info(
        "code_commit_reprocess: prepared scope=%s range=%s reverted_tasks=%s",
        sid,
        node_range,
        reverted,
    )
    return {
        "scope_id": sid,
        "room_id": room_id,
        "node_range": node_range,
        "reverted_task_nos": reverted,
    }
