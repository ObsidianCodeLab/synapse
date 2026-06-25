"""试飞方案 / 试飞优化节点：根据代码提交试飞结果判断是否需进入优化流程。"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any, Literal

from synapse.rd_meeting.paths import archive_node_dir
from synapse.rd_meeting.code_commit_assets import load_code_commit_assets
from synapse.rd_meeting.task_check_assets import _analyze_flight_result
from synapse.rd_sop.nodes import stage_name_for_id

logger = logging.getLogger(__name__)

DEV_STAGE_NAME = stage_name_for_id(4)
TASK_FEEDBACK_NODE = "task_feedback"
DIFF_ANALYSIS_NODE = "diff_analysis"
PLAN_FILENAME = "试飞优化方案.md"
SKIP_PLAN_MARKER = "无需试飞优化"

FlightOptimizeNeed = Literal["needed", "not_needed", "unknown"]

_COMMIT_SKIP_FLIGHT_MARKER = "代码未提交成功，跳过试飞"


def _commit_summary_failed(assets: dict[str, Any]) -> bool:
    summary = assets.get("summary") if isinstance(assets.get("summary"), dict) else {}
    try:
        return int(summary.get("commit_failed") or 0) > 0
    except (TypeError, ValueError):
        return False


def _flight_skipped_due_to_commit_failure(flight: dict[str, Any]) -> bool:
    if str(flight.get("status") or "").strip().lower() != "skipped":
        return False
    err = str(flight.get("error") or "")
    return _COMMIT_SKIP_FLIGHT_MARKER in err or "未提交成功" in err


def _read_flight_result_archive(scope_id: str) -> str:
    path = archive_node_dir(scope_id, DEV_STAGE_NAME, "exception_check") / "试飞结果.md"
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def evaluate_flight_optimize_need(scope_id: str) -> FlightOptimizeNeed:
    """判断代码提交节点是否产出需试飞优化的问题。

    - ``not_needed``：试飞已全部通过，可自动跳过试飞方案 / 试飞优化 SOP
    - ``needed``：存在试飞失败项，需进入优化流程
    - ``unknown``：结果未就绪或无法判定，不自动跳过
    """
    sid = (scope_id or "").strip()
    if not sid:
        return "unknown"

    assets = load_code_commit_assets(sid)
    if assets:
        tasks = assets.get("tasks") if isinstance(assets.get("tasks"), list) else []
        commit_failed = _commit_summary_failed(assets) or any(
            isinstance(row, dict) and str(row.get("status") or "").strip().lower() == "failed"
            for row in tasks
        )

        passed, _err = _analyze_flight_result(assets)
        if passed and not commit_failed:
            return "not_needed"

        flight = assets.get("flight") if isinstance(assets.get("flight"), dict) else {}
        status = str(flight.get("status") or assets.get("status") or "").strip().lower()
        if tasks:
            saw_failed = False
            saw_pending = False
            saw_commit_failed = False
            saw_flight_skipped_for_commit = False
            for row in tasks:
                if not isinstance(row, dict):
                    continue
                if str(row.get("status") or "").strip().lower() == "failed":
                    saw_commit_failed = True
                task_flight = row.get("flight") if isinstance(row.get("flight"), dict) else {}
                fs = str(task_flight.get("status") or "").strip().lower()
                if fs == "failed":
                    saw_failed = True
                elif fs in ("pending", "timeout", "partial"):
                    saw_pending = True
                elif _flight_skipped_due_to_commit_failure(task_flight):
                    saw_flight_skipped_for_commit = True
            if saw_commit_failed or saw_flight_skipped_for_commit or commit_failed:
                archive_text = _read_flight_result_archive(sid)
                if re.search(r"总体试飞状态：\s*failed", archive_text, re.IGNORECASE):
                    return "needed"
                if re.search(r"试飞状态：\s*failed", archive_text, re.IGNORECASE):
                    return "needed"
                if "构建失败" in archive_text or "试飞仍未通过" in archive_text:
                    return "needed"
                return "unknown"
            if saw_failed:
                return "needed"
            if saw_pending:
                return "unknown"
            if passed:
                return "not_needed"

        if status == "failed":
            return "needed"
        if status in ("pending", "timeout", "partial"):
            return "unknown"
        if status == "skipped":
            if _flight_skipped_due_to_commit_failure(flight) or commit_failed:
                return "unknown"
            return "not_needed"
        if status == "ok":
            return "not_needed"

    text = _read_flight_result_archive(sid)
    if not text.strip():
        return "unknown"

    if re.search(r"总体试飞状态：\s*failed", text, re.IGNORECASE):
        return "needed"
    if re.search(r"试飞状态：\s*failed", text, re.IGNORECASE):
        return "needed"
    if re.search(r"总体试飞状态：\s*ok\b", text, re.IGNORECASE):
        return "not_needed"
    if "构建失败" in text or "试飞仍未通过" in text:
        return "needed"
    if re.search(r"试飞状态：\s*ok\b", text, re.IGNORECASE) and "failed" not in text.lower():
        return "not_needed"
    return "unknown"


def _existing_plan_is_skip_placeholder(text: str) -> bool:
    body = str(text or "").strip()
    if not body:
        return True
    if SKIP_PLAN_MARKER in body:
        return True
    if re.search(r"是否需代码改动：\s*否", body) and len(body) < 400:
        return True
    return False


def write_skipped_flight_optimize_plan(
    scope_id: str,
    *,
    reason: str = "",
    overwrite: bool = True,
) -> dict[str, Any]:
    """试飞方案节点跳过时落盘占位方案，供下游 diff_analysis 识别无需改动。

    若 ``overwrite=False`` 或磁盘上已有实质性方案，则保留原文件不覆盖。
    """
    sid = (scope_id or "").strip()
    dest = archive_node_dir(sid, DEV_STAGE_NAME, TASK_FEEDBACK_NODE)
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / PLAN_FILENAME
    if path.is_file():
        try:
            existing = path.read_text(encoding="utf-8")
        except OSError:
            existing = ""
        if not overwrite or not _existing_plan_is_skip_placeholder(existing):
            return {
                "name": PLAN_FILENAME,
                "path": str(path),
                "preserved": True,
                "skipped_write": True,
            }

    body = "\n".join(
        [
            "# 试飞优化方案",
            "",
            "## 结论",
            "",
            f"代码提交与试飞已全部通过，**{SKIP_PLAN_MARKER}**。",
            "",
            "## 是否需代码改动：否",
            "",
            f"- 跳过原因：{reason or '试飞结果无失败项'}",
            "",
        ]
    )
    path.write_text(body, encoding="utf-8")
    return {"name": PLAN_FILENAME, "path": str(path), "preserved": False, "skipped_write": False}


def build_skipped_diff_analysis_result(scope_id: str, *, reason: str = "") -> dict[str, Any]:
    """试飞优化节点跳过时写入最小结果文档。"""
    finished_at = datetime.now().isoformat(timespec="seconds")
    return {
        "status": "ok",
        "commit_phase": "skipped",
        "flight_failed": False,
        "error": "",
        "finished_at": finished_at,
        "started_at": finished_at,
        "summary": {
            "total": 0,
            "ok": 0,
            "failed": 0,
            "skipped": 0,
            "total_tokens": 0,
            "total_duration_sec": 0,
        },
        "tasks": [],
        "human_review": {"status": "skipped", "comment": reason or SKIP_PLAN_MARKER, "decided_at": finished_at},
        "code_commit": None,
        "skip_reason": reason or "试飞结果无失败项，自动跳过试飞优化",
    }


def persist_skipped_diff_analysis(scope_id: str, result_doc: dict[str, Any]) -> None:
    from synapse.rd_meeting.diff_analysis_exec import _persist_state

    _persist_state(scope_id, result_doc)
