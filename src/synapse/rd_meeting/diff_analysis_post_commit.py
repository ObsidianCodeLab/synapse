"""试飞优化：提交后试飞失败时的方案再生与 CLI 重跑。"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from synapse.rd_meeting.diff_analysis_panel import (
    archive_plan_round_before_regen,
    sync_commit_flight_to_exception_check,
)
from synapse.rd_meeting.diff_analysis_rounds import on_diff_analysis_cli_finished, on_diff_analysis_cli_starting
from synapse.rd_meeting.flight_optimize_gate import evaluate_flight_optimize_need

logger = logging.getLogger(__name__)


async def _run_embedded_flight_plan_host(
    *,
    scope_type: str,
    scope_id: str,
    room_id: str,
    ticket_title: str,
    agent_pool: Any,
    orchestrator: Any,
) -> dict[str, Any]:
    """内嵌调用小鲸执行试飞优化方案技能（不推进 task_feedback 节点）。"""
    from synapse.rd_meeting.orchestrator import MeetingRoomOrchestrator

    orch = orchestrator if orchestrator is not None else MeetingRoomOrchestrator()
    extra = (
        "\n\n## 内嵌任务说明\n"
        "当前处于试飞优化（diff_analysis）环节提交后试飞失败的处理流程。"
        "请调用 **whalecloud-dev-tool-flight-optimize-plan** 技能，"
        "基于 archive/开发中/exception_check/试飞结果.md 中**最新**试飞结果，"
        "生成或更新 archive/开发中/task_feedback/试飞优化方案.md。"
        "须覆盖全部新的失败项；禁止 submit_hitl_questionnaire。"
        "完成后简要说明已落盘的路径。"
    )
    return await orch.run_embedded_host_node(
        scope_type=scope_type,
        scope_id=scope_id,
        room_id=room_id,
        node_id="task_feedback",
        ticket_title=ticket_title,
        agent_pool=agent_pool,
        prompt_suffix=extra,
    )


def _run_async(coro: Any) -> Any:
    from synapse.rd_meeting.auto_split_assets import _run_coroutine_sync

    return _run_coroutine_sync(lambda: coro)


def handle_diff_analysis_post_commit(
    *,
    scope_type: str,
    scope_id: str,
    room_id: str,
    ticket_title: str,
    result: dict[str, Any],
    agent_pool: Any | None,
    orchestrator: Any | None = None,
) -> dict[str, Any]:
    """提交试飞完成后：通过则保持 done；失败则同步试飞、再生方案并重跑 CLI。"""
    sid = (scope_id or "").strip()
    commit_result = result.get("code_commit") if isinstance(result.get("code_commit"), dict) else {}
    if commit_result:
        sync_commit_flight_to_exception_check(sid, commit_result)

    if not result.get("flight_failed"):
        return {"action": "commit_passed", "result": result}

    if evaluate_flight_optimize_need(sid) != "needed":
        result = dict(result)
        result["flight_failed"] = False
        result["error"] = ""
        return {"action": "commit_passed_no_issues", "result": result}

    opt_round = int(result.get("optimization_round") or 1) + 1
    archive_plan_round_before_regen(sid, round_no=opt_round - 1)

    try:
        host_out = _run_async(
            _run_embedded_flight_plan_host(
                scope_type=scope_type,
                scope_id=sid,
                room_id=room_id,
                ticket_title=ticket_title,
                agent_pool=agent_pool,
                orchestrator=orchestrator,
            )
        )
    except Exception as exc:
        logger.exception("embedded flight plan host failed scope=%s: %s", sid, exc)
        return {"action": "plan_regen_failed", "error": str(exc), "result": result}

    from synapse.rd_meeting.diff_analysis_exec import bootstrap_diff_analysis, render_diff_analysis_report_markdown
    from synapse.rd_meeting.room_skill import load_reprocess_reason

    on_diff_analysis_cli_starting(sid, reason="提交后试飞仍有问题，按最新试飞优化方案自动重跑修复")
    cli_result = bootstrap_diff_analysis(
        scope_type,  # type: ignore[arg-type]
        sid,
        reprocess_reason=load_reprocess_reason(sid) or "提交后试飞仍有问题，按最新方案修复",
    )
    on_diff_analysis_cli_finished(sid, cli_result)
    cli_result = dict(cli_result)
    cli_result["optimization_round"] = opt_round
    if str(cli_result.get("commit_phase") or "") == "await_confirm":
        cli_result["flight_failed"] = False
        cli_result["error"] = ""

    from synapse.rd_meeting.diff_analysis_exec import _persist_state

    _persist_state(sid, cli_result)

    return {
        "action": "recycled_to_await_confirm",
        "host": host_out,
        "result": cli_result,
        "report_body": render_diff_analysis_report_markdown(cli_result),
    }
