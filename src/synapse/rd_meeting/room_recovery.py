"""会议室服务重启后的节点处理恢复（非重处理）。"""

from __future__ import annotations

import uuid
from typing import Any

from synapse.rd_meeting.intervention_panel import resolve_intervention_panel
from synapse.rd_meeting.node_review import load_node_review, save_node_review
from synapse.rd_meeting.room_runtime import append_history_event, load_room_state, save_room_state

RECOVERY_REASON_LABELS: dict[str, str] = {
    "not_stopped": "会议室未处于停止状态",
    "not_server_restart": "仅服务重启导致的停止可恢复处理",
    "run_in_progress": "节点正在后台执行，请稍后再试",
    "not_current_node": "只能恢复当前流水线节点",
    "agent_still_running": "重启前智能体仍在执行，请使用「重新处理」",
    "no_gate_state": "缺少可恢复的人工门控状态",
    "room_completed": "会议室已结束",
}


def _resolve_gate_panel(room_state: dict[str, Any]) -> str | None:
    pending = room_state.get("pending_delivery")
    node_id = str(room_state.get("current_node_id") or "").strip()
    if not node_id and isinstance(pending, dict):
        node_id = str(pending.get("node_id") or "").strip()
    schema = room_state.get("hitl_form_schema")
    return resolve_intervention_panel(
        node_id=node_id,
        intervention_kind=str(room_state.get("intervention_kind") or "") or None,
        hitl_form_schema=schema if isinstance(schema, dict) else None,
        pending_delivery=pending if isinstance(pending, dict) else None,
    )


def _repair_pending_delivery(scope_id: str, room_state: dict[str, Any], panel: str) -> dict[str, Any]:
    """恢复前补齐 pending_delivery（兼容仅落在 pipeline.context 的评审数据）。"""
    rs = dict(room_state)
    node_id = str(rs.get("current_node_id") or "").strip()
    if not node_id:
        return rs

    pending = rs.get("pending_delivery") if isinstance(rs.get("pending_delivery"), dict) else {}
    pending = dict(pending)

    if panel == "node_review" and not pending.get("review_payload"):
        review = load_node_review(scope_id, node_id)
        if review:
            save_node_review(scope_id, node_id, review, sync_pending=True)
            rs = dict(load_room_state(scope_id) or rs)
            return rs

    if panel in ("solution_review", "func_solution_review", "task_exec"):
        key = {
            "solution_review": "solution_review_payload",
            "func_solution_review": "func_solution_review_payload",
            "task_exec": "task_exec_payload",
        }[panel]
        if not pending.get(key):
            review = load_node_review(scope_id, node_id)
            if isinstance(review, dict) and review:
                pending[key] = review
                pending.setdefault("node_id", node_id)
                rs["pending_delivery"] = pending
                save_room_state(scope_id, rs)
                rs = dict(load_room_state(scope_id) or rs)
    return rs


def assess_node_recovery(
    scope_id: str,
    *,
    node_id: str | None = None,
    run_in_progress: bool = False,
) -> dict[str, Any]:
    """检测当前 SOP 节点是否可从 server_restart 停止态恢复人工门控。"""
    sid = (scope_id or "").strip()
    if not sid:
        return {"recoverable": False, "reason_code": "not_stopped"}

    rs = dict(load_room_state(sid) or {})
    status = str(rs.get("status") or "").strip()
    if status == "completed":
        return {"recoverable": False, "reason_code": "room_completed"}
    if status != "stopped":
        return {"recoverable": False, "reason_code": "not_stopped"}

    if str(rs.get("stopped_reason") or "").strip() != "server_restart":
        return {
            "recoverable": False,
            "reason_code": "not_server_restart",
            "stopped_reason": rs.get("stopped_reason"),
        }

    current = str(rs.get("current_node_id") or "").strip()
    target = (node_id or current).strip()
    if not target or target != current:
        return {"recoverable": False, "reason_code": "not_current_node"}

    if run_in_progress:
        return {"recoverable": False, "reason_code": "run_in_progress"}

    prev = str(rs.get("stopped_prev_status") or "").strip()
    if prev == "processing":
        return {
            "recoverable": False,
            "reason_code": "agent_still_running",
            "stopped_prev_status": prev,
        }

    panel = _resolve_gate_panel(rs)
    if not panel and prev != "human_intervention":
        review = load_node_review(sid, current)
        if isinstance(review, dict) and review:
            panel = "node_review"

    if not panel:
        return {
            "recoverable": False,
            "reason_code": "no_gate_state",
            "stopped_prev_status": prev or None,
        }

    return {
        "recoverable": True,
        "reason_code": None,
        "restore_status": "human_intervention",
        "intervention_panel": panel,
        "stopped_prev_status": prev or "human_intervention",
        "node_id": current,
    }


def recover_stopped_node(
    scope_id: str,
    *,
    room_id: str,
    node_id: str | None = None,
    run_in_progress: bool = False,
) -> dict[str, Any]:
    """将 server_restart 停止态恢复为重启前的人工门控，不清理节点过程数据。"""
    sid = (scope_id or "").strip()
    rid = (room_id or "").strip()
    assessment = assess_node_recovery(
        sid,
        node_id=node_id,
        run_in_progress=run_in_progress,
    )
    if not assessment.get("recoverable"):
        code = str(assessment.get("reason_code") or "no_gate_state")
        raise ValueError(code)

    panel = str(assessment.get("intervention_panel") or "").strip()
    rs = dict(load_room_state(sid) or {})
    rs = _repair_pending_delivery(sid, rs, panel)

    rs["status"] = "human_intervention"
    for key in ("stopped_at", "stopped_reason", "stopped_prev_status"):
        rs.pop(key, None)
    save_room_state(sid, rs)

    node = str(assessment.get("node_id") or rs.get("current_node_id") or "pending")
    append_history_event(
        sid,
        {
            "event": "room_recovered",
            "room_id": rid,
            "node_id": node,
            "text": f"已恢复人工门控（{panel or '人工处理'}），可继续处理",
            "intervention_panel": panel,
            "log_type": "success",
            "agent_id": "system",
            "id": uuid.uuid4().hex[:12],
        },
    )
    return assessment
