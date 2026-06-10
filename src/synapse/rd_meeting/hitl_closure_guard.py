"""会中问卷收口护栏：按用户末题选择强制主控走问卷或节点确认总结（非提示词软约束）。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from synapse.rd_meeting.hitl_feedback import (
    user_selected_no_further_processing,
    user_wants_further_processing,
)
from synapse.rd_meeting.room_runtime import load_room_state, save_room_state

ClosureIntent = Literal["further", "done", "unknown"]
RequiredHostAction = Literal["none", "submit_interactive", "enter_node_review"]

HITL_CLOSURE_INTENT_KEY = "hitl_closure_intent"

_PROMPT_USER_SAID_YES_NEED_QUESTIONNAIRE = """
## ⚠️ 系统护栏：用户选择「仍需进一步处理」

上一轮会中问卷末题，用户选择了 **是**（仍有问题需进一步处理），并给出了具体要求。

**本次禁止**：
- 进入节点确认总结（NodeReview）或口头宣称「待确认总结」；
- 仅输出正文总结而不调用 ``submit_hitl_questionnaire``。

**本次必须**：
1. 读 ``hitl_context.json``，用 ``clarify_fill_ctx.json`` 作 CONTEXT_JSON 重生成 ``需求澄清.md``（保留已确认项）；
2. 委派 ``whalecloud-requirement-expert`` 执行技能 **Phase R**，调研用户补充项（不得把用户原文做成确认题）；
3. 仅对 Phase R 后的新未决点调用 ``submit_hitl_questionnaire(kind="interactive", ...)``；
4. 调用工具后立即停止。
""".strip()

_PROMPT_USER_SAID_NO_FORBID_QUESTIONNAIRE = """
## ⚠️ 系统护栏：用户选择「本节点已无待决问题」

上一轮会中问卷末题，用户选择了 **否**（本节点已无待决问题）。

**本次禁止**：
- 调用 ``submit_hitl_questionnaire(kind="interactive")`` 或任何会中澄清问卷；
- 再次发起交互式问卷。

