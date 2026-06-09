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

from synapse.rd_meeting.cli_tools import DEFAULT_CLI_TOOL, is_cli_tool_implemented, normalize_cli_tool
from synapse.rd_meeting.config_store import load_meeting_room_config
from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path, scope_dir
from synapse.rd_meeting.room_runtime import read_json_file, write_json_file
from synapse.rd_meeting.system_node_display import (
    _auto_split_context_for_bindings,
    build_task_sandbox_bindings,
)
from synapse.rd_meeting.userwork_sync import patch_userwork_summary
from synapse.rd_sop.nodes import stage_name_for_id

logger = logging.getLogger(__name__)

NODE_ID = "task_exec"
DEV_STAGE_NAME = stage_name_for_id(4)
RESULT_JSON = "task_exec_result.json"
REPORT_MD = "任务执行记录.md"

ScopeType = Literal["demand", "task"]


def uses_task_exec_cli(node_id: str) -> bool:
    return (node_id or "").strip() == NODE_ID


def resolve_cli_tool_for_node(node_id: str = NODE_ID) -> str:
    cfg = load_meeting_room_config()
    overrides = cfg.get("node_overrides") if isinstance(cfg.get("node_overrides"), dict) else {}
    ov = overrides.get(node_id) if isinstance(overrides.get(node_id), dict) else {}
    return normalize_cli_tool(str(ov.get("cli_tool") or DEFAULT_CLI_TOOL))


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _cursor_operation_script() -> Path:
    return _repo_root() / "skills" / "whalecloud-dev-tool-development" / "scripts" / "cursor-operation.py"


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


def _pipeline_context(scope_id: str) -> dict[str, Any]:
    raw = read_json_file(meeting_pipeline_path(scope_id))
    if not isinstance(raw, dict):
        return {}
    ctx = raw.get("context")
    return ctx if isinstance(ctx, dict) else {}


def _save_task_exec_assets(scope_id: str, assets: dict[str, Any]) -> None:
    path = meeting_pipeline_path(scope_id)
    raw = read_json_file(path)
    if not isinstance(raw, dict):
        raw = {}
    ctx = raw.get("context") if isinstance(raw.get("context"), dict) else {}
    ctx["task_exec_assets"] = assets
    raw["context"] = ctx
    raw["updated_at"] = datetime.now().isoformat(timespec="seconds")
    write_json_file(path, raw)


def _collect_work_orders(scope_id: str) -> list[dict[str, Any]]:
    ctx = _pipeline_context(scope_id)
    auto_split = dict(ctx.get("auto_split_assets") or {})
    sandbox = dict(ctx.get("sandbox_assets") or {})
    env_assets = dict(ctx.get("env_pregen_assets") or {})

    plan_tasks = auto_split.get("split_plan_tasks")
    if not isinstance(plan_tasks, list) or not plan_tasks:
        plan_tasks = auto_split.get("local_tasks") or []

    auto_ctx = _auto_split_context_for_bindings(scope_id)
    if auto_ctx.get("split_plan_tasks"):
        plan_tasks = auto_ctx["split_plan_tasks"]

    wire_row = None
    prod = str(sandbox.get("prod") or env_assets.get("prod") or "").strip()
    if prod:
        from synapse.rd_meeting.product_context import load_prod_catalog_from_pipeline, match_prod_row_by_prod

        rows = load_prod_catalog_from_pipeline(scope_id)
        wire_row = match_prod_row_by_prod(rows, prod) if rows else None

    bindings = build_task_sandbox_bindings(
        {"split_plan_tasks": plan_tasks, "local_tasks": auto_split.get("local_tasks") or []},
        wire_row,
        sandbox,
    )

    orders: list[dict[str, Any]] = []
    for idx, binding in enumerate(bindings):
        if not isinstance(binding, dict):
            continue
        repos = binding.get("repos") if isinstance(binding.get("repos"), list) else []
        sandbox_path = ""
        for repo in repos:
            if isinstance(repo, dict) and repo.get("engineering_path"):
                sandbox_path = str(repo["engineering_path"])
                break
            if isinstance(repo, dict) and repo.get("local_path"):
                sandbox_path = str(repo["local_path"])
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
                "repos": repos,
                "match_status": str(binding.get("match_status") or ""),
                "product_module": str(binding.get("productModuleName") or binding.get("product_module_name") or ""),
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
    order: dict[str, Any],
    func_doc: str,
    accept_doc: str,
    human_suggestions: str,
) -> str:
    goal = str(order.get("goal") or order.get("task_title") or "完成功能点开发").strip()
    coverage = order.get("coverage") if isinstance(order.get("coverage"), list) else []
    cov_text = "、".join(str(x) for x in coverage if str(x).strip()) or "见函数级方案"
    lines = [
        "【任务执行 · 开发轮】",
        f"工单：{order.get('task_no')} {order.get('task_title') or ''}".strip(),
        f"任务目标：{goal}",
        f"功能覆盖范围：{cov_text}",
    ]
    if func_doc:
        lines.append(f"函数级方案文档：{func_doc}")
    if accept_doc:
        lines.append(f"验收标准文档：{accept_doc}")
    if human_suggestions.strip():
        lines.append(f"人工建议与补充：{human_suggestions.strip()}")
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
    order: dict[str, Any],
    func_doc: str,
    human_suggestions: str,
    develop_log_hint: str,
) -> str:
    goal = str(order.get("goal") or "").strip()
    coverage = order.get("coverage") if isinstance(order.get("coverage"), list) else []
    cov_text = "、".join(str(x) for x in coverage if str(x).strip()) or "见函数级方案"
    lines = [
        "【任务执行 · 完成检测轮】",
        "请对照任务目标、功能覆盖与函数级方案，检查刚才的开发是否已完成。",
        f"任务目标：{goal}",
        f"功能覆盖：{cov_text}",
    ]
    if func_doc:
        lines.append(f"函数级方案：{func_doc}")
    if human_suggestions.strip():
        lines.append(f"人工建议：{human_suggestions.strip()}")
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
            "## 遗留问题与风险",
            "## Token 与耗时估计（若无法精确统计可写「未知」）",
        ]
    )
    return "\n".join(lines)


