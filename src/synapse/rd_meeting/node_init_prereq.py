"""node_init 前置：userwork prod 校验与 code/doc 资产补拉。"""

from __future__ import annotations

import logging
from typing import Any, Literal

from synapse.rd_meeting.paths import product_code_root, product_doc_root
from synapse.rd_meeting.pipeline import STEP_WAITING, MeetingPipeline, PipelineRunContext
from synapse.rd_meeting.room_runtime import append_history_event, load_room_state, save_room_state
from synapse.rd_meeting.userwork_sync import _scope_row, patch_userwork_summary

logger = logging.getLogger(__name__)

ScopeType = Literal["demand", "task"]


def resolve_userwork_prod(scope_type: ScopeType, scope_id: str) -> str:
    """读取 userwork.json 中当前 scope 的 ``prod``（唯一键）。"""
    row = _scope_row(scope_type, scope_id)  # type: ignore[arg-type]
    return str(row.get("prod") or "").strip() if row else ""


def resolve_meeting_prod_fallback(
    scope_id: str,
    *,
    dev_status: dict[str, Any] | None = None,
    pipe: MeetingPipeline | None = None,
    ctx: PipelineRunContext | None = None,
) -> str:
    """开会上下文中的 prod（userwork 尚未回写时的兜底）。"""
    if ctx is not None:
        prod = (ctx.prod or "").strip()
        if prod:
            return prod
    data = dev_status if isinstance(dev_status, dict) else {}
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
    """userwork 无 prod 但会议上下文已知 prod 时，补写 userwork 并返回 True。"""
    key = (prod or "").strip()
    if not key or resolve_userwork_prod(scope_type, scope_id):
        return False
    patch_userwork_summary(
        scope_type=scope_type,
        scope_id=scope_id,
        prod=key,
    )
    return True


def _tree_has_any_file(root) -> bool:
    if not root.is_dir():
        return False
    return any(path.is_file() for path in root.rglob("*"))


def code_assets_present_on_disk(scope_id: str) -> bool:
    """``code/`` 下存在任意文件即视为代码已落盘（不校验完整性）。"""
    sid = (scope_id or "").strip()
    return bool(sid) and _tree_has_any_file(product_code_root(sid))


def doc_assets_present_on_disk(scope_id: str) -> bool:
    """``doc/`` 下存在任意文件即视为文档已落盘（不校验完整性）。"""
    sid = (scope_id or "").strip()
    return bool(sid) and _tree_has_any_file(product_doc_root(sid))


def product_assets_present_on_disk(scope_id: str) -> bool:
    """``code/`` 与 ``doc/`` 均已有文件时视为产品资产齐备。"""
    return code_assets_present_on_disk(scope_id) and doc_assets_present_on_disk(scope_id)


def ensure_product_assets_if_absent(
    scope_id: str,
    prod: str,
    *,
    scope_type: ScopeType = "demand",
) -> dict[str, Any] | None:
    """code 或 doc 缺文件时自动拉取产品资产；两侧均有文件则跳过。"""
    sid = (scope_id or "").strip()
    prod_key = (prod or "").strip()
    if not sid or not prod_key:
        return None
    has_code = code_assets_present_on_disk(sid)
    has_doc = doc_assets_present_on_disk(sid)
    if has_code and has_doc:
        return None

    from synapse.rd_meeting.product_assets import (
        bootstrap_product_assets,
        save_product_assets_to_pipeline,
    )
    from synapse.rd_meeting.product_context import (
        ensure_prod_in_catalog,
        match_prod_row_by_prod,
        save_prod_catalog_to_pipeline,
    )

    catalog_rows, catalog_err = ensure_prod_in_catalog(prod_key)
    if catalog_err:
        logger.warning("node_init assets pull skipped scope=%s: %s", sid, catalog_err)
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
        "node_init auto materialized product assets scope=%s status=%s "
        "(had_code=%s had_doc=%s)",
        sid,
        assets.get("status"),
        has_code,
        has_doc,
    )
    return assets


def enter_prod_selection_gate(
    pipe: MeetingPipeline,
    ctx: PipelineRunContext,
    *,
    room_id: str,
    run_node: str,
) -> None:
    """userwork 与会议上下文均无 prod：挂起 pipeline，等待用户选择产品。"""
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
            "flow_stage": "节点初始化",
            "log_type": "warning",
            "chat_text": "工单未绑定产品（prod），请选择产品后继续节点初始化。",
        },
    )


def clear_prod_selection_gate(scope_id: str) -> None:
    """用户提交 prod 后清除门控状态。"""
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


def prepare_node_init_prerequisites(
    pipe: MeetingPipeline,
    ctx: PipelineRunContext,
    *,
    dev_status: dict[str, Any],
    room_id: str,
    run_node: str,
) -> bool:
    """node_init 前置检查。返回 True 表示可继续初始化；False 表示已挂起等待选 prod。"""
    sid = ctx.scope_id
    scope_type = ctx.scope_type

    prod = resolve_userwork_prod(scope_type, sid)
    if not prod:
        fallback = resolve_meeting_prod_fallback(
            sid,
            dev_status=dev_status,
            pipe=pipe,
            ctx=ctx,
        )
        if fallback:
            backfill_userwork_prod_if_missing(
                scope_type=scope_type,
                scope_id=sid,
                prod=fallback,
            )
            prod = fallback

    if not prod:
        enter_prod_selection_gate(pipe, ctx, room_id=room_id, run_node=run_node)
        return False

    ensure_product_assets_if_absent(sid, prod, scope_type=scope_type)
    return True
