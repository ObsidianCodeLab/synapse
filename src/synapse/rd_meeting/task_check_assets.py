"""任务检查系统节点：试飞级与需求方案级分析，失败时引导回退。"""

from __future__ import annotations

import logging
import re
from typing import Any, Literal

from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path
from synapse.rd_meeting.room_runtime import read_json_file, write_json_file
from synapse.rd_meeting.system_node_display import _load_pipeline_context_asset
from synapse.rd_sop.nodes import stage_name_for_id

logger = logging.getLogger(__name__)

DEV_STAGE_NAME = stage_name_for_id(4)
MAX_TASK_CHECK_FAILURES = 3

CheckOutcome = Literal["pass", "flight_fail", "feature_incomplete"]

_INCOMPLETE_MARKERS = (
    "未完成",
    "未实现",
    "待开发",
    "功能缺失",
    "未覆盖",
    "TODO",
    "FIXME",
    "incomplete",
    "not implemented",
)


def _read_archive_text(scope_id: str, node_id: str, filename: str) -> str:
    path = archive_node_dir(scope_id, DEV_STAGE_NAME, node_id) / filename
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _load_code_commit_assets(scope_id: str) -> dict[str, Any]:
    assets = _load_pipeline_context_asset(scope_id, "code_commit_assets")
    return dict(assets) if isinstance(assets, dict) else {}


def _save_code_commit_assets(scope_id: str, assets: dict[str, Any]) -> None:
    sid = (scope_id or "").strip()
    if not sid:
        return
    path = meeting_pipeline_path(sid)
    raw = read_json_file(path)
    if not isinstance(raw, dict):
        return
    ctx = raw.get("context") if isinstance(raw.get("context"), dict) else {}
    ctx["code_commit_assets"] = assets
    raw["context"] = ctx
    write_json_file(path, raw)


def _overlay_flight_error_on_code_commit(scope_id: str, error_text: str) -> None:
    assets = _load_code_commit_assets(scope_id)
    if not assets:
        return
    flight = dict(assets.get("flight") or {}) if isinstance(assets.get("flight"), dict) else {}
    flight["status"] = "failed"
    flight["error"] = error_text
    assets["flight"] = flight
    assets["status"] = "failed"
    assets["error"] = error_text
    _save_code_commit_assets(scope_id, assets)

    archive_dir = archive_node_dir(scope_id, DEV_STAGE_NAME, "exception_check")
    archive_dir.mkdir(parents=True, exist_ok=True)
    report_path = archive_dir / "试飞结果.md"
    body = f"# 试飞结果（任务检查覆盖）\n\n- 状态：失败\n- 报错：{error_text}\n"
    report_path.write_text(body, encoding="utf-8")


def _pipeline_context(scope_id: str) -> dict[str, Any]:
    raw = read_json_file(meeting_pipeline_path(scope_id))
    if not isinstance(raw, dict):
        return {}
    ctx = raw.get("context")
    return ctx if isinstance(ctx, dict) else {}


def _task_check_fail_count(scope_id: str) -> int:
    state = _pipeline_context(scope_id).get("task_check_state")
    if not isinstance(state, dict):
        return 0
    try:
        return int(state.get("fail_count") or 0)
    except (TypeError, ValueError):
        return 0


def _bump_task_check_fail_count(scope_id: str) -> int:
    sid = (scope_id or "").strip()
    path = meeting_pipeline_path(sid)
    raw = read_json_file(path)
    if not isinstance(raw, dict):
        return 1
    ctx = raw.get("context") if isinstance(raw.get("context"), dict) else {}
    state = dict(ctx.get("task_check_state") or {}) if isinstance(ctx.get("task_check_state"), dict) else {}
    count = int(state.get("fail_count") or 0) + 1
    state["fail_count"] = count
    ctx["task_check_state"] = state
    raw["context"] = ctx
    write_json_file(path, raw)
    return count


def _analyze_feature_completeness(task_exec_text: str, flight_optimize_text: str) -> bool:
    combined = f"{task_exec_text}\n{flight_optimize_text}".lower()
    if not combined.strip():
        return False
    for marker in _INCOMPLETE_MARKERS:
        if marker.lower() in combined:
            return False
    completion_hints = ("已完成", "已实现", "开发完成", "功能点", "提交", "done", "completed")
    return any(h.lower() in combined for h in completion_hints)


def _analyze_flight_result(code_commit: dict[str, Any]) -> tuple[bool, str]:
    tasks = code_commit.get("tasks") if isinstance(code_commit.get("tasks"), list) else []
    if tasks:
        pending_errors: list[str] = []
        failed_errors: list[str] = []
        for row in tasks:
            if not isinstance(row, dict):
                continue
            flight = row.get("flight") if isinstance(row.get("flight"), dict) else {}
            status = str(flight.get("status") or "").strip()
            err = str(flight.get("error") or "").strip()
            data = flight.get("data") if isinstance(flight.get("data"), dict) else {}
            if status == "ok":
                continue
            if status == "failed":
                desc = err or str(data.get("ciFlowInstRunStateDesc") or "") or "试飞构建失败"
                failed_errors.append(f"{row.get('task_no')}: {desc}")
            elif status in ("pending", "timeout", "partial", "skipped"):
                pending_errors.append(err or f"{row.get('task_no')}: 试飞结果未就绪")
        if failed_errors:
            return False, "; ".join(failed_errors)
        if pending_errors:
            return False, "; ".join(pending_errors)
        return True, ""

    flight = code_commit.get("flight") if isinstance(code_commit.get("flight"), dict) else {}
    status = str(flight.get("status") or "").strip()
    if status == "ok":
        return True, ""
    error = str(flight.get("error") or "").strip()
    if not error and status == "failed":
        flows = flight.get("flows") if isinstance(flight.get("flows"), list) else []
        parts = [
            str(f.get("run_state_desc") or "")
            for f in flows
            if isinstance(f, dict) and str(f.get("run_state") or "") == "1"
        ]
        error = "; ".join(p for p in parts if p) or "试飞构建失败"
    if status in ("skipped", "") and not code_commit:
        return True, ""
    if status in ("pending", "timeout", "partial"):
        return False, error or "试飞结果未就绪或超时"
    if status == "failed":
        return False, error or "试飞构建失败"
    return True, ""