**本次必须**：
1. 确保约定归档产出物已落盘并通过校验；
2. 不要提交 interactive 问卷；系统将自动进入 **节点确认总结（NodeReview）** 门控。
""".strip()

_TOOL_REJECT_INTERACTIVE_AFTER_DONE = (
    "用户已在会中问卷末题选择「否，本节点已无待决问题」，禁止再次调用 "
    "submit_hitl_questionnaire(kind=interactive)。请完成归档产出，系统将自动进入节点确认总结。"
)

_TOOL_REJECT_RESULT_CONFIRM_AFTER_FURTHER = (
    "用户已在会中问卷末题选择「是，仍有问题需进一步处理」，禁止 submit_hitl_questionnaire"
    "(kind=result_confirm)。须提交 kind=interactive 会中问卷。"
)


@dataclass(frozen=True)
class HostOutcomeGuard:
    intent: ClosureIntent
    required: RequiredHostAction
    discard_tool_questionnaire: bool = False
    block_node_review: bool = False
    correction_prompt: str = ""


def load_closure_intent(scope_id: str, node_id: str = "") -> ClosureIntent:
    """读取最近一次用户会中问卷收口意图（优先 room_state 显式字段）。"""
    sid = (scope_id or "").strip()
    if not sid:
        return "unknown"
    rs = load_room_state(sid) or {}
    stored = str(rs.get(HITL_CLOSURE_INTENT_KEY) or "").strip().lower()
    if stored == "further":
        return "further"
    if stored == "done":
        return "done"

    sub = rs.get("hitl_submission")
    if not isinstance(sub, dict) or not sub.get("locked"):
        return "unknown"
    if node_id and str(sub.get("node_id") or rs.get("current_node_id") or "").strip() not in (
        "",
        node_id,
    ):
        return "unknown"

    vals = sub.get("values") if isinstance(sub.get("values"), dict) else {}
    schema = sub.get("schema_snapshot") if isinstance(sub.get("schema_snapshot"), dict) else None
    if user_wants_further_processing(vals, schema):
        return "further"
    if user_selected_no_further_processing(vals, schema):
        return "done"
    return "unknown"


def set_closure_intent(scope_id: str, intent: ClosureIntent) -> None:
    sid = (scope_id or "").strip()
    if not sid or intent == "unknown":
        return
    rs = dict(load_room_state(sid) or {})
    rs[HITL_CLOSURE_INTENT_KEY] = intent
    save_room_state(sid, rs)


def clear_closure_intent(scope_id: str) -> None:
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    if HITL_CLOSURE_INTENT_KEY in rs:
        rs.pop(HITL_CLOSURE_INTENT_KEY, None)
        save_room_state(sid, rs)


def assert_tool_questionnaire_kind_allowed(
    scope_id: str,
    node_id: str,
    kind: str,
) -> None:
    """工具层硬拒绝：与用户末题收口意图冲突的问卷 kind。"""
    intent = load_closure_intent(scope_id, node_id)
    kind_norm = (kind or "").strip().lower()
    if intent == "done" and kind_norm == "interactive":
        raise ValueError(_TOOL_REJECT_INTERACTIVE_AFTER_DONE)
    if intent == "further" and kind_norm == "result_confirm":
        raise ValueError(_TOOL_REJECT_RESULT_CONFIRM_AFTER_FURTHER)


def validate_user_closure_submission(
    values: dict[str, Any],
    schema: dict[str, Any] | None,
) -> None:
    """用户提交问卷时校验末题：选「是」须填 further 要求。"""
    from synapse.rd_meeting.hitl_form import HUMAN_CLOSURE_DETAIL_ID, HUMAN_CLOSURE_QUESTION_ID

    if HUMAN_CLOSURE_QUESTION_ID not in values and not any(
        str(q.get("id") or "") == HUMAN_CLOSURE_QUESTION_ID
        for q in (schema or {}).get("questions") or []
        if isinstance(q, dict)
    ):
        return
    if not user_wants_further_processing(values, schema) and not user_selected_no_further_processing(
        values, schema
    ):
        raise ValueError("必须回答末题「是否还存在问题需要进一步处理」")
    if user_wants_further_processing(values, schema):
        detail = str(values.get(HUMAN_CLOSURE_DETAIL_ID) or "").strip()
        if not detail:
            raise ValueError("末题选「是」时必须填写需要进一步处理的要求")


def evaluate_host_run_guard(
    scope_id: str,
    node_id: str,
    *,
    tool_questionnaire: dict[str, Any] | None,
    ready_for_review: bool,
) -> HostOutcomeGuard:
    """主控本轮结束后：判定是否走错路径并给出自动纠正动作。"""
    intent = load_closure_intent(scope_id, node_id)
    if intent == "unknown":
        return HostOutcomeGuard(intent="unknown", required="none")

    tool_kind = ""
    if isinstance(tool_questionnaire, dict):
        tool_kind = str(tool_questionnaire.get("kind") or "interactive").strip().lower()

    if intent == "further":
        if tool_kind == "interactive":
            return HostOutcomeGuard(intent="further", required="none")
        return HostOutcomeGuard(
            intent="further",
            required="submit_interactive",
            block_node_review=True,
            correction_prompt=_PROMPT_USER_SAID_YES_NEED_QUESTIONNAIRE,
        )

    if intent == "done":
        if tool_kind == "interactive":
            return HostOutcomeGuard(
                intent="done",
                required="enter_node_review",
                discard_tool_questionnaire=True,
                correction_prompt=_PROMPT_USER_SAID_NO_FORBID_QUESTIONNAIRE,
            )
        from synapse.rd_meeting.hitl_lifecycle import node_archive_ready_for_review

        archive_ready = node_archive_ready_for_review(scope_id, node_id)
        if ready_for_review or archive_ready:
            return HostOutcomeGuard(intent="done", required="enter_node_review")
        return HostOutcomeGuard(
            intent="done",
            required="enter_node_review",
            correction_prompt=_PROMPT_USER_SAID_NO_FORBID_QUESTIONNAIRE,
        )

    return HostOutcomeGuard(intent=intent, required="none")


def apply_ready_for_review_guard(
    scope_id: str,
    node_id: str,
    ready_for_review: bool,
) -> bool:
    """用户选「是」时禁止 ready_for_review / NodeReview 短路。"""
    if not ready_for_review:
        return False
    if load_closure_intent(scope_id, node_id) == "further":
        return False
    return True


def closure_guard_correction_prompt(scope_id: str, node_id: str) -> str:
    """主控走错路径时注入的系统纠正提示（供 orchestrator 续跑）。"""
    guard = evaluate_host_run_guard(
        scope_id,
        node_id,
        tool_questionnaire=None,
        ready_for_review=False,
    )
    return guard.correction_prompt.strip()
