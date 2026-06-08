"""研发会议室 policy 放行：白名单工具在会议室上下文内跳过 CONFIRM。"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from synapse.core.policy_v2.models import PolicyDecisionV2


def meeting_room_allowed_tool_names() -> frozenset[str]:
    from synapse.rd_meeting.agent_runtime import meeting_tool_names_for_role

    return meeting_tool_names_for_role("host") | meeting_tool_names_for_role("worker")


def is_rd_meeting_session(session_id: str) -> bool:
    from synapse.rd_meeting.live import parse_rd_meeting_session

    return parse_rd_meeting_session(session_id or "") is not None


def is_rd_meeting_agent(agent: Any | None) -> bool:
    """会议室 Agent：``_org_context is True``（非 org dict）且已绑定 meeting prompt / activity。"""
    if agent is None or getattr(agent, "_org_context", None) is not True:
        return False
    try:
        from synapse.rd_meeting.agent_prompt import is_meeting_agent_configured

        if is_meeting_agent_configured(agent):
            return True
    except Exception:
        pass
    try:
        from synapse.rd_meeting.agent_activity import resolve_agent_activity_binding

        return resolve_agent_activity_binding(agent) is not None
    except Exception:
        return False


def is_active_rd_meeting_context(
    *,
    session_id: str = "",
    agent: Any | None = None,
    metadata: dict[str, Any] | None = None,
) -> bool:
    if is_rd_meeting_session(session_id):
        return True
    if isinstance(metadata, dict) and metadata.get("rd_meeting"):
        return True
    return is_rd_meeting_agent(agent)


def _agent_session_id(agent: Any | None) -> str:
    if agent is None:
        return ""
    sess = getattr(agent, "_current_session", None)
    if sess is not None:
        sid = getattr(sess, "id", None) or getattr(sess, "session_id", None) or ""
        if sid:
            return str(sid)
    return str(getattr(agent, "_current_session_id", None) or "")


def try_rd_meeting_policy_allow(
    tool_name: str,
    *,
    session_id: str = "",
    agent: Any | None = None,
    metadata: dict[str, Any] | None = None,
) -> PolicyDecisionV2 | None:
    """policy_v2 / tool_executor 共用：会议室上下文 + 白名单工具 → ALLOW。"""
    if not is_active_rd_meeting_context(session_id=session_id, agent=agent, metadata=metadata):
        return None
    if tool_name not in meeting_room_allowed_tool_names():
        return None

    from synapse.core.policy_v2.enums import ApprovalClass, DecisionAction
    from synapse.core.policy_v2.models import DecisionStep, PolicyDecisionV2

    sid = session_id or _agent_session_id(agent) or "rd_meeting"
    return PolicyDecisionV2(
        action=DecisionAction.ALLOW,
        reason="研发会议室白名单工具自动放行",
        approval_class=ApprovalClass.EXEC_CAPABLE,
        chain=[
            DecisionStep(
                name="rd_meeting_bypass",
                action=DecisionAction.ALLOW,
                note=f"session={sid} tool={tool_name}",
            )
        ],
        metadata={"policy_name": "rd_meeting"},
    )


def try_rd_meeting_allow_via_session(
    tool_name: str,
    *,
    session_id: str,
) -> PolicyDecisionV2 | None:
    return try_rd_meeting_policy_allow(tool_name, session_id=session_id)


def try_rd_meeting_allow_via_agent(tool_name: str, agent: Any | None) -> bool:
    return (
        try_rd_meeting_policy_allow(
            tool_name,
            session_id=_agent_session_id(agent),
            agent=agent,
        )
        is not None
    )
