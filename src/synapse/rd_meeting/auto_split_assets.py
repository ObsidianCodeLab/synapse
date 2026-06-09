"""自动拆单：读 split_plan.json 调 create_task，并同步 userwork / 门户子单清单。"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Coroutine
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Literal, TypeVar

from synapse.rd_meeting.product_assets import _now_iso
from synapse.rd_meeting.userwork_sync import (
    _load_userwork_list,
    _scope_row,
    append_owned_work_items_to_demand,
)

ScopeType = Literal["demand", "task"]

logger = logging.getLogger(__name__)

_T = TypeVar("_T")

_CREATE_TASK_IMPACT_KEYS = (
    "performanceImpact",
    "functionalImpact",
    "cfgChangeDescription",
    "upgradeRisk",
    "securityImpact",
    "compatibilityImpact",
)


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


def _split_plan_row_to_create_request(
    row: dict[str, Any],
    demand_no: str,
) -> tuple[Any | None, str]:
    """将 split_plan.json 中单条 task 转为 CreateTaskRequest；失败返回 (None, 原因)。"""
    from synapse.api.routes.dev_iwhalecloud import CreateTaskRequest

    title = str(row.get("taskTitle") or "").strip()
    if not title:
        return None, "taskTitle 为空"

    patch = str(row.get("patchName") or "").strip()
    module = str(row.get("productModuleName") or "").strip()
    branch = str(row.get("branchVersionName") or "").strip()
    if not patch or not module or not branch:
        return None, "缺少 patchName / productModuleName / branchVersionName"

    impact_desc = str(row.get("taskImpactDesc") or "").strip() or "见方案评审影响评估"
    impacts = {k: str(row.get(k) or "").strip() or "无" for k in _CREATE_TASK_IMPACT_KEYS}

    project_id = row.get("projectId")
    pid: int | None = None
    if project_id is not None and str(project_id).strip() != "":
        try:
            pid = int(project_id)
        except (TypeError, ValueError):
            return None, f"projectId 无效: {project_id!r}"

    main_branch = str(row.get("mainBranchVersionTaskNo") or "").strip() or None

    return (
        CreateTaskRequest(
            taskNo=str(row.get("taskNo") or demand_no).strip() or demand_no,
            taskTitle=title,
            comments=str(row.get("comments") or "").strip() or title,
            projectId=pid,
            productModuleName=module,
            branchVersionName=branch,
            mainBranchVersionTaskNo=main_branch,
            patchName=patch,
            taskImpactDesc=impact_desc,
            **impacts,
        ),
        "",
    )


def _build_owned_work_item_from_create(
    req: Any,
    data: dict[str, Any] | None,
    task_no: str,
) -> dict[str, Any]:
    """create_task 响应 data → owned_work_items 单条（与门户快照字段一致）。"""
    row = data if isinstance(data, dict) else {}
    return {
        "task_no": str(row.get("task_no") or task_no).strip(),
        "task_title": str(row.get("task_title") or getattr(req, "taskTitle", "") or ""),
        "task_desc": str(row.get("task_desc") or getattr(req, "comments", "") or ""),
        "created_date": str(row.get("created_date") or ""),
        "sccb_work_hours": row.get("sccb_work_hours"),
        "state": "待处理",
        "product_module_id": row.get("product_module_id"),
        "product_module_name": str(
            row.get("product_module_name") or getattr(req, "productModuleName", "") or ""
        ),
        "repo_url": str(row.get("repo_url") or ""),
        "feature_id": str(row.get("feature_id") or "").strip(),
    }


async def _create_tasks_from_split_plan_async(
    demand_no: str,
    tasks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """逐条调用研发云 create_task。"""
    from synapse.api.routes.dev_iwhalecloud import create_task

    results: list[dict[str, Any]] = []
    for index, row in enumerate(tasks):
        title = str(row.get("taskTitle") or "").strip() or f"task-{index}"
        req, err = _split_plan_row_to_create_request(row, demand_no)
        if req is None:
            results.append(
                {
                    "index": index,
                    "taskTitle": title,
                    "status": "skipped",
                    "task_no": None,
                    "error": err,
                }
            )
            continue
        try:
            resp = await create_task(req)
        except Exception as exc:
            results.append(
                {
                    "index": index,
                    "taskTitle": req.taskTitle,
                    "status": "failed",
                    "task_no": None,
                    "error": str(exc),
                }
            )
            continue

        ok = isinstance(resp, dict) and resp.get("errorcode") in (None, 0)
        data = resp.get("data") if isinstance(resp, dict) else None
        task_no = data.get("task_no") if isinstance(data, dict) else None
        work_item = (
            _build_owned_work_item_from_create(req, data if isinstance(data, dict) else None, str(task_no))
            if ok and task_no
            else None
        )
        results.append(
            {
                "index": index,
                "taskTitle": req.taskTitle,
                "status": "ok" if ok else "failed",
                "task_no": task_no,
                "work_item": work_item,
                "error": None if ok else str(resp.get("message") or resp),
            }
        )
    return results


def _create_tasks_from_split_plan_sync(
    demand_no: str,
    tasks: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return _run_coroutine_sync(lambda: _create_tasks_from_split_plan_async(demand_no, tasks))


def _apply_create_task_status(result: dict[str, Any], create_results: list[dict[str, Any]]) -> None:
    ok_n = sum(1 for r in create_results if r.get("status") == "ok")
    bad = [r for r in create_results if r.get("status") != "ok"]
    for row in bad:
        result["errors"].append(
            f"create_task「{row.get('taskTitle') or '?'}」: {row.get('error') or row.get('status')}"
        )
    if bad and not ok_n:
        result["status"] = "failed"
    elif bad:
        result["status"] = "partial"


def bootstrap_auto_split(
    scope_type: ScopeType,
    scope_id: str,
) -> dict[str, Any]:
    """读 split_plan.json 按 tasks 逐条 create_task，并同步本轮成功子单到 userwork。"""
    sid = (scope_id or "").strip()
    demand_no = _resolve_demand_no(scope_type, sid)
    split_plan_tasks = _load_split_plan_tasks(sid)
    result: dict[str, Any] = {
        "scope_type": scope_type,
        "scope_id": sid,
        "demand_no": demand_no,
        "split_plan_tasks": split_plan_tasks,
        "create_task_results": [],
        "local_tasks": [],
        "status": "ok",
        "errors": [],
        "materialized_at": _now_iso(),
    }

    if not sid or not demand_no:
        result["status"] = "failed"
        result["errors"].append("scope_id 或 demand_no 为空")
        return result

    if not split_plan_tasks:
        result["status"] = "failed"
        result["errors"].append("未找到 split_plan.json tasks，须先通过方案评审并落盘拆单计划")
        return result

    create_results = _create_tasks_from_split_plan_sync(demand_no, split_plan_tasks)
    result["create_task_results"] = create_results
    _apply_create_task_status(result, create_results)
    if result["status"] == "failed":
        return result

    new_work_items = [
        r["work_item"]
        for r in create_results
        if r.get("status") == "ok" and isinstance(r.get("work_item"), dict)
    ]
    if new_work_items:
        added_nos = append_owned_work_items_to_demand(demand_no, new_work_items)
        result["userwork_added_task_nos"] = added_nos
        if len(added_nos) < len(new_work_items):
            skipped = [
                str(r.get("task_no") or "")
                for r in create_results
                if r.get("status") == "ok"
                and isinstance(r.get("work_item"), dict)
                and str(r.get("task_no") or "") not in added_nos
            ]
            if skipped:
                logger.info(
                    "auto_split userwork skip duplicate task_nos demand=%s: %s",
                    demand_no,
                    skipped,
                )
    else:
        result["userwork_added_task_nos"] = []

    created_nos = {
        str(r.get("task_no") or "").strip()
        for r in create_results
        if r.get("status") == "ok" and str(r.get("task_no") or "").strip()
    }
    local = _local_owned_tasks(demand_no)
    result["local_tasks"] = [
        {
            "task_no": str(t.get("task_no") or ""),
            "task_title": str(t.get("task_title") or ""),
            "sop_node": str(t.get("sop_node") or ""),
            "local_process_state": str(t.get("local_process_state") or ""),
        }
        for t in local
        if str(t.get("task_no") or "").strip() in created_nos
    ]

    return result


def format_auto_split_report(assets: dict[str, Any], *, node_name: str) -> str:
    """生成 ``研发子单拆分清单.md`` 正文（按 split_plan 条数展示拆单成败）。"""
    from synapse.rd_meeting.system_node_display import collect_task_rows

    status = str(assets.get("status") or "—")
    tasks = collect_task_rows(assets)
    plan_n = len(assets.get("split_plan_tasks") or [])
    ok_n = sum(1 for t in tasks if str(t.get("create_status") or "") == "ok")

    if status == "failed":
        conclusion = "自动拆单失败：split_plan 中的研发子单未能全部创建成功。"
    elif status == "partial":
        conclusion = f"自动拆单部分成功：计划 {plan_n} 条，成功 {ok_n} 条。"
    elif not plan_n:
        conclusion = "未找到 split_plan 拆单计划，无法执行自动拆单。"
    else:
        conclusion = f"自动拆单成功：计划 {plan_n} 条，均已创建研发子单。"

    lines = [
        f"# {node_name} — 研发子单拆分清单",
        "",
        "",
        "本节点按方案评审 split_plan 逐条调用 create_task，未调用大模型与人工确认。",
        "",
        f"- **需求单号**：{assets.get('demand_no') or '—'}",
        f"- **执行时间**：{assets.get('materialized_at') or '—'}",
        f"- **计划条数**：{plan_n}",
        f"- **总体状态**：{status}",
        "",
        "## 拆单结果",
        "",
    ]
    if not tasks:
        lines.append("（无 — 须先通过方案评审并落盘 split_plan.json）")
    else:
        for row in tasks:
            title = row.get("task_title") or "—"
            portal_no = row.get("task_no") or "—"
            create_status = row.get("create_status") or "—"
            module = row.get("product_module_name") or "—"
            branch = row.get("branch_version") or "—"
            patch = row.get("patch_name") or "—"
            feature_id = row.get("feature_id") or "—"
            err = row.get("error") or ""
            line = (
                f"- **{title}** → 子单号 {portal_no} （{create_status}）"
                f" 模块={module} 分支={branch} 补丁={patch} 特性分支={feature_id}"
            )
            if err:
                line += f" — {err}"
            lines.append(line)

    global_errors = assets.get("errors") if isinstance(assets.get("errors"), list) else []
    if global_errors:
        lines.extend(["", "## 错误", ""])
        for err in global_errors:
            lines.append(f"- {err}")

    lines.extend(["", "## 结论", "", conclusion, ""])
    return "\n".join(lines)
