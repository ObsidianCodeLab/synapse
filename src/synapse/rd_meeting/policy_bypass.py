"""研发会议室 policy 放行：白名单工具在 rd_meeting 会话内跳过 CONFIRM。"""

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


def try_rd_meeting_allow_via_session(
    tool_name: str,
    *,
    session_id: str,
) -> PolicyDecisionV2 | None:
    """policy_v2 路径：rd_meeting 会话 + 白名单工具 → ALLOW（避免 run_shell CONFIRM 卡死）。"""
    if not is_rd_meeting_session(session_id):
        return None
    if tool_name not in meeting_room_allowed_tool_names():
        return None

    from synapse.core.policy_v2.enums import ApprovalClass, DecisionAction
    from synapse.core.policy_v2.models import DecisionStep, PolicyDecisionV2

    return PolicyDecisionV2(
        action=DecisionAction.ALLOW,
        reason="研发会议室白名单工具自动放行",
        approval_class=ApprovalClass.EXEC_CAPABLE,
        chain=[
            DecisionStep(
                name="rd_meeting_bypass",
                action=DecisionAction.ALLOW,
                note=f"session={session_id} tool={tool_name}",
            )
        ],
        metadata={"policy_name": "rd_meeting"},
    )


def try_rd_meeting_allow_via_agent(tool_name: str, agent: Any | None) -> bool:
    """tool_executor 路径：额外要求 ``_org_context``，防止非会议室 Agent 误放行。"""
    if agent is None or not getattr(agent, "_org_context", False):
        return False
    session_id = ""
    sess = getattr(agent, "_current_session", None)
    if sess is not None:
        session_id = getattr(sess, "id", None) or getattr(sess, "session_id", None) or ""
    if not session_id:
        session_id = getattr(agent, "_current_session_id", None) or ""
    return try_rd_meeting_allow_via_session(tool_name, session_id=str(session_id)) is not None
