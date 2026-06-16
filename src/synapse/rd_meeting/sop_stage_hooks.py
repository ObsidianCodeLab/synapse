"""研发会议室：SOP 跨阶段切换时触发研发云转单钩子。"""

from __future__ import annotations

import logging
from collections.abc import Coroutine
from typing import Any, Literal

from synapse.rd_meeting.room_runtime import append_history_event
from synapse.rd_meeting.userwork_sync import patch_userwork_summary
from synapse.rd_sop.nodes import node_display_name, stage_name_for_id

logger = logging.getLogger(__name__)

ScopeType = Literal["demand", "task"]

# (from_stage_id, to_stage_id) → 已实现的需求单转单钩子
_IMPLEMENTED_DEMAND_TRANSITIONS: dict[tuple[int, int], str] = {
    (1, 2): "transfer_demand_to_designing",
    (2, 3): "transfer_demand_to_developing",
}

# SOP to_stage → 研发云 demand_status（与 get_demand_by_user 快照字段一致）
_DEMAND_STATUS_BY_TO_STAGE: dict[int, str] = {
    2: "需求设计",
    3: "需求开发",
}


def _demand_status_for_to_stage(to_stage: int) -> str | None:
    return _DEMAND_STATUS_BY_TO_STAGE.get(int(to_stage))


def _transition_comments(
    *,
    from_stage: int,
    to_stage: int,
    completed_node_id: str,
    next_node_id: str,
) -> str:
    from_name = stage_name_for_id(from_stage) or str(from_stage)
    to_name = stage_name_for_id(to_stage) or str(to_stage)
    done_label = node_display_name(completed_node_id)
    next_label = node_display_name(next_node_id)
    return (
        f"Synapse 研发会议室自动转单：{from_name} → {to_name}；"
        f"已完成节点「{done_label}」，进入「{next_label}」。"
    )


async def run_sop_stage_transition_hook(
    *,
    scope_type: ScopeType,
    scope_id: str,
    from_stage: int,
    to_stage: int,
    completed_node_id: str,
    next_node_id: str,
) -> dict[str, Any]:
    """执行单次跨阶段钩子，返回摘要（供 history / 日志）。"""
    key = (int(from_stage), int(to_stage))
    comments = _transition_comments(
        from_stage=from_stage,
        to_stage=to_stage,
        completed_node_id=completed_node_id,
        next_node_id=next_node_id,
    )
    from_name = stage_name_for_id(from_stage) or str(from_stage)
    to_name = stage_name_for_id(to_stage) or str(to_stage)

    if scope_type != "demand":
        logger.info(
            "sop_stage_hook TODO: scope_type=%s %s→%s scope=%s（仅需求单已实现转单）",
            scope_type,
            from_name,
            to_name,
            scope_id,
        )
        return {
            "status": "todo",
            "hook": None,
            "from_stage": from_stage,
            "to_stage": to_stage,
            "message": f"任务单跨阶段 {from_name}→{to_name} 转单钩子尚未实现",
        }

    hook_name = _IMPLEMENTED_DEMAND_TRANSITIONS.get(key)
    if not hook_name:
        logger.info(
            "sop_stage_hook TODO: demand %s→%s scope=%s node=%s→%s",
            from_name,
            to_name,
            scope_id,
            completed_node_id,
            next_node_id,
        )
        return {
            "status": "todo",
            "hook": None,
            "from_stage": from_stage,
            "to_stage": to_stage,
            "message": f"需求单跨阶段 {from_name}→{to_name} 转单钩子尚未实现",
        }

    demand_no = scope_id.strip()
    if not demand_no:
        logger.warning("sop_stage_hook skipped: empty demand scope_id")
        return {"status": "skipped", "hook": hook_name, "message": "需求单号为空"}

    try:
        if hook_name == "transfer_demand_to_designing":
            from synapse.api.routes.dev_iwhalecloud import (
                TransferDemandToDesigningRequest,
                transfer_demand_to_designing,
            )

            resp = await transfer_demand_to_designing(
                TransferDemandToDesigningRequest(demandNo=demand_no, comments=comments)
            )
        elif hook_name == "transfer_demand_to_developing":
            from synapse.api.routes.dev_iwhalecloud import (
                TransferDemandToDevelopingRequest,
                transfer_demand_to_developing,
            )

            resp = await transfer_demand_to_developing(
                TransferDemandToDevelopingRequest(demandNo=demand_no, comments=comments)
            )
        else:  # pragma: no cover
            logger.warning("sop_stage_hook unknown hook_name=%s", hook_name)
            return {"status": "error", "hook": hook_name, "message": "未知钩子"}
    except Exception as exc:
        logger.exception(
            "sop_stage_hook failed hook=%s demand=%s %s→%s: %s",
            hook_name,
            demand_no,
            from_name,
            to_name,
            exc,
        )
        return {
            "status": "error",
            "hook": hook_name,
            "demand_no": demand_no,
            "message": str(exc),
        }

    ok = isinstance(resp, dict) and resp.get("errorcode") in (None, 0)
    userwork_applied: dict[str, str] = {}
    if not ok:
        logger.warning(
            "sop_stage_hook api returned error hook=%s demand=%s resp=%s",
            hook_name,
            demand_no,
            resp,
        )
    else:
        logger.info(
            "sop_stage_hook ok hook=%s demand=%s %s→%s",
            hook_name,
            demand_no,
            from_name,
            to_name,
        )
        demand_status = _demand_status_for_to_stage(to_stage)
        if demand_status:
            userwork_applied = patch_userwork_summary(
                scope_type="demand",
                scope_id=demand_no,
                demand_status=demand_status,
            )
            if not userwork_applied:
                logger.warning(
                    "sop_stage_hook userwork sync skipped demand=%s demand_status=%s",
                    demand_no,
                    demand_status,
                )

    return {
        "status": "ok" if ok else "api_error",
        "hook": hook_name,
        "demand_no": demand_no,
        "from_stage": from_stage,
        "to_stage": to_stage,
        "comments": comments,
        "userwork_applied": userwork_applied,
        "api_response": resp if isinstance(resp, dict) else {"raw": resp},
    }


