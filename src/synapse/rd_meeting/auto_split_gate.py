"""自动拆单：需求单已挂任务单时，等待用户选择继续拆单或沿用已有子单。"""

from __future__ import annotations

import logging
from typing import Any, Literal

from synapse.rd_meeting.auto_split_assets import (
    _local_owned_tasks,
    _resolve_demand_no,
    bootstrap_auto_split,
)
from synapse.rd_meeting.pipeline import STEP_SYSTEM_NODE_EXEC, STEP_WAITING, MeetingPipeline, PipelineRunContext
from synapse.rd_meeting.room_runtime import append_history_event, load_room_state, save_room_state

ScopeType = Literal["demand", "task"]
AutoSplitChoice = Literal["continue", "reuse_existing"]

logger = logging.getLogger(__name__)

INTERVENTION_KIND = "auto_split_choice"
INTERVENTION_PANEL = "auto_split_choice"


def existing_owned_tasks(scope_type: ScopeType, scope_id: str) -> list[dict[str, Any]]:
    """从 userwork.json 读取需求单下已有研发子单（含 task_no）。"""
    demand_no = _resolve_demand_no(scope_type, scope_id)
    if not demand_no:
        return []
    rows: list[dict[str, Any]] = []
    for item in _local_owned_tasks(demand_no):
        task_no = str(item.get("task_no") or "").strip()
        if not task_no:
            continue
        rows.append(
            {
                "task_no": task_no,
                "task_title": str(item.get("task_title") or "").strip(),
                "sop_node": str(item.get("sop_node") or "").strip(),
                "local_process_state": str(item.get("local_process_state") or "").strip(),
                "product_module_name": str(item.get("product_module_name") or "").strip(),
            }
        )
    return rows


def _pipe_auto_split_choice(pipe: MeetingPipeline | None) -> str:
    if pipe is None:
        return ""
    pctx = pipe._data.get("context")
    if not isinstance(pctx, dict):
        return ""
    return str(pctx.get("auto_split_choice") or "").strip()


def should_prompt_auto_split_choice(
    scope_type: ScopeType,
    scope_id: str,
    *,
    pipe: MeetingPipeline | None = None,
) -> bool:
    """是否需在自动拆单前让用户确认（已有子单且本会话尚未选择策略）。"""
    if _pipe_auto_split_choice(pipe):
        return False
    return bool(existing_owned_tasks(scope_type, scope_id))


def build_auto_split_choice_payload(scope_type: ScopeType, scope_id: str) -> dict[str, Any]:
    demand_no = _resolve_demand_no(scope_type, scope_id)
    tasks = existing_owned_tasks(scope_type, scope_id)
    return {
        "demand_no": demand_no,
        "existing_tasks": tasks,
        "existing_task_count": len(tasks),
    }


def enter_auto_split_choice_gate(
    pipe: MeetingPipeline,
    ctx: PipelineRunContext,
    *,
    room_id: str,
    run_node: str,
) -> None:
    sid = ctx.scope_id
    payload = build_auto_split_choice_payload(ctx.scope_type, sid)
    rs = dict(load_room_state(sid) or {})
    rs["status"] = "human_intervention"
    rs["intervention_kind"] = INTERVENTION_KIND
    rs["intervention_panel"] = INTERVENTION_PANEL
    rs["auto_split_choice_payload"] = payload
    rs["phase"] = "waiting"
    rs["current_node_id"] = run_node
    save_room_state(sid, rs)
    ctx.room_state = rs

    pipe.set_phase("waiting", sync_room_state=False)
    pipe.set_flow_step(STEP_WAITING, reason="需求单已有任务单，等待用户选择拆单策略")

    task_lines = ", ".join(
        f"{t.get('task_no') or '?'}({t.get('task_title') or '—'})" for t in payload.get("existing_tasks") or []
    )
    append_history_event(
        sid,
        {
            "event": "auto_split_choice_required",
            "room_id": room_id,
            "scope_id": sid,
            "node_id": run_node,
            "existing_task_count": payload.get("existing_task_count"),
            "flow_stage": "自动拆单",
            "log_type": "warning",
            "chat_text": (
                f"需求单 {payload.get('demand_no') or sid} 在 userwork 中已有 "
                f"{payload.get('existing_task_count')} 条任务单（{task_lines}）。"
                "请选择继续按 split_plan 拆单，或沿用已有任务单并跳过创建。"
            ),
        },
    )


def clear_auto_split_choice_gate(scope_id: str) -> None:
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    if str(rs.get("intervention_kind") or "") != INTERVENTION_KIND:
        return
    rs["status"] = "processing"
    rs["phase"] = "running"
    rs.pop("intervention_kind", None)
    rs.pop("intervention_panel", None)
    rs.pop("auto_split_choice_payload", None)
    save_room_state(sid, rs)


def maybe_enter_auto_split_choice_gate(
    pipe: MeetingPipeline,
    ctx: PipelineRunContext,
    *,
    room_id: str,
    run_node: str,
) -> bool:
    """若需用户确认拆单策略则挂起 pipeline。返回 True 表示已挂起。"""
    if run_node != "auto_split":
        return False
    if not should_prompt_auto_split_choice(ctx.scope_type, ctx.scope_id, pipe=pipe):
        return False
    enter_auto_split_choice_gate(pipe, ctx, room_id=room_id, run_node=run_node)
    return True


