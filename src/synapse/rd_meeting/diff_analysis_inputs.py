"""试飞优化节点：上游产物快照与本节点工作区路径（禁止跨节点写上游 archive）。"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from synapse.rd_meeting.paths import archive_node_dir
from synapse.rd_meeting.room_runtime import read_meeting_pipeline_json, save_meeting_pipeline
from synapse.rd_sop.nodes import stage_name_for_id

logger = logging.getLogger(__name__)

NODE_ID = "diff_analysis"
UPSTREAM_PLAN_NODE = "task_feedback"
UPSTREAM_COMMIT_NODE = "exception_check"
DEV_STAGE_NAME = stage_name_for_id(4)

INPUTS_SUBDIR = "inputs"
INPUT_PLAN_FILENAME = "试飞优化方案.md"
INPUT_FLIGHT_FILENAME = "试飞结果.md"
INPUT_COMMIT_LOG_FILENAME = "代码提交日志.md"

PLAN_ROUND_RE = re.compile(r"^试飞优化方案_第(\d+)轮\.md$")
FLIGHT_ROUND_RE = re.compile(r"^试飞结果_第(\d+)轮\.md$")

CTX_DIFF_ANALYSIS_COMMIT = "diff_analysis_commit_assets"

_UPSTREAM_SNAPSHOTS: tuple[tuple[str, str, str], ...] = (
    (INPUT_PLAN_FILENAME, UPSTREAM_PLAN_NODE, INPUT_PLAN_FILENAME),
    (INPUT_FLIGHT_FILENAME, UPSTREAM_COMMIT_NODE, INPUT_FLIGHT_FILENAME),
    (INPUT_COMMIT_LOG_FILENAME, UPSTREAM_COMMIT_NODE, INPUT_COMMIT_LOG_FILENAME),
)


def diff_analysis_archive_dir(scope_id: str) -> Path:
    return archive_node_dir(scope_id, DEV_STAGE_NAME, NODE_ID)


def diff_analysis_inputs_dir(scope_id: str) -> Path:
    return diff_analysis_archive_dir(scope_id) / INPUTS_SUBDIR


def plan_round_filename(round_no: int) -> str:
    return f"试飞优化方案_第{max(int(round_no), 1)}轮.md"


def flight_round_filename(round_no: int) -> str:
    return f"试飞结果_第{max(int(round_no), 1)}轮.md"


def _read_text(path: Path) -> str:
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _copy_upstream_file(scope_id: str, *, dest_name: str, src_node: str, src_name: str) -> str:
    dest_dir = diff_analysis_inputs_dir(scope_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / dest_name
    src = archive_node_dir(scope_id, DEV_STAGE_NAME, src_node) / src_name
    if not src.is_file():
        return ""
    try:
        dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    except OSError as exc:
        logger.warning("diff_analysis snapshot copy failed %s -> %s: %s", src, dest, exc)
        return ""
    return str(dest)


def ensure_diff_analysis_input_snapshots(scope_id: str, *, force: bool = False) -> dict[str, str]:
    """进入试飞优化时快照上游只读产物至 ``diff_analysis/inputs/``（默认只写一次）。"""
    sid = (scope_id or "").strip()
    out: dict[str, str] = {}
    if not sid:
        return out
    for dest_name, src_node, src_name in _UPSTREAM_SNAPSHOTS:
        dest = diff_analysis_inputs_dir(sid) / dest_name
        if dest.is_file() and not force:
            out[dest_name] = str(dest)
            continue
        copied = _copy_upstream_file(
            sid,
            dest_name=dest_name,
            src_node=src_node,
            src_name=src_name,
        )
        if copied:
            out[dest_name] = copied
    return out


def _list_round_files(scope_id: str, pattern: re.Pattern[str]) -> list[tuple[int, Path]]:
    root = diff_analysis_archive_dir(scope_id)
    if not root.is_dir():
        return []
    rows: list[tuple[int, Path]] = []
    for path in root.iterdir():
        if not path.is_file():
            continue
        match = pattern.match(path.name)
        if not match:
            continue
        rows.append((int(match.group(1)), path))
    rows.sort(key=lambda item: item[0])
    return rows


def list_plan_round_paths(scope_id: str) -> list[tuple[int, Path]]:
    return _list_round_files(scope_id, PLAN_ROUND_RE)


def list_flight_round_paths(scope_id: str) -> list[tuple[int, Path]]:
    return _list_round_files(scope_id, FLIGHT_ROUND_RE)


def resolve_latest_plan_round(scope_id: str) -> tuple[int, Path | None]:
    rounds = list_plan_round_paths(scope_id)
    if not rounds:
        return 0, None
    rnd, path = rounds[-1]
    return rnd, path


def resolve_latest_flight_round(scope_id: str) -> tuple[int, Path | None]:
    rounds = list_flight_round_paths(scope_id)
    if not rounds:
        return 0, None
    rnd, path = rounds[-1]
    return rnd, path


def read_diff_analysis_plan(scope_id: str) -> tuple[str, str]:
    """读取试飞优化使用的方案：最新轮次方案 > inputs 快照。"""
    sid = (scope_id or "").strip()
    rnd, latest = resolve_latest_plan_round(sid)
    if latest is not None:
        text = _read_text(latest)
        if text.strip():
            return str(latest), text
    inputs_path = diff_analysis_inputs_dir(sid) / INPUT_PLAN_FILENAME
    text = _read_text(inputs_path)
    if text.strip():
        return str(inputs_path), text
    return "", ""


def read_diff_analysis_input_flight(scope_id: str) -> tuple[str, str]:
    """读取进入试飞优化时的试飞结果快照（首次代码提交节点产出）。"""
    sid = (scope_id or "").strip()
    path = diff_analysis_inputs_dir(sid) / INPUT_FLIGHT_FILENAME
    text = _read_text(path)
    return (str(path), text) if text.strip() else ("", "")


def resolve_flight_result_for_regen(scope_id: str) -> str:
    """方案再生时引用的试飞结果：最新提交轮归档 > inputs 快照 > exception_check（只读兜底）。"""
    sid = (scope_id or "").strip()
    _rnd, latest = resolve_latest_flight_round(sid)
    if latest is not None:
        return str(latest)
    inputs_path = diff_analysis_inputs_dir(sid) / INPUT_FLIGHT_FILENAME
    if inputs_path.is_file():
        return str(inputs_path)
    legacy = archive_node_dir(sid, DEV_STAGE_NAME, UPSTREAM_COMMIT_NODE) / INPUT_FLIGHT_FILENAME
    return str(legacy) if legacy.is_file() else str(inputs_path)


def resolve_plan_regen_output_path(scope_id: str, round_no: int) -> Path:
    dest = diff_analysis_archive_dir(scope_id)
    dest.mkdir(parents=True, exist_ok=True)
    return dest / plan_round_filename(round_no)


def write_diff_analysis_plan_round(scope_id: str, body: str, *, round_no: int) -> Path:
    path = resolve_plan_regen_output_path(scope_id, round_no)
    path.write_text(body, encoding="utf-8")
    return path


def write_diff_analysis_flight_round(
    scope_id: str,
    commit_result: dict[str, Any],
    *,
    round_no: int,
) -> Path:
    from synapse.rd_meeting.code_commit_assets import format_flight_result_report

    sid = (scope_id or "").strip()
    dest = diff_analysis_archive_dir(sid)
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / flight_round_filename(round_no)
    path.write_text(format_flight_result_report(commit_result, node_name="试飞结果"), encoding="utf-8")
    return path


def resolve_commit_round_no(scope_id: str, commit_result: dict[str, Any] | None = None) -> int:
    if isinstance(commit_result, dict):
        try:
            rnd = int(commit_result.get("optimization_round") or 0)
            if rnd > 0:
                return rnd
        except (TypeError, ValueError):
            pass
    _rnd, _path = resolve_latest_flight_round(scope_id)
    return max(_rnd, 0) + 1


def persist_diff_analysis_commit_assets(
    scope_id: str,
    commit_result: dict[str, Any],
    *,
    round_no: int,
) -> None:
    sid = (scope_id or "").strip()
    if not sid or not isinstance(commit_result, dict):
        return
    raw = read_meeting_pipeline_json(sid)
    if not isinstance(raw, dict):
        raw = {}
    ctx = raw.get("context") if isinstance(raw.get("context"), dict) else {}
    payload = dict(commit_result)
    payload["optimization_round"] = round_no
    payload["flight_archive_path"] = str(
        diff_analysis_archive_dir(sid) / flight_round_filename(round_no)
    )
    ctx[CTX_DIFF_ANALYSIS_COMMIT] = payload
    ctx["diff_analysis_latest_flight_round"] = round_no
    raw["context"] = ctx
    save_meeting_pipeline(sid, raw)


def sync_diff_analysis_commit_result(
    scope_id: str,
    commit_result: dict[str, Any],
    *,
    round_no: int | None = None,
) -> Path | None:
    """试飞优化节点提交后：试飞结果写入本节点 archive，不覆盖 exception_check。"""
    if not isinstance(commit_result, dict):
        return None
    sid = (scope_id or "").strip()
    if not sid:
        return None
    rnd = round_no if round_no is not None else resolve_commit_round_no(sid, commit_result)
    path = write_diff_analysis_flight_round(sid, commit_result, round_no=rnd)
    persist_diff_analysis_commit_assets(sid, commit_result, round_no=rnd)
    return path
