"""试飞优化节点：CLI 问题修复（无完成检测轮）+ 代码提交与试飞等待。"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from synapse.rd_meeting.cli_models import (
    DEFAULT_CURSOR_CLI_MODEL,
    display_cli_model_label,
    normalize_cursor_cli_model,
    resolve_cli_model_arg,
)
from synapse.rd_meeting.cli_tools import (
    DEFAULT_CLI_TOOL,
    is_cli_tool_implemented,
    normalize_cli_tool,
)
from synapse.rd_meeting.config_store import load_meeting_room_config
from synapse.rd_meeting.cursor_agent_cli import check_cursor_agent_cli
from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path
from synapse.rd_meeting.product_assets import resolve_sandbox_path_for_product_module
from synapse.rd_meeting.room_runtime import read_json_file, save_meeting_pipeline
from synapse.rd_meeting.system_node_display import (
    _auto_split_context_for_bindings,
    collect_task_rows,
)
from synapse.rd_meeting.task_exec import (
    _merge_cli_round_metrics,
    _run_cursor_cli_round,
    build_cursor_round_commands,
    resolve_cli_timeout_for_node,
)
from synapse.rd_meeting.userwork_sync import patch_userwork_summary
from synapse.rd_sop.nodes import stage_name_for_id

logger = logging.getLogger(__name__)

NODE_ID = "diff_analysis"
DEV_STAGE_NAME = stage_name_for_id(4)
RESULT_JSON = "diff_analysis_result.json"
REPORT_MD = "试飞优化执行记录.md"
PLAN_NODE_ID = "task_feedback"
PLAN_FILENAME = "试飞优化方案.md"

ScopeType = Literal["demand", "task"]

_NO_CODE_CHANGE_RE = re.compile(
    r"是否需代码改动[^\n]*[：:]\s*否",
    re.IGNORECASE,
)
_COMMIT_SUMMARY_LINE_RE = re.compile(
    r"(?:变更摘要|commit\s*message|提交摘要)[：:\s]*(.+)",
    re.IGNORECASE,
)


def uses_diff_analysis_cli(node_id: str) -> bool:
    return (node_id or "").strip() == NODE_ID


def resolve_cli_tool_for_node(node_id: str = NODE_ID) -> str:
    cfg = load_meeting_room_config()
    overrides = cfg.get("node_overrides") if isinstance(cfg.get("node_overrides"), dict) else {}
    ov = overrides.get(node_id) if isinstance(overrides.get(node_id), dict) else {}
    return normalize_cli_tool(str(ov.get("cli_tool") or DEFAULT_CLI_TOOL))


def resolve_cli_model_for_node(node_id: str = NODE_ID) -> tuple[str, str]:
    cfg = load_meeting_room_config()
    overrides = cfg.get("node_overrides") if isinstance(cfg.get("node_overrides"), dict) else {}
    ov = overrides.get(node_id) if isinstance(overrides.get(node_id), dict) else {}
    preset = normalize_cursor_cli_model(str(ov.get("cli_model") or DEFAULT_CURSOR_CLI_MODEL))
    custom = str(ov.get("cli_model_custom") or "").strip()
    return preset, custom


def _result_json_path(scope_id: str) -> Path:
    return archive_node_dir(scope_id, DEV_STAGE_NAME, NODE_ID) / RESULT_JSON


def _read_result(scope_id: str) -> dict[str, Any] | None:
    path = _result_json_path(scope_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("read diff_analysis_result failed %s: %s", path, exc)
        return None


def _write_result(scope_id: str, data: dict[str, Any]) -> None:
    dest = _result_json_path(scope_id)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    report = render_diff_analysis_report_markdown(data)
    (dest.parent / REPORT_MD).write_text(report, encoding="utf-8")


def _save_assets(scope_id: str, assets: dict[str, Any]) -> None:
    path = meeting_pipeline_path(scope_id)
    raw = read_json_file(path)
    if not isinstance(raw, dict):
        raw = {}
    ctx = raw.get("context") if isinstance(raw.get("context"), dict) else {}
    ctx["diff_analysis_assets"] = assets
    raw["context"] = ctx
    raw["updated_at"] = datetime.now().isoformat(timespec="seconds")
    save_meeting_pipeline(scope_id, raw)


def _persist_state(scope_id: str, result_doc: dict[str, Any]) -> None:
    _write_result(scope_id, result_doc)
    _save_assets(scope_id, result_doc)
    sync_diff_analysis_node_metrics(scope_id)


def _read_flight_optimize_plan(scope_id: str) -> tuple[str, str]:
    path = archive_node_dir(scope_id, DEV_STAGE_NAME, PLAN_NODE_ID) / PLAN_FILENAME
    if not path.is_file():
        return "", ""
    try:
        return str(path), path.read_text(encoding="utf-8")
    except OSError:
        return str(path), ""


def _plan_requires_code_change(plan_md: str) -> bool:
    text = (plan_md or "").strip()
    if not text:
        return True
    if _NO_CODE_CHANGE_RE.search(text):
        return False
    if "无需代码优化" in text or "无需代码改动" in text:
        return False
    return True


def _extract_optimize_goal(plan_md: str, *, task_no: str, task_title: str) -> str:
    text = (plan_md or "").strip()
    if not text:
        return str(task_title or task_no or "按试飞优化方案修复问题").strip()

    markers = [task_no, task_title]
    chunks: list[str] = []
    for marker in markers:
        m = (marker or "").strip()
        if not m or len(m) < 2:
            continue
        if m not in text:
            continue
        for block in re.split(r"\n(?=###\s+计划项|\n##\s+)", text):
            if m in block:
                chunks.append(block.strip())

    if chunks:
        return "\n\n".join(dict.fromkeys(chunks))[:12000]

    section = re.search(
        r"##\s*优化研发计划\s*(.*?)(?=\n##\s|\Z)",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if section:
        body = section.group(1).strip()
        if body:
            return body[:12000]

    issues = re.search(
        r"##\s*已识别问题清单\s*(.*?)(?=\n##\s|\Z)",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if issues:
        return issues.group(1).strip()[:8000]

    return text[:8000]


def _extract_commit_summary_from_log(log_path: str, *, fallback: str) -> str:
    path = Path(log_path)
    if path.is_file():
        try:
            tail = path.read_text(encoding="utf-8", errors="replace")[-12000:]
            for line in reversed(tail.splitlines()):
                match = _COMMIT_SUMMARY_LINE_RE.search(line)
                if match:
                    summary = " ".join(match.group(1).split())
                    if summary and summary not in ("—", "-", "未知", "无"):
                        return summary[:500]
        except OSError:
            pass
    fb = (fallback or "").strip()
    return fb[:500] if fb else "试飞优化修复"


def _collect_optimize_orders(scope_type: ScopeType, scope_id: str) -> tuple[list[dict[str, Any]], str, str]:
    plan_path, plan_md = _read_flight_optimize_plan(scope_id)
    if not plan_md.strip():
        return [], plan_path, plan_md

    auto_ctx = _auto_split_context_for_bindings(scope_id)
    tasks = collect_task_rows(auto_ctx)
    orders: list[dict[str, Any]] = []
    for idx, binding in enumerate(tasks):
        if not isinstance(binding, dict):
            continue
        if str(binding.get("create_status") or "") != "ok":
            continue
        product_module = str(
            binding.get("product_module_name") or binding.get("productModuleName") or ""
        ).strip()
        sandbox_path = resolve_sandbox_path_for_product_module(
            scope_type,
            scope_id,
            product_module,
        )
        task_no = str(binding.get("taskNo") or binding.get("task_no") or f"task-{idx + 1}")
        task_title = str(binding.get("taskTitle") or binding.get("task_title") or "")
        goal = _extract_optimize_goal(
            plan_md,
            task_no=task_no,
            task_title=task_title,
        )
        orders.append(
            {
                "index": idx,
                "task_no": task_no,
                "task_title": task_title,
                "goal": goal,
                "sandbox_path": sandbox_path,
                "product_module": product_module,
                "plan_doc_path": plan_path,
            }
        )
    return orders, plan_path, plan_md


def build_diff_analysis_develop_prompt(
    *,
    scope_id: str = "",
    order: dict[str, Any],
    plan_doc_path: str,
    human_suggestions: str,
    reprocess_reason: str = "",
) -> str:
    goal = str(order.get("goal") or order.get("task_title") or "修复试飞已识别问题").strip()
    lines: list[str] = []
    reason = (reprocess_reason or "").strip()
    if reason:
        lines.extend(
            [
                "【用户重处理要求 · 最高优先级】",
                f"用户重处理要求：{reason}",
                "本条优先级高于试飞优化方案及一切历史结论；冲突时以用户重处理要求为准。",
                "",
            ]
        )
    lines.extend(
        [
            "【试飞优化 · 问题修复轮】",
            f"工单：{order.get('task_no')} {order.get('task_title') or ''}".strip(),
            f"任务目标（试飞优化关键内容）：{goal}",
        ]
    )
    if plan_doc_path:
        lines.append(f"试飞优化方案文档：{plan_doc_path}")
    if human_suggestions.strip():
        lines.append(f"人工建议与补充：{human_suggestions.strip()}")
    from synapse.rd_meeting.soul_instruction import format_soul_instruction_cli_lines

    lines.extend(format_soul_instruction_cli_lines(scope_id))
    lines.extend(
        [
            "",
            "请根据试飞优化方案，在沙箱工程目录中修复试飞已识别的问题。",
            "注意：不要 git commit。",
            "完成后输出：已修改文件列表、变更说明，以及一行 git commit message 摘要（标注「变更摘要：」）。",
        ]
    )
    return "\n".join(lines)


def _resolve_demand_no(scope_type: ScopeType, scope_id: str) -> str:
    from synapse.rd_meeting.auto_split_assets import _resolve_demand_no

    return _resolve_demand_no(scope_type, scope_id)


def _resolve_room_id(scope_id: str) -> str:
    from synapse.rd_meeting.dev_status import load_dev_status

    data = load_dev_status(scope_id) or {}
    meeting_room = data.get("meeting_room")
    if isinstance(meeting_room, dict):
        return str(meeting_room.get("room_id") or "").strip()
    return ""


def _progress_snapshot(
    *,
    phase: str,
    message: str,
    task_index: int,
    task_total: int,
    task_no: str = "",
    live_log_path: str = "",
) -> dict[str, Any]:
    snap = {
        "phase": phase,
        "message": message,
        "task_index": task_index,
        "task_total": task_total,
        "task_no": task_no,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    if live_log_path:
        snap["live_log_path"] = live_log_path
    return snap


def _summary_from_rows(task_rows: list[dict[str, Any]], *, task_total: int) -> dict[str, Any]:
    return {
        "total": task_total,
        "ok": sum(1 for t in task_rows if t.get("status") == "ok"),
        "failed": sum(1 for t in task_rows if t.get("status") == "failed"),
        "skipped": sum(1 for t in task_rows if t.get("status") == "skipped"),
        "running": sum(1 for t in task_rows if t.get("status") == "running"),
        "total_tokens": sum(int(t.get("tokens_used") or 0) for t in task_rows),
        "total_duration_sec": sum(int(t.get("duration_seconds") or 0) for t in task_rows),
        "total_duration_ms": sum(int(t.get("duration_ms") or 0) for t in task_rows),
    }


def aggregate_diff_analysis_tool_tokens(scope_id: str) -> int:
    data = _read_result(scope_id)
    if not isinstance(data, dict):
        return 0
    summary = data.get("summary")
    if isinstance(summary, dict):
        total = int(summary.get("total_tokens") or 0)
        if total > 0:
            return total
    tasks = data.get("tasks")
    if isinstance(tasks, list):
        return sum(int(t.get("tokens_used") or 0) for t in tasks if isinstance(t, dict))
    return 0


def sync_diff_analysis_node_metrics(scope_id: str) -> int:
    from synapse.rd_meeting.room_runtime import refresh_node_metrics

    sid = (scope_id or "").strip()
    if not sid:
        return 0
    return refresh_node_metrics(sid, NODE_ID)


def write_diff_analysis_cli_starting(
    scope_id: str,
    *,
    cli_tool: str,
    cli_model: str,
    cli_model_custom: str,
    cli_model_label: str,
    demand_no: str = "",
) -> None:
    started_at = datetime.now().isoformat(timespec="seconds")
    result_doc: dict[str, Any] = {
        "cli_tool": cli_tool,
        "cli_model": cli_model,
        "cli_model_custom": cli_model_custom,
        "cli_model_label": cli_model_label,
        "demand_no": demand_no,
        "started_at": started_at,
        "finished_at": None,
        "status": "running",
        "progress": _progress_snapshot(
            phase="starting",
            message="正在启动 Cursor CLI…",
            task_index=0,
            task_total=0,
        ),
        "summary": _summary_from_rows([], task_total=0),
        "tasks": [],
        "human_review": {"status": "pending", "comment": "", "decided_at": None},
    }
    _persist_state(scope_id, result_doc)


def _emit_progress(
    scope_id: str,
    *,
    event: str,
    message: str,
    room_id: str,
    task_no: str = "",
    phase: str = "",
    task_index: int = 0,
    task_total: int = 0,
    log_type: str = "info",
    display: dict[str, Any] | None = None,
) -> None:
    from synapse.rd_meeting.room_runtime import append_history_event

    payload: dict[str, Any] = {
        "event": event,
        "room_id": room_id,
        "node_id": NODE_ID,
        "message": message,
        "flow_stage": "试飞优化 CLI",
        "log_type": log_type,
        "agent_id": "system",
        "system_node": True,
    }
    if task_no:
        payload["task_no"] = task_no
    if phase:
        payload["phase"] = phase
    if task_total:
        payload["task_index"] = task_index
        payload["task_total"] = task_total
    if isinstance(display, dict) and display:
        payload["display"] = display
    append_history_event(scope_id, payload)


def _run_code_commit_phase(
    scope_id: str,
    *,
    scope_type: ScopeType,
    room_id: str,
    pipe: Any = None,
) -> dict[str, Any]:
    from synapse.rd_meeting.code_commit_assets import bootstrap_code_commit

    return bootstrap_code_commit(
        scope_id,
        scope_type=scope_type,
        room_id=room_id,
        pipe=pipe,
        stage_name=DEV_STAGE_NAME,
    )


def bootstrap_diff_analysis(
    scope_type: ScopeType,
    scope_id: str,
    *,
    cli_tool: str | None = None,
    cli_model: str | None = None,
    cli_model_custom: str | None = None,
    cli_timeout_seconds: int | None = None,
    human_suggestions: str = "",
    reprocess_reason: str | None = None,
    pipe: Any = None,
) -> dict[str, Any]:
    """试飞优化：CLI 修复 + 代码提交 + 试飞等待；试飞仍失败则整体 failed。"""
    sid = (scope_id or "").strip()
    from synapse.rd_meeting.room_skill import load_reprocess_reason

    reprocess_text = (
        str(reprocess_reason).strip()
        if reprocess_reason is not None
        else load_reprocess_reason(sid)
    )
    tool = normalize_cli_tool(cli_tool or resolve_cli_tool_for_node(NODE_ID))
    preset, custom = resolve_cli_model_for_node(NODE_ID)
    if cli_model is not None:
        preset = normalize_cursor_cli_model(cli_model)
    if cli_model_custom is not None:
        custom = str(cli_model_custom or "").strip()
    model_arg = resolve_cli_model_arg(tool, preset, custom)
    model_label = display_cli_model_label(tool, preset, custom)
    cli_timeout = resolve_cli_timeout_for_node(NODE_ID)
    if cli_timeout_seconds is not None:
        try:
            parsed_timeout = int(cli_timeout_seconds)
            if parsed_timeout > 0:
                cli_timeout = parsed_timeout
        except (TypeError, ValueError):
            pass

    if not is_cli_tool_implemented(tool):
        return {
            "status": "failed",
            "error": f"CLI 工具 {tool} 尚未接入",
            "cli_tool": tool,
            "tasks": [],
        }

    plan_path, plan_md = _read_flight_optimize_plan(sid)
    if not plan_md.strip():
        return {
            "status": "failed",
            "error": f"未找到试飞优化方案，请先完成试飞方案节点并落盘 {PLAN_FILENAME}",
            "cli_tool": tool,
            "tasks": [],
        }

    if normalize_cli_tool(tool) == DEFAULT_CLI_TOOL:
        agent_status = check_cursor_agent_cli()
        if not agent_status.get("ready"):
            missing = not agent_status.get("installed")
            result_doc = {
                "status": "agent_cli_missing" if missing else "agent_cli_login_required",
                "error": str(
                    agent_status.get("error")
                    or agent_status.get("auth_message")
                    or ("未安装 Cursor Agent CLI" if missing else "Cursor Agent CLI 未登录")
                ),
                "agent_cli": agent_status,
                "cli_tool": tool,
                "cli_model": preset,
                "cli_model_custom": custom if preset == "custom" else "",
                "cli_model_label": model_label,
                "demand_no": _resolve_demand_no(scope_type, sid),
                "summary": {
                    "total": 0,
                    "ok": 0,
                    "failed": 0,
                    "skipped": 0,
                    "total_tokens": 0,
                    "total_duration_sec": 0,
                },
                "tasks": [],
                "human_review": {"status": "pending", "comment": "", "decided_at": None},
            }
            _write_result(sid, result_doc)
            _save_assets(sid, result_doc)
            patch_userwork_summary(scope_type=scope_type, scope_id=sid, sop_node="试飞优化")
            return result_doc

    orders, plan_path, plan_md = _collect_optimize_orders(scope_type, sid)
    if not orders:
        return {
            "status": "failed",
            "error": "未找到可执行的研发子单，请先完成自动拆单与沙箱构建",
            "cli_tool": tool,
            "tasks": [],
        }

    need_code_change = _plan_requires_code_change(plan_md)
    demand_no = _resolve_demand_no(scope_type, sid)
    room_id = _resolve_room_id(sid)
    from synapse.rd_meeting.paths import scope_dir

    log_root = scope_dir(sid) / "agents" / NODE_ID / "cli_logs"
    log_root.mkdir(parents=True, exist_ok=True)

    task_rows: list[dict[str, Any]] = []
    task_total = len(orders)
    started_at = datetime.now().isoformat(timespec="seconds")

    _emit_progress(
        sid,
        event="diff_analysis_cli_running",
        message=f"开始 CLI 试飞优化，共 {task_total} 个明细",
        room_id=room_id,
        task_total=task_total,
    )

    result_doc: dict[str, Any] = {
        "cli_tool": tool,
        "cli_model": preset,
        "cli_model_custom": custom if preset == "custom" else "",
        "cli_model_label": model_label,
        "cli_timeout_seconds": cli_timeout,
        "demand_no": demand_no,
        "plan_doc_path": plan_path,
        "started_at": started_at,
        "finished_at": None,
        "status": "running",
        "progress": _progress_snapshot(
            phase="prepare",
            message=f"准备执行 {task_total} 条试飞优化明细",
            task_index=0,
            task_total=task_total,
        ),
        "summary": _summary_from_rows(task_rows, task_total=task_total),
        "tasks": task_rows,
        "human_review": {"status": "pending", "comment": "", "decided_at": None},
        "code_commit": None,
        "flight_failed": False,
    }
    _persist_state(sid, result_doc)

    def _sync_running(
        *,
        phase: str,
        message: str,
        task_index: int,
        task_no: str = "",
        tasks: list[dict[str, Any]] | None = None,
        live_log_path: str = "",
    ) -> None:
        result_doc["progress"] = _progress_snapshot(
            phase=phase,
            message=message,
            task_index=task_index,
            task_total=task_total,
            task_no=task_no,
            live_log_path=live_log_path,
        )
        result_doc["tasks"] = tasks if tasks is not None else list(task_rows)
        result_doc["summary"] = _summary_from_rows(result_doc["tasks"], task_total=task_total)
        _persist_state(sid, result_doc)

    if not need_code_change:
        for order in orders:
            task_rows.append(
                {
                    **order,
                    "status": "skipped",
                    "error": "",
                    "tokens_used": 0,
                    "duration_seconds": 0,
                    "commit_summary": "试飞优化方案确认无需代码改动",
                }
            )
        _sync_running(
            phase="skipped",
            message="试飞优化方案确认无需代码改动，跳过 CLI 修复",
            task_index=task_total,
        )
    else:
        for order_index, order in enumerate(orders):
            task_index = order_index + 1
            sandbox_path = str(order.get("sandbox_path") or "").strip()
            task_key = str(order.get("task_no") or order.get("index"))
            task_no = str(order.get("task_no") or task_key)
            dev_log = log_root / f"{task_key}_develop.log"

            row_base = {
                "task_no": order.get("task_no"),
                "task_title": order.get("task_title"),
                "goal": order.get("goal"),
                "sandbox_path": sandbox_path,
                "product_module": order.get("product_module"),
                "plan_doc_path": plan_path,
            }
            develop_prompt = build_diff_analysis_develop_prompt(
                scope_id=sid,
                order=order,
                plan_doc_path=plan_path,
                human_suggestions=human_suggestions,
                reprocess_reason=reprocess_text,
            )

            if not sandbox_path or not Path(sandbox_path).is_dir():
                task_rows.append(
                    {
                        **row_base,
                        "develop_prompt": develop_prompt,
                        "status": "skipped",
                        "error": "未匹配沙箱工程路径",
                        "tokens_used": 0,
                        "duration_seconds": 0,
                    }
                )
                _sync_running(
                    phase="skipped",
                    message=f"明细 {task_no} 已跳过（{task_index}/{task_total}）",
                    task_index=task_index,
                    task_no=task_no,
                )
                continue

            develop_cmds = build_cursor_round_commands(
                code_path=sandbox_path,
                target=develop_prompt,
                func_doc="",
                accept_doc="",
                continue_session=False,
                model=model_arg,
                log_path=str(dev_log),
                timeout=cli_timeout,
            )
            running_row = {
                **row_base,
                "develop_prompt": develop_prompt,
                "develop_agent_command": develop_cmds.get("agent_command") or "",
                "develop_python_command": develop_cmds.get("python_command") or "",
                "status": "running",
                "phase": "develop",
                "error": "",
                "tokens_used": 0,
                "duration_seconds": 0,
                "develop_log": str(dev_log),
            }
            _emit_progress(
                sid,
                event="diff_analysis_develop_started",
                message=f"明细 {task_no} · 问题修复轮（{task_index}/{task_total}）",
                room_id=room_id,
                task_no=task_no,
                phase="develop",
                task_index=task_index,
                task_total=task_total,
                display={
                    "phase": "develop",
                    "task_no": task_no,
                    "task_title": order.get("task_title") or "",
                    "task_index": task_index,
                    "task_total": task_total,
                    "sandbox_path": sandbox_path,
                    "cli_model": model_label,
                    "agent_command": develop_cmds.get("agent_command") or "",
                    "python_command": develop_cmds.get("python_command") or "",
                    "node_id": NODE_ID,
                },
            )
            _sync_running(
                phase="develop",
                message=f"明细 {task_no} · Cursor 问题修复（{task_index}/{task_total}）",
                task_index=task_index,
                task_no=task_no,
                tasks=[*task_rows, running_row],
                live_log_path=str(dev_log),
            )

            dev_result = _run_cursor_cli_round(
                code_path=sandbox_path,
                target=develop_prompt,
                func_doc="",
                accept_doc="",
                log_path=dev_log,
                model=model_arg,
                timeout=cli_timeout,
            )
            _emit_progress(
                sid,
                event="diff_analysis_develop_finished",
                message=f"明细 {task_no} · 修复轮结束：{dev_result.get('status') or 'unknown'}",
                room_id=room_id,
                task_no=task_no,
                phase="develop",
                task_index=task_index,
                task_total=task_total,
                log_type="info" if dev_result.get("status") == "ok" else "warning",
            )

            round_metrics = _merge_cli_round_metrics(dev_result)
            tokens = int(round_metrics.get("tokens_used") or 0)
            duration = int(round_metrics.get("duration_seconds") or 0)
            duration_ms = int(round_metrics.get("duration_ms") or 0)
            commit_summary = _extract_commit_summary_from_log(
                str(dev_result.get("log_path") or dev_log),
                fallback=str(order.get("goal") or order.get("task_title") or ""),
            )
            status = "ok" if dev_result.get("status") == "ok" else "failed"

            row = {
                **row_base,
                "develop_prompt": develop_prompt,
                "develop_agent_command": develop_cmds.get("agent_command") or "",
                "develop_python_command": develop_cmds.get("python_command") or "",
                "status": status,
                "error": dev_result.get("error") or "",
                "tokens_used": tokens,
                "duration_seconds": duration,
                "duration_ms": duration_ms,
                "develop_log": str(dev_log),
                "commit_summary": commit_summary,
            }
            session_id = str(round_metrics.get("session_id") or "").strip()
            if session_id:
                row["session_id"] = session_id
            usage = round_metrics.get("usage")
            if isinstance(usage, dict) and usage:
                row["usage"] = usage
            task_rows.append(row)
            _emit_progress(
                sid,
                event="diff_analysis_task_finished",
                message=f"明细 {task_no} 完成：{status}（{task_index}/{task_total}）",
                room_id=room_id,
                task_no=task_no,
                phase="done",
                task_index=task_index,
                task_total=task_total,
                log_type="info" if status == "ok" else "warning",
            )
            _sync_running(
                phase="done",
                message=f"明细 {task_no} 已结束（{task_index}/{task_total}）",
                task_index=task_index,
                task_no=task_no,
            )

    dev_failed = any(t.get("status") == "failed" for t in task_rows)
    dev_ok_or_skip = all(t.get("status") in ("ok", "skipped") for t in task_rows)

    commit_result: dict[str, Any] | None = None
    flight_failed = False

    if dev_ok_or_skip and not dev_failed and task_rows:
        _sync_running(
            phase="code_commit",
            message="代码修复完成，开始代码提交与试飞等待…",
            task_index=task_total,
        )
        _emit_progress(
            sid,
            event="diff_analysis_code_commit_started",
            message="进入代码提交 SOP，提交并等待试飞结果",
            room_id=room_id,
            phase="code_commit",
            task_total=task_total,
        )
        commit_result = _run_code_commit_phase(
            sid,
            scope_type=scope_type,
            room_id=room_id,
            pipe=pipe,
        )
        result_doc["code_commit"] = commit_result
        flight = commit_result.get("flight") if isinstance(commit_result.get("flight"), dict) else {}
        flight_status = str(flight.get("status") or commit_result.get("status") or "").strip()
        flight_failed = flight_status in ("failed", "timeout", "partial") or (
            commit_result.get("status") in ("failed", "partial")
            and flight_status not in ("ok", "skipped")
        )
        if flight_failed:
            result_doc["flight_failed"] = True
            result_doc["error"] = str(
                commit_result.get("error") or flight.get("error") or "试飞仍未通过，不允许推进节点"
            )

    ok_count = sum(1 for t in task_rows if t.get("status") == "ok")
    if flight_failed or dev_failed:
        overall = "failed"
    elif dev_ok_or_skip and commit_result and str(commit_result.get("status") or "") in ("ok", "partial"):
        overall = "ok" if not flight_failed else "failed"
    elif ok_count == len(task_rows) and ok_count > 0:
        overall = "ok"
    elif ok_count > 0:
        overall = "partial"
    else:
        overall = "failed"

    finished_at = datetime.now().isoformat(timespec="seconds")
    result_doc.update(
        {
            "finished_at": finished_at,
            "status": overall,
            "progress": _progress_snapshot(
                phase="finished",
                message=f"试飞优化 CLI 结束：{overall}",
                task_index=task_total,
                task_total=task_total,
            ),
            "summary": _summary_from_rows(task_rows, task_total=task_total),
            "tasks": task_rows,
        }
    )
    _persist_state(sid, result_doc)

    patch_userwork_summary(scope_type=scope_type, scope_id=sid, sop_node="试飞优化")
    return result_doc


def load_diff_analysis_payload(scope_id: str) -> dict[str, Any] | None:
    data = _read_result(scope_id)
    if not isinstance(data, dict):
        return None
    return data


def read_diff_analysis_live_tail(
    scope_id: str,
    *,
    max_bytes: int | None = None,
    max_lines: int | None = None,
    log_path: str = "",
) -> dict[str, Any]:
    from synapse.rd_meeting.task_exec import (
        LIVE_TAIL_MAX_BYTES,
        LIVE_TAIL_MAX_LINES,
        _format_live_log_display_lines,
        _tail_log_file,
    )

    resolved_path = (log_path or "").strip()
    progress_updated = ""
    if not resolved_path:
        payload = load_diff_analysis_payload(scope_id)
        if not isinstance(payload, dict):
            return {"path": "", "lines": [], "entries": [], "updated_at": ""}
        progress = payload.get("progress") if isinstance(payload.get("progress"), dict) else {}
        resolved_path = str(progress.get("live_log_path") or "").strip()
        progress_updated = str(progress.get("updated_at") or "")
    if not resolved_path:
        return {"path": "", "lines": [], "entries": [], "updated_at": progress_updated}
    path = Path(resolved_path)
    mb = max_bytes if max_bytes is not None else LIVE_TAIL_MAX_BYTES
    ml = max_lines if max_lines is not None else LIVE_TAIL_MAX_LINES
    raw_lines = _tail_log_file(path, max_bytes=mb, max_lines=ml * 4)
    lines, entries = _format_live_log_display_lines(raw_lines)
    return {
        "path": resolved_path,
        "lines": lines,
        "entries": entries,
        "updated_at": progress_updated,
        "line_count": len(entries),
    }


def render_diff_analysis_report_markdown(data: dict[str, Any]) -> str:
    lines = [
        "# 试飞优化执行记录",
        "",
        f"- CLI 工具：{data.get('cli_tool') or '—'}",
        f"- CLI 模型：{data.get('cli_model_label') or data.get('cli_model') or '—'}",
        f"- 总体状态：{data.get('status') or '—'}",
        f"- 试飞优化方案：{data.get('plan_doc_path') or '—'}",
    ]
    if data.get("flight_failed"):
        lines.append(f"- 试飞结论：未通过（{data.get('error') or '—'}）")
    if str(data.get("status") or "") in ("agent_cli_missing", "agent_cli_login_required"):
        agent_cli = data.get("agent_cli") if isinstance(data.get("agent_cli"), dict) else {}
        lines.extend(
            [
                "",
                "## Cursor Agent CLI 未就绪",
                "",
                str(agent_cli.get("install_hint") or data.get("error") or "请先安装并登录 agent CLI。"),
                "",
            ]
        )
        return "\n".join(lines)
    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    lines.extend(
        [
            f"- 明细总数：{summary.get('total', 0)}",
            f"- 成功：{summary.get('ok', 0)}",
            f"- Token 合计：{summary.get('total_tokens', 0)}",
            f"- 耗时合计：{summary.get('total_duration_sec', 0)}s",
            "",
            "## 试飞优化明细",
            "",
        ]
    )
    for task in data.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        lines.append(f"### {task.get('task_no')} {task.get('task_title') or ''}".strip())
        lines.append(f"- 状态：{task.get('status')}")
        lines.append(f"- 沙箱路径：{task.get('sandbox_path') or '—'}")
        lines.append(f"- 任务目标：{task.get('goal') or '—'}")
        lines.append(
            f"- Token：{task.get('tokens_used', 0)} · 耗时：{task.get('duration_seconds', 0)}s"
        )
        if task.get("commit_summary"):
            lines.append(f"- 提交摘要：{task.get('commit_summary')}")
        if task.get("error"):
            lines.append(f"- 错误：{task['error']}")
        lines.append("")

    commit = data.get("code_commit")
    if isinstance(commit, dict):
        lines.extend(["## 代码提交与试飞", ""])
        lines.append(f"- 提交状态：{commit.get('status') or '—'}")
        flight = commit.get("flight") if isinstance(commit.get("flight"), dict) else {}
        lines.append(f"- 试飞状态：{flight.get('status') or '—'}")
        if commit.get("error"):
            lines.append(f"- 错误：{commit.get('error')}")
        lines.append("")
    return "\n".join(lines)
