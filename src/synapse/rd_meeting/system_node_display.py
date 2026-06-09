"""系统节点结构化展示：供协作会议流卡片与节点详情渲染。"""

from __future__ import annotations

from typing import Any

from synapse.rd_meeting.env_pregen_layout import _pipe_name_part
from synapse.rd_meeting.paths import meeting_pipeline_path
from synapse.rd_meeting.room_runtime import read_json_file

SYSTEM_NODE_DISPLAY_KINDS: dict[str, str] = {
    "auto_split": "system_auto_split",
    "sandbox_build": "system_sandbox_build",
    "env_pregen": "system_env_pregen",
}


def display_kind_for_system_node(node_id: str) -> str:
    nid = (node_id or "").strip()
    return SYSTEM_NODE_DISPLAY_KINDS.get(nid, "system_exec")


def _load_pipeline_context_asset(scope_id: str, key: str) -> dict[str, Any] | None:
    sid = (scope_id or "").strip()
    if not sid:
        return None
    raw = read_json_file(meeting_pipeline_path(sid))
    if not isinstance(raw, dict):
        return None
    ctx = raw.get("context")
    if not isinstance(ctx, dict):
        return None
    val = ctx.get(key)
    return val if isinstance(val, dict) else None


def _module_display_name(raw: Any) -> str:
    return _pipe_name_part(raw) or str(raw or "").strip()


def _modules_match(module_a: str, module_b: str) -> bool:
    a = _module_display_name(module_a)
    b = _module_display_name(module_b)
    if not a or not b:
        return False
    if a == b:
        return True
    return a.lower() == b.lower()


def collect_task_rows(auto_split_assets: dict[str, Any] | None) -> list[dict[str, Any]]:
    """汇总拆单任务行（create_task 结果 + split_plan + local_tasks 状态）。"""
    assets = auto_split_assets or {}
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()

    for raw in assets.get("create_task_results") or []:
        if not isinstance(raw, dict):
            continue
        wi = raw.get("work_item") if isinstance(raw.get("work_item"), dict) else {}
        task_no = str(raw.get("task_no") or wi.get("task_no") or "").strip()
        title = str(raw.get("taskTitle") or wi.get("task_title") or "").strip()
        key = task_no or title
        if not key or key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "task_no": task_no,
                "task_title": title,
                "product_module_name": str(
                    wi.get("product_module_name") or raw.get("productModuleName") or ""
                ).strip(),
                "branch_version": str(
                    wi.get("branch_version") or raw.get("branchVersionName") or ""
                ).strip(),
                "patch_name": str(wi.get("patch_name") or raw.get("patchName") or "").strip(),
                "create_status": str(raw.get("status") or ""),
                "source": "create_task",
            }
        )

    for raw in assets.get("split_plan_tasks") or []:
        if not isinstance(raw, dict):
            continue
        task_no = str(raw.get("taskNo") or "").strip()
        title = str(raw.get("taskTitle") or "").strip()
        key = task_no or title
        if not key or key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "task_no": task_no,
                "task_title": title,
                "product_module_name": str(raw.get("productModuleName") or "").strip(),
                "branch_version": str(raw.get("branchVersionName") or "").strip(),
                "patch_name": str(raw.get("patchName") or "").strip(),
                "create_status": "planned",
                "source": "split_plan",
            }
        )

    local_by_no = {
        str(t.get("task_no") or "").strip(): t
        for t in (assets.get("local_tasks") or [])
        if isinstance(t, dict) and str(t.get("task_no") or "").strip()
    }
    for row in rows:
        lt = local_by_no.get(row["task_no"])
        if lt:
            row["sop_node"] = str(lt.get("sop_node") or "")
            row["local_process_state"] = str(lt.get("local_process_state") or "")

    for raw in assets.get("local_tasks") or []:
        if not isinstance(raw, dict):
            continue
        task_no = str(raw.get("task_no") or "").strip()
        if not task_no or task_no in seen:
            continue
        seen.add(task_no)
        rows.append(
            {
                "task_no": task_no,
                "task_title": str(raw.get("task_title") or ""),
                "product_module_name": "",
                "branch_version": "",
                "patch_name": "",
                "create_status": "local",
                "source": "userwork",
                "sop_node": str(raw.get("sop_node") or ""),
                "local_process_state": str(raw.get("local_process_state") or ""),
            }
        )

    return rows


