"""任务执行节点：CLI 循环处理工单 + 人工评审门控（不调用小鲸/协作智能体）。"""

from __future__ import annotations

import json
import logging
import re
import subprocess
import sys
import time
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
from synapse.rd_meeting.cursor_agent_cli import (
    check_cursor_agent_cli,
    format_argv_as_shell,
    resolve_agent_executable,
)
from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path, scope_dir
from synapse.rd_meeting.product_assets import resolve_sandbox_path_for_product_module
from synapse.rd_meeting.room_runtime import read_json_file, save_meeting_pipeline
from synapse.rd_meeting.system_node_display import (
    _auto_split_context_for_bindings,
    collect_task_rows,
)
from synapse.rd_meeting.userwork_sync import patch_userwork_summary
from synapse.rd_sop.nodes import stage_name_for_id

logger = logging.getLogger(__name__)

NODE_ID = "task_exec"
DEV_STAGE_NAME = stage_name_for_id(4)
RESULT_JSON = "task_exec_result.json"
REPORT_MD = "任务执行记录.md"
LIVE_TAIL_MAX_BYTES = 512 * 1024
LIVE_TAIL_MAX_LINES = 80
LIVE_DISPLAY_LINE_MAX = 600

ScopeType = Literal["demand", "task"]


def uses_task_exec_cli(node_id: str) -> bool:
    return (node_id or "").strip() == NODE_ID


def resolve_cli_tool_for_node(node_id: str = NODE_ID) -> str:
    cfg = load_meeting_room_config()
    overrides = cfg.get("node_overrides") if isinstance(cfg.get("node_overrides"), dict) else {}
    ov = overrides.get(node_id) if isinstance(overrides.get(node_id), dict) else {}
    return normalize_cli_tool(str(ov.get("cli_tool") or DEFAULT_CLI_TOOL))


def resolve_cli_model_for_node(node_id: str = NODE_ID) -> tuple[str, str]:
    """返回 (cli_model preset, cli_model_custom)。"""
    cfg = load_meeting_room_config()
    overrides = cfg.get("node_overrides") if isinstance(cfg.get("node_overrides"), dict) else {}
    ov = overrides.get(node_id) if isinstance(overrides.get(node_id), dict) else {}
    preset = normalize_cursor_cli_model(str(ov.get("cli_model") or DEFAULT_CURSOR_CLI_MODEL))
    custom = str(ov.get("cli_model_custom") or "").strip()
    return preset, custom


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _cursor_operation_script() -> Path:
    return _repo_root() / "skills" / "whalecloud-dev-tool-development" / "scripts" / "cursor-operation.py"


_cursor_operation_mod: Any = None