def set_auto_split_choice(pipe: MeetingPipeline, choice: AutoSplitChoice) -> None:
    pctx = pipe._data.get("context")
    if not isinstance(pctx, dict):
        pctx = {}
    pctx["auto_split_choice"] = choice
    pipe._data["context"] = pctx


def resolve_auto_split_choice(pipe: MeetingPipeline | None) -> AutoSplitChoice | None:
    raw = _pipe_auto_split_choice(pipe)
    if raw in ("continue", "reuse_existing"):
        return raw  # type: ignore[return-value]
    return None


def bootstrap_auto_split_with_choice(
    scope_type: ScopeType,
    scope_id: str,
    *,
    pipe: MeetingPipeline | None = None,
) -> dict[str, Any]:
    choice = resolve_auto_split_choice(pipe)
    if choice == "reuse_existing":
        return bootstrap_auto_split_reuse_existing(scope_type, scope_id)
    return bootstrap_auto_split(scope_type, scope_id)


def bootstrap_auto_split_reuse_existing(scope_type: ScopeType, scope_id: str) -> dict[str, Any]:
    """沿用 userwork 已有任务单，跳过 create_task。"""
    from synapse.rd_meeting.auto_split_assets import _load_split_plan_tasks, _now_iso

    sid = (scope_id or "").strip()
    demand_no = _resolve_demand_no(scope_type, sid)
    split_plan_tasks = _load_split_plan_tasks(sid)
    existing = existing_owned_tasks(scope_type, sid)

    result: dict[str, Any] = {
        "scope_type": scope_type,
        "scope_id": sid,
        "demand_no": demand_no,
        "split_plan_tasks": split_plan_tasks,
        "create_task_results": [],
        "local_tasks": [],
        "status": "ok",
        "errors": [],
        "materialized_at": _now_iso(),
        "reuse_existing": True,
        "userwork_added_task_nos": [],
    }

    if not sid or not demand_no:
        result["status"] = "failed"
        result["errors"].append("scope_id 或 demand_no 为空")
        return result

    if not existing:
        result["status"] = "failed"
        result["errors"].append("未找到可沿用的已有任务单")
        return result

    owned_by_no = {str(t.get("task_no") or "").strip(): t for t in _local_owned_tasks(demand_no)}
    create_results: list[dict[str, Any]] = []

    if split_plan_tasks:
        for index, plan in enumerate(split_plan_tasks):
            ex_summary = existing[index] if index < len(existing) else {}
            task_no = str(ex_summary.get("task_no") or "").strip()
            work_item = dict(owned_by_no.get(task_no) or {}) if task_no else {}
            create_results.append(
                {
                    "status": "ok" if task_no else "skipped",
                    "taskTitle": str(plan.get("taskTitle") or work_item.get("task_title") or ""),
                    "task_no": task_no,
                    "work_item": work_item if task_no else None,
                    "reused_existing": bool(task_no),
                    "error": None if task_no else "split_plan 条目无对应已有任务单",
                }
            )
    else:
        for ex in existing:
            task_no = str(ex.get("task_no") or "").strip()
            work_item = dict(owned_by_no.get(task_no) or ex)
            create_results.append(
                {
                    "status": "ok",
                    "taskTitle": str(work_item.get("task_title") or ex.get("task_title") or ""),
                    "task_no": task_no,
                    "work_item": work_item,
                    "reused_existing": True,
                }
            )

    ok_n = sum(1 for r in create_results if r.get("status") == "ok")
    bad = [r for r in create_results if r.get("status") != "ok"]
    for row in bad:
        result["errors"].append(
            f"沿用任务单「{row.get('taskTitle') or '?'}」: {row.get('error') or row.get('status')}"
        )
    if bad and not ok_n:
        result["status"] = "failed"
    elif bad:
        result["status"] = "partial"

    result["create_task_results"] = create_results
    reused_nos = {
        str(r.get("task_no") or "").strip()
        for r in create_results
        if r.get("status") == "ok" and str(r.get("task_no") or "").strip()
    }
    result["local_tasks"] = [
        {
            "task_no": str(t.get("task_no") or ""),
            "task_title": str(t.get("task_title") or ""),
            "sop_node": str(t.get("sop_node") or ""),
            "local_process_state": str(t.get("local_process_state") or ""),
        }
        for t in _local_owned_tasks(demand_no)
        if str(t.get("task_no") or "").strip() in reused_nos
    ]
    return result


def resume_auto_split_after_choice(
    pipe: MeetingPipeline,
    *,
    choice: AutoSplitChoice,
) -> None:
    set_auto_split_choice(pipe, choice)
    pipe.set_flow_step(
        STEP_SYSTEM_NODE_EXEC,
        reason="继续拆单" if choice == "continue" else "沿用已有任务单，跳过 create_task",
    )
    pipe.save()