def _parse_cursor_subprocess_output(stdout: str) -> dict[str, Any]:
    success = False
    log_path = ""
    for line in (stdout or "").splitlines():
        line = line.strip()
        if line.startswith("SYNAPSE_CURSOR_SUCCESS="):
            success = line.split("=", 1)[-1].strip() in ("1", "true", "True")
        elif line.startswith("SYNAPSE_CURSOR_LOG="):
            log_path = line.split("=", 1)[-1].strip()
    tokens = 0
    if log_path and Path(log_path).is_file():
        try:
            text = Path(log_path).read_text(encoding="utf-8", errors="replace")
            for pat in (r'"input_tokens"\s*:\s*(\d+)', r'"output_tokens"\s*:\s*(\d+)'):
                for m in re.finditer(pat, text):
                    tokens += int(m.group(1))
        except OSError:
            pass
    return {"success": success, "log_path": log_path, "tokens_used": tokens}


def _run_cursor_cli_round(
    *,
    code_path: str,
    target: str,
    func_doc: str,
    accept_doc: str,
    log_path: Path,
    timeout: int = 900,
    continue_session: bool = False,
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
    duration = int(time.monotonic() - started)
    stderr = (proc.stderr or "").strip()
    return {
        "status": "ok" if ok else "failed",
        "error": "" if ok else (stderr or proc.stdout or f"exit={proc.returncode}")[:2000],
        "duration_seconds": duration,
        "tokens_used": int(parsed.get("tokens_used") or 0),
        "log_path": str(parsed.get("log_path") or log_path),
        "exit_code": proc.returncode,
    }


def _extract_report_from_log(log_path: str) -> str:
    path = Path(log_path)
    if not path.is_file():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    chunks: list[str] = []
    for line in text.splitlines():
        if "[cursor-output]" in line:
            chunks.append(line.split("[cursor-output]", 1)[-1].strip())
    if chunks:
        return "\n".join(chunks[-40:])
    return text[-8000:] if len(text) > 8000 else text


def _infer_completion_status(report_md: str, develop_ok: bool) -> str:
    body = (report_md or "").lower()
    if "completed" in body or "完成状态" in report_md and "完成" in report_md:
        if "failed" in body or "失败" in report_md:
            return "failed"
        if "partial" in body or "部分" in report_md:
            return "partial"
        return "completed" if develop_ok else "partial"
    return "completed" if develop_ok else "failed"


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
    from synapse.api.routes.dev_iwhalecloud import _atomic_write_json_file, _owner_order_file_lock_path, _owner_order_file_name, _snapshot_norm_id
    from filelock import FileLock

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


def bootstrap_task_exec(
    scope_type: ScopeType,
    scope_id: str,
    *,
    cli_tool: str | None = None,
    human_suggestions: str = "",
) -> dict[str, Any]:
    """循环处理工单：CLI 开发 + 完成检测 + 持久化。"""
    sid = (scope_id or "").strip()
    tool = normalize_cli_tool(cli_tool or resolve_cli_tool_for_node(NODE_ID))
    if not is_cli_tool_implemented(tool):
        return {
            "status": "failed",
            "error": f"CLI 工具 {tool} 尚未接入",
            "cli_tool": tool,
            "tasks": [],
        }

    orders = _collect_work_orders(sid)
    if not orders:
        return {
            "status": "failed",
            "error": "未找到可执行的研发子单，请先完成自动拆单、沙箱构建与环境预生成",
            "cli_tool": tool,
            "tasks": [],
        }

    demand_no = _resolve_demand_no(scope_type, sid)
    work_dir = scope_dir(sid)
    log_root = work_dir / "agents" / NODE_ID / "cli_logs"
    log_root.mkdir(parents=True, exist_ok=True)

    task_rows: list[dict[str, Any]] = []
    total_tokens = 0
    total_duration = 0
    ok_count = 0

    for order in orders:
        sandbox_path = str(order.get("sandbox_path") or "").strip()
        row_base = {
            "task_no": order.get("task_no"),
            "task_title": order.get("task_title"),
            "goal": order.get("goal"),
            "coverage": order.get("coverage") or [],
            "sandbox_path": sandbox_path,
            "product_module": order.get("product_module"),
        }
        if not sandbox_path or not Path(sandbox_path).is_dir():
            row = {
                **row_base,
                "status": "skipped",
                "error": "未匹配沙箱工程路径",
                "tokens_used": 0,
                "duration_seconds": 0,
                "report_markdown": "",
            }
            task_rows.append(row)
            continue

        func_doc, accept_doc = _archive_doc_paths(sandbox_path)
        task_key = str(order.get("task_no") or order.get("index"))
        dev_log = log_root / f"{task_key}_develop.log"
        verify_log = log_root / f"{task_key}_verify.log"

        develop_prompt = build_task_develop_prompt(
            order=order,
            func_doc=func_doc,
            accept_doc=accept_doc,
            human_suggestions=human_suggestions,
        )
        dev_result = _run_cursor_cli_round(
            code_path=sandbox_path,
            target=develop_prompt,
            func_doc=func_doc,
            accept_doc=accept_doc,
            log_path=dev_log,
        )

        verify_prompt = build_task_verify_prompt(
            order=order,
            func_doc=func_doc,
            human_suggestions=human_suggestions,
            develop_log_hint=str(dev_log),
        )
        verify_result = _run_cursor_cli_round(
            code_path=sandbox_path,
            target=verify_prompt,
            func_doc=func_doc,
            accept_doc=accept_doc,
            log_path=verify_log,
            continue_session=True,
        )

        report_md = _extract_report_from_log(str(verify_result.get("log_path") or verify_log))
        completion = _infer_completion_status(report_md, dev_result.get("status") == "ok")
        status = "ok" if completion == "completed" and verify_result.get("status") == "ok" else (
            "partial" if completion == "partial" else "failed"
        )
        if status == "ok":
            ok_count += 1

        tokens = int(dev_result.get("tokens_used") or 0) + int(verify_result.get("tokens_used") or 0)
        duration = int(dev_result.get("duration_seconds") or 0) + int(verify_result.get("duration_seconds") or 0)
        total_tokens += tokens
        total_duration += duration

        row = {
            **row_base,
            "status": status,
            "completion": completion,
            "error": verify_result.get("error") or dev_result.get("error") or "",
            "tokens_used": tokens,
            "duration_seconds": duration,
            "develop_log": str(dev_log),
            "verify_log": str(verify_log),
            "report_markdown": report_md,
        }
        task_rows.append(row)

        patch_owned_work_item_task_exec(
            demand_no,
            str(order.get("task_no") or ""),
            status=status,
            sandbox_path=sandbox_path,
            tokens_used=tokens,
            duration_seconds=duration,
            report_excerpt=report_md[:500],
        )

    overall = "ok" if ok_count == len(task_rows) and ok_count > 0 else (
        "partial" if ok_count > 0 else "failed"
    )
    result_doc = {
        "cli_tool": tool,
        "started_at": datetime.now().isoformat(timespec="seconds"),
        "finished_at": datetime.now().isoformat(timespec="seconds"),
        "status": overall,
        "summary": {
            "total": len(task_rows),
            "ok": ok_count,
            "failed": sum(1 for t in task_rows if t.get("status") == "failed"),
            "skipped": sum(1 for t in task_rows if t.get("status") == "skipped"),
            "total_tokens": total_tokens,
            "total_duration_sec": total_duration,
        },
        "tasks": task_rows,
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


def load_task_exec_payload(scope_id: str) -> dict[str, Any] | None:
    data = _read_result(scope_id)
    if not isinstance(data, dict):
        return None
    return data


def render_task_exec_report_markdown(data: dict[str, Any]) -> str:
    summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
    lines = [
        "# 任务执行记录",
        "",
        f"- CLI 工具：{data.get('cli_tool') or '—'}",
        f"- 总体状态：{data.get('status') or '—'}",
        f"- 子单总数：{summary.get('total', 0)}",
        f"- 成功：{summary.get('ok', 0)}",
        f"- Token 合计：{summary.get('total_tokens', 0)}",
        f"- 耗时合计：{summary.get('total_duration_sec', 0)}s",
        "",
        "## 子单明细",
        "",
    ]
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
        lines.append(f"- Token：{task.get('tokens_used', 0)} · 耗时：{task.get('duration_seconds', 0)}s")
        if task.get("error"):
            lines.append(f"- 错误：{task['error']}")
        lines.append("")
    return "\n".join(lines)