def _load_cursor_operation_module() -> Any:
    """惰性加载 cursor-operation.py（与 subprocess 调用共用同一份脚本逻辑）。"""
    global _cursor_operation_mod
    if _cursor_operation_mod is not None:
        return _cursor_operation_mod
    import importlib.util

    script = _cursor_operation_script()
    spec = importlib.util.spec_from_file_location("synapse_rd_cursor_operation", script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载 Cursor CLI 脚本：{script}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    _cursor_operation_mod = mod
    return mod


def build_cursor_round_commands(
    *,
    code_path: str,
    target: str,
    func_doc: str,
    accept_doc: str,
    continue_session: bool = False,
    model: str | None = None,
    log_path: str = "",
    timeout: int = 900,
) -> dict[str, str]:
    """生成任务执行轮次的完整 agent 命令与 Synapse 包装命令。"""
    mod = _load_cursor_operation_module()
    prompt = mod.build_develop_prompt(
        code_path=code_path,
        target=target,
        doc_path=func_doc or None,
        acceptance_doc=accept_doc or None,
        continue_session=continue_session,
    )
    model_val = (model or DEFAULT_CURSOR_CLI_MODEL).strip() or DEFAULT_CURSOR_CLI_MODEL
    cursor = mod.CursorCLI(
        agent_path=resolve_agent_executable("agent"),
        workspace=code_path,
        model=model_val,
        continue_session=continue_session,
    )
    agent_argv = cursor.build_argv(prompt)
    py_argv = [
        sys.executable,
        str(_cursor_operation_script()),
        "--code-path",
        code_path,
        "--target",
        target,
        "--log",
        log_path or "(log-path)",
        "--timeout",
        str(timeout),
        "--no-echo-stream",
    ]
    if func_doc:
        py_argv.extend(["--doc", func_doc])
    if accept_doc:
        py_argv.extend(["--acceptance-doc", accept_doc])
    if continue_session:
        py_argv.append("--continue")
    if model is not None:
        py_argv.extend(["--model", model_val])
    return {
        "agent_command": format_argv_as_shell(agent_argv),
        "agent_prompt": prompt,
        "python_command": format_argv_as_shell(py_argv),
    }


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
        logger.warning("read task_exec_result failed %s: %s", path, exc)
        return None


def _write_result(scope_id: str, data: dict[str, Any]) -> None:
    dest = _result_json_path(scope_id)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    report = render_task_exec_report_markdown(data)
    (dest.parent / REPORT_MD).write_text(report, encoding="utf-8")


def _save_task_exec_assets(scope_id: str, assets: dict[str, Any]) -> None:
    path = meeting_pipeline_path(scope_id)
    raw = read_json_file(path)
    if not isinstance(raw, dict):
        raw = {}
    ctx = raw.get("context") if isinstance(raw.get("context"), dict) else {}
    ctx["task_exec_assets"] = assets
    raw["context"] = ctx
    raw["updated_at"] = datetime.now().isoformat(timespec="seconds")
    save_meeting_pipeline(scope_id, raw)


def _collect_work_orders(scope_type: ScopeType, scope_id: str) -> list[dict[str, Any]]:
    """从拆单计划汇总子单，并按 product_module_name 解析唯一 SANDBOX_PATH。"""
    auto_ctx = _auto_split_context_for_bindings(scope_id)
    tasks = collect_task_rows(auto_ctx)

    orders: list[dict[str, Any]] = []
    for idx, binding in enumerate(tasks):
        if not isinstance(binding, dict):
            continue
        product_module = str(
            binding.get("product_module_name") or binding.get("productModuleName") or ""
        ).strip()
        sandbox_path = resolve_sandbox_path_for_product_module(
            scope_type,
            scope_id,
            product_module,
        )
        fps = binding.get("function_points")
        fp_list = [str(x).strip() for x in fps if str(x).strip()] if isinstance(fps, list) else []
        orders.append(
            {
                "index": idx,
                "task_no": str(binding.get("taskNo") or binding.get("task_no") or f"task-{idx + 1}"),
                "task_title": str(binding.get("taskTitle") or binding.get("task_title") or ""),
                "goal": str(binding.get("comments") or binding.get("task_title") or "").strip(),
                "coverage": fp_list,
                "sandbox_path": sandbox_path,
                "product_module": product_module,
            }
        )
    return orders


def _archive_doc_paths(engineering_root: str) -> tuple[str, str]:
    root = Path(engineering_root)
    func_doc = root / "synapse_archive" / "需求设计" / "func_solution" / "函数级方案.md"
    accept_doc = root / "synapse_archive" / "需求分析" / "acceptance" / "验收标准.md"
    return (
        str(func_doc) if func_doc.is_file() else "",
        str(accept_doc) if accept_doc.is_file() else "",
    )


def build_task_develop_prompt(
    *,
    scope_id: str = "",
    order: dict[str, Any],
    func_doc: str,
    accept_doc: str,
    human_suggestions: str,
    reprocess_reason: str = "",
) -> str:
    goal = str(order.get("goal") or order.get("task_title") or "完成功能点开发").strip()
    coverage = order.get("coverage") if isinstance(order.get("coverage"), list) else []
    cov_text = "、".join(str(x) for x in coverage if str(x).strip()) or "见函数级方案"
    lines: list[str] = []
    reason = (reprocess_reason or "").strip()
    if reason:
        lines.extend(
            [
                "【用户重处理要求 · 最高优先级】",
                f"用户重处理要求：{reason}",
                "本条优先级高于函数级方案、验收标准及一切历史结论；冲突时以用户重处理要求为准。",
                "",
            ]
        )
    lines.extend(
        [
            "【任务执行 · 开发轮】",
            f"工单：{order.get('task_no')} {order.get('task_title') or ''}".strip(),
            f"任务目标：{goal}",
            f"功能覆盖范围：{cov_text}",
        ]
    )
    if func_doc:
        lines.append(f"函数级方案文档：{func_doc}")
    if accept_doc:
        lines.append(f"验收标准文档：{accept_doc}")
    if human_suggestions.strip():
        lines.append(f"人工建议与补充：{human_suggestions.strip()}")
    from synapse.rd_meeting.soul_instruction import format_soul_instruction_cli_lines

    lines.extend(format_soul_instruction_cli_lines(scope_id))
    lines.extend(
        [
            "",
            "请在沙箱工程目录中完成上述功能点的代码实现。",
            "注意：不要 git commit；完成后输出已修改文件列表与变更摘要。",
        ]
    )
    return "\n".join(lines)


def build_task_verify_prompt(
    *,
    scope_id: str = "",
    order: dict[str, Any],
    func_doc: str,
    human_suggestions: str,
    develop_log_hint: str,
    reprocess_reason: str = "",
) -> str:
    goal = str(order.get("goal") or "").strip()
    coverage = order.get("coverage") if isinstance(order.get("coverage"), list) else []
    cov_text = "、".join(str(x) for x in coverage if str(x).strip()) or "见函数级方案"
    lines: list[str] = []
    reason = (reprocess_reason or "").strip()
    if reason:
        lines.extend(
            [
                "【用户重处理要求 · 最高优先级】",
                f"用户重处理要求：{reason}",
                "完成检测时须以用户重处理要求为准；若与函数级方案冲突，以用户重处理要求优先。",
                "",
            ]
        )
    lines.extend(
        [
            "【任务执行 · 完成检测轮】",
            "请对照任务目标、功能覆盖与函数级方案，检查刚才的开发是否已完成。",
            f"任务目标：{goal}",
            f"功能覆盖：{cov_text}",
        ]
    )
    if func_doc:
        lines.append(f"函数级方案：{func_doc}")
    if human_suggestions.strip():
        lines.append(f"人工建议：{human_suggestions.strip()}")
    from synapse.rd_meeting.soul_instruction import format_soul_instruction_cli_lines

    lines.extend(format_soul_instruction_cli_lines(scope_id))
    if develop_log_hint:
        lines.append(f"开发轮日志：{develop_log_hint}")
    lines.extend(
        [
            "",
            "输出一份 Markdown 任务报告，必须包含以下小节：",
            "## 完成状态（completed / partial / failed）",
            "## 目标达成说明",
            "## 覆盖功能点核对",
            "## 修改文件列表",
            "## 变更摘要",
            "（一行简述本次改造，用于 git commit message，勿含换行）",
            "## 遗留问题与风险",
            "## Token 与耗时估计（若无法精确统计可写「未知」）",
        ]
    )
    return "\n".join(lines)


def _usage_int(raw: dict[str, Any], *keys: str) -> int:
    for key in keys:
        value = raw.get(key)
        if value is None:
            continue
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            continue
    return 0


def _normalize_cli_usage(raw: Any) -> dict[str, int]:
    if not isinstance(raw, dict):
        return {}
    return {
        "input_tokens": _usage_int(raw, "inputTokens", "input_tokens", "billable_input_tokens"),
        "output_tokens": _usage_int(raw, "outputTokens", "output_tokens", "billable_output_tokens"),
        "cache_read_tokens": _usage_int(raw, "cacheReadTokens", "cache_read_tokens"),
        "cache_write_tokens": _usage_int(raw, "cacheWriteTokens", "cache_write_tokens"),
    }


def _billable_tokens_from_usage(usage: dict[str, int]) -> int:
    return int(usage.get("input_tokens") or 0) + int(usage.get("output_tokens") or 0)


def _metrics_from_cli_result_event(event: dict[str, Any]) -> dict[str, Any]:
    if event.get("type") != "result":
        return {}
    duration_ms = max(int(event.get("duration_ms") or 0), 0)
    usage = _normalize_cli_usage(event.get("usage"))
    tokens_used = _billable_tokens_from_usage(usage)
    session_id = str(event.get("session_id") or "").strip()
    return {
        "duration_ms": duration_ms,
        "duration_seconds": duration_ms // 1000 if duration_ms > 0 else 0,
        "tokens_used": tokens_used,
        "session_id": session_id,
        "usage": usage,
    }


def _parse_cli_round_metrics_from_log(log_path: str | Path) -> dict[str, Any]:
    """从 CLI 日志末尾的 ``[raw] {type:result,...}`` 行读取 session / usage / duration。"""
    path = Path(log_path)
    if not path.is_file():
        return {}
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}
    for line in reversed(text.splitlines()):
        if "[raw]" not in line:
            continue
        raw_json = line.split("[raw]", 1)[-1].strip()
        if '"type":"result"' not in raw_json and '"type": "result"' not in raw_json:
            continue
        try:
            event = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        metrics = _metrics_from_cli_result_event(event)
        if metrics:
            return metrics
    return {}