def _extract_requirement_gaps(task_exec_text: str, func_solution_text: str) -> list[str]:
    gaps: list[str] = []
    fp_lines = [ln.strip() for ln in func_solution_text.splitlines() if ln.strip()]
    for ln in fp_lines:
        if re.match(r"^[-*•]\s+", ln) or re.match(r"^\d+[.)]\s+", ln):
            point = re.sub(r"^[-*•\d.)]+\s*", "", ln).strip()
            if point and point.lower() not in task_exec_text.lower():
                gaps.append(point)
    return gaps[:8]


def format_task_check_report(assets: dict[str, Any], *, node_name: str = "任务检查") -> str:
    lines = [f"# {node_name}", ""]
    lines.append(f"- 结论：{assets.get('outcome') or '—'}")
    lines.append(f"- 状态：{assets.get('status') or '—'}")
    if assets.get("redirect_to_node"):
        lines.append(f"- 引导节点：{assets.get('redirect_to_node')}")
    if assets.get("redirect_reason"):
        lines.append(f"- 引导原因：{assets.get('redirect_reason')}")
    if assets.get("fail_count") is not None:
        lines.append(f"- 累计未通过次数：{assets.get('fail_count')}")
    if assets.get("ai_processing_blocked"):
        lines.append("- AI 处理：已禁止（同一子单任务检查三次未通过）")
    analysis = assets.get("analysis") if isinstance(assets.get("analysis"), dict) else {}
    if analysis.get("requirement_gaps"):
        lines.append("- 需求方案缺口：")
        for gap in analysis["requirement_gaps"]:
            lines.append(f"  - {gap}")
    if assets.get("error"):
        lines.append(f"- 错误：{assets.get('error')}")
    return "\n".join(lines) + "\n"


def bootstrap_task_check(scope_id: str) -> dict[str, Any]:
    """对试飞优化与任务执行产出做试飞级、需求方案级检查。"""
    sid = (scope_id or "").strip()
    task_exec_text = _read_archive_text(sid, "task_exec", "任务执行记录.md")
    flight_optimize_text = _read_archive_text(sid, "diff_analysis", "试飞优化执行记录.md")
    func_solution_path = archive_node_dir(sid, stage_name_for_id(2), "func_solution") / "函数级方案.md"
    func_solution_text = ""
    if func_solution_path.is_file():
        try:
            func_solution_text = func_solution_path.read_text(encoding="utf-8")
        except OSError:
            func_solution_text = ""

    code_commit = _load_code_commit_assets(sid)
    flight_ok, flight_error = _analyze_flight_result(code_commit)
    feature_complete = _analyze_feature_completeness(task_exec_text, flight_optimize_text)
    requirement_gaps = _extract_requirement_gaps(task_exec_text, func_solution_text)

    outcome: CheckOutcome = "pass"
    redirect_to_node = ""
    redirect_reason = ""
    ai_blocked = False
    fail_count = _task_check_fail_count(sid)

    if not feature_complete or requirement_gaps:
        outcome = "feature_incomplete"
        redirect_to_node = "task_exec"
        redirect_reason = "功能实现不完整，请回到任务执行节点继续开发"
        if requirement_gaps:
            redirect_reason += f"（缺口 {len(requirement_gaps)} 项）"
    elif not flight_ok:
        outcome = "flight_fail"
        redirect_to_node = "task_feedback"
        redirect_reason = "试飞检查未通过，请回到试飞方案节点评估优化方案"
        _overlay_flight_error_on_code_commit(sid, flight_error)
        fail_count = _bump_task_check_fail_count(sid)
        if fail_count >= MAX_TASK_CHECK_FAILURES:
            ai_blocked = True
            redirect_reason += f"；同一子单已连续 {fail_count} 次未通过，严禁 AI 继续处理"

    status = "ok" if outcome == "pass" else "failed"
    return {
        "status": status,
        "outcome": outcome,
        "error": flight_error if outcome == "flight_fail" else "",
        "redirect_to_node": redirect_to_node,
        "redirect_reason": redirect_reason,
        "fail_count": fail_count,
        "ai_processing_blocked": ai_blocked,
        "analysis": {
            "flight_ok": flight_ok,
            "feature_complete": feature_complete,
            "requirement_gaps": requirement_gaps,
            "has_task_exec_output": bool(task_exec_text.strip()),
            "has_flight_optimize_output": bool(flight_optimize_text.strip()),
        },
    }
