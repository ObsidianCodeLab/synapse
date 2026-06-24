"""工单完成归档：将本地 SOP 节点、文档产出、代码仓库产出写入研发统一服务 rd_view。"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from synapse.api.routes.dev_iwhalecloud import (
    OWNED_WORK_ITEM_STATE_COMPLETED,
    _snapshot_norm_id,
    load_owner_order_snapshot_from_file,
)
from synapse.rd_meeting.dev_status import load_dev_status, save_dev_status
from synapse.rd_meeting.devservice import unified_service_base_url
from synapse.rd_meeting.node_review import collect_artifact_files
from synapse.rd_meeting.paths import scope_dir
from synapse.rd_meeting.room_runtime import load_room_state
from synapse.rd_meeting.userwork_sync import patch_userwork_summary
from synapse.rd_sop.manifest import NODE_TYPES
from synapse.rd_sop.nodes import ALL_NODES, node_display_name, seq_index_for_node_id, stage_id_for_node_id

logger = logging.getLogger(__name__)

ARCHIVED_LOCAL_STATE = "archived"
RD_VIEW_DEMAND_SAVE_PATH = "/dev/iwhalecloud/synapse/rd_view_demand_save"

RD_VIEW_SOP_NODE_INSERT_PATH = "/dev/iwhalecloud/synapse/rd_view_sop_node_insert"
RD_VIEW_NODE_OUTPUT_INSERT_PATH = "/dev/iwhalecloud/synapse/rd_view_node_output_insert"
RD_VIEW_NODE_REPO_OUTPUT_INSERT_PATH = "/dev/iwhalecloud/synapse/rd_view_node_repo_output_insert"


def is_archived_local_state(local_process_state: str) -> bool:
    return _snapshot_norm_id(local_process_state) == ARCHIVED_LOCAL_STATE


def should_archive_orphan_demand(demand: dict[str, Any]) -> bool:
    """门户已下架且本地已完成、尚未归档时触发归档。"""
    local = _snapshot_norm_id(demand.get("local_process_state"))
    if local == ARCHIVED_LOCAL_STATE:
        return False
    return local == OWNED_WORK_ITEM_STATE_COMPLETED


def _processing_mode_for_node(node_id: str) -> str:
    node_type = NODE_TYPES.get((node_id or "").strip(), "")
    if node_type in ("human", "human_start", "human_multi"):
        return "人工"
    if node_type in ("ai", "ai_human", "ai_exception", "system"):
        return "ai"
    return "待定"


def _repo_name_from_url(repo_url: str) -> str:
    url = (repo_url or "").strip().rstrip("/")
    if not url:
        return "unknown"
    path = urlparse(url).path if "://" in url else url
    name = path.rstrip("/").split("/")[-1] if path else url.split("/")[-1]
    if name.endswith(".git"):
        name = name[:-4]
    return name or "unknown"


def _resolve_node_model(scope_id: str, node_id: str) -> str | None:
    from synapse.rd_meeting.agent_activity import list_node_agent_profiles, read_activity_log

    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or not nid:
        return None
    for pid in list_node_agent_profiles(sid, nid):
        for row in read_activity_log(sid, nid, pid, limit=500):
            if str(row.get("category") or "") != "llm_usage":
                continue
            model = str(row.get("model") or "").strip()
            if model:
                return model[:120]
    return None


def _load_demand_row(demand_no: str) -> dict[str, Any] | None:
    dn = _snapshot_norm_id(demand_no)
    if not dn:
        return None
    snap = load_owner_order_snapshot_from_file()
    raw_list = snap.get("list") if isinstance(snap, dict) else None
    for row in raw_list or []:
        if isinstance(row, dict) and _snapshot_norm_id(row.get("demand_no")) == dn:
            return row
    return None


def _node_has_archive_signal(scope_id: str, node_id: str, node_metrics: dict[str, Any]) -> bool:
    if isinstance(node_metrics.get(node_id), dict):
        return True
    stage_name = ""
    for node in ALL_NODES:
        if str(node.get("id")) == node_id:
            stage_name = str(node.get("stage_name") or "")
            break
    if not stage_name:
        return False
    artifacts = collect_artifact_files(scope_id, stage_name, node_id)
    return bool(artifacts)


def collect_sop_node_items(*, demand_no: str, scope_id: str) -> list[dict[str, Any]]:
    """从 ``room_state.node_metrics`` 与 archive 目录组装 SOP 节点插入项。"""
    dn = _snapshot_norm_id(demand_no)
    sid = _snapshot_norm_id(scope_id) or dn
    if not dn or not sid:
        return []

    room_state = load_room_state(sid) or {}
    node_metrics = room_state.get("node_metrics")
    if not isinstance(node_metrics, dict):
        node_metrics = {}

    items: list[dict[str, Any]] = []
    for node in ALL_NODES:
        node_id = str(node.get("id") or "").strip()
        if not node_id or node_id == "pending":
            continue
        if not _node_has_archive_signal(sid, node_id, node_metrics):
            continue

        nm = node_metrics.get(node_id) if isinstance(node_metrics.get(node_id), dict) else {}
        started_at = str(nm.get("started_at") or "").strip() or None
        finished_at = str(nm.get("completed_at") or "").strip() or None
        seconds = int(nm.get("seconds") or 0)
        duration_hours = round(seconds / 3600.0, 4) if seconds > 0 else None
        tokens = int(nm.get("tokens") or 0) or None
        stage_id = int(node.get("stage_id") or stage_id_for_node_id(node_id))
        from synapse.rd_meeting.owner_order_refresh import stage_slug_for_id

        items.append(
            {
                "demand_no": dn,
                "sop_node_id": node_id,
                "stage": stage_slug_for_id(stage_id),
                "seq_id": seq_index_for_node_id(node_id),
                "name": node_display_name(node_id),
                "processing_mode": _processing_mode_for_node(node_id),
                "started_at": started_at,
                "finished_at": finished_at,
                "duration_hours": duration_hours,
                "tokens": tokens,
                "model": _resolve_node_model(sid, node_id),
            }
        )
    return items


def collect_node_output_items(
    *,
    demand_no: str,
    scope_id: str,
    node_id_map: dict[str, int],
) -> list[dict[str, Any]]:
    """扫 archive 目录，组装文档产出插入项。"""
    dn = _snapshot_norm_id(demand_no)
    sid = _snapshot_norm_id(scope_id) or dn
    if not dn or not sid:
        return []

    items: list[dict[str, Any]] = []
    for node in ALL_NODES:
        node_id = str(node.get("id") or "").strip()
        db_node_id = node_id_map.get(node_id)
        if not db_node_id:
            continue
        stage_name = str(node.get("stage_name") or "")
        for artifact in collect_artifact_files(sid, stage_name, node_id):
            ext = (artifact.ext or "").lower()
            output_type = "document"
            if ext in {".json", ".yaml", ".yml"}:
                output_type = "data"
            elif ext in {".html", ".htm"}:
                output_type = "report"
            items.append(
                {
                    "demand_no": dn,
                    "node_id": db_node_id,
                    "type": output_type,
                    "label": artifact.name,
                    "url": artifact.relative_path,
                }
            )
    return items


def collect_repo_output_items(
    *,
    demand_no: str,
    demand: dict[str, Any],
    node_id_map: dict[str, int],
) -> list[dict[str, Any]]:
    """从 ``owned_work_items`` 组装代码仓库产出插入项（挂到代码提交节点）。"""
    dn = _snapshot_norm_id(demand_no)
    if not dn:
        return []

    repo_node_key = "exception_check" if "exception_check" in node_id_map else "task_exec"
    db_node_id = node_id_map.get(repo_node_key)
    if not db_node_id:
        return []

    owned = demand.get("owned_work_items")
    if not isinstance(owned, list):
        return []

    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in owned:
        if not isinstance(row, dict):
            continue
        repo_url = str(row.get("repo_url") or "").strip()
        if not repo_url:
            continue
        repo_name = str(row.get("product_module_name") or "").strip() or _repo_name_from_url(repo_url)
        branch = str(row.get("feature_id") or row.get("branch") or "").strip() or "master"
        dedupe_key = f"{repo_url}::{branch}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        items.append(
            {
                "demand_no": dn,
                "node_id": db_node_id,
                "repo_url": repo_url,
                "repo_name": repo_name,
                "branch": branch,
                "lines_added": None,
                "lines_deleted": None,
                "commit_count": None,
            }
        )
    return items


def _parse_rd_view_response(body: Any) -> tuple[bool, str]:
    if not isinstance(body, dict):
        return False, "invalid response"
    code = body.get("code")
    if code in (0, "0", None):
        return True, str(body.get("message") or body.get("msg") or "ok")
    message = str(body.get("message") or body.get("msg") or f"code={code}")
    return False, message


async def _post_rd_view_items(
    client: httpx.AsyncClient,
    *,
    base: str,
    path: str,
    items: list[dict[str, Any]],
) -> tuple[bool, str, dict[str, Any]]:
    if not items:
        return True, "skipped empty", {}
    url = f"{base}{path}"
    try:
        resp = await client.post(url, json={"items": items})
        resp.raise_for_status()
        body = resp.json()
    except Exception as exc:
        return False, str(exc), {}

    ok, message = _parse_rd_view_response(body)
    data = body.get("data") if isinstance(body, dict) else {}
    return ok, message, data if isinstance(data, dict) else {}


def _extract_sop_node_id_map(response_data: dict[str, Any]) -> dict[str, int]:
    out: dict[str, int] = {}
    rows = response_data.get("items")
    if not isinstance(rows, list):
        return out
    for row in rows:
        if not isinstance(row, dict):
            continue
        sop_node_id = str(row.get("sop_node_id") or "").strip()
        node_id = row.get("id")
        if sop_node_id and node_id is not None:
            out[sop_node_id] = int(node_id)
    return out


async def _sync_archived_demand_view(
    client: httpx.AsyncClient,
    *,
    base: str,
    demand: dict[str, Any],
    assignee_id: str,
) -> tuple[bool, str]:
    from synapse.rd_meeting.owner_order_refresh import (
        _load_assignee_id,
        build_rd_view_demand_save_payload,
    )

    payload = build_rd_view_demand_save_payload(demand, assignee_id=assignee_id or _load_assignee_id())
    payload["local_process_state"] = ARCHIVED_LOCAL_STATE
    payload["run_status"] = "archived"
    url = f"{base}{RD_VIEW_DEMAND_SAVE_PATH}"
    try:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        body = resp.json()
    except Exception as exc:
        return False, str(exc)
    ok, message = _parse_rd_view_response(body)
    return ok, message


def _mark_local_demand_archived(*, demand_no: str) -> None:
    dn = _snapshot_norm_id(demand_no)
    if not dn:
        return

    patch_userwork_summary(
        scope_type="demand",
        scope_id=dn,
        local_process_state=ARCHIVED_LOCAL_STATE,
    )

    dev = load_dev_status(dn)
    if isinstance(dev, dict):
        dev["local_process_state"] = ARCHIVED_LOCAL_STATE
        dev["pipeline_enabled"] = False
        mr = dev.get("meeting_room")
        if isinstance(mr, dict):
            mr = dict(mr)
            mr["active"] = False
            dev["meeting_room"] = mr
        save_dev_status(dn, dev)


async def archive_completed_demand_if_needed(*, demand_no: str) -> dict[str, Any]:
    """已完成且门户已下架的工单：归档 SOP/产出/仓库数据，并将本地状态改为 archived。"""
    dn = _snapshot_norm_id(demand_no)
    if not dn:
        return {"status": "skipped", "demand_no": "", "archived": False, "reason": "empty demand_no"}

    demand = _load_demand_row(dn)
    if not demand:
        return {"status": "skipped", "demand_no": dn, "archived": False, "reason": "demand_not_in_userwork"}

    local = _snapshot_norm_id(demand.get("local_process_state"))
    if local == ARCHIVED_LOCAL_STATE:
        return {"status": "skipped", "demand_no": dn, "archived": True, "reason": "already_archived"}
    if local != OWNED_WORK_ITEM_STATE_COMPLETED:
        return {"status": "skipped", "demand_no": dn, "archived": False, "reason": "not_completed"}

    base = unified_service_base_url()
    if not base:
        return {"status": "skipped", "demand_no": dn, "archived": False, "reason": "missing_devservice_ip"}

    scope_path = scope_dir(dn)
    sop_items = collect_sop_node_items(demand_no=dn, scope_id=dn)
    if scope_path.is_dir() and not sop_items:
        logger.warning("owner_order_archive: no SOP nodes to archive demand_no=%s", dn)

    from synapse.rd_meeting.owner_order_refresh import _load_assignee_id

    assignee_id = _load_assignee_id()
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=120.0) as client:
        ok, message, data = await _post_rd_view_items(
            client,
            base=base,
            path=RD_VIEW_SOP_NODE_INSERT_PATH,
            items=sop_items,
        )
        if not ok and sop_items:
            logger.warning("owner_order_archive sop_node_insert failed demand_no=%s: %s", dn, message)
            return {"status": "failed", "demand_no": dn, "archived": False, "errors": [message]}

        node_id_map = _extract_sop_node_id_map(data)

        output_items = collect_node_output_items(demand_no=dn, scope_id=dn, node_id_map=node_id_map)
        ok, message, _ = await _post_rd_view_items(
            client,
            base=base,
            path=RD_VIEW_NODE_OUTPUT_INSERT_PATH,
            items=output_items,
        )
        if not ok and output_items:
            errors.append(f"node_output: {message}")

        repo_items = collect_repo_output_items(demand_no=dn, demand=demand, node_id_map=node_id_map)
        ok, message, _ = await _post_rd_view_items(
            client,
            base=base,
            path=RD_VIEW_NODE_REPO_OUTPUT_INSERT_PATH,
            items=repo_items,
        )
        if not ok and repo_items:
            errors.append(f"repo_output: {message}")

        archived_demand = dict(demand)
        archived_demand["local_process_state"] = ARCHIVED_LOCAL_STATE
        ok, message = await _sync_archived_demand_view(
            client,
            base=base,
            demand=archived_demand,
            assignee_id=assignee_id,
        )
        if not ok:
            errors.append(f"demand_save: {message}")

    if errors:
        logger.warning("owner_order_archive partial failure demand_no=%s: %s", dn, "; ".join(errors))
        return {"status": "failed", "demand_no": dn, "archived": False, "errors": errors}

    _mark_local_demand_archived(demand_no=dn)
    logger.info(
        "owner_order_archive completed demand_no=%s sop_nodes=%s outputs=%s repos=%s",
        dn,
        len(sop_items),
        len(output_items),
        len(repo_items),
    )
    return {
        "status": "ok",
        "demand_no": dn,
        "archived": True,
        "sop_nodes": len(sop_items),
        "outputs": len(output_items),
        "repos": len(repo_items),
    }
