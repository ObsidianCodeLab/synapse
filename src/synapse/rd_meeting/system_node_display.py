"""系统节点结构化展示：供协作会议流卡片与节点详情渲染。"""

from __future__ import annotations

from typing import Any

from pathlib import Path

from synapse.rd_meeting.binding import resolve_node_binding
from synapse.rd_meeting.env_pregen_layout import (
    _ARCHIVE_ARTIFACT_LAYOUT,
    _PRODUCT_DOC_LAYOUT,
    _pipe_name_part,
)
from synapse.rd_meeting.paths import (
    archive_node_dir,
    meeting_pipeline_path,
    product_doc_dir,
)
from synapse.rd_meeting.prior_outputs import load_skipped_node_ids
from synapse.rd_meeting.room_runtime import read_meeting_pipeline_json
from synapse.rd_sop.nodes import node_display_name, stage_id_for_node_id, stage_name_for_id

SYSTEM_NODE_DISPLAY_KINDS: dict[str, str] = {
    "auto_split": "system_auto_split",
    "sandbox_build": "system_sandbox_build",
    "env_pregen": "system_env_pregen",
    "exception_check": "system_code_commit",
    "env_start": "system_task_check",
}

STRUCTURED_SYSTEM_NODES: frozenset[str] = frozenset(SYSTEM_NODE_DISPLAY_KINDS)


def display_kind_for_system_node(node_id: str) -> str:
    nid = (node_id or "").strip()
    return SYSTEM_NODE_DISPLAY_KINDS.get(nid, "system_exec")


def _load_pipeline_context_asset(scope_id: str, key: str) -> dict[str, Any] | None:
    sid = (scope_id or "").strip()
    if not sid:
        return None
    raw = read_meeting_pipeline_json(sid)
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


def _join_workspace_path(local_path: str, code_path: str) -> str:
    """沙箱仓库根路径 + catalog 工程相对路径。"""
    base = (local_path or "").strip().rstrip("\\/")
    rel = (code_path or "").strip().replace("\\", "/").strip("/")
    if not base:
        return rel
    if not rel:
        return base
    return f"{base}/{rel}".replace("\\", "/")


def _plan_row_fields(plan: dict[str, Any]) -> dict[str, Any]:
    fps = plan.get("functionPoints")
    fp_list: list[str] = []
    if isinstance(fps, list):
        fp_list = [str(x).strip() for x in fps if str(x).strip()]
    return {
        "comments": str(plan.get("comments") or "").strip(),
        "task_impact_desc": str(plan.get("taskImpactDesc") or "").strip(),
        "function_point_count": len(fp_list),
        "function_points": fp_list,
    }


def _auto_split_context_for_bindings(scope_id: str) -> dict[str, Any]:
    """沙箱挂钩优先用 auto_split 落盘；缺 plan 时回读 split_plan.json。"""
    assets = dict(_load_pipeline_context_asset(scope_id, "auto_split_assets") or {})
    plan_tasks = assets.get("split_plan_tasks")
    if isinstance(plan_tasks, list) and plan_tasks:
        return assets
    from synapse.rd_meeting.solution_review import load_split_plan

    plan = load_split_plan(scope_id)
    if isinstance(plan, dict) and isinstance(plan.get("tasks"), list):
        assets["split_plan_tasks"] = [dict(t) for t in plan["tasks"] if isinstance(t, dict)]
    return assets