def build_task_sandbox_bindings(
    auto_split_assets: dict[str, Any] | None,
    wire_row: dict[str, Any] | None,
    sandbox_assets: dict[str, Any],
) -> list[dict[str, Any]]:
    """将研发子单与应用模块 / 沙箱代码路径挂钩。"""
    from synapse.rd_meeting.product_context import _normalize_product_wire

    tasks = collect_task_rows(auto_split_assets)
    sandbox_repos = {
        str(r.get("repo_name") or ""): r
        for r in (sandbox_assets.get("repos") or [])
        if isinstance(r, dict) and str(r.get("repo_name") or "")
    }
    catalog_repos: list[dict[str, Any]] = []
    if wire_row:
        normalized = _normalize_product_wire(wire_row)
        catalog_repos = [r for r in (normalized.get("repos") or []) if isinstance(r, dict)]

    bindings: list[dict[str, Any]] = []
    for task in tasks:
        mod = task.get("product_module_name") or ""
        matched: list[dict[str, Any]] = []
        for repo in catalog_repos:
            repo_module = str(repo.get("repo_module") or "")
            if mod and not _modules_match(mod, repo_module):
                continue
            repo_name = str(repo.get("repo_name") or "")
            sb = sandbox_repos.get(repo_name) or {}
            matched.append(
                {
                    "repo_name": repo_name,
                    "repo_module": _module_display_name(repo_module),
                    "code_path": str(repo.get("code_path") or ""),
                    "repo_branch": str(repo.get("repo_branch") or ""),
                    "local_path": str(sb.get("local_path") or ""),
                    "git_status": str(sb.get("status") or "unmatched"),
                    "error": str(sb.get("error") or ""),
                }
            )
        match_status = "ok" if matched else ("unmatched" if mod else "no_module")
        bindings.append({**task, "repos": matched, "match_status": match_status})
    return bindings


def build_env_path_inventory(assets: dict[str, Any]) -> list[dict[str, Any]]:
    """按落盘路径汇总环境预生成内容，便于前端逐路径检查。"""
    entries: list[dict[str, Any]] = []

    for row in assets.get("docs") or []:
        if not isinstance(row, dict):
            continue
        path = str(row.get("local_path") or "").strip()
        entries.append(
            {
                "path": path,
                "category": "catalog_doc",
                "label": str(row.get("doc_type") or "文档"),
                "status": str(row.get("status") or ""),
            }
        )

    product_docs = assets.get("product_docs") if isinstance(assets.get("product_docs"), dict) else {}
    if product_docs.get("status") == "ok":
        base = str(product_docs.get("local_path") or "").strip()
        for doc_type in product_docs.get("doc_types") or []:
            entries.append(
                {
                    "path": f"{base}/{doc_type}" if base else str(doc_type),
                    "category": "product_doc",
                    "label": str(doc_type),
                    "status": "ok",
                }
            )

    entropy = assets.get("entropy") if isinstance(assets.get("entropy"), dict) else {}
    entropy_root = str(entropy.get("local_path") or "").strip()
    for name in entropy.get("files") or []:
        rel = str(name or "").strip()
        if not rel:
            continue
        path = f"{entropy_root}/{rel}".replace("\\", "/") if entropy_root else rel
        entries.append(
            {
                "path": path,
                "category": "entropy",
                "label": rel,
                "status": str(entropy.get("status") or ""),
            }
        )

    engineering = assets.get("engineering") if isinstance(assets.get("engineering"), dict) else {}
    for layout in engineering.get("layouts") or []:
        if not isinstance(layout, dict):
            continue
        eng_root = str(layout.get("engineering_root") or "").strip()
        module = str(layout.get("module") or "")
        code_path = str(layout.get("code_path") or "")
        dev = layout.get("dev_templates") if isinstance(layout.get("dev_templates"), dict) else {}
        for fname in dev.get("files") or []:
            name = str(fname or "").strip()
            if not name:
                continue
            if name == "AGENTS.md":
                path = f"{eng_root}/AGENTS.md"
            else:
                path = f"{eng_root}/synapse_archive/产品规范/{name}"
            entries.append(
                {
                    "path": path.replace("\\", "/"),
                    "category": "dev_template",
                    "label": name,
                    "module": module,
                    "code_path": code_path,
                    "engineering_root": eng_root,
                    "status": str(dev.get("status") or layout.get("status") or ""),
                }
            )
        wo = layout.get("work_order_docs") if isinstance(layout.get("work_order_docs"), dict) else {}
        for rel in wo.get("files") or []:
            rel_path = str(rel or "").strip()
            if not rel_path:
                continue
            entries.append(
                {
                    "path": f"{eng_root}/synapse_archive/{rel_path}".replace("\\", "/"),
                    "category": "work_order_doc",
                    "label": rel_path,
                    "module": module,
                    "code_path": code_path,
                    "engineering_root": eng_root,
                    "status": str(wo.get("status") or layout.get("status") or ""),
                }
            )

    return entries