def _merge_cli_round_metrics(*metrics_list: dict[str, Any]) -> dict[str, Any]:
    merged_usage = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
    }
    duration_ms = 0
    duration_seconds = 0
    tokens_used = 0
    session_id = ""
    for metrics in metrics_list:
        if not metrics:
            continue
        duration_ms += int(metrics.get("duration_ms") or 0)
        duration_seconds += int(metrics.get("duration_seconds") or 0)
        tokens_used += int(metrics.get("tokens_used") or 0)
        sid = str(metrics.get("session_id") or "").strip()
        if sid:
            session_id = sid
        usage = metrics.get("usage") if isinstance(metrics.get("usage"), dict) else {}
        for key in merged_usage:
            merged_usage[key] += int(usage.get(key) or 0)
    out: dict[str, Any] = {
        "duration_ms": duration_ms,
        "duration_seconds": duration_seconds,
        "tokens_used": tokens_used,
        "usage": merged_usage,
    }
    if session_id:
        out["session_id"] = session_id
    return out


def _parse_cursor_subprocess_output(stdout: str) -> dict[str, Any]:
    success = False
    log_path = ""
    for line in (stdout or "").splitlines():
        line = line.strip()
        if line.startswith("SYNAPSE_CURSOR_SUCCESS="):
            success = line.split("=", 1)[-1].strip() in ("1", "true", "True")
        elif line.startswith("SYNAPSE_CURSOR_LOG="):
            log_path = line.split("=", 1)[-1].strip()
    metrics = _parse_cli_round_metrics_from_log(log_path) if log_path else {}
    return {
        "success": success,
        "log_path": log_path,
        "tokens_used": int(metrics.get("tokens_used") or 0),
        **metrics,
    }