def collect_task_rows(auto_split_assets: dict[str, Any] | None) -> list[dict[str, Any]]:
    """按 split_plan 条数汇总拆单结果：每条计划对应一行，合并同序 create_task 结果。"""
    from synapse.rd_meeting.auto_split_assets import resolve_auto_split_feature_id

    assets = auto_split_assets or {}
    plan_tasks = [
        dict(t) for t in (assets.get("split_plan_tasks") or []) if isinstance(t, dict)
    ]
    create_results = [
        dict(r) for r in (assets.get("create_task_results") or []) if isinstance(r, dict)
    ]
    local_by_no = {
        str(t.get("task_no") or "").strip(): t
        for t in (assets.get("local_tasks") or [])
        if isinstance(t, dict) and str(t.get("task_no") or "").strip()
    }

    rows: list[dict[str, Any]] = []
    if plan_tasks:
        for index, plan in enumerate(plan_tasks):
            created = create_results[index] if index < len(create_results) else {}
            wi = created.get("work_item") if isinstance(created.get("work_item"), dict) else {}
            portal_no = str(created.get("task_no") or wi.get("task_no") or "").strip()
            create_status = str(created.get("status") or "pending").strip() or "pending"
            row: dict[str, Any] = {
                "plan_index": index,
                "plan_task_no": str(plan.get("taskNo") or "").strip(),
                "task_no": portal_no,
                "task_title": str(plan.get("taskTitle") or created.get("taskTitle") or "").strip(),
                "product_module_name": str(plan.get("productModuleName") or "").strip(),
                "branch_version": str(plan.get("branchVersionName") or "").strip(),
                "patch_name": str(plan.get("patchName") or "").strip(),
                "create_status": create_status,
                "error": str(created.get("error") or "").strip(),
                **_plan_row_fields(plan),
            }
            if not row.get("comments"):
                row["comments"] = str(wi.get("task_desc") or "").strip()
            row["task_desc"] = str(row.get("comments") or wi.get("task_desc") or "").strip()
            if not row.get("task_impact_desc"):
                row["task_impact_desc"] = str(plan.get("taskImpactDesc") or "").strip()
            feature_id = resolve_auto_split_feature_id(wi, portal_no)
            if feature_id:
                row["feature_id"] = feature_id
            portal_task_id = wi.get("portal_task_id") or wi.get("task_id") or wi.get("taskId")
            if portal_task_id is not None and str(portal_task_id).strip():
                row["portal_task_id"] = portal_task_id
            lt = local_by_no.get(portal_no)
            if lt:
                row["sop_node"] = str(lt.get("sop_node") or "")
                row["local_process_state"] = str(lt.get("local_process_state") or "")
            rows.append(row)
        return rows

    for index, created in enumerate(create_results):
        wi = created.get("work_item") if isinstance(created.get("work_item"), dict) else {}
        portal_no = str(created.get("task_no") or wi.get("task_no") or "").strip()
        row = {
            "plan_index": index,
            "plan_task_no": "",
            "task_no": portal_no,
            "task_title": str(created.get("taskTitle") or wi.get("task_title") or "").strip(),
            "product_module_name": str(wi.get("product_module_name") or "").strip(),
            "branch_version": "",
            "patch_name": "",
            "create_status": str(created.get("status") or ""),
            "error": str(created.get("error") or "").strip(),
            "comments": str(wi.get("task_desc") or "").strip(),
            "task_desc": str(wi.get("task_desc") or "").strip(),
        }
        feature_id = resolve_auto_split_feature_id(wi, portal_no)
        if feature_id:
            row["feature_id"] = feature_id
        portal_task_id = wi.get("portal_task_id") or wi.get("task_id") or wi.get("taskId")
        if portal_task_id is not None and str(portal_task_id).strip():
            row["portal_task_id"] = portal_task_id
        lt = local_by_no.get(portal_no)
        if lt:
            row["sop_node"] = str(lt.get("sop_node") or "")
            row["local_process_state"] = str(lt.get("local_process_state") or "")
        rows.append(row)
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
            code_path = str(repo.get("code_path") or sb.get("code_path") or "")
            local_path = str(sb.get("local_path") or "")
            matched.append(
                {
                    "repo_name": repo_name,
                    "repo_module": _module_display_name(repo_module),
                    "code_path": code_path,
                    "repo_branch": str(repo.get("repo_branch") or sb.get("repo_branch") or ""),
                    "feature_branch": str(task.get("feature_id") or sb.get("feature_branch") or ""),
                    "local_path": local_path,
                    "engineering_path": _join_workspace_path(local_path, code_path),
                    "git_status": str(sb.get("status") or "unmatched"),
                    "error": str(sb.get("error") or ""),
                }
            )
        match_status = "ok" if matched and any(r.get("git_status") == "ok" for r in matched) else (
            "unmatched" if mod else "no_module"
        )
        bindings.append({**task, "repos": matched, "match_status": match_status})
    return bindings


def _first_engineering_root(assets: dict[str, Any]) -> str:
    engineering = assets.get("engineering") if isinstance(assets.get("engineering"), dict) else {}
    for layout in engineering.get("layouts") or []:
        if not isinstance(layout, dict):
            continue
        root = str(layout.get("engineering_root") or "").strip()
        if root:
            return root
    return ""


