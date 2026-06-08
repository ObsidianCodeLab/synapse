"""研发会议室委派：工作计划门控 + live 事件（供 Orchestrator.delegate 集中调用）。"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def resolve_session_id(session: Any) -> str:
    return str(
        getattr(session, "id", None)
        or getattr(session, "session_id", None)
        or ""
    )


def begin_rd_meeting_delegation(
    session_id: str,
    *,
    from_agent: str,
    to_agent: str,
    reason: str = "",
    message: str = "",
    plan_item_id: str = "",
) -> str | None:
    """若应阻断委派则返回错误文案，否则 None（非会议室 session 亦直接放行）。"""
    if not session_id:
        return None

    from synapse.rd_meeting.work_plan import check_delegation_allowed, mark_delegation_started

    gate_err = check_delegation_allowed(
        session_id, agent_id=to_agent, plan_item_id=plan_item_id
    )
    if gate_err:
        return gate_err

    mark_delegation_started(session_id, agent_id=to_agent, plan_item_id=plan_item_id)
    try:
        from synapse.rd_meeting.live import record_delegation_started

        record_delegation_started(
            session_id,
            from_agent=from_agent,
            to_agent=to_agent,
            reason=reason,
            task_preview=(message or "")[:280],
            plan_item_id=plan_item_id,
        )
    except Exception as exc:
        logger.debug("record_delegation_started failed: %s", exc)
    return None


def finish_rd_meeting_delegation(
    session_id: str,
    *,
    from_agent: str,
    to_agent: str,
    ok: bool,
    summary: str = "",
    elapsed_s: float | None = None,
    plan_item_id: str = "",
) -> str:
    hint = ""
    if session_id:
        try:
            from synapse.rd_meeting.work_plan import mark_delegation_completed

            hint = mark_delegation_completed(
                session_id,
                agent_id=to_agent,
                plan_item_id=plan_item_id,
                ok=ok,
            )
        except Exception as exc:
            logger.debug("mark_delegation_completed failed: %s", exc)
    try:
        from synapse.rd_meeting.live import record_delegation_finished

        record_delegation_finished(
            session_id,
            from_agent=from_agent,
            to_agent=to_agent,
            ok=ok,
            summary=summary,
            elapsed_s=elapsed_s,
        )
    except Exception as exc:
        logger.debug("record_delegation_finished failed: %s", exc)
    return hint


def handle_rd_meeting_delegation_error(
    session_id: str,
    *,
    from_agent: str,
    to_agent: str,
    error_text: str,
    elapsed_s: float | None = None,
) -> None:
    finish_rd_meeting_delegation(
        session_id,
        from_agent=from_agent,
        to_agent=to_agent,
        ok=False,
        summary=error_text,
        elapsed_s=elapsed_s,
    )
    try:
        from synapse.rd_meeting.gate import schedule_delegation_failure_gate

        schedule_delegation_failure_gate(session_id, to_agent=to_agent, error_text=error_text)
    except Exception as exc:
        logger.debug("schedule_delegation_failure_gate failed: %s", exc)
