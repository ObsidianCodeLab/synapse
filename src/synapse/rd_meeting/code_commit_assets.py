"""代码提交系统节点：特性分支提交并收集试飞结果。"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from synapse.rd_meeting.product_assets import _run_git
from synapse.rd_meeting.system_node_display import _load_pipeline_context_asset

logger = logging.getLogger(__name__)

_FLIGHT_POLL_INTERVAL_SEC = 15
_FLIGHT_POLL_MAX_WAIT_SEC = 600


def _sandbox_repos(scope_id: str) -> list[dict[str, Any]]:
    assets = _load_pipeline_context_asset(scope_id, "sandbox_assets") or {}
    repos = assets.get("repos")
    if isinstance(repos, list):
        return [r for r in repos if isinstance(r, dict) and r.get("status") == "ok"]
    return []


def _commit_and_push_repo(repo: dict[str, Any], *, commit_message: str) -> dict[str, Any]:
    local_path = str(repo.get("local_path") or "").strip()
    repo_name = str(repo.get("repo_name") or local_path or "repo")
    entry: dict[str, Any] = {
        "repo_name": repo_name,
        "local_path": local_path,
        "status": "skipped",
        "commit_hash": "",
        "push_detail": "",
        "error": "",
    }
    if not local_path:
        entry["status"] = "failed"
        entry["error"] = "缺少沙箱本地路径"
        return entry

    ok, detail = _run_git(["git", "-C", local_path, "add", "-A"], timeout=120.0)
    if not ok:
        entry["status"] = "failed"
        entry["error"] = detail or "git add 失败"
        return entry

    ok, detail = _run_git(
        ["git", "-C", local_path, "commit", "-m", commit_message],
        timeout=120.0,
    )
    if not ok and "nothing to commit" not in (detail or "").lower():
        entry["status"] = "failed"
        entry["error"] = detail or "git commit 失败"
        return entry

    ok_hash, hash_detail = _run_git(["git", "-C", local_path, "rev-parse", "HEAD"], timeout=30.0)
    if ok_hash:
        entry["commit_hash"] = (hash_detail or "").strip()

    branch = str(repo.get("repo_branch") or "").strip() or "HEAD"
    ok, detail = _run_git(
        ["git", "-C", local_path, "push", "origin", branch],
        timeout=300.0,
    )
    entry["push_detail"] = detail or ""
    if not ok:
        entry["status"] = "failed"
        entry["error"] = detail or "git push 失败"
        return entry

    entry["status"] = "ok"
    return entry


async def _fetch_flight_build_status(task_id: str) -> dict[str, Any]:
    from synapse.api.routes.dev_iwhalecloud import (
        GetCiFlowBuildStatusRequest,
        get_ci_flow_build_status,
    )

    try:
        resp = await get_ci_flow_build_status(GetCiFlowBuildStatusRequest(taskId=task_id))
        return resp if isinstance(resp, dict) else {"errorcode": -1, "message": "invalid response"}
    except Exception as exc:
        logger.warning("fetch flight build status failed task=%s: %s", task_id, exc)
        return {"errorcode": -1, "message": str(exc)}


def _summarize_flight_status(resp: dict[str, Any]) -> dict[str, Any]:
    if resp.get("errorcode") != 0:
        return {
            "status": "failed",
            "error": str(resp.get("message") or resp.get("errormsg") or "获取试飞结果失败"),
            "flows": [],
        }

    data = resp.get("data") if isinstance(resp.get("data"), dict) else {}
    flows = data.get("flowBuildStatusList") if isinstance(data.get("flowBuildStatusList"), list) else []
    summary_rows: list[dict[str, Any]] = []
    overall = "ok"
    errors: list[str] = []

    for flow in flows:
        if not isinstance(flow, dict):
            continue
        state = str(flow.get("ciFlowInstRunState") or "").strip()
        state_desc = str(flow.get("ciFlowInstRunStateDesc") or _run_state_desc(state)).strip()
        row = {
            "ci_flow_id": flow.get("ciFlowId"),
            "ci_flow_inst_id": flow.get("ciFlowInstId"),
            "run_state": state,
            "run_state_desc": state_desc,
            "begin_date": flow.get("ciFlowInstBeginDate"),
            "end_date": flow.get("ciFlowInstEndDate"),
            "build_result": flow.get("buildResult") or [],
        }
        summary_rows.append(row)
        if state == "1":
            overall = "failed"
            errors.append(state_desc or "试飞构建失败")
        elif state not in ("0", "") and overall != "failed":
            overall = "pending"

    return {
        "status": overall,
        "error": "; ".join(errors),
        "flows": summary_rows,
    }


def _run_state_desc(state: str) -> str:
    if state == "0":
        return "构建成功"
    if state == "1":
        return "构建失败"
    return "构建中"


async def _wait_for_flight_result_async(task_id: str) -> dict[str, Any]:
    if not task_id:
        return {"status": "skipped", "error": "非任务单或无 taskId，跳过试飞轮询", "flows": []}

    deadline = time.monotonic() + _FLIGHT_POLL_MAX_WAIT_SEC
    last: dict[str, Any] = {"status": "pending", "error": "", "flows": []}

    while time.monotonic() < deadline:
        resp = await _fetch_flight_build_status(task_id)
        last = _summarize_flight_status(resp)
        if last.get("status") in ("ok", "failed"):
            return last
        await asyncio.sleep(_FLIGHT_POLL_INTERVAL_SEC)

    last.setdefault("error", "等待试飞结果超时")
    last["status"] = "timeout"
    return last


def _wait_for_flight_result(task_id: str) -> dict[str, Any]:
    return asyncio.run(_wait_for_flight_result_async(task_id))


def format_code_commit_report(assets: dict[str, Any], *, node_name: str = "代码提交") -> str:
    lines = [f"# {node_name}", ""]
    lines.append(f"- 状态：{assets.get('status') or '—'}")
    repos = assets.get("repos") or []
    if repos:
        lines.append(f"- 提交仓库数：{len(repos)}")
        for row in repos:
            if not isinstance(row, dict):
                continue
            lines.append(
                f"  - {row.get('repo_name')}: {row.get('status')} "
                f"(commit={row.get('commit_hash') or '—'})"
            )
    flight = assets.get("flight") if isinstance(assets.get("flight"), dict) else {}
    if flight:
        lines.append(f"- 试飞状态：{flight.get('status') or '—'}")
        if flight.get("error"):
            lines.append(f"- 试飞报错：{flight.get('error')}")
    if assets.get("error"):
        lines.append(f"- 错误：{assets.get('error')}")
    return "\n".join(lines) + "\n"


def bootstrap_code_commit(scope_id: str, *, scope_type: str, task_id: str = "") -> dict[str, Any]:
    """触发特性分支代码提交并等待试飞结果。"""
    sid = (scope_id or "").strip()
    repos = _sandbox_repos(sid)
    commit_message = f"feat: auto commit for {sid}"

    repo_results: list[dict[str, Any]] = []
    commit_errors: list[str] = []
    for repo in repos:
        row = _commit_and_push_repo(repo, commit_message=commit_message)
        repo_results.append(row)
        if row.get("status") == "failed":
            commit_errors.append(f"{row.get('repo_name')}: {row.get('error')}")

    flight_task_id = (task_id or sid).strip() if scope_type == "task" else ""
    flight_summary = _wait_for_flight_result(flight_task_id)

    status = "ok"
    if commit_errors:
        status = "failed"
    elif flight_summary.get("status") == "failed" or flight_summary.get("status") in (
        "timeout",
        "pending",
    ):
        status = "partial"

    return {
        "status": status,
        "error": "; ".join(commit_errors) or str(flight_summary.get("error") or ""),
        "repos": repo_results,
        "flight": flight_summary,
        "task_id": flight_task_id,
    }

