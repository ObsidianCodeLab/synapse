"""会议室中栏人机面板：按 SOP 节点类型与 intervention_kind 解析。"""

from __future__ import annotations

from typing import Any, Literal

from synapse.rd_sop.manifest import NODE_TYPES

InterventionPanel = Literal["solution_review", "func_solution_review", "task_exec", "node_review", "hitl"]

# 协同型（ai_human）节点完成门控使用的专用面板（非 MeetingHitlForm 问卷）
_COLLAB_DEDICATED_PANEL: dict[str, InterventionPanel] = {
    "solution_review": "solution_review",
    "func_solution": "func_solution_review",
    "task_exec": "task_exec",
    "leader_review": "node_review",
}


def node_sop_type(node_id: str) -> str:
    return NODE_TYPES.get((node_id or "").strip(), "ai")


def is_human_sop_type(node_type: str) -> bool:
    """人工主导节点：会中/完成门控使用 HITL 问卷。"""
    return node_type in ("human", "human_start", "human_multi", "ai_exception")


def is_collab_sop_type(node_type: str) -> bool:
    return node_type == "ai_human"


def collab_dedicated_panel(node_id: str) -> InterventionPanel | None:
    return _COLLAB_DEDICATED_PANEL.get((node_id or "").strip())


def is_clarify_gate_active(
    intervention_kind: str | None,
    hitl_form_schema: dict[str, Any] | None,
    *,
    phase: str | None = None,
) -> bool:
    """会中澄清/异常门控进行中：须展示 HITL 问卷，不得被 node_review 抢占。"""
    kind = (intervention_kind or "").strip().lower()
    if not isinstance(hitl_form_schema, dict):
        return False
    if not (hitl_form_schema.get("questions") or []):
        return False
    if (phase or "").strip() == "clarify_gate":
        return True
    return kind in ("interactive", "exception")


def resolve_intervention_panel(
    *,
    node_id: str,
    intervention_kind: str | None = None,
    hitl_form_schema: dict[str, Any] | None = None,
    pending_delivery: dict[str, Any] | None = None,
) -> str | None:
    """返回中栏应渲染的面板 id；None 表示无人工门控 UI。"""
    nid = (node_id or "").strip()
    kind = (intervention_kind or "").strip().lower()
    sop = node_sop_type(nid)
    pending = pending_delivery if isinstance(pending_delivery, dict) else {}

    if kind == "solution_review" or pending.get("solution_review_payload"):
        return "solution_review"

    if kind == "func_solution_review" or pending.get("func_solution_review_payload"):
        return "func_solution_review"

    if kind == "task_exec" or pending.get("task_exec_payload"):
        return "task_exec"

    # 会中问卷优先于 pending 内预取的 review_payload（避免详情页拉取 node-review 盖掉表单）
    if is_clarify_gate_active(kind, hitl_form_schema):
        return "hitl"

    if kind == "result_confirm" or pending.get("review_payload"):
        return "node_review"

    dedicated = collab_dedicated_panel(nid)
    if is_collab_sop_type(sop) and dedicated and kind in ("solution_review", "func_solution_review", "result_confirm", "gate", ""):
        if dedicated == "solution_review" and (
            kind == "solution_review" or pending.get("solution_review_payload")
        ):
            return "solution_review"
        if dedicated == "func_solution_review" and (
            kind == "func_solution_review" or pending.get("func_solution_review_payload")
        ):
            return "func_solution_review"
        if dedicated == "node_review" and (kind == "result_confirm" or pending.get("review_payload")):
            return "node_review"

    if isinstance(hitl_form_schema, dict) and is_human_sop_type(sop):
        return "hitl"

    if is_collab_sop_type(sop) and dedicated == "solution_review" and pending.get("solution_review_payload"):
        return "solution_review"

    if is_collab_sop_type(sop) and dedicated == "func_solution_review" and pending.get(
        "func_solution_review_payload"
    ):
        return "func_solution_review"

    return None