def _run_cursor_cli_round(
    *,
    code_path: str,
    target: str,
    func_doc: str,
    accept_doc: str,
    log_path: Path,
    timeout: int = 900,
    continue_session: bool = False,
    model: str | None = None,
) -> dict[str, Any]:
    script = _cursor_operation_script()
    if not script.is_file():
        return {
            "status": "failed",
            "error": f"未找到 Cursor CLI 脚本：{script}",
            "duration_seconds": 0,
            "tokens_used": 0,
            "log_path": "",
        }

    started = time.monotonic()
    logger.info(
        "task_exec: cursor CLI round begin log=%s continue=%s model=%s",
        log_path,
        continue_session,
        model,
    )
    argv = [
        sys.executable,
        str(script),
        "--code-path",
        code_path,
        "--target",
        target,
        "--log",
        str(log_path),
        "--timeout",
        str(timeout),
        "--no-echo-stream",
    ]
    if func_doc:
        argv.extend(["--doc", func_doc])
    if accept_doc:
        argv.extend(["--acceptance-doc", accept_doc])
    if continue_session:
        argv.append("--continue")
    if model is not None:
        argv.extend(["--model", model])

    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout + 120,
            cwd=str(Path(code_path).parent if Path(code_path).is_dir() else scope_dir("")),
        )
    except subprocess.TimeoutExpired:
        return {
            "status": "failed",
            "error": f"CLI 超时（>{timeout}s）",
            "duration_seconds": int(time.monotonic() - started),
            "tokens_used": 0,
            "log_path": str(log_path),
        }
    except OSError as exc:
        return {
            "status": "failed",
            "error": str(exc),
            "duration_seconds": int(time.monotonic() - started),
            "tokens_used": 0,
            "log_path": str(log_path),
        }

    parsed = _parse_cursor_subprocess_output(proc.stdout)
    ok = parsed["success"] and proc.returncode == 0
    effective_log = str(parsed.get("log_path") or log_path)
    log_metrics = _parse_cli_round_metrics_from_log(effective_log)
    fallback_duration = int(time.monotonic() - started)
    duration_ms = int(log_metrics.get("duration_ms") or parsed.get("duration_ms") or 0)
    duration_seconds = int(
        log_metrics.get("duration_seconds")
        or parsed.get("duration_seconds")
        or (duration_ms // 1000 if duration_ms > 0 else fallback_duration)
    )
    tokens_used = int(
        log_metrics.get("tokens_used") or parsed.get("tokens_used") or 0
    )
    stderr = (proc.stderr or "").strip()
    result: dict[str, Any] = {
        "status": "ok" if ok else "failed",
        "error": "" if ok else (stderr or proc.stdout or f"exit={proc.returncode}")[:2000],
        "duration_ms": duration_ms,
        "duration_seconds": duration_seconds,
        "tokens_used": tokens_used,
        "log_path": effective_log,
        "exit_code": proc.returncode,
    }
    session_id = str(log_metrics.get("session_id") or parsed.get("session_id") or "").strip()
    if session_id:
        result["session_id"] = session_id
    usage = log_metrics.get("usage") or parsed.get("usage")
    if isinstance(usage, dict) and usage:
        result["usage"] = usage
    return result


_COMPLETION_SECTION_RE = re.compile(
    r"##\s*完成状态[^\n]*\n+\s*(?:\*\*)?(completed|partial|failed)(?:\*\*)?",
    re.IGNORECASE,
)
_COMMIT_SUMMARY_SECTION_RE = re.compile(
    r"##\s*变更摘要[^\n]*\n+\s*(.+?)(?=\n##|\Z)",
    re.IGNORECASE | re.DOTALL,
)
_CURSOR_OUTPUT_MAX_CHUNK = 50_000


def _parse_stream_json_result_line(line: str) -> str:
    """从 ``[raw] {type:result,...}`` 行提取 assistant 结果文本。"""
    if "[raw]" not in line:
        return ""
    raw_json = line.split("[raw]", 1)[-1].strip()
    if '"type":"result"' not in raw_json and '"type": "result"' not in raw_json:
        return ""
    try:
        obj = json.loads(raw_json)
    except json.JSONDecodeError:
        return ""
    if not isinstance(obj, dict) or obj.get("type") != "result":
        return ""
    result_text = str(obj.get("result") or "").strip()
    if not result_text:
        return ""
    if "完成状态" in result_text or "完成检测" in result_text:
        return result_text
    return ""


def _extract_report_from_log(log_path: str) -> str:
    path = Path(log_path)
    if not path.is_file():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""

    for line in reversed(text.splitlines()):
        report = _parse_stream_json_result_line(line)
        if report:
            return report

    for line in reversed(text.splitlines()):
        if "[raw]" not in line or '"type":"assistant"' not in line:
            continue
        raw_json = line.split("[raw]", 1)[-1].strip()
        try:
            obj = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        if not isinstance(obj, dict) or obj.get("type") != "assistant":
            continue
        message = obj.get("message")
        if not isinstance(message, dict):
            continue
        parts: list[str] = []
        for block in message.get("content") or []:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text") or ""))
        report = "\n".join(p for p in parts if p.strip()).strip()
        if report and "完成状态" in report:
            return report

    chunks: list[str] = []
    lines = text.splitlines()
    idx = 0
    while idx < len(lines):
        line = lines[idx]
        if "[cursor-output]" not in line:
            idx += 1
            continue
        chunk = line.split("[cursor-output]", 1)[-1].strip()
        body: list[str] = [chunk] if chunk else []
        next_idx = idx + 1
        while next_idx < len(lines):
            follow = lines[next_idx]
            if re.match(r"^\[\d{4}-\d{2}-\d{2}\s", follow):
                break
            if follow.strip():
                body.append(follow.strip())
            next_idx += 1
        merged = "\n".join(body).strip()
        if merged and len(merged) <= _CURSOR_OUTPUT_MAX_CHUNK and "[raw]" not in merged:
            if '"tool_call"' not in merged:
                chunks.append(merged)
        idx = next_idx if next_idx > idx else idx + 1
    if chunks:
        return "\n".join(chunks[-40:])
    return text[-8000:] if len(text) > 8000 else text


def _extract_commit_summary(report_md: str) -> str:
    report = report_md or ""
    match = _COMMIT_SUMMARY_SECTION_RE.search(report)
    if match:
        summary = match.group(1).strip()
        summary = re.sub(r"^[（(][^）)]*[）)]\s*", "", summary)
        summary = " ".join(summary.split())
        if summary and summary not in ("—", "-", "未知", "无"):
            return summary[:500]
    return ""


def _infer_completion_status(report_md: str, develop_ok: bool) -> str:
    report = report_md or ""
    match = _COMPLETION_SECTION_RE.search(report)
    if match:
        return match.group(1).lower()

    body = report.lower()
    if "## 完成状态" in report or "##完成状态" in report:
        for status in ("completed", "partial", "failed"):
            if re.search(rf"\b{status}\b", body):
                return status

    if develop_ok:
        return "partial"
    return "failed"


def patch_owned_work_item_task_exec(
    demand_no: str,
    task_no: str,
    *,
    status: str,
    sandbox_path: str = "",
    tokens_used: int = 0,
    duration_seconds: int = 0,
    report_excerpt: str = "",
) -> bool:
    from filelock import FileLock

    from synapse.api.routes.dev_iwhalecloud import (
        _atomic_write_json_file,
        _owner_order_file_lock_path,
        _owner_order_file_name,
        _snapshot_norm_id,
    )

    path = _owner_order_file_name()
    if not path.is_file():
        return False
    dn = _snapshot_norm_id(demand_no)
    tn = _snapshot_norm_id(task_no)
    if not dn or not tn:
        return False

    lock = FileLock(str(_owner_order_file_lock_path()), timeout=30)
    with lock:
        try:
            prev = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(prev, dict):
                return False
            existing_list = prev.get("list")
            if not isinstance(existing_list, list):
                return False
        except (OSError, json.JSONDecodeError):
            return False

        modified = False
        for demand in existing_list:
            if not isinstance(demand, dict):
                continue
            if _snapshot_norm_id(demand.get("demand_no")) != dn:
                continue
            owned = demand.get("owned_work_items")
            if not isinstance(owned, list):
                continue
            for item in owned:
                if not isinstance(item, dict):
                    continue
                if _snapshot_norm_id(item.get("task_no")) != tn:
                    continue
                item["task_exec_status"] = status
                if sandbox_path:
                    item["task_exec_sandbox_path"] = sandbox_path
                item["task_exec_tokens"] = tokens_used
                item["task_exec_duration_sec"] = duration_seconds
                if report_excerpt:
                    item["task_exec_report_excerpt"] = report_excerpt[:2000]
                item["sop_node"] = "任务执行"
                modified = True
                break
            break

        if not modified:
            return False
        payload = {
            "list": existing_list,
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }
        _atomic_write_json_file(path, payload)
        return True


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


def _task_exec_progress_snapshot(
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


def _persist_task_exec_state(scope_id: str, result_doc: dict[str, Any]) -> None:
    _write_result(scope_id, result_doc)
    _save_task_exec_assets(scope_id, result_doc)


def write_task_exec_cli_starting(
    scope_id: str,
    *,
    cli_tool: str,
    cli_model: str,
    cli_model_custom: str,
    cli_model_label: str,
    demand_no: str = "",
) -> None:
    """CLI bootstrap 开始前写入 running 占位，便于 reprocess 后前端立即轮询。"""
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
        "progress": _task_exec_progress_snapshot(
            phase="starting",
            message="正在启动 Cursor CLI…",
            task_index=0,
            task_total=0,
        ),
        "summary": _summary_from_rows([], task_total=0),
        "tasks": [],
        "human_review": {"status": "pending", "comment": "", "decided_at": None},
    }
    _persist_task_exec_state(scope_id, result_doc)


def _emit_task_exec_progress(
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
        "flow_stage": "任务执行 CLI",
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


def bootstrap_task_exec(
    scope_type: ScopeType,
    scope_id: str,
    *,
    cli_tool: str | None = None,
    cli_model: str | None = None,
    cli_model_custom: str | None = None,
    human_suggestions: str = "",
    reprocess_reason: str | None = None,
) -> dict[str, Any]:
    """循环处理工单：CLI 开发 + 完成检测 + 持久化。"""
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
    if not is_cli_tool_implemented(tool):
        return {
            "status": "failed",
            "error": f"CLI 工具 {tool} 尚未接入",
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
            _save_task_exec_assets(sid, result_doc)
            patch_userwork_summary(
                scope_type=scope_type,
                scope_id=sid,
                sop_node="任务执行",
                local_process_state="human_intervention",
            )
            return result_doc

    orders = _collect_work_orders(scope_type, sid)
    if not orders:
        return {
            "status": "failed",
            "error": "未找到可执行的研发子单，请先完成自动拆单、沙箱构建与环境预生成",
            "cli_tool": tool,
            "tasks": [],
        }

    demand_no = _resolve_demand_no(scope_type, sid)
    room_id = _resolve_room_id(sid)
    work_dir = scope_dir(sid)
    log_root = work_dir / "agents" / NODE_ID / "cli_logs"
    log_root.mkdir(parents=True, exist_ok=True)

    task_rows: list[dict[str, Any]] = []
    task_total = len(orders)
    started_at = datetime.now().isoformat(timespec="seconds")

    _emit_task_exec_progress(
        sid,
        event="task_exec_cli_running",
        message=f"开始 CLI 任务执行，共 {task_total} 个研发子单",
        room_id=room_id,
        task_total=task_total,
    )

    result_doc: dict[str, Any] = {
        "cli_tool": tool,
        "cli_model": preset,
        "cli_model_custom": custom if preset == "custom" else "",
        "cli_model_label": model_label,
        "demand_no": demand_no,
        "started_at": started_at,
        "finished_at": None,
        "status": "running",
        "progress": _task_exec_progress_snapshot(
            phase="prepare",
            message=f"准备执行 {task_total} 个研发子单",
            task_index=0,
            task_total=task_total,
        ),
        "summary": _summary_from_rows(task_rows, task_total=task_total),
        "tasks": task_rows,
        "human_review": {"status": "pending", "comment": "", "decided_at": None},
    }
    _persist_task_exec_state(sid, result_doc)

    def _sync_running(
        *,
        phase: str,
        message: str,
        task_index: int,
        task_no: str = "",
        tasks: list[dict[str, Any]] | None = None,
        live_log_path: str = "",
    ) -> None:
        result_doc["progress"] = _task_exec_progress_snapshot(
            phase=phase,
            message=message,
            task_index=task_index,
            task_total=task_total,
            task_no=task_no,
            live_log_path=live_log_path,
        )
        result_doc["tasks"] = tasks if tasks is not None else list(task_rows)
        result_doc["summary"] = _summary_from_rows(result_doc["tasks"], task_total=task_total)
        _persist_task_exec_state(sid, result_doc)

    for order_index, order in enumerate(orders):
        task_index = order_index + 1
        sandbox_path = str(order.get("sandbox_path") or "").strip()
        task_key = str(order.get("task_no") or order.get("index"))
        task_no = str(order.get("task_no") or task_key)
        dev_log = log_root / f"{task_key}_develop.log"
        verify_log = log_root / f"{task_key}_verify.log"
        func_doc, accept_doc = _archive_doc_paths(sandbox_path) if sandbox_path else ("", "")

        row_base = {
            "task_no": order.get("task_no"),
            "task_title": order.get("task_title"),
            "goal": order.get("goal"),
            "coverage": order.get("coverage") or [],
            "sandbox_path": sandbox_path,
            "product_module": order.get("product_module"),
        }
        develop_prompt = build_task_develop_prompt(
            scope_id=sid,
            order=order,
            func_doc=func_doc,
            accept_doc=accept_doc,
            human_suggestions=human_suggestions,
            reprocess_reason=reprocess_text,
        )
        verify_prompt = build_task_verify_prompt(
            scope_id=sid,
            order=order,
            func_doc=func_doc,
            human_suggestions=human_suggestions,
            develop_log_hint=str(dev_log),
            reprocess_reason=reprocess_text,
        )

        if not sandbox_path or not Path(sandbox_path).is_dir():
            skipped_row = {
                **row_base,
                "develop_prompt": develop_prompt,
                "verify_prompt": verify_prompt,
                "status": "skipped",
                "error": "未匹配沙箱工程路径",
                "tokens_used": 0,
                "duration_seconds": 0,
                "report_markdown": "",
            }
            task_rows.append(skipped_row)
            _emit_task_exec_progress(
                sid,
                event="task_exec_task_skipped",
                message=f"工单 {task_no} 跳过：未匹配沙箱工程路径",
                room_id=room_id,
                task_no=task_no,
                phase="skipped",
                task_index=task_index,
                task_total=task_total,
                log_type="warning",
            )
            _sync_running(
                phase="skipped",
                message=f"工单 {task_no} 已跳过（{task_index}/{task_total}）",
                task_index=task_index,
                task_no=task_no,
            )
            continue

        develop_cmds = build_cursor_round_commands(
            code_path=sandbox_path,
            target=develop_prompt,
            func_doc=func_doc,
            accept_doc=accept_doc,
            continue_session=False,
            model=model_arg,
            log_path=str(dev_log),
        )
        verify_cmds = build_cursor_round_commands(
            code_path=sandbox_path,
            target=verify_prompt,
            func_doc=func_doc,
            accept_doc=accept_doc,
            continue_session=True,
            model=model_arg,
            log_path=str(verify_log),
        )
        running_row = {
            **row_base,
            "develop_prompt": develop_prompt,
            "verify_prompt": verify_prompt,
            "develop_agent_command": develop_cmds.get("agent_command") or "",
            "verify_agent_command": verify_cmds.get("agent_command") or "",
            "develop_python_command": develop_cmds.get("python_command") or "",
            "verify_python_command": verify_cmds.get("python_command") or "",
            "status": "running",
            "phase": "develop",
            "error": "",
            "tokens_used": 0,
            "duration_seconds": 0,
            "develop_log": str(dev_log),
            "verify_log": str(verify_log),
            "report_markdown": "",
        }
        _emit_task_exec_progress(
            sid,
            event="task_exec_develop_started",
            message=f"工单 {task_no} · 开发轮（{task_index}/{task_total}）",
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
                "func_doc": func_doc,
                "acceptance_doc": accept_doc,
                "cli_model": model_label,
                "agent_command": develop_cmds.get("agent_command") or "",
                "python_command": develop_cmds.get("python_command") or "",
            },
        )
        _sync_running(
            phase="develop",
            message=f"工单 {task_no} · Cursor 开发轮（{task_index}/{task_total}）",
            task_index=task_index,
            task_no=task_no,
            tasks=[*task_rows, running_row],
            live_log_path=str(dev_log),
        )

        dev_result = _run_cursor_cli_round(
            code_path=sandbox_path,
            target=develop_prompt,
            func_doc=func_doc,
            accept_doc=accept_doc,
            log_path=dev_log,
            model=model_arg,
        )
        _emit_task_exec_progress(
            sid,
            event="task_exec_develop_finished",
            message=f"工单 {task_no} · 开发轮结束：{dev_result.get('status') or 'unknown'}",
            room_id=room_id,
            task_no=task_no,
            phase="develop",
            task_index=task_index,
            task_total=task_total,
            log_type="info" if dev_result.get("status") == "ok" else "warning",
        )

        running_row = {**running_row, "phase": "verify"}
        _emit_task_exec_progress(
            sid,
            event="task_exec_verify_started",
            message=f"工单 {task_no} · 完成检测轮（{task_index}/{task_total}）",
            room_id=room_id,
            task_no=task_no,
            phase="verify",
            task_index=task_index,
            task_total=task_total,
            display={
                "phase": "verify",
                "task_no": task_no,
                "task_title": order.get("task_title") or "",
                "task_index": task_index,
                "task_total": task_total,
                "sandbox_path": sandbox_path,
                "func_doc": func_doc,
                "acceptance_doc": accept_doc,
                "cli_model": model_label,
                "agent_command": verify_cmds.get("agent_command") or "",
                "python_command": verify_cmds.get("python_command") or "",
            },
        )
        _sync_running(
            phase="verify",
            message=f"工单 {task_no} · Cursor 完成检测（{task_index}/{task_total}）",
            task_index=task_index,
            task_no=task_no,
            tasks=[*task_rows, running_row],
            live_log_path=str(verify_log),
        )

        verify_result = _run_cursor_cli_round(
            code_path=sandbox_path,
            target=verify_prompt,
            func_doc=func_doc,
            accept_doc=accept_doc,
            log_path=verify_log,
            continue_session=True,
            model=model_arg,
        )

        report_md = _extract_report_from_log(str(verify_result.get("log_path") or verify_log))
        completion = _infer_completion_status(report_md, dev_result.get("status") == "ok")
        commit_summary = _extract_commit_summary(report_md)
        if not commit_summary:
            commit_summary = str(order.get("goal") or order.get("task_title") or "").strip()[:500]
        status = "ok" if completion == "completed" and verify_result.get("status") == "ok" else (
            "partial" if completion == "partial" else "failed"
        )

        round_metrics = _merge_cli_round_metrics(dev_result, verify_result)
        tokens = int(round_metrics.get("tokens_used") or 0)
        duration = int(round_metrics.get("duration_seconds") or 0)
        duration_ms = int(round_metrics.get("duration_ms") or 0)

        row = {
            **row_base,
            "develop_prompt": develop_prompt,
            "verify_prompt": verify_prompt,
            "develop_agent_command": develop_cmds.get("agent_command") or "",
            "verify_agent_command": verify_cmds.get("agent_command") or "",
            "develop_python_command": develop_cmds.get("python_command") or "",
            "verify_python_command": verify_cmds.get("python_command") or "",
            "status": status,
            "completion": completion,
            "error": verify_result.get("error") or dev_result.get("error") or "",
            "tokens_used": tokens,
            "duration_seconds": duration,
            "duration_ms": duration_ms,
            "develop_log": str(dev_log),
            "verify_log": str(verify_log),
            "report_markdown": report_md,
            "commit_summary": commit_summary,
        }
        session_id = str(round_metrics.get("session_id") or "").strip()
        if session_id:
            row["session_id"] = session_id
        usage = round_metrics.get("usage")
        if isinstance(usage, dict) and any(int(usage.get(k) or 0) for k in usage):
            row["usage"] = usage
        task_rows.append(row)
        _emit_task_exec_progress(
            sid,
            event="task_exec_task_finished",
            message=f"工单 {task_no} 完成：{status}（{task_index}/{task_total}）",
            room_id=room_id,
            task_no=task_no,
            phase="done",
            task_index=task_index,
            task_total=task_total,
            log_type="info" if status == "ok" else "warning",
        )
        _sync_running(
            phase="done",
            message=f"工单 {task_no} 已结束（{task_index}/{task_total}）",
            task_index=task_index,
            task_no=task_no,
        )

        patch_owned_work_item_task_exec(
            demand_no,
            str(order.get("task_no") or ""),
            status=status,
            sandbox_path=sandbox_path,
            tokens_used=tokens,
            duration_seconds=duration,
            report_excerpt=report_md[:500],
        )

    ok_count = sum(1 for t in task_rows if t.get("status") == "ok")
    overall = "ok" if ok_count == len(task_rows) and ok_count > 0 else (
        "partial" if ok_count > 0 else "failed"
    )
    finished_at = datetime.now().isoformat(timespec="seconds")
    result_doc.update(
        {
            "finished_at": finished_at,
            "status": overall,
            "progress": _task_exec_progress_snapshot(
                phase="finished",
                message=f"CLI 任务执行结束：{overall}",
                task_index=task_total,
                task_total=task_total,
            ),
            "summary": _summary_from_rows(task_rows, task_total=task_total),
            "tasks": task_rows,
        }
    )
    _persist_task_exec_state(sid, result_doc)

    patch_userwork_summary(
        scope_type=scope_type,
        scope_id=sid,
        sop_node="任务执行",
        local_process_state="human_intervention",
    )

    return result_doc


def load_task_exec_payload(scope_id: str) -> dict[str, Any] | None:
    data = _read_result(scope_id)
    if not isinstance(data, dict):
        return None
    return data


def _tail_log_file(path: Path, *, max_bytes: int, max_lines: int) -> list[str]:
    if not path.is_file():
        return []
    size = path.stat().st_size
    if size <= 0:
        return []
    read_size = min(size, max_bytes)
    with path.open("rb") as handle:
        if size > read_size:
            handle.seek(size - read_size)
        chunk = handle.read(read_size)
    text = chunk.decode("utf-8", errors="replace")
    lines = text.splitlines()
    if size > read_size and lines:
        lines = lines[1:]
    if len(lines) > max_lines:
        lines = lines[-max_lines:]
    return lines


def _split_log_timestamp(line: str) -> tuple[str, str]:
    """Return ``(HH:MM:SS, body)`` from a timestamped CLI log line."""
    m = re.match(r"^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]\s*", line)
    if not m:
        return "", line.strip()
    ts_full = m.group(1)
    time_hms = ts_full.split(" ", 1)[-1] if " " in ts_full else ts_full
    return time_hms, line[m.end() :].strip()


def _short_display_path(path: str, *, max_len: int = 80) -> str:
    raw = (path or "").strip().replace("\\", "/")
    if not raw:
        return ""
    if len(raw) <= max_len:
        return raw
    parts = [p for p in raw.split("/") if p]
    if len(parts) >= 2:
        tail = "/".join(parts[-2:])
        if len(tail) <= max_len:
            return f"…/{tail}"
    return f"…{raw[-max_len:]}"


def _parse_tool_log_body(body: str) -> dict[str, Any] | None:
    if "[tool]" not in body:
        return None
    content = body.split("[tool]", 1)[-1].strip()
    if not content:
        return None
    if content.endswith(":completed"):
        tool_name = content[: -len(":completed")].strip()
        return {
            "kind": "tool_done",
            "tool": tool_name,
            "text": f"{tool_name} 完成",
        }
    parts = content.split(None, 1)
    tool_name = parts[0] if parts else "tool"
    detail = parts[1].strip() if len(parts) > 1 else ""
    if detail and ("/" in detail or "\\" in detail or "." in detail):
        detail = _short_display_path(detail)
    text = tool_name if not detail else f"{tool_name} · {detail}"
    return {
        "kind": "tool",
        "tool": tool_name,
        "detail": detail,
        "text": text[:LIVE_DISPLAY_LINE_MAX],
    }


def _parse_raw_json_log_entry(time_hms: str, body: str) -> dict[str, Any] | None:
    if "[raw]" not in body:
        return None
    raw_json = body.split("[raw]", 1)[-1].strip()
    if not raw_json.startswith("{"):
        return None
    try:
        event = json.loads(raw_json)
    except json.JSONDecodeError:
        return None
    if not isinstance(event, dict):
        return None

    etype = str(event.get("type") or "")
    if etype == "tool_call":
        return None
    if etype == "assistant":
        return None
    if etype == "thinking":
        return None
    if etype == "result":
        subtype = str(event.get("subtype") or "unknown")
        metrics = _metrics_from_cli_result_event(event)
        duration_ms = int(metrics.get("duration_ms") or 0)
        tokens_used = int(metrics.get("tokens_used") or 0)
        dur_hint = f" · {duration_ms // 1000}s" if duration_ms > 0 else ""
        token_hint = f" · {tokens_used} tk" if tokens_used > 0 else ""
        session_id = str(metrics.get("session_id") or "").strip()
        if subtype == "success":
            entry: dict[str, Any] = {
                "kind": "result",
                "time": time_hms,
                "text": f"本轮 Agent 完成{dur_hint}{token_hint}",
                "status": "ok",
            }
        else:
            entry = {
                "kind": "result",
                "time": time_hms,
                "text": f"本轮结束：{subtype}{dur_hint}{token_hint}",
                "status": "fail",
            }
        if duration_ms > 0:
            entry["duration_ms"] = duration_ms
        if tokens_used > 0:
            entry["tokens_used"] = tokens_used
            entry["total_tokens"] = tokens_used
        if session_id:
            entry["session_id"] = session_id
        usage = metrics.get("usage")
        if isinstance(usage, dict) and usage:
            entry["usage"] = usage
        return entry
    if etype == "system":
        model = str(event.get("model") or "").strip()
        label = f"会话初始化 · {model}" if model else "会话初始化"
        return {"kind": "system", "time": time_hms, "text": label}
    return None


def _parse_cli_log_entry(line: str) -> dict[str, Any] | None:
    time_hms, body = _split_log_timestamp(line)
    if not body:
        return None

    if "[cursor-think]" in body:
        text = body.split("[cursor-think]", 1)[-1].strip()
        if not text:
            return None
        return {"kind": "think", "time": time_hms, "text": text[:800]}

    if "[cursor-output]" in body:
        text = body.split("[cursor-output]", 1)[-1].strip()
        if not text:
            return None
        if text == "result:success":
            return {"kind": "success", "time": time_hms, "text": "Agent 输出完成"}
        if text.startswith("result:"):
            return {"kind": "result", "time": time_hms, "text": text, "status": "ok"}
        return {"kind": "output", "time": time_hms, "text": text[:LIVE_DISPLAY_LINE_MAX]}

    tool_entry = _parse_tool_log_body(body)
    if tool_entry:
        tool_entry["time"] = time_hms
        return tool_entry

    if "[stderr]" in body:
        text = body.split("[stderr]", 1)[-1].strip()
        if not text:
            return None
        return {"kind": "error", "time": time_hms, "text": text[:400]}

    raw_entry = _parse_raw_json_log_entry(time_hms, body)
    if raw_entry:
        return raw_entry

    if body.startswith("===") or body.startswith("--- Cursor"):
        return {"kind": "meta", "time": time_hms, "text": body[:240]}
    if body.startswith(("代码目录:", "函数级方案:", "验收标准:", "日志文件:", "命令:", "模式:", "会话:")):
        return {"kind": "meta", "time": time_hms, "text": body[:240]}
    if "任务执行成功" in body:
        return {"kind": "success", "time": time_hms, "text": "任务执行成功"}
    if "任务执行失败" in body:
        return {"kind": "error", "time": time_hms, "text": body[:300]}
    return None


def _merge_consecutive_think_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    think_buf = ""
    think_time = ""
    for entry in entries:
        if entry.get("kind") == "think":
            think_buf += str(entry.get("text") or "")
            if not think_time:
                think_time = str(entry.get("time") or "")
            continue
        if think_buf:
            merged.append(
                {
                    "kind": "think",
                    "time": think_time,
                    "text": think_buf[:1200],
                }
            )
            think_buf = ""
            think_time = ""
        merged.append(entry)
    if think_buf:
        merged.append({"kind": "think", "time": think_time, "text": think_buf[:1200]})
    return merged


def _entry_to_display_line(entry: dict[str, Any]) -> str:
    prefix = f"[{entry.get('time')}] " if entry.get("time") else ""
    kind = str(entry.get("kind") or "")
    text = str(entry.get("text") or "")
    if kind == "tool":
        return f"{prefix}🔧 {text}"
    if kind == "tool_done":
        return f"{prefix}✓ {text}"
    if kind == "think":
        return f"{prefix}💭 {text}"
    if kind == "output":
        return f"{prefix}📝 {text}"
    if kind == "system":
        return f"{prefix}⚙ {text}"
    if kind in ("success", "result") and entry.get("status") != "fail":
        return f"{prefix}✅ {text}"
    if kind == "error" or entry.get("status") == "fail":
        return f"{prefix}✗ {text}"
    return f"{prefix}{text}"


def _collapse_tool_pairs(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """将 ``tool`` + ``tool_done`` 合并为单条带完成态的工具记录。"""
    merged: list[dict[str, Any]] = []
    pending: dict[str, int] = {}
    for entry in entries:
        kind = str(entry.get("kind") or "")
        if kind == "tool":
            tool_name = str(entry.get("tool") or "")
            merged.append({**entry, "status": "running"})
            if tool_name:
                pending[tool_name] = len(merged) - 1
            continue
        if kind == "tool_done":
            tool_name = str(entry.get("tool") or "")
            idx = pending.pop(tool_name, None)
            if idx is not None:
                row = merged[idx]
                row["status"] = "ok"
                row["text"] = f"{row.get('text') or tool_name} · 完成"
            else:
                merged.append(entry)
            continue
        merged.append(entry)
    return merged


def _parse_cli_log_entries(raw_lines: list[str]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for line in raw_lines:
        entry = _parse_cli_log_entry(line)
        if entry:
            entries.append(entry)
    entries = _merge_consecutive_think_entries(entries)
    entries = _collapse_tool_pairs(entries)
    if len(entries) > LIVE_TAIL_MAX_LINES:
        entries = entries[-LIVE_TAIL_MAX_LINES:]
    return entries


def _format_live_log_display_lines(raw_lines: list[str]) -> tuple[list[str], list[dict[str, Any]]]:
    entries = _parse_cli_log_entries(raw_lines)
    lines = [_entry_to_display_line(entry) for entry in entries]
    return lines, entries


def read_task_exec_live_tail(
    scope_id: str,
    *,
    max_bytes: int = LIVE_TAIL_MAX_BYTES,
    max_lines: int = LIVE_TAIL_MAX_LINES,
    log_path: str = "",
) -> dict[str, Any]:
    """读取 CLI 日志尾部，供前端轮询展示结构化实时输出。"""
    resolved_path = (log_path or "").strip()
    progress_updated = ""
    if not resolved_path:
        payload = load_task_exec_payload(scope_id)
        if not isinstance(payload, dict):
            return {"path": "", "lines": [], "entries": [], "updated_at": ""}
        progress = payload.get("progress") if isinstance(payload.get("progress"), dict) else {}
        resolved_path = str(progress.get("live_log_path") or "").strip()
        progress_updated = str(progress.get("updated_at") or "")
    if not resolved_path:
        return {"path": "", "lines": [], "entries": [], "updated_at": progress_updated}
    path = Path(resolved_path)
    raw_lines = _tail_log_file(path, max_bytes=max_bytes, max_lines=max_lines * 4)
    lines, entries = _format_live_log_display_lines(raw_lines)
    return {
        "path": resolved_path,
        "lines": lines,
        "entries": entries,
        "updated_at": progress_updated,
        "line_count": len(entries),
    }


def render_task_exec_report_markdown(data: dict[str, Any]) -> str:
    lines = [
        "# 任务执行记录",
        "",
        f"- CLI 工具：{data.get('cli_tool') or '—'}",
        f"- CLI 模型：{data.get('cli_model_label') or data.get('cli_model') or '—'}",
        f"- 总体状态：{data.get('status') or '—'}",
    ]
    if str(data.get("status") or "") in ("agent_cli_missing", "agent_cli_login_required"):
        agent_cli = data.get("agent_cli") if isinstance(data.get("agent_cli"), dict) else {}
        lines.extend(
            [
                "",
                "## Cursor Agent CLI 未安装",
                "",
                str(agent_cli.get("install_hint") or data.get("error") or "请先安装 agent CLI 后重新执行任务执行节点。"),
                "",
            ]
        )
        return "\n".join(lines)
    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    lines.extend(
        [
            f"- 子单总数：{summary.get('total', 0)}",
            f"- 成功：{summary.get('ok', 0)}",
            f"- Token 合计：{summary.get('total_tokens', 0)}",
            f"- 耗时合计：{summary.get('total_duration_sec', 0)}s",
            "",
            "## 子单明细",
            "",
        ]
    )
    for task in data.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        lines.append(f"### {task.get('task_no')} {task.get('task_title') or ''}".strip())
        lines.append(f"- 状态：{task.get('status')}")
        lines.append(f"- 沙箱路径：{task.get('sandbox_path') or '—'}")
        lines.append(f"- 目标：{task.get('goal') or '—'}")
        cov = task.get("coverage") if isinstance(task.get("coverage"), list) else []
        if cov:
            lines.append(f"- 功能覆盖：{', '.join(str(x) for x in cov)}")
        duration_ms = int(task.get("duration_ms") or 0)
        duration_label = (
            f"{duration_ms // 1000}s ({duration_ms}ms)"
            if duration_ms > 0
            else f"{task.get('duration_seconds', 0)}s"
        )
        lines.append(f"- Token：{task.get('tokens_used', 0)} · 耗时：{duration_label}")
        if task.get("session_id"):
            lines.append(f"- CLI session：{task.get('session_id')}")
        usage = task.get("usage") if isinstance(task.get("usage"), dict) else {}
        if usage:
            lines.append(
                "- Token 明细："
                f" input={usage.get('input_tokens', 0)}"
                f" output={usage.get('output_tokens', 0)}"
                f" cache_read={usage.get('cache_read_tokens', 0)}"
            )
        if task.get("error"):
            lines.append(f"- 错误：{task['error']}")
        if task.get("commit_summary"):
            lines.append(f"- 提交摘要：{task.get('commit_summary')}")
        lines.append("")
    return "\n".join(lines)