def group_env_paths_by_engineering(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按沙箱工程根路径分组预生成条目。"""
    groups: dict[str, dict[str, Any]] = {}
    for entry in entries:
        root = str(entry.get("engineering_root") or entry.get("path") or "").strip()
        if entry.get("category") in ("catalog_doc", "entropy", "product_doc"):
            root = str(entry.get("path") or "").rsplit("/", 1)[0] or root
        if not root:
            root = "—"
        bucket = groups.setdefault(
            root,
            {
                "engineering_root": root,
                "module": entry.get("module") or "",
                "code_path": entry.get("code_path") or "",
                "entries": [],
            },
        )
        if entry.get("module") and not bucket.get("module"):
            bucket["module"] = entry.get("module")
        if entry.get("code_path") and not bucket.get("code_path"):
            bucket["code_path"] = entry.get("code_path")
        bucket["entries"].append(entry)
    return list(groups.values())


def build_auto_split_display(result: dict[str, Any]) -> dict[str, Any]:
    tasks = collect_task_rows(result)
    return {
        "node_id": "auto_split",
        "status": result.get("status"),
        "demand_no": result.get("demand_no"),
        "errors": result.get("errors") or [],
        "tasks": tasks,
        "local_tasks": result.get("local_tasks") or [],
        "portal_task_nos": result.get("portal_task_nos") or [],
        "only_in_portal": result.get("only_in_portal") or [],
        "only_in_local": result.get("only_in_local") or [],
        "create_task_results": result.get("create_task_results") or [],
        "split_plan_tasks": result.get("split_plan_tasks") or [],
        "materialized_at": result.get("materialized_at"),
    }


def build_sandbox_build_display(
    result: dict[str, Any],
    *,
    scope_id: str,
    wire_row: dict[str, Any] | None,
) -> dict[str, Any]:
    auto_split = _load_pipeline_context_asset(scope_id, "auto_split_assets") or {}
    sandbox_assets = {
        "repos": result.get("repos") or [],
        "sandbox_root": result.get("sandbox_root"),
    }
    bindings = build_task_sandbox_bindings(auto_split, wire_row, sandbox_assets)
    return {
        "node_id": "sandbox_build",
        "status": result.get("status"),
        "prod": result.get("prod"),
        "sandbox_root": result.get("sandbox_root"),
        "errors": result.get("errors") or [],
        "repos": result.get("repos") or [],
        "task_bindings": bindings,
        "materialized_at": result.get("materialized_at"),
    }


def build_env_pregen_display(result: dict[str, Any]) -> dict[str, Any]:
    path_entries = build_env_path_inventory(result)
    return {
        "node_id": "env_pregen",
        "status": result.get("status"),
        "prod": result.get("prod"),
        "env_root": result.get("env_root"),
        "doc_root": result.get("doc_root"),
        "errors": result.get("errors") or [],
        "docs": result.get("docs") or [],
        "product_docs": result.get("product_docs") or {},
        "entropy": result.get("entropy") or {},
        "engineering": result.get("engineering") or {},
        "path_entries": path_entries,
        "path_groups": group_env_paths_by_engineering(path_entries),
        "materialized_at": result.get("materialized_at"),
    }


def attach_system_node_display(
    node_id: str,
    result: dict[str, Any],
    *,
    scope_id: str = "",
    wire_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """为 handler 返回值附加 ``display`` 字段（会议流结构化卡片）。"""
    nid = (node_id or "").strip()
    if nid == "auto_split":
        result["display"] = build_auto_split_display(result)
    elif nid == "sandbox_build":
        result["display"] = build_sandbox_build_display(result, scope_id=scope_id, wire_row=wire_row)
    elif nid == "env_pregen":
        result["display"] = build_env_pregen_display(result)
    return result
