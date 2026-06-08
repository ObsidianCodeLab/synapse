"""自动拆单：从 userwork 与研发云门户同步研发子单清单。"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Literal, TypeVar

from synapse.rd_meeting.product_assets import _now_iso
from synapse.rd_meeting.userwork_sync import _load_userwork_list, _scope_row

logger = logging.getLogger(__name__)

ScopeType = Literal["demand", "task"]

_T = TypeVar("_T")


def _run_coroutine_sync(factory: Callable[[], Coroutine[Any, Any, _T]]) -> _T:
    """在同步代码中执行协程；若当前线程已有事件循环则在独立线程内 asyncio.run。"""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(factory())
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(lambda: asyncio.run(factory())).result()


def _norm_id(raw: str) -> str:
    from synapse.api.routes.dev_iwhalecloud import _snapshot_norm_id

    return _snapshot_norm_id(raw)


def _resolve_demand_no(scope_type: ScopeType, scope_id: str) -> str:
    sid = _norm_id(scope_id)
    if scope_type == "demand":
        return sid
    row = _scope_row(scope_type, scope_id)
    if row:
        dn = _norm_id(str(row.get("demand_no") or ""))
        if dn:
            return dn
    return sid


def _local_owned_tasks(demand_no: str) -> list[dict[str, Any]]:
    dn = _norm_id(demand_no)
    for demand in _load_userwork_list():
        if _norm_id(str(demand.get("demand_no") or "")) != dn:
            continue
        owned = demand.get("owned_work_items")
        if not isinstance(owned, list):
            return []
        return [t for t in owned if isinstance(t, dict)]
    return []


async def _fetch_portal_task_nos_async(demand_no: str) -> tuple[list[str], str]:
    """调用研发云 ai-gateway 任务列表 API，返回 (taskNo 列表, 错误说明)。"""
    from synapse.api.routes.dev_iwhalecloud import (
        GetTaskListFromDemandRequest,
        _get_task_list_from_demand,
    )

    try:
        resp = await _get_task_list_from_demand(GetTaskListFromDemandRequest(demandNo=demand_no))
    except Exception as exc:
        logger.warning("auto_split portal fetch failed demand=%s: %s", demand_no, exc)
        return [], f"门户 API 异常: {exc}"

    if not isinstance(resp, dict):
        return [], "门户 API 返回格式无效"
    if resp.get("errorcode") not in (None, 0):
        err = resp.get("message")
        if not err and isinstance(resp.get("data"), dict):
            err = resp["data"].get("error")
        return [], str(err or "门户 API 失败")

    data = resp.get("data")
    if not isinstance(data, list):
        return [], "门户 API data 非列表"

    nos: list[str] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        tn = str(row.get("taskNo") or "").strip()
        if tn:
            nos.append(tn)
    return nos, ""


def _fetch_portal_task_nos(demand_no: str) -> tuple[list[str], str]:
    """同步入口：会议室 pipeline 在已有事件循环中调用。"""
    return _run_coroutine_sync(lambda: _fetch_portal_task_nos_async(demand_no))


def _load_split_plan_tasks(scope_id: str) -> list[dict[str, Any]]:
    from synapse.rd_meeting.solution_review import load_split_plan

    plan = load_split_plan(scope_id)
    if not isinstance(plan, dict):
        return []
    tasks = plan.get("tasks")
    if not isinstance(tasks, list):
        return []
    return [dict(t) for t in tasks if isinstance(t, dict)]


def bootstrap_auto_split(
    scope_type: ScopeType,
    scope_id: str,
) -> dict[str, Any]:
    """汇总本地 userwork 子单与门户任务列表，生成拆单摘要。"""
    sid = (scope_id or "").strip()
    demand_no = _resolve_demand_no(scope_type, sid)
    split_plan_tasks = _load_split_plan_tasks(sid)
    result: dict[str, Any] = {
        "scope_type": scope_type,
        "scope_id": sid,
        "demand_no": demand_no,
        "split_plan_tasks": split_plan_tasks,
        "local_tasks": [],
        "portal_task_nos": [],
        "portal_error": "",
        "status": "ok",
        "errors": [],
        "materialized_at": _now_iso(),
    }

    if not sid or not demand_no:
        result["status"] = "failed"
        result["errors"].append("scope_id 或 demand_no 为空")
        return result

    local = _local_owned_tasks(demand_no)
    result["local_tasks"] = [
        {
            "task_no": str(t.get("task_no") or ""),
            "task_title": str(t.get("task_title") or ""),
            "sop_node": str(t.get("sop_node") or ""),
            "local_process_state": str(t.get("local_process_state") or ""),
        }
        for t in local
    ]

    portal_nos, portal_err = _fetch_portal_task_nos(demand_no)
    result["portal_task_nos"] = portal_nos
    result["portal_error"] = portal_err

    local_nos = {_norm_id(str(t.get("task_no") or "")) for t in local if t.get("task_no")}
    portal_norm = {_norm_id(n) for n in portal_nos}
    only_portal = sorted(portal_norm - local_nos - {""})
    only_local = sorted(local_nos - portal_norm - {""})

    result["only_in_portal"] = only_portal
    result["only_in_local"] = only_local

    if portal_err and not local:
        result["status"] = "failed"
        result["errors"].append(portal_err)
    elif portal_err:
        result["status"] = "partial"
        result["errors"].append(portal_err)
    elif not local and not portal_nos:
        result["status"] = "partial"
        result["errors"].append("本地与门户均无研发子单，请确认需求单是否已拆分")

    return result


def format_auto_split_report(assets: dict[str, Any], *, node_name: str) -> str:
    """生成 ``研发子单拆分清单.md`` 正文。"""
    lines = [
        f"# {node_name} — 研发子单拆分清单",
        "",
        "本节点由系统脚本执行（userwork + 研发云门户同步），未调用大模型与人工确认。",
        "",
        f"- **需求单号**：{assets.get('demand_no') or '—'}",
        f"- **同步时间**：{assets.get('materialized_at') or '—'}",
        f"- **总体状态**：{assets.get('status') or '—'}",
        "",
        "## 本地 userwork 子单",
        "",
    ]
    local = assets.get("local_tasks") if isinstance(assets.get("local_tasks"), list) else []
    if not local:
        lines.append("（无）")
    else:
        for row in local:
            if not isinstance(row, dict):
                continue
            lines.append(
                f"- **{row.get('task_no') or '—'}** {row.get('task_title') or ''} "
                f"— sop={row.get('sop_node') or '—'} / {row.get('local_process_state') or '—'}"
            )

    portal = assets.get("portal_task_nos") if isinstance(assets.get("portal_task_nos"), list) else []
    lines.extend(["", "## 门户任务列表", ""])
    if assets.get("portal_error"):
        lines.append(f"（门户同步失败：{assets.get('portal_error')}）")
    elif not portal:
        lines.append("（无）")
    else:
        for tn in portal:
            lines.append(f"- {tn}")

    only_p = assets.get("only_in_portal") or []
    only_l = assets.get("only_in_local") or []
    if only_p or only_l:
        lines.extend(["", "## 差异", ""])
        if only_p:
            lines.append(f"- 仅门户：{', '.join(only_p)}")
        if only_l:
            lines.append(f"- 仅本地：{', '.join(only_l)}")

    plan_tasks = assets.get("split_plan_tasks") if isinstance(assets.get("split_plan_tasks"), list) else []
    lines.extend(["", "## 方案评审拆单计划（split_plan.json）", ""])
    if not plan_tasks:
        lines.append("（无 — 须先通过方案评审并落盘 split_plan.json）")
    else:
        for row in plan_tasks:
            if not isinstance(row, dict):
                continue
            lines.append(
                f"- **{row.get('taskTitle') or '—'}** "
                f"模块={row.get('productModuleName') or '—'} "
                f"分支={row.get('branchVersionName') or '—'} "
                f"补丁={row.get('patchName') or '—'}"
            )

    lines.extend(
        [
            "",
            "## 结论",
            "",
            "自动拆单已完成：已汇总本地与门户研发子单，可进入沙箱构建等后续节点。",
            "",
        ]
    )
    return "\n".join(lines)