def _dispatch_sop_stage_hook_task(coro: Coroutine[Any, Any, None]) -> bool:
    """把跨阶段钩子协程调度到会议室主事件循环（兼容 pipeline 后台线程调用）。"""
    from synapse.rd_meeting.orchestrator import (
        _resolve_meeting_coordinator_loop,
        _schedule_on_coordinator_loop,
    )

    coordinator_loop = _resolve_meeting_coordinator_loop()
    if coordinator_loop is None or coordinator_loop.is_closed():
        return False

    async def _runner() -> None:
        await coro

    try:
        _schedule_on_coordinator_loop(_runner)
        return True
    except RuntimeError:
        return False


def schedule_sop_stage_transition_hook(
    *,
    scope_type: ScopeType,
    scope_id: str,
    from_stage: int,
    to_stage: int,
    completed_node_id: str,
    next_node_id: str,
) -> None:
    """节点推进跨 SOP 阶段时异步触发转单钩子（不阻塞会议室主流程）。"""
    if from_stage == to_stage:
        return

    async def _run() -> None:
        try:
            outcome = await run_sop_stage_transition_hook(
                scope_type=scope_type,
                scope_id=scope_id,
                from_stage=from_stage,
                to_stage=to_stage,
                completed_node_id=completed_node_id,
                next_node_id=next_node_id,
            )
            append_history_event(
                scope_id.strip(),
                {
                    "event": "sop_stage_transition_hook",
                    "scope_type": scope_type,
                    "from_stage": from_stage,
                    "to_stage": to_stage,
                    "from_stage_name": stage_name_for_id(from_stage),
                    "to_stage_name": stage_name_for_id(to_stage),
                    "completed_node_id": completed_node_id,
                    "next_node_id": next_node_id,
                    "hook_status": outcome.get("status"),
                    "hook": outcome.get("hook"),
                    "message": outcome.get("message"),
                    "userwork_applied": outcome.get("userwork_applied"),
                },
            )
        except Exception as exc:
            logger.warning("sop_stage_transition_hook task failed scope=%s: %s", scope_id, exc)

    if not _dispatch_sop_stage_hook_task(_run()):
        logger.warning(
            "sop_stage_transition_hook: no event loop available, skipped scope=%s %s→%s",
            scope_id,
            from_stage,
            to_stage,
        )
