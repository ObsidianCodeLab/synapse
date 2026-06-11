"""human_confirm 双阶段门控：会中问卷 (hitl_form) → 完成确认 (node_review)。"""

from __future__ import annotations

from typing import Any

from synapse.rd_meeting.binding import resolve_node_binding
from synapse.rd_meeting.hitl_feedback import (
    HitlFeedbackMode,
    user_has_free_text_input,
)
from synapse.rd_meeting.room_runtime import load_room_state, save_room_state

READY_FOR_NODE_REVIEW_KEY = "ready_for_node_review"
HITL_CLARIFY_ROUND_KEY = "hitl_clarify_round"
HITL_FEEDBACK_MODE_KEY = "hitl_feedback_mode"
MAX_HOST_QUESTIONNAIRE_ATTEMPTS = 5

_PROMPT_REQUIRE_INTERACTIVE = """
## ⚠️ 系统提示：必须提交会中问卷（kind=interactive）

你尚未通过 ``submit_hitl_questionnaire`` 工具提交 **interactive** 会中问卷，系统无法进入人工确认总结。

**本次要求**：
1. 直接调用 ``submit_hitl_questionnaire(kind="interactive", ...)``，题目覆盖本节点待用户确认的决策点；
2. **禁止**使用 ``kind=result_confirm``（节点完成总结由系统在用户确认问卷后自动进入 NodeReview）；
3. **summary** 会渲染在表单顶部；每题 **context** 须含用户可独立审阅的完整正文（签收题禁止只写维度关键词）；
4. 调用工具后立即停止，不要重复总结正文。
"""

_PROMPT_REQUIRE_ARCHIVE_DOC = """
## ⚠️ 系统提示：须先更新归档产出（doc-generate）

收到协作智能体或人工反馈后，须先调用 ``whalecloud-dev-tool-doc-generate`` 更新本节点归档 Markdown（如 ``需求澄清.md``），再委派、交问卷或进入节点确认总结。

**本次要求**：
1. 读 ``hitl_context.json``（如有）并 **write_file** 更新 ``clarify_sections.json`` / 上下文；
2. 以 ``clarify_fill_ctx.json`` 为 ``CONTEXT_JSON``、**STRICT=true** 执行 doc-generate；
3. 用户末题已选「否」时 **禁止** ``submit_hitl_questionnaire(kind=interactive)``，完成后系统将自动进入节点确认总结。
"""


def is_ready_for_node_review(room_state: dict[str, Any] | None) -> bool:
    if not isinstance(room_state, dict):
        return False
    return bool(room_state.get(READY_FOR_NODE_REVIEW_KEY))


def _submission_values_for_closure_check(room_state: dict[str, Any] | None) -> tuple[dict[str, Any], dict[str, Any] | None]:
    if not isinstance(room_state, dict):
        return {}, None
    submission = room_state.get("hitl_submission")
    if not isinstance(submission, dict):
        return {}, None
    values = submission.get("values")
    schema = submission.get("schema_snapshot")
    vals = dict(values) if isinstance(values, dict) else {}
    sch = schema if isinstance(schema, dict) else None
    return vals, sch


def should_enter_node_review_after_hitl_locked(
    scope_id: str,
    node_id: str,
    room_state: dict[str, Any] | None,
) -> bool:
    """会中问卷已提交并锁定，且约定归档 Markdown 已落盘 → 应进入结果确认门控。

    弥补 ``ready_for_node_review`` 仅在问卷提交瞬间置位、委派会清标等问题。
    """
    if not isinstance(room_state, dict):
        return False
    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or not nid or nid == "pending":
        return False

    try:
        from synapse.rd_meeting.hitl_closure_guard import load_closure_intent
        from synapse.rd_meeting.work_plan import (
            get_work_plan,
            is_archive_doc_pending,
            must_submit_interactive_questionnaire,
            plan_requires_hitl,
        )

        if is_archive_doc_pending(sid):
            return False
        if must_submit_interactive_questionnaire(sid, nid):
            return False
        plan = get_work_plan(sid)
        if isinstance(plan, dict) and str(plan.get("node_id") or "") == nid:
            binding = resolve_node_binding(nid, scope_id=sid)
            if plan_requires_hitl(plan, human_confirm=bool(binding.get("human_confirm"))):
                if load_closure_intent(sid, nid) != "done" and not plan.get("hitl_submitted"):
                    return False
    except Exception:
        pass

    if not room_state.get("hitl_locked"):
        return False
    # 仍有待填问卷 schema 时不应跳过会中门控（防御性；主路径在 orchestrator 优先消费 tool_questionnaire）
    if isinstance(room_state.get("hitl_form_schema"), dict):
        return False
    submission = room_state.get("hitl_submission")
    kind = ""
    if isinstance(submission, dict):
        kind = str(submission.get("kind") or "").strip().lower()
    if not kind:
        kind = str(room_state.get("intervention_kind") or "").strip().lower()
    if kind and kind not in ("interactive", ""):
        return False
    from synapse.rd_meeting.hitl_feedback import user_selected_no_further_processing

    sub_vals, sub_schema = _submission_values_for_closure_check(room_state)
    if not user_selected_no_further_processing(sub_vals, sub_schema):
        return False
    return node_archive_ready_for_review(sid, nid)


def should_enter_node_review_gate(
    scope_id: str,
    node_id: str,
    room_state: dict[str, Any] | None,
) -> bool:
    """节点收尾是否应进入 NodeReview（``enter_node_review_gate``）。"""
    if is_ready_for_node_review(room_state):
        return True
    return should_enter_node_review_after_hitl_locked(scope_id, node_id, room_state)