def _copied_work_order_rels(assets: dict[str, Any]) -> set[str]:
    rels: set[str] = set()
    engineering = assets.get("engineering") if isinstance(assets.get("engineering"), dict) else {}
    for layout in engineering.get("layouts") or []:
        if not isinstance(layout, dict):
            continue
        wo = layout.get("work_order_docs") if isinstance(layout.get("work_order_docs"), dict) else {}
        for rel in wo.get("files") or []:
            name = str(rel or "").strip()
            if name:
                rels.add(name)
    return rels


def build_upstream_sop_artifact_entries(scope_id: str, assets: dict[str, Any]) -> list[dict[str, Any]]:
    """列出环境预生成模板内全部上游 SOP 产出，并标注关闭/跳过/未归档。"""
    sid = (scope_id or "").strip()
    skipped_ids = load_skipped_node_ids(sid) if sid else set()
    eng_root = _first_engineering_root(assets)
    copied = _copied_work_order_rels(assets)
    entries: list[dict[str, Any]] = []

    for node_id, filename, rel in _ARCHIVE_ARTIFACT_LAYOUT:
        binding = resolve_node_binding(node_id)
        enabled = bool(binding.get("enabled", True))
        node_skipped = node_id in skipped_ids
        node_name = str(binding.get("node_name") or node_display_name(node_id))

        archive_path: Path | None = None
        archive_exists = False
        if sid:
            stage_name = stage_name_for_id(stage_id_for_node_id(node_id))
            archive_path = archive_node_dir(sid, stage_name, node_id) / filename
            archive_exists = archive_path.is_file()

        if not enabled:
            status = "skipped"
            skip_reason = "环节已关闭"
        elif node_skipped:
            status = "skipped"
            skip_reason = "环节已跳过"
        elif rel in copied or archive_exists:
            status = "ok"
            skip_reason = ""
        else:
            status = "missing"
            skip_reason = "尚未归档"

        if eng_root and rel in copied:
            path = f"{eng_root}/synapse_archive/{rel}".replace("\\", "/")
        elif archive_exists and archive_path is not None:
            path = str(archive_path)
        elif eng_root:
            path = f"{eng_root}/synapse_archive/{rel}".replace("\\", "/")
        else:
            path = str(rel)

        entries.append(
            {
                "path": path,
                "category": "sop_artifact",
                "label": rel,
                "file_name": filename,
                "node_id": node_id,
                "node_name": node_name,
                "status": status,
                "skip_reason": skip_reason,
            }
        )
    return entries


def build_product_doc_file_entries(scope_id: str, assets: dict[str, Any]) -> list[dict[str, Any]]:
    """将产品文档展开为具体 Markdown 文件（如 FUNCTIONAL_ARCH / TECH_ARCH）。"""
    sid = (scope_id or "").strip()
    if not sid:
        return []

    product_docs = assets.get("product_docs") if isinstance(assets.get("product_docs"), dict) else {}
    available_types = {str(t) for t in (product_docs.get("doc_types") or [])}
    eng_root = _first_engineering_root(assets)
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()

    for doc_type, mappings in _PRODUCT_DOC_LAYOUT.items():
        by_dest: dict[str, list[str]] = {}
        for src_name, rel in mappings:
            by_dest.setdefault(rel, []).append(src_name)

        for rel, src_names in by_dest.items():
            if rel in seen:
                continue
            seen.add(rel)
            filename = rel.rsplit("/", 1)[-1]
            src_path: Path | None = None
            for src_name in src_names:
                candidate = product_doc_dir(sid, doc_type) / src_name
                if candidate.is_file():
                    src_path = candidate
                    break

            sandbox_path = (
                Path(f"{eng_root}/synapse_archive/{rel}") if eng_root else None
            )
            sandbox_exists = sandbox_path.is_file() if sandbox_path else False

            if sandbox_exists and sandbox_path is not None:
                path = str(sandbox_path)
                status = "ok"
            elif src_path is not None:
                path = str(src_path)
                status = "ok"
            elif doc_type in available_types:
                path = str(product_doc_dir(sid, doc_type) / filename)
                status = "missing"
            else:
                path = str(product_doc_dir(sid, doc_type) / filename)
                status = "skipped"

            entries.append(
                {
                    "path": path,
                    "category": "product_doc",
                    "label": rel,
                    "file_name": filename,
                    "doc_type": doc_type,
                    "status": status,
                }
            )
    return entries


