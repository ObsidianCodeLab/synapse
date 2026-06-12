"""重处理专用：prod 校验与强制刷新 code/doc 产品资产（不影响一键开会）。"""

from __future__ import annotations

import logging
import shutil
from typing import Any, Literal

from synapse.rd_meeting.dev_status import load_dev_status
from synapse.rd_meeting.paths import product_code_root, product_doc_root
from synapse.rd_meeting.pipeline import STEP_WAITING, MeetingPipeline, PipelineRunContext
from synapse.rd_meeting.room_runtime import append_history_event, load_room_state, save_room_state
from synapse.rd_meeting.userwork_sync import _scope_row, patch_userwork_summary

logger = logging.getLogger(__name__)

ScopeType = Literal["demand", "task"]


def resolve_userwork_prod(scope_type: ScopeType, scope_id: str) -> str:
    row = _scope_row(scope_type, scope_id)  # type: ignore[arg-type]
    return str(row.get("prod") or "").strip() if row else ""


def resolve_meeting_prod_fallback(
    scope_id: str,
    *,
    dev_status: dict[str, Any] | None = None,
    pipe: MeetingPipeline | None = None,
) -> str:
    data = dev_status if isinstance(dev_status, dict) else load_dev_status(scope_id) or {}
    mr = data.get("meeting_room")
    if isinstance(mr, dict):
        prod = str(mr.get("prod") or "").strip()
        if prod:
            return prod
    if pipe is not None:
        pctx = pipe.data.get("context")
        if isinstance(pctx, dict):
            prod = str(pctx.get("selected_prod") or "").strip()
            if prod:
                return prod
    return ""


def backfill_userwork_prod_if_missing(
    *,
    scope_type: ScopeType,
    scope_id: str,
    prod: str,
) -> bool:
    key = (prod or "").strip()
    if not key or resolve_userwork_prod(scope_type, scope_id):
        return False
    patch_userwork_summary(
        scope_type=scope_type,
        scope_id=scope_id,
        prod=key,
    )
    return True


def clear_product_code_and_doc_dirs(scope_id: str) -> None:
    """强制删除 ``work/<scope>/code`` 与 ``doc``（重处理专用）。"""
    sid = (scope_id or "").strip()
    if not sid:
        return
    for root in (product_code_root(sid), product_doc_root(sid)):
        if root.is_dir():
            shutil.rmtree(root)
            logger.info("reprocess: removed product asset dir %s", root)


def force_refresh_product_assets(
    scope_id: str,
    prod: str,
    *,
    scope_type: ScopeType = "demand",
) -> dict[str, Any]:
    """清空 code/doc 后重新拉取产品资产（code 删目录再 clone；doc 仅 D 状态）。"""
    sid = (scope_id or "").strip()
    prod_key = (prod or "").strip()
    if not sid or not prod_key:
        return {"status": "failed", "error": "scope_id 或 prod 为空"}

    from synapse.rd_meeting.product_assets import (
        bootstrap_product_assets,
        save_product_assets_to_pipeline,
    )
    from synapse.rd_meeting.product_context import (
        ensure_prod_in_catalog,
        match_prod_row_by_prod,
        save_prod_catalog_to_pipeline,
    )

    clear_product_code_and_doc_dirs(sid)

    catalog_rows, catalog_err = ensure_prod_in_catalog(prod_key)
    if catalog_err:
        logger.warning("reprocess assets pull failed scope=%s: %s", sid, catalog_err)
        return {"status": "failed", "error": catalog_err}

    save_prod_catalog_to_pipeline(sid, catalog_rows, selected_prod=prod_key)
    wire_hit = match_prod_row_by_prod(catalog_rows, prod_key)
    assets = bootstrap_product_assets(sid, prod_key, wire_row=wire_hit, catalog_rows=catalog_rows)
    save_product_assets_to_pipeline(sid, assets)

    pipe = MeetingPipeline.load(sid)
    pctx = pipe.data.get("context")
    if not isinstance(pctx, dict):
        pctx = {}
    pctx["product_assets"] = assets
    pctx["selected_prod"] = prod_key
    pipe.data["context"] = pctx
    pipe.save()
    logger.info(
        "reprocess force refreshed product assets scope=%s status=%s",
        sid,
        assets.get("status"),
    )
    return assets


def enter_prod_selection_gate(
    pipe: MeetingPipeline,
    ctx: PipelineRunContext,
    *,
    room_id: str,
    run_node: str,
) -> None:
    sid = ctx.scope_id
    rs = dict(load_room_state(sid) or {})
    rs["status"] = "human_intervention"
    rs["intervention_kind"] = "prod_selection"
    rs["intervention_panel"] = "prod_selection"
    rs["phase"] = "waiting"
    rs["current_node_id"] = run_node
    save_room_state(sid, rs)
    ctx.room_state = rs

    pipe.set_phase("waiting", sync_room_state=False)
    pipe.set_flow_step(STEP_WAITING, reason="缺少产品 prod，等待用户选择")

    append_history_event(
        sid,
        {
            "event": "prod_selection_required",
            "room_id": room_id,
            "scope_id": sid,
            "node_id": run_node,
            "flow_stage": "重新处理准备",
            "log_type": "warning",
            "chat_text": "工单未绑定产品（prod），请选择产品后继续重处理。",
        },
    )


def clear_prod_selection_gate(scope_id: str) -> None:
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    if str(rs.get("intervention_kind") or "") != "prod_selection":
        return
    rs["status"] = "processing"
    rs["phase"] = "running"
    rs.pop("intervention_kind", None)
    rs.pop("intervention_panel", None)
    save_room_state(sid, rs)


def resolve_reprocess_prod(
    scope_type: ScopeType,
    scope_id: str,
    *,
    dev_status: dict[str, Any] | None = None,
    pipe: MeetingPipeline | None = None,
) -> str:
    prod = resolve_userwork_prod(scope_type, scope_id)
    if prod:
        return prod
    fallback = resolve_meeting_prod_fallback(scope_id, dev_status=dev_status, pipe=pipe)
    if fallback:
        backfill_userwork_prod_if_missing(
            scope_type=scope_type,
            scope_id=scope_id,
            prod=fallback,
        )
        return fallback
    return ""


def finish_reprocess_product_assets(
    pipe: MeetingPipeline,
    ctx: PipelineRunContext,
    *,
    room_id: str,
    run_node: str,
    dev_status: dict[str, Any],
) -> bool:
    """``reprocess_prep`` 尾部：校验 prod → 清空 code/doc → 强制重拉。False 表示已挂起选 prod。"""
    sid = ctx.scope_id
    scope_type = ctx.scope_type

    prod = resolve_reprocess_prod(
        scope_type,
        sid,
        dev_status=dev_status,
        pipe=pipe,
    )
    if not prod:
        enter_prod_selection_gate(pipe, ctx, room_id=room_id, run_node=run_node)
        return False

    assets = force_refresh_product_assets(sid, prod, scope_type=scope_type)
    status = str(assets.get("status") or "")
    append_history_event(
        sid,
        {
            "event": "reprocess_product_assets",
            "room_id": room_id,
            "scope_id": sid,
            "node_id": run_node,
            "prod": prod,
            "asset_status": status,
            "flow_stage": "重新处理准备",
            "log_type": "info" if status in ("ok", "partial") else "warning",
            "chat_text": (
                f"重处理已刷新产品资产（{prod}）"
                if status in ("ok", "partial")
                else f"重处理刷新产品资产部分失败：{assets.get('error') or status}"
            ),
        },
    )
    return True
