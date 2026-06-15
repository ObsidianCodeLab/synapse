"""研发会议室工作安排计划：提交、校验、委派门禁。"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from synapse.rd_meeting.binding import resolve_node_binding
from synapse.rd_meeting.collaboration import collaboration_worker_ids
from synapse.rd_meeting.dev_status import load_dev_status
from synapse.rd_meeting.live import parse_rd_meeting_session, scope_id_for_room_id
from synapse.rd_meeting.participants import resolve_profile_display_name
from synapse.rd_meeting.room_runtime import append_history_event, load_room_state, save_room_state

logger = logging.getLogger(__name__)

PLAN_TYPE = "meeting_work_plan"
PLAN_VERSION = "1"
ROOM_STATE_KEY = "current_work_plan"
ARCHIVE_DOC_PENDING_KEY = "archive_doc_pending"
INTERACTIVE_REQUIRED_KEY = "interactive_required"
HOST_HITL_ACTION = "submit_hitl"
HOST_FORWARD_GATED_TOOLS = frozenset({
    "deliver_artifacts",
    "submit_hitl_questionnaire",
    "delegate_to_agent",
    "delegate_parallel",
})
DEFAULT_CLOSING_STEP: dict[str, str] = {
    "action": HOST_HITL_ACTION,
    "kind": "interactive",
    "task": "综合本计划全部协作智能体产出，调用 submit_hitl_questionnaire 生成本批次人机确认表单",
    "reason": "本节点开启人工确认，须结构化问卷，禁止在聊天中用「待用户确认」代替",
}
PLAN_HITL_GATED_TOOLS = frozenset({
    "deliver_artifacts",
    "execute_skill",
    "run_skill_script",
})


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def is_rd_meeting_host_session(session_id: str) -> bool:
    parsed = parse_rd_meeting_session(session_id or "")
    return parsed is not None and parsed.get("role") == "host"


def is_rd_meeting_host_agent(agent: Any) -> bool:
    """判断当前 Agent 轮次是否为会议室 Host（非 Worker）。

    Worker 委派时 ``_current_session`` 仍指向 Host Session 对象，但
    ``_current_session_id`` 为 ``rd_meeting:{room}:{profile}`` 池化键；
    角色判断必须优先后者，否则会误把 Worker 当成 Host 触发 HITL 门禁。
    """
    sid = str(getattr(agent, "_current_session_id", None) or "").strip()
    parsed = parse_rd_meeting_session(sid)
    if parsed is not None:
        return parsed.get("role") == "host"
    session = getattr(agent, "_current_session", None)
    fallback = str(
        getattr(session, "id", None)
        or getattr(session, "session_id", None)
        or ""
    )
    return is_rd_meeting_host_session(fallback)


def meeting_context_from_session(session_id: str) -> dict[str, str] | None:
    """解析 rd_meeting host 会话 → scope_id / room_id / node_id。"""
    parsed = parse_rd_meeting_session(session_id or "")
    if not parsed or parsed.get("role") != "host":
        return None
    room_id = str(parsed.get("room_id") or "").strip()
    scope_id = scope_id_for_room_id(room_id)
    if not scope_id:
        return None
    dev = load_dev_status(scope_id)
    node_id = str(dev.get("current_node_id") or "pending") if dev else "pending"
    return {"scope_id": scope_id, "room_id": room_id, "node_id": node_id}


def _normalize_items(raw_items: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError("items 必须为非空数组")
    out: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for i, row in enumerate(raw_items):
        if not isinstance(row, dict):
            raise ValueError(f"items[{i}] 必须为对象")
        item_id = str(row.get("id") or f"t{i + 1}").strip()
        if not item_id:
            raise ValueError(f"items[{i}].id 不能为空")
        if item_id in seen_ids:
            raise ValueError(f"items 中 id 重复: {item_id}")
        seen_ids.add(item_id)
        agent_id = str(row.get("agent_id") or "").strip()
        task = str(row.get("task") or "").strip()
        reason = str(row.get("reason") or "").strip()
        if not agent_id:
            raise ValueError(f"items[{i}].agent_id 不能为空")
        if not task:
            raise ValueError(f"items[{i}].task 不能为空")
        if not reason:
            raise ValueError(f"items[{i}].reason 不能为空")
        entry: dict[str, Any] = {
            "id": item_id,
            "agent_id": agent_id,
            "task": task,
            "reason": reason,
        }
        pg = str(row.get("parallel_group") or "").strip()
        if pg:
            entry["parallel_group"] = pg
        out.append(entry)
    return out


def validate_work_plan_items(
    items: list[dict[str, Any]],
    *,
    allowed_worker_ids: list[str],
    host_profile_id: str,
) -> None:
    allowed = {str(w).strip() for w in allowed_worker_ids if str(w).strip()}
    host_id = str(host_profile_id or "").strip()
    if host_id:
        allowed.discard(host_id)
    if not allowed:
        raise ValueError("当前节点未配置可委派的协作智能体（worker_profile_ids）")
    for item in items:
        aid = str(item.get("agent_id") or "").strip()
        if aid not in allowed:
            raise ValueError(
                f"agent_id `{aid}` 不在本节点协作阵容内；可委派: {', '.join(sorted(allowed))}"
            )


def _normalize_closing_step(raw: Any) -> dict[str, str]:
    if raw is None:
        return dict(DEFAULT_CLOSING_STEP)
    if not isinstance(raw, dict):
        raise ValueError("closing_step 必须为对象")
    action = str(raw.get("action") or HOST_HITL_ACTION).strip().lower()
    if action != HOST_HITL_ACTION:
        raise ValueError(f"closing_step.action 必须为 `{HOST_HITL_ACTION}`")
    kind = str(raw.get("kind") or "interactive").strip().lower()
    if kind != "interactive":
        raise ValueError("closing_step.kind 当前仅支持 `interactive`（会中批次澄清）")
    task = str(raw.get("task") or "").strip()
    reason = str(raw.get("reason") or "").strip()
    if not task:
        raise ValueError("closing_step.task 不能为空")
    if not reason:
        raise ValueError("closing_step.reason 不能为空")
    return {"action": action, "kind": kind, "task": task, "reason": reason}


def _delegate_item_ids(plan: dict[str, Any]) -> set[str]:
    items = plan.get("items") if isinstance(plan.get("items"), list) else []
    return {
        str(it.get("id") or "").strip()
        for it in items
        if isinstance(it, dict) and str(it.get("id") or "").strip()
    }


def is_plan_batch_complete(plan: dict[str, Any]) -> bool:
    delegate_ids = _delegate_item_ids(plan)
    if not delegate_ids:
        return False
    completed = plan.get("completed_item_ids")
    if not isinstance(completed, list):
        return False
    done = {str(x).strip() for x in completed if str(x).strip()}
    return delegate_ids.issubset(done)


def plan_requires_hitl(plan: dict[str, Any], *, human_confirm: bool) -> bool:
    node_id = str(plan.get("node_id") or "").strip()
    if node_id:
        from synapse.rd_meeting.binding import uses_human_interactive_hitl

        if not uses_human_interactive_hitl(node_id):
            return False
    return bool(human_confirm and isinstance(plan.get("closing_step"), dict))


def plan_awaiting_hitl(scope_id: str, *, human_confirm: bool | None = None) -> bool:
    """本批 Worker 已全部返回且 closing_step 仍待交 interactive（不含用户已选「否」收口）。"""
    plan = get_work_plan(scope_id)
    if not plan:
        return False
    node_id = str(plan.get("node_id") or "").strip()
    if node_id:
        from synapse.rd_meeting.hitl_closure_guard import load_closure_intent

        if load_closure_intent(scope_id, node_id) == "done":
            return False
    if human_confirm is None:
        binding = resolve_node_binding(node_id, scope_id=scope_id) if node_id else {}
        human_confirm = bool(binding.get("human_confirm"))
    if not plan_requires_hitl(plan, human_confirm=bool(human_confirm)):
        return False
    if plan.get("hitl_submitted"):
        return False
    return is_plan_batch_complete(plan)


def mark_archive_doc_pending(scope_id: str) -> None:
    """Host 收到人机问卷或节点打回反馈后，要求先 doc-generate 再推进。"""
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    rs[ARCHIVE_DOC_PENDING_KEY] = True
    save_room_state(sid, rs)


def clear_archive_doc_pending(scope_id: str) -> None:
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    if ARCHIVE_DOC_PENDING_KEY in rs:
        rs.pop(ARCHIVE_DOC_PENDING_KEY, None)
        save_room_state(sid, rs)


def is_archive_doc_pending(scope_id: str) -> bool:
    rs = load_room_state((scope_id or "").strip()) or {}
    return bool(rs.get(ARCHIVE_DOC_PENDING_KEY))


def sync_interactive_required_after_closure(scope_id: str, intent: str) -> None:
    """与末题收口互斥：选「否」不要求 interactive；选「是」要求后续交 interactive。"""
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    if intent == "done":
        rs.pop(INTERACTIVE_REQUIRED_KEY, None)
    elif intent == "further":
        rs[INTERACTIVE_REQUIRED_KEY] = True
    save_room_state(sid, rs)


def must_submit_interactive_questionnaire(scope_id: str, node_id: str = "") -> bool:
    """是否仍须提交 kind=interactive 会中问卷（与「本节点已无待决问题」互斥）。"""
    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid:
        return False
    from synapse.rd_meeting.binding import uses_human_interactive_hitl

    if nid and not uses_human_interactive_hitl(nid):
        return False
    from synapse.rd_meeting.hitl_closure_guard import load_closure_intent

    intent = load_closure_intent(sid, nid)
    if intent == "done":
        return False
    rs = load_room_state(sid) or {}
    if rs.get(INTERACTIVE_REQUIRED_KEY):
        plan = get_work_plan(sid)
        if isinstance(plan, dict) and plan.get("hitl_submitted"):
            return False
        pending_q = rs.get("pending_questionnaire")
        if isinstance(pending_q, dict) and pending_q.get("schema"):
            return False
        return True
    return plan_awaiting_hitl(sid)


def _is_doc_generate_tool(tool_name: str, skill_name: str) -> bool:
    if tool_name in ("execute_skill", "run_skill_script"):
        skill = (skill_name or "").strip().lower()
        return "doc-generate" in skill or "doc_generate" in skill
    return False


def batch_complete_hint(scope_id: str) -> str:
    if not must_submit_interactive_questionnaire(scope_id):
        if is_archive_doc_pending(scope_id):
            return (
                "\n\n---\n**系统提示**：本工作安排计划中的协作任务已全部返回。"
                "请先 `whalecloud-dev-tool-doc-generate` 更新归档产出，再继续后续动作。"
            )
        return ""
    return (
        "\n\n---\n**系统提示**：本工作安排计划中的协作任务已全部返回。"
        "请先 `whalecloud-dev-tool-doc-generate` 更新归档产出，"
        "再调用 `submit_hitl_questionnaire`（kind=\"interactive\"）；"
        "勿在正文中写「待用户确认」代替表单。"
    )


def build_plan_document(
    *,
    goal_summary: str,
    items: list[dict[str, Any]],
    node_id: str,
    closing_step: dict[str, str] | None = None,
) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "type": PLAN_TYPE,
        "version": PLAN_VERSION,
        "node_id": node_id,
        "goal_summary": (goal_summary or "").strip(),
        "items": items,
        "plan_id": uuid.uuid4().hex[:12],
        "submitted_at": _now_iso(),
    }
    if closing_step is not None:
        doc["closing_step"] = dict(closing_step)
    return doc


def format_plan_summary_text(plan: dict[str, Any]) -> str:
    lines = ["# 工作安排计划"]
    goal = str(plan.get("goal_summary") or "").strip()
    if goal:
        lines.append(f"\n**目标**：{goal}")
    lines.append("\n**任务分配**：")
    for item in plan.get("items") or []:
        if not isinstance(item, dict):
            continue
        aid = str(item.get("agent_id") or "")
        name = resolve_profile_display_name(aid)
        task = str(item.get("task") or "").strip()
        reason = str(item.get("reason") or "").strip()
        pg = str(item.get("parallel_group") or "").strip()
        pg_txt = f" · 并行组 `{pg}`" if pg else ""
        lines.append(f"- **{name}** (`{aid}`){pg_txt}：{task}")
        if reason:
            lines.append(f"  - 原因：{reason}")
    closing = plan.get("closing_step")
    if isinstance(closing, dict):
        lines.append("\n**收尾（主控）**：")
        lines.append(f"- {str(closing.get('task') or '').strip()}")
        creason = str(closing.get("reason") or "").strip()
        if creason:
            lines.append(f"  - 原因：{creason}")
    return "\n".join(lines)


def clear_work_plan(scope_id: str) -> None:
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    if ROOM_STATE_KEY in rs:
        rs.pop(ROOM_STATE_KEY, None)
        save_room_state(sid, rs)


def get_work_plan(scope_id: str) -> dict[str, Any] | None:
    rs = load_room_state((scope_id or "").strip()) or {}
    plan = rs.get(ROOM_STATE_KEY)
    return dict(plan) if isinstance(plan, dict) else None


def submit_work_plan(
    *,
    session_id: str,
    goal_summary: str,
    items: list[dict[str, Any]],
    closing_step: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ctx = meeting_context_from_session(session_id)
    if ctx is None:
        raise ValueError("仅研发会议室主控（小鲸）会话可提交工作安排计划")

    scope_id = ctx["scope_id"]
    room_id = ctx["room_id"]
    node_id = ctx["node_id"]

    rs = dict(load_room_state(scope_id) or {})
    existing = rs.get(ROOM_STATE_KEY)
    if isinstance(existing, dict) and existing.get("delegation_started"):
        raise ValueError("已开始委派协作智能体，不可再修改工作安排计划")

    binding = resolve_node_binding(node_id, scope_id=scope_id)
    host_id = str(binding.get("host_profile_id") or "default")
    workers = collaboration_worker_ids(host_id, binding.get("worker_profile_ids"))
    normalized = _normalize_items(items)
    if not workers:
        raise ValueError(
            "本场无协作智能体，无需 submit_meeting_work_plan；"
            "请直接按 SKILL / 工具完成本节点，勿调用 delegate_to_agent / delegate_parallel"
        )
    validate_work_plan_items(normalized, allowed_worker_ids=workers, host_profile_id=host_id)

    human_confirm = bool(binding.get("human_confirm"))
    normalized_closing: dict[str, str] | None = None
    if human_confirm:
        normalized_closing = _normalize_closing_step(
            closing_step if closing_step is not None else DEFAULT_CLOSING_STEP
        )

    plan = build_plan_document(
        goal_summary=goal_summary,
        items=normalized,
        node_id=node_id,
        closing_step=normalized_closing,
    )
    plan["delegation_started"] = False
    plan["delegated_item_ids"] = []
    plan["completed_item_ids"] = []
    plan["hitl_submitted"] = False

    rs[ROOM_STATE_KEY] = plan
    save_room_state(scope_id, rs)

    summary_text = format_plan_summary_text(plan)
    append_history_event(
        scope_id,
        {
            "event": "work_plan_submitted",
            "room_id": room_id,
            "node_id": node_id,
            "text": summary_text,
            "log_type": "info",
            "agent_id": host_id,
            "plan_id": plan.get("plan_id"),
            "item_count": len(normalized),
        },
    )
    try:
        from synapse.rd_meeting.agent_activity import record_output, resolve_binding_for_profile

        binding = resolve_binding_for_profile(scope_id, node_id, host_id, host_profile_id=host_id)
        record_output(
            binding,
            output_kind="work_plan",
            title="工作安排计划",
            summary=summary_text,
            detail={"plan_id": plan.get("plan_id"), "item_count": len(normalized)},
        )
    except Exception as exc:
        logger.debug("work_plan activity record failed: %s", exc)
    return plan


def check_delegation_allowed(
    session_id: str,
    *,
    agent_id: str,
    plan_item_id: str = "",
) -> str | None:
    """返回错误信息；None 表示允许委派。"""
    if not is_rd_meeting_host_session(session_id):
        return None

    ctx = meeting_context_from_session(session_id)
    if ctx is None:
        return "❌ 无法解析研发会议室上下文，委派已阻止"

    scope_id = ctx["scope_id"]
    binding = resolve_node_binding(ctx["node_id"], scope_id=scope_id)
    host_id = str(binding.get("host_profile_id") or "default")
    if not collaboration_worker_ids(host_id, binding.get("worker_profile_ids")):
        return None
    plan = get_work_plan(scope_id)
    if plan is None:
        return (
            "❌ 尚未提交工作安排计划。请先调用 `submit_meeting_work_plan` "
            "明确各协作智能体的任务与原因，再使用 delegate_to_agent / delegate_parallel。"
        )

    plan_node = str(plan.get("node_id") or "")
    if plan_node and plan_node != ctx["node_id"]:
        return (
            f"❌ 当前工作安排计划属于节点 `{plan_node}`，与当前节点 `{ctx['node_id']}` 不一致；"
            "请重新 submit_meeting_work_plan。"
        )

    aid = (agent_id or "").strip()
    items = plan.get("items") if isinstance(plan.get("items"), list) else []
    item_ids = {str(it.get("id") or "") for it in items if isinstance(it, dict)}
    agent_ids_in_plan = {
        str(it.get("agent_id") or "").strip()
        for it in items
        if isinstance(it, dict) and str(it.get("agent_id") or "").strip()
    }

    pid = (plan_item_id or "").strip()
    if pid:
        if pid not in item_ids:
            return f"❌ plan_item_id `{pid}` 不在当前工作安排计划中"
        matched = next((it for it in items if isinstance(it, dict) and str(it.get("id")) == pid), None)
        if matched and str(matched.get("agent_id") or "").strip() != aid:
            return f"❌ plan_item_id `{pid}` 对应 agent 为 `{matched.get('agent_id')}`，与 `{aid}` 不一致"
    elif aid not in agent_ids_in_plan:
        return (
            f"❌ agent_id `{aid}` 未出现在当前工作安排计划中；"
            f"计划内协作智能体: {', '.join(sorted(agent_ids_in_plan))}"
        )

    return None


def mark_delegation_started(
    session_id: str,
    *,
    agent_id: str,
    plan_item_id: str = "",
) -> None:
    if not is_rd_meeting_host_session(session_id):
        return
    ctx = meeting_context_from_session(session_id)
    if ctx is None:
        return
    scope_id = ctx["scope_id"]
    rs = dict(load_room_state(scope_id) or {})
    plan = rs.get(ROOM_STATE_KEY)
    if not isinstance(plan, dict):
        return
    plan = dict(plan)
    plan["delegation_started"] = True
    delegated = plan.get("delegated_item_ids")
    if not isinstance(delegated, list):
        delegated = []
    pid = (plan_item_id or "").strip()
    resolved_pid = pid
    if pid and pid not in delegated:
        delegated.append(pid)
    elif not pid:
        items = plan.get("items") if isinstance(plan.get("items"), list) else []
        for it in items:
            if isinstance(it, dict) and str(it.get("agent_id") or "").strip() == (agent_id or "").strip():
                iid = str(it.get("id") or "")
                if iid:
                    resolved_pid = iid
                if iid and iid not in delegated:
                    delegated.append(iid)
                break
    plan["delegated_item_ids"] = delegated
    had_hitl = bool(plan.get("hitl_submitted"))
    if had_hitl:
        plan["hitl_submitted"] = False
        completed = plan.get("completed_item_ids")
        if isinstance(completed, list) and resolved_pid:
            plan["completed_item_ids"] = [
                x for x in completed if str(x).strip() != resolved_pid
            ]
    rs[ROOM_STATE_KEY] = plan
    if had_hitl:
        from synapse.rd_meeting.hitl_lifecycle import clear_ready_for_node_review

        rs.pop("hitl_locked", None)
        clear_ready_for_node_review(scope_id)
    save_room_state(scope_id, rs)


def mark_delegation_completed(
    session_id: str,
    *,
    agent_id: str,
    plan_item_id: str = "",
    ok: bool = True,
) -> str:
    """委派返回后标记计划条目完成；若本批全部完成则返回提示 Host 交 HITL 的文案。"""
    if not ok or not is_rd_meeting_host_session(session_id):
        return ""
    ctx = meeting_context_from_session(session_id)
    if ctx is None:
        return ""
    scope_id = ctx["scope_id"]
    rs = dict(load_room_state(scope_id) or {})
    plan = rs.get(ROOM_STATE_KEY)
    if not isinstance(plan, dict):
        return ""

    plan = dict(plan)
    completed = plan.get("completed_item_ids")
    if not isinstance(completed, list):
        completed = []
    pid = (plan_item_id or "").strip()
    if not pid:
        items = plan.get("items") if isinstance(plan.get("items"), list) else []
        for it in items:
            if isinstance(it, dict) and str(it.get("agent_id") or "").strip() == (agent_id or "").strip():
                pid = str(it.get("id") or "").strip()
                break
    if pid and pid not in completed:
        completed.append(pid)
    plan["completed_item_ids"] = completed
    rs[ROOM_STATE_KEY] = plan
    save_room_state(scope_id, rs)
    return batch_complete_hint(scope_id)


def mark_plan_hitl_submitted(scope_id: str, *, kind: str = "interactive") -> None:
    """Host 成功 submit_hitl 后标记当前计划批次已交问卷。"""
    if kind.strip().lower() != "interactive":
        return
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    plan = rs.get(ROOM_STATE_KEY)
    if not isinstance(plan, dict) or not isinstance(plan.get("closing_step"), dict):
        return
    plan = dict(plan)
    plan["hitl_submitted"] = True
    rs[ROOM_STATE_KEY] = plan
    rs.pop(INTERACTIVE_REQUIRED_KEY, None)
    save_room_state(sid, rs)


def session_id_from_agent(agent: Any) -> str:
    """解析 Agent 当前执行上下文对应的 session id（优先池化键）。"""
    sid = str(getattr(agent, "_current_session_id", None) or "").strip()
    if parse_rd_meeting_session(sid):
        return sid
    session = getattr(agent, "_current_session", None)
    return str(
        getattr(session, "id", None)
        or getattr(session, "session_id", None)
        or sid
        or ""
    )


def check_host_forward_gate(
    session_id: str,
    tool_name: str,
    *,
    skill_name: str = "",
    questionnaire_kind: str = "",
    agent: Any = None,
) -> str | None:
    """Host 推进门禁：doc-generate 随时可做；收到反馈后须先 doc-generate，再按收口意图交 interactive。"""
    if agent is not None:
        if not is_rd_meeting_host_agent(agent):
            return None
        session_id = session_id_from_agent(agent)
    elif not is_rd_meeting_host_session(session_id):
        return None
    ctx = meeting_context_from_session(session_id)
    if ctx is None:
        return None
    scope_id = ctx["scope_id"]
    node_id = ctx.get("node_id") or ""

    from synapse.rd_meeting.binding import uses_human_interactive_hitl

    if not uses_human_interactive_hitl(node_id):
        return None

    if _is_doc_generate_tool(tool_name, skill_name):
        return None

    gated = tool_name in HOST_FORWARD_GATED_TOOLS or tool_name in PLAN_HITL_GATED_TOOLS
    if not gated:
        return None

    if is_archive_doc_pending(scope_id):
        return (
            "❌ 收到协作智能体或人工反馈后，须先调用 `whalecloud-dev-tool-doc-generate` "
            "更新本节点归档产出（如 `需求澄清.md`），再执行委派、问卷或交付。"
        )

    qkind = (questionnaire_kind or "").strip().lower()
    if tool_name == "submit_hitl_questionnaire" and qkind == "exception":
        return None

    if must_submit_interactive_questionnaire(scope_id, node_id):
        if tool_name == "submit_hitl_questionnaire" and qkind == "interactive":
            return None
        return (
            "❌ 本节点仍有待决问题须用户确认：请先 `whalecloud-dev-tool-doc-generate` 更新归档产出，"
            "再调用 `submit_hitl_questionnaire`（kind=\"interactive\"）。"
            "用户末题选「否」后不再要求 interactive。"
        )
    return None


def check_host_hitl_gate(
    session_id: str,
    tool_name: str,
    *,
    skill_name: str = "",
    agent: Any = None,
) -> str | None:
    """兼容旧名；见 ``check_host_forward_gate``。"""
    return check_host_forward_gate(
        session_id,
        tool_name,
        skill_name=skill_name,
        agent=agent,
    )