def build_env_path_inventory(assets: dict[str, Any], *, scope_id: str = "") -> list[dict[str, Any]]:
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
    if scope_id:
        entries.extend(build_product_doc_file_entries(scope_id, assets))
        entries.extend(build_upstream_sop_artifact_entries(scope_id, assets))
    elif product_docs.get("status") == "ok":
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
        if not scope_id:
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
    plan_count = len(result.get("split_plan_tasks") or [])
    ok_count = sum(1 for t in tasks if str(t.get("create_status") or "") == "ok")
    fail_count = sum(
        1 for t in tasks if str(t.get("create_status") or "") in ("failed", "skipped")
    )
    return {
        "node_id": "auto_split",
        "status": result.get("status"),
        "demand_no": result.get("demand_no"),
        "errors": result.get("errors") or [],
        "tasks": tasks,
        "plan_count": plan_count,
        "ok_count": ok_count,
        "fail_count": fail_count,
        "materialized_at": result.get("materialized_at"),
    }


def _enrich_sandbox_repos(
    repos: list[dict[str, Any]],
    wire_row: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """为落盘仓库补充 catalog 中的模块 / 工程路径 / 分支展示字段。"""
    from synapse.rd_meeting.product_context import _normalize_product_wire

    catalog_by_name: dict[str, dict[str, Any]] = {}
    if wire_row:
        normalized = _normalize_product_wire(wire_row)
        for repo in normalized.get("repos") or []:
            if isinstance(repo, dict):
                name = str(repo.get("repo_name") or "").strip()
                if name:
                    catalog_by_name[name] = repo

    enriched: list[dict[str, Any]] = []
    for raw in repos:
        if not isinstance(raw, dict):
            continue
        row = dict(raw)
        cat = catalog_by_name.get(str(row.get("repo_name") or "").strip()) or {}
        if cat:
            code_path = str(cat.get("code_path") or row.get("code_path") or "")
            local_path = str(row.get("local_path") or "")
            row.setdefault("repo_module", _module_display_name(cat.get("repo_module")))
            row.setdefault("code_path", code_path)
            row.setdefault("repo_branch", str(cat.get("repo_branch") or row.get("repo_branch") or ""))
            row.setdefault("repo_url", str(cat.get("repo_url") or row.get("repo_url") or ""))
            row.setdefault("feature_branch", str(row.get("feature_branch") or ""))
            row["engineering_path"] = _join_workspace_path(local_path, code_path)
        elif row.get("local_path") and row.get("code_path"):
            row["engineering_path"] = _join_workspace_path(
                str(row.get("local_path") or ""),
                str(row.get("code_path") or ""),
            )
        enriched.append(row)
    return enriched


def build_sandbox_build_display(
    result: dict[str, Any],
    *,
    scope_id: str,
    wire_row: dict[str, Any] | None,
) -> dict[str, Any]:
    auto_split = _auto_split_context_for_bindings(scope_id)
    repos = _enrich_sandbox_repos(
        [r for r in (result.get("repos") or []) if isinstance(r, dict)],
        wire_row,
    )
    sandbox_assets = {
        "repos": repos,
        "sandbox_root": result.get("sandbox_root"),
    }
    bindings = build_task_sandbox_bindings(auto_split, wire_row, sandbox_assets)
    plan_count = len(auto_split.get("split_plan_tasks") or [])
    return {
        "node_id": "sandbox_build",
        "status": result.get("status"),
        "prod": result.get("prod"),
        "sandbox_root": result.get("sandbox_root"),
        "errors": result.get("errors") or [],
        "repos": repos,
        "task_bindings": bindings,
        "plan_count": plan_count,
        "materialized_at": result.get("materialized_at"),
    }


def build_env_pregen_display(result: dict[str, Any], *, scope_id: str = "") -> dict[str, Any]:
    path_entries = build_env_path_inventory(result, scope_id=scope_id)
    errors = [
        str(err)
        for err in (result.get("errors") or [])
        if str(err).strip() and not str(err).startswith("控熵")
    ]
    return {
        "node_id": "env_pregen",
        "status": result.get("status"),
        "prod": result.get("prod"),
        "env_root": result.get("env_root"),
        "doc_root": result.get("doc_root"),
        "errors": errors,
        "docs": result.get("docs") or [],
        "product_docs": result.get("product_docs") or {},
        "entropy": result.get("entropy") or {},
        "engineering": result.get("engineering") or {},
        "path_entries": path_entries,
        "path_groups": group_env_paths_by_engineering(path_entries),
        "materialized_at": result.get("materialized_at"),
    }


def build_code_commit_display(result: dict[str, Any]) -> dict[str, Any]:
    flight = result.get("flight") if isinstance(result.get("flight"), dict) else {}
    tasks = result.get("tasks") if isinstance(result.get("tasks"), list) else []
    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    display_tasks: list[dict[str, Any]] = []
    for row in tasks:
        if not isinstance(row, dict):
            continue
        task_flight = row.get("flight") if isinstance(row.get("flight"), dict) else {}
        flight_data = task_flight.get("data") if isinstance(task_flight.get("data"), dict) else {}
        display_tasks.append(
            {
                "task_no": row.get("task_no"),
                "task_title": row.get("task_title"),
                "feature_id": row.get("feature_id"),
                "portal_task_id": row.get("portal_task_id"),
                "commit_message": row.get("commit_message"),
                "commit_hash": row.get("commit_hash"),
                "status": row.get("status"),
                "error": row.get("error"),
                "sandbox_path": row.get("sandbox_path") or row.get("local_path"),
                "flight_status": task_flight.get("status"),
                "flight_error": task_flight.get("error"),
                "flight_data": flight_data,
            }
        )
    return {
        "node_id": "exception_check",
        "status": result.get("status"),
        "errors": [result.get("error")] if result.get("error") else [],
        "tasks": display_tasks,
        "flight": flight,
        "summary": summary,
        "progress": result.get("progress") if isinstance(result.get("progress"), dict) else {},
        "archives": result.get("archives") if isinstance(result.get("archives"), list) else [],
        "started_at": result.get("started_at"),
        "finished_at": result.get("finished_at"),
    }


def build_task_check_display(result: dict[str, Any]) -> dict[str, Any]:
    analysis = result.get("analysis") if isinstance(result.get("analysis"), dict) else {}
    return {
        "node_id": "env_start",
        "status": result.get("status"),
        "outcome": result.get("outcome"),
        "errors": [result.get("error")] if result.get("error") else [],
        "redirect_to_node": result.get("redirect_to_node"),
        "redirect_reason": result.get("redirect_reason"),
        "fail_count": result.get("fail_count"),
        "ai_processing_blocked": bool(result.get("ai_processing_blocked")),
        "analysis": analysis,
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
        result["display"] = build_env_pregen_display(result, scope_id=scope_id)
    elif nid == "exception_check":
        result["display"] = build_code_commit_display(result)
    elif nid == "env_start":
        result["display"] = build_task_check_display(result)
    return result


def refresh_system_node_display_payload(
    node_id: str,
    result: dict[str, Any],
    *,
    scope_id: str = "",
    wire_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """从 handler 完整 result 重建 display，忽略过期的 embedded display。"""
    source = dict(result)
    embedded = result.get("display") if isinstance(result.get("display"), dict) else {}
    for key in ("demand_no", "status", "errors", "materialized_at", "prod", "sandbox_root"):
        if not source.get(key) and embedded.get(key) not in (None, "", []):
            source[key] = embedded[key]
    rebuilt = attach_system_node_display(
        node_id,
        source,
        scope_id=scope_id,
        wire_row=wire_row,
    )
    display = rebuilt.get("display")
    if not isinstance(display, dict):
        return {}
    if embedded and not display.get("tasks") and embedded.get("tasks"):
        display = {**display, "tasks": embedded.get("tasks")}
    return display


def _pipeline_context(scope_id: str) -> dict[str, Any]:
    sid = (scope_id or "").strip()
    if not sid:
        return {}
    raw = read_meeting_pipeline_json(sid)
    if not isinstance(raw, dict):
        return {}
    ctx = raw.get("context")
    return ctx if isinstance(ctx, dict) else {}


def _wire_row_for_sandbox(scope_id: str, prod: str) -> dict[str, Any] | None:
    from synapse.rd_meeting.product_context import load_prod_catalog_from_pipeline, match_prod_row_by_prod

    prod_key = (prod or "").strip()
    if not prod_key:
        return None
    rows = load_prod_catalog_from_pipeline(scope_id)
    if not rows:
        catalog = _pipeline_context(scope_id).get("prod_catalog")
        if isinstance(catalog, list):
            rows = [r for r in catalog if isinstance(r, dict)]
    return match_prod_row_by_prod(rows, prod_key) if rows else None


def _display_from_history(scope_id: str, node_id: str) -> dict[str, Any] | None:
    """历史节点：从 ``room_history.jsonl`` 的 ``system_node_executed`` 事件恢复展示。"""
    from synapse.rd_meeting.room_runtime import read_history

    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or not nid:
        return None
    for ev in reversed(read_history(sid, node_id=nid)):
        if str(ev.get("event") or "").strip() != "system_node_executed":
            continue
        if str(ev.get("node_id") or "").strip() not in ("", nid):
            continue
        result = ev.get("result") if isinstance(ev.get("result"), dict) else {}
        if result:
            wire = (
                _wire_row_for_sandbox(sid, str(result.get("prod") or ""))
                if nid == "sandbox_build"
                else None
            )
            display = refresh_system_node_display_payload(
                nid,
                result,
                scope_id=sid,
                wire_row=wire,
            )
            if display:
                return {**display, "node_id": nid, "display_kind": display_kind_for_system_node(nid)}
    return None


def resolve_system_node_display(scope_id: str, node_id: str) -> dict[str, Any] | None:
    """从 pipeline 上下文重建系统节点结构化展示（供节点详情 / API）。"""
    nid = (node_id or "").strip()
    if nid not in STRUCTURED_SYSTEM_NODES:
        return None

    ctx = _pipeline_context(scope_id)
    last = ctx.get("last_system_node_result") if isinstance(ctx.get("last_system_node_result"), dict) else {}
    if str(last.get("node_id") or "").strip() == nid:
        wire = (
            _wire_row_for_sandbox(scope_id, str(last.get("prod") or ""))
            if nid == "sandbox_build"
            else None
        )
        display = refresh_system_node_display_payload(
            nid,
            last,
            scope_id=scope_id,
            wire_row=wire,
        )
        if display:
            return {**display, "node_id": nid, "display_kind": display_kind_for_system_node(nid)}

    if nid == "auto_split":
        assets = _load_pipeline_context_asset(scope_id, "auto_split_assets")
        if assets:
            return {
                **build_auto_split_display(assets),
                "display_kind": display_kind_for_system_node(nid),
            }
        return _display_from_history(scope_id, nid)

    if nid == "sandbox_build":
        assets = _load_pipeline_context_asset(scope_id, "sandbox_assets")
        if not assets:
            if str(last.get("node_id") or "").strip() == nid:
                assets = {
                    k: last[k]
                    for k in ("status", "sandbox_root", "repos", "prod", "errors", "materialized_at")
                    if k in last
                }
        if assets:
            prod = str(assets.get("prod") or last.get("prod") or "").strip()
            wire = _wire_row_for_sandbox(scope_id, prod)
            return {
                **build_sandbox_build_display(assets, scope_id=scope_id, wire_row=wire),
                "display_kind": display_kind_for_system_node(nid),
            }
        return _display_from_history(scope_id, nid)

    if nid == "env_pregen":
        assets = _load_pipeline_context_asset(scope_id, "env_pregen_assets")
        if assets:
            return {
                **build_env_pregen_display(assets, scope_id=scope_id),
                "display_kind": display_kind_for_system_node(nid),
            }
        return _display_from_history(scope_id, nid)

    if nid == "exception_check":
        assets = _load_pipeline_context_asset(scope_id, "code_commit_assets")
        if assets:
            return {
                **build_code_commit_display(assets),
                "display_kind": display_kind_for_system_node(nid),
            }
        return _display_from_history(scope_id, nid)

    if nid == "env_start":
        assets = _load_pipeline_context_asset(scope_id, "task_check_assets")
        if assets:
            return {
                **build_task_check_display(assets),
                "display_kind": display_kind_for_system_node(nid),
            }
        return _display_from_history(scope_id, nid)

    return _display_from_history(scope_id, nid)
