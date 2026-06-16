"""代码提交系统节点：按研发子单特性分支提交并收集试飞结果。"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import datetime
from typing import Any, Literal

from synapse.rd_meeting.product_assets import _run_git, resolve_sandbox_path_for_product_module
from synapse.rd_meeting.system_node_display import (
    _auto_split_context_for_bindings,
    build_code_commit_display,
    collect_task_rows,
)
from synapse.rd_meeting.task_exec import load_task_exec_payload
from synapse.rd_meeting.task_exec_code_diff import collect_repo_commit_stage_paths

logger = logging.getLogger(__name__)

ScopeType = Literal["demand", "task"]

_FLIGHT_POLL_INTERVAL_SEC = 15
_FLIGHT_POLL_MAX_WAIT_SEC = 600

CodeCommitPhase = Literal["prepare", "commit", "flight_poll", "archive", "done"]


def _code_commit_progress_snapshot(
    *,
    phase: CodeCommitPhase,
    message: str,
    task_index: int = 0,
    task_total: int = 0,
    task_no: str = "",
) -> dict[str, Any]:
    snap: dict[str, Any] = {
        "phase": phase,
        "message": message,
        "task_index": task_index,
        "task_total": task_total,
        "task_no": task_no,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    return snap


def _persist_code_commit_state(
    scope_id: str,
    assets: dict[str, Any],
    *,
    pipe: Any = None,
) -> None:
    from synapse.rd_meeting.paths import meeting_pipeline_path
    from synapse.rd_meeting.room_runtime import read_json_file, save_meeting_pipeline

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
    raw["updated_at"] = datetime.now().isoformat(timespec="seconds")
    save_meeting_pipeline(sid, raw)
    if pipe is not None:
        pctx = pipe._data.get("context")
        if not isinstance(pctx, dict):
            pctx = {}
        pctx["code_commit_assets"] = assets
        pipe._data["context"] = pctx


def _emit_code_commit_progress(
    scope_id: str,
    *,
    event: str,
    message: str,
    room_id: str,
    log_type: str = "info",
    display: dict[str, Any] | None = None,
    task_no: str = "",
    phase: CodeCommitPhase = "prepare",
    task_index: int = 0,
    task_total: int = 0,
) -> None:
    from synapse.rd_meeting.room_runtime import append_history_event

    payload: dict[str, Any] = {
        "event": event,
        "room_id": room_id,
        "node_id": "exception_check",
        "message": message,
        "flow_stage": "代码提交",
        "log_type": log_type,
        "agent_id": "system",
        "system_node": True,
        "phase": phase,
    }
    if task_no:
        payload["task_no"] = task_no
    if task_total:
        payload["task_index"] = task_index
        payload["task_total"] = task_total
    if isinstance(display, dict) and display:
        payload["display"] = display
    append_history_event(scope_id, payload)


def _resolve_overall_status(
    *,
    commit_errors: list[str],
    all_commits_ok: bool,
    commit_ok: int,
    flight_summary: dict[str, Any],
) -> str:
    if commit_errors and not all_commits_ok:
        return "failed"
    flight_st = str(flight_summary.get("status") or "").strip()
    if flight_st == "failed":
        return "partial" if commit_ok > 0 else "failed"
    if flight_st in ("timeout", "pending"):
        return "partial"
    return "ok"


def _git_toplevel(path: str) -> str:
    local = (path or "").strip()
    if not local:
        return ""
    ok, detail = _run_git(["git", "-C", local, "rev-parse", "--show-toplevel"], timeout=30.0)
    return (detail or local).strip() if ok else local


def _build_commit_message(feature_id: str, summary: str) -> str:
    branch = (feature_id or "").strip()
    body = " ".join((summary or "").split()).strip()
    if branch and body:
        return f"{branch} {body}"
    return branch or body or "auto commit"


def _commit_and_push(
    *,
    local_path: str,
    commit_message: str,
    feature_branch: str = "",
) -> dict[str, Any]:
    repo_root = _git_toplevel(local_path)
    entry: dict[str, Any] = {
        "local_path": repo_root or local_path,
        "status": "skipped",
        "commit_hash": "",
        "commit_message": commit_message,
        "push_detail": "",
        "error": "",
    }
    if not repo_root:
        entry["status"] = "failed"
        entry["error"] = "缺少沙箱本地路径"
        return entry

    ok, detail, stage_paths = collect_repo_commit_stage_paths(repo_root)
    if not ok:
        entry["status"] = "failed"
        entry["error"] = detail or "git status 失败"
        return entry

    if stage_paths:
        ok, detail = _run_git(
            ["git", "-C", repo_root, "add", "--", *stage_paths],
            timeout=120.0,
        )
        if not ok:
            entry["status"] = "failed"
            entry["error"] = detail or "git add 失败"
            return entry

    ok, detail = _run_git(
        ["git", "-C", repo_root, "commit", "-m", commit_message],
        timeout=120.0,
    )
    if not ok and "nothing to commit" not in (detail or "").lower():
        entry["status"] = "failed"
        entry["error"] = detail or "git commit 失败"
        return entry

    ok_hash, hash_detail = _run_git(["git", "-C", repo_root, "rev-parse", "HEAD"], timeout=30.0)
    if ok_hash:
        entry["commit_hash"] = (hash_detail or "").strip()

    branch = (feature_branch or "").strip() or "HEAD"
    ok, detail = _run_git(
        ["git", "-C", repo_root, "push", "origin", branch],
        timeout=300.0,
    )
    entry["push_detail"] = detail or ""
    if not ok:
        entry["status"] = "failed"
        entry["error"] = detail or "git push 失败"
        return entry

    entry["status"] = "ok"
    return entry


def _normalize_build_results(raw_items: list[Any]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        attachments = item.get("attachments")
        if isinstance(attachments, list) and attachments:
            for att in attachments:
                if not isinstance(att, dict):
                    continue
                result_type = str(att.get("resultType") or item.get("nodeName") or "检查项").strip()
                result_msg = str(
                    att.get("attachmentDesc")
                    or att.get("path")
                    or att.get("fullPath")
                    or item.get("url")
                    or item.get("runResult")
                    or ""
                ).strip()
                if result_type or result_msg:
                    rows.append({"resultType": result_type, "resultMsg": result_msg})
            continue
        result_type = str(item.get("resultType") or item.get("nodeName") or "检查项").strip()
        result_msg = str(
            item.get("resultMsg")
            or item.get("url")
            or item.get("runResult")
            or ""
        ).strip()
        if result_type or result_msg:
            rows.append({"resultType": result_type, "resultMsg": result_msg})
    return rows


def _flight_status_from_run_state(state: str) -> str:
    s = (state or "").strip()
    if s == "0":
        return "ok"
    if s == "1":
        return "failed"
    if s in ("-1", ""):
        return "pending"
    return "pending"


def _run_state_desc(state: str) -> str:
    s = (state or "").strip()
    if s == "0":
        return "构建成功"
    if s == "1":
        return "构建失败"
    return "构建中"


def _normalize_flight_data(resp: dict[str, Any]) -> dict[str, Any]:
    if resp.get("errorcode") != 0:
        return {
            "status": "failed",
            "error": str(resp.get("message") or resp.get("errormsg") or "获取试飞结果失败"),
            "data": {},
        }

    data = resp.get("data") if isinstance(resp.get("data"), dict) else {}
    run_state = str(data.get("ciFlowInstRunState") or "").strip()
    status = _flight_status_from_run_state(run_state)
    build_result = _normalize_build_results(data.get("buildResult") or [])
    normalized_data = {
        "taskId": data.get("taskId"),
        "ciFlowInstBeginDate": data.get("ciFlowInstBeginDate"),
        "ciFlowInstEndDate": data.get("ciFlowInstEndDate"),
        "ciFlowInstRunState": run_state,
        "ciFlowInstRunStateDesc": str(data.get("ciFlowInstRunStateDesc") or _run_state_desc(run_state)),
        "buildResult": build_result,
    }
    error = ""
    if status == "failed":
        error = normalized_data["ciFlowInstRunStateDesc"] or "试飞构建失败"
    return {"status": status, "error": error, "data": normalized_data}


async def _fetch_flight_build_status(portal_task_id: int) -> dict[str, Any]:
    from synapse.api.routes.dev_iwhalecloud import (
        GetCiFlowBuildStatusRequest,
        get_ci_flow_build_status,
    )

    try:
        resp = await get_ci_flow_build_status(GetCiFlowBuildStatusRequest(taskId=portal_task_id))
        return resp if isinstance(resp, dict) else {"errorcode": -1, "message": "invalid response"}
    except Exception as exc:
        logger.warning("fetch flight build status failed task=%s: %s", portal_task_id, exc)
        return {"errorcode": -1, "message": str(exc)}


async def _wait_for_flight_result_async(
    portal_task_id: int,
    *,
    on_poll: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    if not portal_task_id:
        return {"status": "skipped", "error": "缺少 portal taskId，跳过试飞轮询", "data": {}}

    deadline = time.monotonic() + _FLIGHT_POLL_MAX_WAIT_SEC
    last: dict[str, Any] = {"status": "pending", "error": "", "data": {}}

    while time.monotonic() < deadline:
        resp = await _fetch_flight_build_status(portal_task_id)
        last = _normalize_flight_data(resp)
        if on_poll:
            on_poll(last)
        if last.get("status") in ("ok", "failed"):
            return last
        await asyncio.sleep(_FLIGHT_POLL_INTERVAL_SEC)

    last.setdefault("error", "等待试飞结果超时")
    last["status"] = "timeout"
    if on_poll:
        on_poll(last)
    return last


def _wait_for_flight_result(
    portal_task_id: int,
    *,
    on_poll: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    return asyncio.run(_wait_for_flight_result_async(portal_task_id, on_poll=on_poll))


def _int_portal_task_id(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        value = int(str(raw).strip())
        return value if value > 0 else None
    except (TypeError, ValueError):
        return None


async def _resolve_portal_task_id_async(task_no: str) -> int | None:
    task_no = (task_no or "").strip()
    if not task_no:
        return None
    import httpx

    from synapse.api.routes.dev_iwhalecloud import _gateway_api_task_owner_and_id, _headers

    bearer = _headers().get("Authorization") or ""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            _, task_id = await _gateway_api_task_owner_and_id(client, task_no, bearer)
    except Exception as exc:
        logger.warning("resolve portal taskId failed task_no=%s: %s", task_no, exc)
        return None
    return _int_portal_task_id(task_id)


def _resolve_portal_task_id(task_no: str, cached: Any = None) -> int | None:
    found = _int_portal_task_id(cached)
    if found:
        return found
    return asyncio.run(_resolve_portal_task_id_async(task_no))


def _task_exec_index(scope_id: str) -> dict[str, dict[str, Any]]:
    payload = load_task_exec_payload(scope_id) or {}
    rows = payload.get("tasks") if isinstance(payload.get("tasks"), list) else []
    return {
        str(row.get("task_no") or "").strip(): row
        for row in rows
        if isinstance(row, dict) and str(row.get("task_no") or "").strip()
    }


def _collect_commit_orders(scope_type: ScopeType, scope_id: str) -> list[dict[str, Any]]:
    auto_ctx = _auto_split_context_for_bindings(scope_id)
    task_rows = collect_task_rows(auto_ctx)
    exec_by_no = _task_exec_index(scope_id)
    orders: list[dict[str, Any]] = []

    for row in task_rows:
        if str(row.get("create_status") or "") != "ok":
            continue
        task_no = str(row.get("task_no") or "").strip()
        if not task_no:
            continue
        exec_row = exec_by_no.get(task_no) or {}
        product_module = str(row.get("product_module_name") or "").strip()
        sandbox_path = str(exec_row.get("sandbox_path") or "").strip()
        if not sandbox_path:
            sandbox_path = resolve_sandbox_path_for_product_module(scope_type, scope_id, product_module)
        commit_summary = str(exec_row.get("commit_summary") or "").strip()
        if not commit_summary:
            commit_summary = str(row.get("comments") or row.get("task_desc") or row.get("task_title") or "").strip()
        feature_id = str(row.get("feature_id") or "").strip()
        portal_task_id = _resolve_portal_task_id(task_no, row.get("portal_task_id"))
        orders.append(
            {
                "task_no": task_no,
                "task_title": str(row.get("task_title") or "").strip(),
                "feature_id": feature_id,
                "portal_task_id": portal_task_id,
                "commit_summary": commit_summary[:500],
                "commit_message": _build_commit_message(feature_id, commit_summary),
                "sandbox_path": sandbox_path,
                "product_module": product_module,
            }
        )
    return orders


def _aggregate_flight_status(task_rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not task_rows:
        return {"status": "skipped", "error": "无试飞任务", "data": {}}

    statuses = []
    errors: list[str] = []
    for row in task_rows:
        flight = row.get("flight") if isinstance(row.get("flight"), dict) else {}
        st = str(flight.get("status") or "").strip()
        statuses.append(st)
        if flight.get("error"):
            errors.append(f"{row.get('task_no')}: {flight.get('error')}")

    if any(st == "failed" for st in statuses):
        overall = "failed"
    elif any(st in ("timeout", "pending") for st in statuses):
        overall = "timeout" if any(st == "timeout" for st in statuses) else "pending"
    elif all(st in ("ok", "skipped") for st in statuses) and any(st == "ok" for st in statuses):
        overall = "ok"
    elif all(st == "skipped" for st in statuses):
        overall = "skipped"
    else:
        overall = "partial"

    return {
        "status": overall,
        "error": "; ".join(errors),
        "tasks": [
            {
                "task_no": row.get("task_no"),
                "feature_id": row.get("feature_id"),
                "data": (row.get("flight") or {}).get("data") or {},
            }
            for row in task_rows
            if isinstance(row.get("flight"), dict)
        ],
    }


def format_code_commit_log_report(assets: dict[str, Any], *, node_name: str = "代码提交") -> str:
    lines = [f"# {node_name} — 提交日志", ""]
    lines.append(f"- 状态：{assets.get('status') or '—'}")
    summary = assets.get("summary") if isinstance(assets.get("summary"), dict) else {}
    if summary:
        lines.append(
            f"- 子单：{summary.get('total', 0)} · 提交成功 {summary.get('commit_ok', 0)} · "
            f"提交失败 {summary.get('commit_failed', 0)}"
        )
    for row in assets.get("tasks") or []:
        if not isinstance(row, dict):
            continue
        lines.append("")
        lines.append(f"## {row.get('task_no')} {row.get('task_title') or ''}".strip())
        lines.append(f"- 特性分支：{row.get('feature_id') or '—'}")
        lines.append(f"- 提交说明：{row.get('commit_message') or '—'}")
        lines.append(f"- 状态：{row.get('status') or '—'}")
        if row.get("commit_hash"):
            lines.append(f"- commit：{row.get('commit_hash')}")
        if row.get("sandbox_path"):
            lines.append(f"- 沙箱路径：{row.get('sandbox_path')}")
        if row.get("error"):
            lines.append(f"- 错误：{row.get('error')}")
    if assets.get("error"):
        lines.append("")
        lines.append(f"- 总体错误：{assets.get('error')}")
    return "\n".join(lines) + "\n"


def format_flight_result_report(assets: dict[str, Any], *, node_name: str = "试飞结果") -> str:
    lines = [f"# {node_name}", ""]
    flight = assets.get("flight") if isinstance(assets.get("flight"), dict) else {}
    lines.append(f"- 总体试飞状态：{flight.get('status') or assets.get('status') or '—'}")
    if flight.get("error"):
        lines.append(f"- 报错：{flight.get('error')}")

    for row in assets.get("tasks") or []:
        if not isinstance(row, dict):
            continue
        task_flight = row.get("flight") if isinstance(row.get("flight"), dict) else {}
        data = task_flight.get("data") if isinstance(task_flight.get("data"), dict) else {}
        lines.append("")
        lines.append(f"## {row.get('task_no')} · {row.get('feature_id') or '—'}")
        lines.append(f"- 试飞状态：{task_flight.get('status') or '—'}")
        if data:
            lines.append(f"- taskId：{data.get('taskId') or row.get('portal_task_id') or '—'}")
            lines.append(f"- 开始：{data.get('ciFlowInstBeginDate') or '—'}")
            lines.append(f"- 结束：{data.get('ciFlowInstEndDate') or '—'}")
            lines.append(
                f"- 构建状态：{data.get('ciFlowInstRunStateDesc') or data.get('ciFlowInstRunState') or '—'}"
            )
            build_result = data.get("buildResult") if isinstance(data.get("buildResult"), list) else []
            if build_result:
                lines.append("- 构建明细：")
                for item in build_result:
                    if not isinstance(item, dict):
                        continue
                    lines.append(
                        f"  - {item.get('resultType') or '检查项'}："
                        f"{str(item.get('resultMsg') or '')[:500]}"
                    )
        if task_flight.get("error"):
            lines.append(f"- 错误：{task_flight.get('error')}")
    return "\n".join(lines) + "\n"


def format_code_commit_report(assets: dict[str, Any], *, node_name: str = "代码提交") -> str:
    return format_code_commit_log_report(assets, node_name=node_name)


def write_code_commit_log_archive(
    scope_id: str,
    stage_name: str,
    assets: dict[str, Any],
) -> dict[str, Any] | None:
    from synapse.rd_meeting.paths import archive_node_dir

    dest = archive_node_dir(scope_id, stage_name, "exception_check")
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / "代码提交日志.md"
    path.write_text(format_code_commit_log_report(assets), encoding="utf-8")
    return {"name": "代码提交日志.md", "path": str(path)}


def write_flight_result_archive(
    scope_id: str,
    stage_name: str,
    assets: dict[str, Any],
) -> dict[str, Any] | None:
    from synapse.rd_meeting.paths import archive_node_dir

    dest = archive_node_dir(scope_id, stage_name, "exception_check")
    dest.mkdir(parents=True, exist_ok=True)
    path = dest / "试飞结果.md"
    path.write_text(format_flight_result_report(assets), encoding="utf-8")
    return {"name": "试飞结果.md", "path": str(path)}


def bootstrap_code_commit(
    scope_id: str,
    *,
    scope_type: ScopeType,
    room_id: str = "",
    pipe: Any = None,
    stage_name: str = "",
) -> dict[str, Any]:
    """按研发子单提交特性分支代码，并在全部提交成功后轮询试飞结果。"""
    sid = (scope_id or "").strip()
    orders = _collect_commit_orders(scope_type, sid)
    if not orders:
        return {
            "status": "failed",
            "error": "未找到可提交的研发子单，请先完成自动拆单与任务执行",
            "tasks": [],
            "flight": {"status": "skipped", "error": "", "data": {}},
            "summary": {"total": 0, "commit_ok": 0, "commit_failed": 0, "flight_ok": 0},
            "progress": _code_commit_progress_snapshot(
                phase="done",
                message="无可提交的研发子单",
            ),
            "archives": [],
        }

    task_total = len(orders)
    task_results: list[dict[str, Any]] = []
    commit_errors: list[str] = []
    archives: list[dict[str, Any]] = []
    rid = (room_id or "").strip()

    result_doc: dict[str, Any] = {
        "status": "running",
        "error": "",
        "tasks": task_results,
        "flight": {"status": "pending", "error": "", "data": {}},
        "summary": {"total": task_total, "commit_ok": 0, "commit_failed": 0, "flight_ok": 0},
        "progress": _code_commit_progress_snapshot(
            phase="prepare",
            message=f"准备提交 {task_total} 个研发子单",
            task_total=task_total,
        ),
        "archives": archives,
        "started_at": datetime.now().isoformat(timespec="seconds"),
        "finished_at": None,
    }
    _persist_code_commit_state(sid, result_doc, pipe=pipe)
    if rid:
        _emit_code_commit_progress(
            sid,
            event="code_commit_started",
            message=result_doc["progress"]["message"],
            room_id=rid,
            phase="prepare",
            task_total=task_total,
            display=build_code_commit_display(result_doc),
        )

    def _sync_running(
        *,
        phase: CodeCommitPhase,
        message: str,
        task_index: int = 0,
        task_no: str = "",
        tasks: list[dict[str, Any]] | None = None,
        flight: dict[str, Any] | None = None,
        summary: dict[str, Any] | None = None,
        status: str | None = None,
    ) -> None:
        result_doc["progress"] = _code_commit_progress_snapshot(
            phase=phase,
            message=message,
            task_index=task_index,
            task_total=task_total,
            task_no=task_no,
        )
        if tasks is not None:
            result_doc["tasks"] = tasks
        if flight is not None:
            result_doc["flight"] = flight
        if summary is not None:
            result_doc["summary"] = summary
        if status is not None:
            result_doc["status"] = status
        _persist_code_commit_state(sid, result_doc, pipe=pipe)

    for order_index, order in enumerate(orders):
        task_index = order_index + 1
        task_no = str(order.get("task_no") or "").strip()
        row: dict[str, Any] = {
            **order,
            "status": "pending",
            "commit_hash": "",
            "error": "",
            "flight": {"status": "pending", "error": "", "data": {}},
        }
        _sync_running(
            phase="commit",
            message=f"正在提交 {task_no}（{task_index}/{task_total}）",
            task_index=task_index,
            task_no=task_no,
            tasks=[*task_results, row],
        )

        sandbox_path = str(order.get("sandbox_path") or "").strip()
        feature_id = str(order.get("feature_id") or "").strip()
        if not sandbox_path:
            row["status"] = "skipped"
            row["error"] = "未匹配沙箱工程路径"
            task_results.append(row)
            commit_errors.append(f"{task_no}: 未匹配沙箱工程路径")
            continue
        if not feature_id:
            row["status"] = "skipped"
            row["error"] = "缺少 feature_id"
            task_results.append(row)
            commit_errors.append(f"{task_no}: 缺少 feature_id")
            continue

        commit_row = _commit_and_push(
            local_path=sandbox_path,
            commit_message=str(order.get("commit_message") or ""),
            feature_branch=feature_id,
        )
        row["commit_hash"] = commit_row.get("commit_hash") or ""
        row["local_path"] = commit_row.get("local_path") or sandbox_path
        if commit_row.get("status") == "ok":
            row["status"] = "ok"
        else:
            row["status"] = "failed"
            row["error"] = commit_row.get("error") or "git 提交失败"
            commit_errors.append(f"{task_no}: {row['error']}")
        task_results.append(row)

        commit_ok = sum(1 for t in task_results if t.get("status") == "ok")
        summary = {
            "total": task_total,
            "commit_ok": commit_ok,
            "commit_failed": sum(1 for t in task_results if t.get("status") == "failed"),
            "flight_ok": 0,
        }
        _sync_running(
            phase="commit",
            message=f"子单 {task_no} 提交{'成功' if row.get('status') == 'ok' else '失败'}",
            task_index=task_index,
            task_no=task_no,
            tasks=task_results,
            summary=summary,
        )
        if rid:
            _emit_code_commit_progress(
                sid,
                event="code_commit_task_done",
                message=f"子单 {task_no} 提交{'成功' if row.get('status') == 'ok' else '失败'}",
                room_id=rid,
                log_type="info" if row.get("status") == "ok" else "warning",
                phase="commit",
                task_index=task_index,
                task_total=task_total,
                task_no=task_no,
                display=build_code_commit_display(result_doc),
            )

    commit_ok = sum(1 for t in task_results if t.get("status") == "ok")
    all_commits_ok = commit_ok == len(task_results) and commit_ok > 0
    summary = {
        "total": task_total,
        "commit_ok": commit_ok,
        "commit_failed": sum(1 for t in task_results if t.get("status") == "failed"),
        "flight_ok": 0,
    }

    if stage_name:
        commit_art = write_code_commit_log_archive(sid, stage_name, result_doc)
        if commit_art:
            archives.append(commit_art)
            result_doc["archives"] = archives

    _sync_running(
        phase="flight_poll" if all_commits_ok else "archive",
        message=(
            f"全部 {commit_ok}/{task_total} 个子单提交完成，开始轮询试飞结果"
            if all_commits_ok
            else f"提交阶段结束（成功 {commit_ok}/{task_total}），跳过试飞"
        ),
        task_index=task_total if all_commits_ok else commit_ok,
        summary=summary,
        tasks=task_results,
    )
    if rid:
        _emit_code_commit_progress(
            sid,
            event="code_commit_phase_done",
            message=result_doc["progress"]["message"],
            room_id=rid,
            phase=result_doc["progress"]["phase"],
            task_total=task_total,
            display=build_code_commit_display(result_doc),
        )

    if all_commits_ok:
        for poll_index, row in enumerate(task_results, start=1):
            portal_task_id = _int_portal_task_id(row.get("portal_task_id"))
            task_no = str(row.get("task_no") or "").strip()
            if not portal_task_id:
                row["flight"] = {
                    "status": "skipped",
                    "error": "缺少 portal taskId，无法查询试飞",
                    "data": {},
                }
                continue

            _sync_running(
                phase="flight_poll",
                message=f"试飞轮询中：{task_no}（{poll_index}/{task_total}）",
                task_index=poll_index,
                task_no=task_no,
                tasks=task_results,
            )

            def _on_flight_poll(
                flight_row: dict[str, Any],
                *,
                target_row: dict[str, Any] = row,
                idx: int = poll_index,
                tno: str = task_no,
            ) -> None:
                target_row["flight"] = flight_row
                flight_summary = _aggregate_flight_status(task_results)
                flight_ok = sum(
                    1
                    for t in task_results
                    if isinstance(t.get("flight"), dict) and t["flight"].get("status") == "ok"
                )
                poll_summary = {
                    **summary,
                    "flight_ok": flight_ok,
                }
                poll_phase: CodeCommitPhase = "flight_poll"
                poll_message = f"试飞轮询中：{tno}"
                flight_st = str(flight_row.get("status") or "").strip()
                if flight_st in ("ok", "failed", "timeout", "skipped"):
                    poll_message = f"子单 {tno} 试飞{'成功' if flight_st == 'ok' else '结束'}"
                _sync_running(
                    phase=poll_phase,
                    message=poll_message,
                    task_index=idx,
                    task_no=tno,
                    tasks=task_results,
                    flight=flight_summary,
                    summary=poll_summary,
                )

            row["flight"] = _wait_for_flight_result(portal_task_id, on_poll=_on_flight_poll)

            flight_summary = _aggregate_flight_status(task_results)
            summary["flight_ok"] = sum(
                1
                for t in task_results
                if isinstance(t.get("flight"), dict) and t["flight"].get("status") == "ok"
            )
            _sync_running(
                phase="archive",
                message=f"子单 {task_no} 试飞结果已收集",
                task_index=poll_index,
                task_no=task_no,
                tasks=task_results,
                flight=flight_summary,
                summary=summary,
            )
            if stage_name:
                flight_art = write_flight_result_archive(sid, stage_name, result_doc)
                if flight_art:
                    archives = [a for a in archives if a.get("name") != flight_art.get("name")]
                    archives.append(flight_art)
                    result_doc["archives"] = archives
                    _persist_code_commit_state(sid, result_doc, pipe=pipe)
            if rid:
                _emit_code_commit_progress(
                    sid,
                    event="code_commit_flight_done",
                    message=f"子单 {task_no} 试飞结果已落盘",
                    room_id=rid,
                    log_type="info"
                    if row["flight"].get("status") == "ok"
                    else "warning",
                    phase="archive",
                    task_index=poll_index,
                    task_total=task_total,
                    task_no=task_no,
                    display=build_code_commit_display(result_doc),
                )
    else:
        for row in task_results:
            if row.get("status") != "ok":
                row["flight"] = {
                    "status": "skipped",
                    "error": "代码未提交成功，跳过试飞",
                    "data": {},
                }

    flight_summary = _aggregate_flight_status(task_results)
    summary = {
        "total": task_total,
        "commit_ok": commit_ok,
        "commit_failed": sum(1 for t in task_results if t.get("status") == "failed"),
        "flight_ok": sum(
            1
            for t in task_results
            if isinstance(t.get("flight"), dict) and t["flight"].get("status") == "ok"
        ),
    }
    status = _resolve_overall_status(
        commit_errors=commit_errors,
        all_commits_ok=all_commits_ok,
        commit_ok=commit_ok,
        flight_summary=flight_summary,
    )

    result_doc.update(
        {
            "status": status,
            "error": "; ".join(commit_errors) or str(flight_summary.get("error") or ""),
            "tasks": task_results,
            "flight": flight_summary,
            "summary": summary,
            "finished_at": datetime.now().isoformat(timespec="seconds"),
            "progress": _code_commit_progress_snapshot(
                phase="done",
                message="代码提交与试飞结果收集完成",
                task_index=task_total,
                task_total=task_total,
            ),
            "archives": archives,
        }
    )
    _persist_code_commit_state(sid, result_doc, pipe=pipe)
    if rid:
        _emit_code_commit_progress(
            sid,
            event="code_commit_finished",
            message=result_doc["progress"]["message"],
            room_id=rid,
            log_type="info" if status in ("ok", "partial") else "error",
            phase="done",
            task_total=task_total,
            display=build_code_commit_display(result_doc),
        )

    return result_doc


def write_code_commit_archives(
    scope_id: str,
    stage_name: str,
    assets: dict[str, Any],
) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    commit_art = write_code_commit_log_archive(scope_id, stage_name, assets)
    flight_art = write_flight_result_archive(scope_id, stage_name, assets)
    if commit_art:
        artifacts.append(commit_art)
    if flight_art:
        artifacts.append(flight_art)
    return artifacts