def set_ready_for_node_review(scope_id: str, ready: bool) -> None:
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    if ready:
        rs[READY_FOR_NODE_REVIEW_KEY] = True
    else:
        rs.pop(READY_FOR_NODE_REVIEW_KEY, None)
    save_room_state(sid, rs)


def clear_ready_for_node_review(scope_id: str) -> None:
    """节点仍在进行中（如再次委派 Worker）时撤销 NodeReview 就绪标记。"""
    set_ready_for_node_review(scope_id, False)


def node_archive_ready_for_review(scope_id: str, node_id: str) -> bool:
    """约定归档 Markdown 已落盘时才允许进入 NodeReview。"""
    from synapse.rd_meeting.validation import validate_node_archive_files
    from synapse.rd_sop.nodes import stage_id_for_node_id, stage_name_for_id

    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or not nid or nid == "pending":
        return False
    stage_name = stage_name_for_id(stage_id_for_node_id(nid))
    return validate_node_archive_files(sid, stage_name, nid).ok


def resolve_ready_for_node_review_after_hitl(
    scope_id: str,
    node_id: str,
    feedback_mode: HitlFeedbackMode,
    *,
    values: dict[str, Any] | None = None,
    schema: dict[str, Any] | None = None,
) -> bool:
    """会中问卷提交后：末题选「否」且归档已就绪时才标记 NodeReview 就绪。"""
    from synapse.rd_meeting.func_solution_review import uses_func_solution_gate
    from synapse.rd_meeting.hitl_feedback import user_selected_no_further_processing
    from synapse.rd_meeting.solution_review import uses_solution_review_gate

    del feedback_mode  # 收口题「否」为唯一门控，不再依赖 options_only

    if uses_solution_review_gate(node_id):
        return False
    if uses_func_solution_gate(node_id):
        return False
    if not user_selected_no_further_processing(values or {}, schema):
        return False
    return node_archive_ready_for_review(scope_id, node_id)


def set_hitl_feedback_mode(scope_id: str, mode: HitlFeedbackMode | None) -> None:
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    if mode:
        rs[HITL_FEEDBACK_MODE_KEY] = mode
    else:
        rs.pop(HITL_FEEDBACK_MODE_KEY, None)
    save_room_state(sid, rs)


def reset_human_confirm_lifecycle(scope_id: str) -> None:
    """新节点开始或节点推进后重置会中澄清 / 完成确认状态。"""
    sid = (scope_id or "").strip()
    if not sid:
        return
    from synapse.rd_meeting.hitl_closure_guard import HITL_CLOSURE_INTENT_KEY
    from synapse.rd_meeting.work_plan import ARCHIVE_DOC_PENDING_KEY, INTERACTIVE_REQUIRED_KEY

    rs = dict(load_room_state(sid) or {})
    rs.pop(READY_FOR_NODE_REVIEW_KEY, None)
    rs.pop(HITL_CLARIFY_ROUND_KEY, None)
    rs.pop(HITL_FEEDBACK_MODE_KEY, None)
    rs.pop(HITL_CLOSURE_INTENT_KEY, None)
    rs.pop(ARCHIVE_DOC_PENDING_KEY, None)
    rs.pop(INTERACTIVE_REQUIRED_KEY, None)
    save_room_state(sid, rs)


def clear_hitl_gate_residual_state(room_state: dict[str, Any]) -> dict[str, Any]:
    """清理会中门控残留（重处理/节点初始化用；不触碰 reprocess_reason）。"""
    from synapse.rd_meeting.hitl_closure_guard import HITL_CLOSURE_INTENT_KEY
    from synapse.rd_meeting.work_plan import ARCHIVE_DOC_PENDING_KEY, INTERACTIVE_REQUIRED_KEY

    rs = dict(room_state)
    for key in (
        "hitl_locked",
        "hitl_submission",
        "hitl_form_schema",
        "intervention_kind",
        "pending_questionnaire",
        HITL_CLOSURE_INTENT_KEY,
        ARCHIVE_DOC_PENDING_KEY,
        INTERACTIVE_REQUIRED_KEY,
    ):
        rs.pop(key, None)
    pending = rs.get("pending_delivery")
    if isinstance(pending, dict):
        pending = dict(pending)
        pending.pop("review_payload", None)
        if pending:
            rs["pending_delivery"] = pending
        else:
            rs.pop("pending_delivery", None)
    rs.pop(READY_FOR_NODE_REVIEW_KEY, None)
    rs.pop(HITL_CLARIFY_ROUND_KEY, None)
    rs.pop(HITL_FEEDBACK_MODE_KEY, None)
    return rs


def get_clarify_round(scope_id: str) -> int:
    rs = load_room_state(scope_id) or {}
    try:
        return max(0, int(rs.get(HITL_CLARIFY_ROUND_KEY) or 0))
    except (TypeError, ValueError):
        return 0


def bump_clarify_round(scope_id: str) -> int:
    sid = (scope_id or "").strip()
    if not sid:
        return 0
    rs = dict(load_room_state(sid) or {})
    n = get_clarify_round(sid) + 1
    rs[HITL_CLARIFY_ROUND_KEY] = n
    save_room_state(sid, rs)
    return n


def prompt_require_interactive_questionnaire() -> str:
    return _PROMPT_REQUIRE_INTERACTIVE.strip()


def prompt_require_archive_doc() -> str:
    return _PROMPT_REQUIRE_ARCHIVE_DOC.strip()


def user_has_supplement_input(
    values: dict[str, Any],
    *,
    comment: str = "",
    schema: dict[str, Any] | None = None,
) -> bool:
    """兼容旧名：是否含任意自由输入（见 ``user_has_free_text_input``）。"""
    return user_has_free_text_input(values, schema, comment=comment)
