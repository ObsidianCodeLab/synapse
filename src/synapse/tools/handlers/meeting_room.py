"""研发会议室工具 handler。"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from ...core.policy_v2 import ApprovalClass

if TYPE_CHECKING:
    from ...core.agent import Agent

logger = logging.getLogger(__name__)


class MeetingRoomToolHandler:
    TOOLS = ["submit_meeting_work_plan", "submit_hitl_questionnaire"]

    # 会中问卷 / 工作计划是 HITL 与派单编排入口，语义同 ask_user，须全模式 ALLOW，
    # 避免 policy_v2 UNKNOWN→CONFIRM 弹出 SecurityConfirm 阻断会议室流程。
    TOOL_CLASSES = {
        "submit_hitl_questionnaire": ApprovalClass.INTERACTIVE,
        "submit_meeting_work_plan": ApprovalClass.INTERACTIVE,
    }

    def __init__(self, agent: Agent):
        self.agent = agent

    async def handle(self, tool_name: str, params: dict[str, Any]) -> str:
        if tool_name == "submit_meeting_work_plan":
            return await self._submit_work_plan(params)
        if tool_name == "submit_hitl_questionnaire":
            return await self._submit_questionnaire(params)
        return f"❌ Unknown meeting room tool: {tool_name}"

    def _resolve_session_id(self) -> str:
        session = getattr(self.agent, "_current_session", None)
        return (
            getattr(session, "id", None)
            or getattr(session, "session_id", None)
            or getattr(self.agent, "_current_session_id", None)
            or ""
        )

    async def _submit_work_plan(self, params: dict[str, Any]) -> str:
        from synapse.rd_meeting.work_plan import format_plan_summary_text, submit_work_plan

        goal_summary = str(params.get("goal_summary") or "").strip()
        items = params.get("items")
        closing_step = params.get("closing_step")
        if not goal_summary:
            return "❌ goal_summary 不能为空"
        if not isinstance(items, list) or not items:
            return "❌ items 必须为非空数组"

        session_id = self._resolve_session_id()
        try:
            plan = submit_work_plan(
                session_id=str(session_id),
                goal_summary=goal_summary,
                items=items,
                closing_step=closing_step if isinstance(closing_step, dict) else None,
            )
        except ValueError as exc:
            return f"❌ {exc}"
        except Exception as exc:
            logger.exception("submit_meeting_work_plan failed: %s", exc)
            return f"❌ 提交工作安排计划失败: {exc}"

        n = len(plan.get("items") or [])
        preview = format_plan_summary_text(plan)
        return (
            f"✅ 工作安排计划已提交（plan_id={plan.get('plan_id')}，共 {n} 项）。"
            f"请按 items 使用 delegate_to_agent / delegate_parallel 执行。\n\n{preview}"
        )

    async def _submit_questionnaire(self, params: dict[str, Any]) -> str:
        from synapse.rd_meeting.hitl_submit import submit_questionnaire

        kind = str(params.get("kind") or "").strip().lower()
        questions = params.get("questions")
        title = str(params.get("title") or "").strip()
        description = str(params.get("description") or "").strip()
        summary = str(params.get("summary") or "").strip()
        render = params.get("render") if isinstance(params.get("render"), dict) else None
        raw_await = params.get("await_confirm")
        await_confirm: bool | None
        if raw_await is None:
            await_confirm = None
        elif isinstance(raw_await, bool):
            await_confirm = raw_await
        else:
            await_confirm = str(raw_await).strip().lower() in ("true", "1", "yes")

        session_id = self._resolve_session_id()
        try:
            result = submit_questionnaire(
                session_id=str(session_id),
                kind=kind,
                questions=questions,
                title=title,
                description=description,
                summary=summary,
                await_confirm=await_confirm,
                render=render,
            )
        except ValueError as exc:
            return f"❌ {exc}"
        except Exception as exc:
            logger.exception("submit_hitl_questionnaire failed: %s", exc)
            return f"❌ 提交人机问卷失败: {exc}"

        # 标记 agent 应停止后续行动；orchestrator 在 execute_task 完成后会优先
        # 读 room_state.pending_questionnaire，不依赖 LLM 终稿。
        try:
            self.agent._hitl_locked = True
        except Exception:
            pass

        q_count = len(result["schema"].get("questions") or [])
        kind_norm = result["kind"]
        await_text = "true" if result["await_confirm"] else "false"
        return (
            f"✅ 人机问卷已提交（kind={kind_norm}, await_confirm={await_text}, "
            f"questions={q_count}）。\n"
            "**会议室已锁定为 human_intervention**：请立即停止后续工具调用与正文输出，"
            "不要重复总结或宣称已交付；系统会按本次提交的问卷渲染表单，等待用户回复。"
        )


def create_meeting_room_handler(agent: Agent):
    """Return bound ``handle`` so SystemHandlerRegistry maps TOOLS correctly."""
    handler = MeetingRoomToolHandler(agent)
    return handler.handle
