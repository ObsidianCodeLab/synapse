"""研发会议室：work/<scope_id>/ 流水线与会议运行时（Phase 0/1）。"""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from typing import Any, Literal

from synapse.rd_meeting.agent_context_probe import (
    collect_meeting_agent_contexts,
    dump_meeting_agent_contexts,
)
from synapse.rd_meeting.binding import list_resolved_bindings, resolve_node_binding
from synapse.rd_sop.manifest import is_collaborative_node
from synapse.rd_meeting.config_store import (
    load_meeting_room_config,
    save_meeting_room_config,
)
from synapse.rd_meeting.dev_status import (
    ensure_room_id,
    load_dev_status,
    load_or_create_dev_status,
    read_dev_status_file,
    resolve_work_dir_scope,
    save_dev_status,
    should_list_in_meeting_rooms,
)
from synapse.rd_meeting.hitl_submission import (
    parse_hitl_form_text,
    record_hitl_submission_locked,
)
from synapse.rd_meeting.live import collect_live_sub_agents
from synapse.rd_meeting.orchestrator import (
    MeetingRoomOrchestrator,
    cancel_room_run,
    is_room_run_in_progress,
    schedule_run_node,
)
from synapse.rd_meeting.participants import build_meeting_participants
from synapse.rd_meeting.paths import iter_work_order_directories
from synapse.rd_meeting.phase import get_phase
from synapse.rd_meeting.pipeline import MeetingPipeline
from synapse.rd_meeting.room_runtime import (
    append_history_event,
    build_meeting_summary_nodes,
    compute_room_token_budget,
    compute_stage_elapsed_seconds,
    DEFAULT_NODE_TOKEN_BUDGET,
    DEFAULT_TOKEN_BUDGET,
    extract_skipped_node_ids,
    history_to_chat_logs,
    list_archive_index,
    load_room_state,
    mark_room_stopped,
    read_history,
    ensure_metrics_token_budget,
    refresh_node_metrics,
    resolve_node_token_budget,
    save_room_state,
    sync_room_state_from_dev,
)
from synapse.rd_meeting.user_context import (
    append_user_context_pending,
    is_hitl_form_submission,
)
from synapse.rd_meeting.userwork_sync import build_title_index, patch_userwork_summary
from synapse.rd_meeting.validation import resolve_delivery_body_for_archive
from synapse.rd_sop.manifest import list_manifest_stages
from synapse.rd_sop.manifest import is_system_node
from synapse.rd_sop.nodes import (
    ALL_NODES,
    node_display_name,
    stage_id_for_node_id,
    stage_name_for_id,
)

logger = logging.getLogger(__name__)

ScopeType = Literal["demand", "task"]

_open_meeting_tail_tasks: dict[str, asyncio.Task[None]] = {}


class OpenMeetingTailError(Exception):
    """开门 async tail 失败（catalog 校验等），携带 stage 供 WS 推送。"""

    def __init__(self, message: str, *, stage: str = "tail") -> None:
        self.stage = stage
        super().__init__(message)


class MeetingRoomService:
    def get_meeting_room_config(self) -> dict[str, Any]:
        cfg = load_meeting_room_config()
        return {
            **cfg,
            "manifest_version": "1.0.0",
            "stages": list_manifest_stages(),
            "bindings": list_resolved_bindings(),
        }

    def put_meeting_room_config(self, body: dict[str, Any]) -> dict[str, Any]:
        allowed: dict[str, Any] = {}
        if "version" in body:
            allowed["version"] = body["version"]
        for key in (
            "host_llm_endpoint_key",
            "worker_llm_endpoint_key",
        ):
            if key in body:
                value = body.get(key)
                if value is None:
                    continue
                if not isinstance(value, str):
                    raise ValueError(f"{key} must be string")
                value = value.strip()
                if not value:
                    continue
                allowed[key] = value
        if "node_overrides" in body:
            overrides = body["node_overrides"]
            if not isinstance(overrides, dict):
                raise ValueError("node_overrides must be object")
            cleaned: dict[str, Any] = {}
            for node_id, ov in overrides.items():
                if not isinstance(ov, dict):
                    continue
                entry: dict[str, Any] = {}
                for key in (
                    "enabled",
                    "human_confirm",
                    "prompt_supplement",
                    "host_profile_id",
                    "worker_profile_ids",
                    "llm_endpoint_key",
                    "hitl_form_schema",
                    "token_budget",
                ):
                    if key in ov:
                        if key == "token_budget":
                            try:
                                val = int(ov[key])
                                if val > 0:
                                    entry[key] = val
                            except (TypeError, ValueError):
                                pass
                            continue
                        entry[key] = ov[key]
                if entry:
                    nid = str(node_id)
                    if is_collaborative_node(nid):
                        entry["worker_profile_ids"] = []
                    if is_system_node(nid):
                        entry.pop("token_budget", None)
                    cleaned[nid] = entry
            allowed["node_overrides"] = cleaned
        if allowed:
            save_meeting_room_config(allowed)
        return self.get_meeting_room_config()

    def resolve_binding(self, node_id: str) -> dict[str, Any]:
        return resolve_node_binding(node_id)

    @staticmethod
    def _resolve_intervention_panel(room_state: dict[str, Any]) -> str | None:
        from synapse.rd_meeting.intervention_panel import resolve_intervention_panel

        if not isinstance(room_state, dict):
            return None
        pending = room_state.get("pending_delivery")
        node_id = str(room_state.get("current_node_id") or "").strip()
        if not node_id and isinstance(pending, dict):
            node_id = str(pending.get("node_id") or "").strip()
        schema = room_state.get("hitl_form_schema")
        return resolve_intervention_panel(
            node_id=node_id,
            intervention_kind=str(room_state.get("intervention_kind") or "") or None,
            hitl_form_schema=schema if isinstance(schema, dict) else None,
            pending_delivery=pending if isinstance(pending, dict) else None,
        )

    async def run_current_node_sync(
        self,
        room_id: str,
        *,
        agent_pool: Any | None = None,
        dry_run: bool | None = None,
    ) -> dict[str, Any]:
        ctx = self._room_context(room_id)
        if ctx is None:
            raise ValueError("meeting_room_not_found")
        orch = MeetingRoomOrchestrator()
        result = await orch.run_current_node(
            scope_type=ctx["scope_type"],
            scope_id=ctx["scope_id"],
            room_id=room_id,
            ticket_title=str(ctx.get("ticket_title") or ""),
            agent_pool=agent_pool,
            dry_run=dry_run,
        )
        detail = self.get_room_detail(room_id)
        return {"result": result, "room": detail}

    def _room_context(self, room_id: str) -> dict[str, Any] | None:
        detail = self.get_room_detail(room_id)
        if detail is None:
            return None
        return {
            "room_id": room_id,
            "scope_type": detail.get("scope_type"),
            "scope_id": detail.get("scope_id"),
            "ticket_title": detail.get("ticket_title"),
        }

    def list_meeting_rooms(self) -> list[dict[str, Any]]:
        titles = build_title_index()
        items: list[dict[str, Any]] = []
        for order_dir in iter_work_order_directories():
            resolved = resolve_work_dir_scope(order_dir)
            if resolved is None:
                continue
            scope_id, data = resolved
            if not should_list_in_meeting_rooms(data):
                continue
            ensure_metrics_token_budget(scope_id)
            items.append(self._to_list_item(data, scope_id, titles))
        items.sort(key=lambda x: (x.get("updated_at") or ""), reverse=True)
        return items

    def get_by_room_id(self, room_id: str) -> dict[str, Any] | None:
        return self.get_room_detail(room_id)

    @staticmethod
    def _resolve_orchestrator(agent_pool: Any | None = None) -> Any | None:
        from synapse.rd_meeting.agent_session import resolve_meeting_orchestrator

        return resolve_meeting_orchestrator(agent_pool)

    def get_agent_contexts(
        self,
        room_id: str,
        *,
        agent_pool: Any | None = None,
        dump: bool = False,
        message_char_limit: int = 12_000,
        node_id: str | None = None,
    ) -> dict[str, Any] | None:
        """探测会议室各 Agent 池实例的 system prompt / messages（调试监控用）。"""
        detail = self.get_room_detail(room_id)
        if detail is None:
            return None
        scope_id = str(detail.get("scope_id") or "")
        orchestrator = self._resolve_orchestrator(agent_pool)
        payload = collect_meeting_agent_contexts(
            room_id,
            agent_pool,
            orchestrator=orchestrator,
            message_char_limit=message_char_limit,
            node_id=node_id,
        )
        if dump and scope_id:
            payload["dump_path"] = dump_meeting_agent_contexts(payload, scope_id=scope_id)
        return payload

    def get_room_live(
        self,
        room_id: str,
        *,
        agent_pool: Any | None = None,
        history_limit: int = 40,
        view_node_id: str = "",
    ) -> dict[str, Any] | None:
        """轻量 live 快照：phase、委派进度、子 Agent 状态、近期 history（供 UI 轮询）。"""
        detail = self.get_room_detail(room_id)
        if detail is None:
            return None
        scope_id = str(detail.get("scope_id") or "")
        view_nid = (view_node_id or "").strip()
        current_node_id = str(detail.get("current_node_id") or "pending")
        node_token: int | None = None
        if scope_id and view_nid:
            node_token = refresh_node_metrics(
                scope_id,
                view_nid,
                current_node_id=current_node_id,
            )
            rs = load_room_state(scope_id)
            if isinstance(rs, dict):
                detail["room_state"] = rs
        room_state = detail.get("room_state") if isinstance(detail.get("room_state"), dict) else {}
        node_id = view_nid or current_node_id
        history = read_history(scope_id, node_id=node_id, limit=history_limit) if scope_id else []
        all_history = read_history(scope_id, limit=500) if scope_id else []

        orchestrator = self._resolve_orchestrator(agent_pool)

        host_session_id = f"rd_meeting:{room_id.strip()}:host"
        sub_agents: list[dict[str, Any]] = []
        if orchestrator is not None:
            getter = getattr(orchestrator, "get_sub_agent_states", None)
            if callable(getter):
                sub_agents = list(getter(host_session_id) or [])
            if not sub_agents:
                sub_agents = collect_live_sub_agents(orchestrator, host_session_id)

        agents_active = (
            room_state.get("agents_active")
            if isinstance(room_state.get("agents_active"), list)
            else []
        )
        scope_type = str(detail.get("scope_type") or "demand")
        binding = resolve_node_binding(
            node_id,
            scope_type=scope_type,
            scope_id=scope_id,
            ticket_title=str(detail.get("ticket_title") or ""),
        )
        binding["node_id"] = node_id
        participants = (
            room_state.get("participants")
            if isinstance(room_state.get("participants"), list)
            else build_meeting_participants(binding)
        )

        view_node_budget: int | None = resolve_node_token_budget(view_nid) if view_nid else None
        room_metrics = (
            room_state.get("metrics") if isinstance(room_state.get("metrics"), dict) else {}
        )
        room_token_budget = compute_room_token_budget(room_state if isinstance(room_state, dict) else None)
        if not room_token_budget:
            room_token_budget = int(room_metrics.get("token_budget") or 0)

        return {
            "room_id": room_id,
            "scope_id": scope_id,
            "scope_type": detail.get("scope_type"),
            "status": detail.get("status") or room_state.get("status"),
            "phase": get_phase(scope_id) if scope_id else "idle",
            "pipeline": (
                MeetingPipeline.load(scope_id).snapshot_for_api()
                if scope_id and MeetingPipeline.exists(scope_id)
                else None
            ),
            "run_in_progress": is_room_run_in_progress(room_id),
            "current_node_id": detail.get("current_node_id"),
            "current_node_name": detail.get("current_node_name"),
            "stage_id": detail.get("stage_id"),
            "stage_name": detail.get("stage_name"),
            "view_node_id": view_nid or None,
            "view_node_token": node_token if view_nid else None,
            "tokenConsumed": (
                node_token
                if view_nid
                else int(
                    (room_state.get("metrics") or {}).get("tokens")
                    if isinstance(room_state.get("metrics"), dict)
                    else detail.get("tokenConsumed")
                    or 0
                )
            ),
            "tokenBudget": (
                view_node_budget
                if view_nid
                else room_token_budget
            ),
            "stageDuration": detail.get("stageDuration"),
            "meetingStartedAt": detail.get("meetingStartedAt"),
            "agents_active": agents_active,
            "participants": participants,
            "sub_agents": sub_agents,
            "recent_history": history,
            "recent_chat": history_to_chat_logs(history),
            "intervention_kind": room_state.get("intervention_kind"),
            "intervention_panel": self._resolve_intervention_panel(room_state),
            "hitl_form_schema": room_state.get("hitl_form_schema"),
            "hitl_locked": bool(room_state.get("hitl_locked")),
            "hitl_submission": room_state.get("hitl_submission"),
            "pending_delivery": room_state.get("pending_delivery"),
            "solution_review_blocked": bool(room_state.get("solution_review_blocked")),
            "func_solution_blocked": bool(room_state.get("func_solution_blocked")),
            "skipped_node_ids": extract_skipped_node_ids(all_history),
            **(
                {
                    "node_recovery": self.assess_node_recovery(
                        room_id,
                        node_id=str(detail.get("current_node_id") or ""),
                    )
                }
                if scope_id
                else {}
            ),
        }

    def get_room_detail(self, room_id: str) -> dict[str, Any] | None:
        rid = (room_id or "").strip()
        if not rid:
            return None
        titles = build_title_index()
        matches: list[tuple[str, str, dict[str, Any]]] = []
        for order_dir in iter_work_order_directories():
            resolved = resolve_work_dir_scope(order_dir)
            if resolved is None:
                continue
            scope_id, data = resolved
            data = ensure_room_id(data)
            mr = data.get("meeting_room")
            if isinstance(mr, dict) and str(mr.get("room_id") or "").strip() == rid:
                matches.append((str(data.get("updated_at") or ""), scope_id, data))
        if not matches:
            return None
        matches.sort(key=lambda item: item[0], reverse=True)
        _, scope_id, data = matches[0]
        return self._room_detail_payload(data, scope_id, titles)

    def get_room_node_chat(self, room_id: str, node_id: str) -> dict[str, Any] | None:
        """按 SOP 节点读取协作会议流（``agents/<node_id>/room_history.jsonl``）。"""
        detail = self.get_room_detail(room_id)
        if detail is None:
            return None
        scope_id = str(detail.get("scope_id") or "")
        nid = (node_id or detail.get("current_node_id") or "pending").strip() or "pending"
        history = read_history(scope_id, node_id=nid, limit=500) if scope_id else []
        return {
            "room_id": room_id,
            "scope_id": scope_id,
            "node_id": nid,
            "history": history,
            "chat_logs": history_to_chat_logs(history),
        }

    def get_dev_status(self, scope_type: ScopeType, scope_id: str) -> dict[str, Any] | None:
        sid = (scope_id or "").strip()
        if not sid:
            return None
        data = load_dev_status(sid)
        if data is None:
            return None
        return ensure_room_id(data)

    def put_dev_status(
        self,
        scope_type: ScopeType,
        scope_id: str,
        body: dict[str, Any],
        *,
        sync_userwork: bool = True,
    ) -> dict[str, Any]:
        sid = (scope_id or "").strip()
        if not sid:
            raise ValueError("scope_id required")

        existing = load_dev_status(sid)
        if existing is None:
            merged = load_or_create_dev_status(sid, scope_type=scope_type)
        else:
            merged = dict(existing)

        scope = merged.get("scope")
        if not isinstance(scope, dict):
            merged["scope"] = {"type": scope_type, "id": sid}
        else:
            merged["scope"] = {"type": scope_type, "id": sid}

        for key in (
            "local_process_state",
            "stage_id",
            "current_node_id",
            "sop_node_display",
            "pipeline_enabled",
            "meeting_room",
        ):
            if key in body:
                merged[key] = body[key]

        merged = ensure_room_id(merged)
        save_dev_status(sid, merged)

        if sync_userwork:
            self._sync_userwork_from_dev_status(scope_type, sid, merged)

        room_id = str(merged.get("meeting_room", {}).get("room_id") or "")
        if room_id and isinstance(merged.get("meeting_room"), dict) and merged["meeting_room"].get("active"):
            sync_room_state_from_dev(
                sid,
                room_id=room_id,
                scope_type=scope_type,
                stage_id=int(merged.get("stage_id") or 0),
                current_node_id=str(merged.get("current_node_id") or "pending"),
                local_process_state=str(merged.get("local_process_state") or ""),
            )

        return merged

    def list_pending_human_intervention(self) -> list[dict[str, Any]]:
        """扫描 room_state.status=human_intervention 的会议室（Phase 3 通知看板）。"""
        pending: list[dict[str, Any]] = []
        titles = build_title_index()
        for order_dir in iter_work_order_directories():
            resolved = resolve_work_dir_scope(order_dir)
            if resolved is None:
                continue
            scope_id, dev = resolved
            rs = load_room_state(scope_id)
            if not rs or str(rs.get("status") or "") != "human_intervention":
                continue
            item = self._to_list_item(dev, scope_id, titles)
            item["status"] = "human_intervention"
            pending.append(item)
        pending.sort(key=lambda x: (x.get("updated_at") or ""), reverse=True)
        return pending

    def get_soul_instruction(self, scope_id: str) -> dict[str, Any]:
        from synapse.rd_meeting.soul_instruction import (
            load_soul_instruction,
            load_soul_instruction_payload,
            soul_instruction_path,
        )

        sid = (scope_id or "").strip()
        if not sid:
            raise ValueError("scope_id required")
        payload = load_soul_instruction_payload(sid)
        return {
            "scope_id": sid,
            "instruction": load_soul_instruction(sid),
            "updated_at": payload.get("updated_at"),
            "path": str(soul_instruction_path(sid)),
        }

    def put_soul_instruction(
        self,
        scope_id: str,
        instruction: str,
    ) -> dict[str, Any]:
        from synapse.rd_meeting.host_prompt_cache import clear_host_prompt_cache
        from synapse.rd_meeting.soul_instruction import save_soul_instruction, soul_instruction_path

        sid = (scope_id or "").strip()
        if not sid:
            raise ValueError("scope_id required")
        payload = save_soul_instruction(sid, instruction)
        clear_host_prompt_cache(sid)
        return {
            "scope_id": sid,
            "instruction": str(payload.get("instruction") or ""),
            "updated_at": payload.get("updated_at"),
            "path": str(soul_instruction_path(sid)),
        }

    def open_meeting(
        self,
        scope_type: ScopeType,
        scope_id: str,
        *,
        prod: str = "",
        sync_userwork: bool = True,
        promote_to_processing: bool = True,
        soul_instruction: str | None = None,
        agent_pool: Any | None = None,
        schedule_tail: bool | None = None,
    ) -> dict[str, Any]:
        """一键开会：

        - 同步阶段（毫秒级）：写本地 dev_status / room_state / pipeline.json，立即返回 detail（含 room_id）。
        - 异步阶段（后台）：补做外部 HTTP（产品 catalog 校验 + userwork 回写）、节点初始化、主控提示词组装、
          调度首节点执行；过程通过 WebSocket 推送 ``meeting_room_pipeline`` 事件，前端订阅刷新即可。

        ``schedule_tail=False``：仅跑同步 pipeline（供 FastAPI 在 ``to_thread`` 中调用），由路由层
        再调用 :meth:`schedule_open_meeting_async_tail` 投递 tail，避免 worker 线程无法 ``create_task``。

        若运行环境不在 async 循环里（同步测试 / CLI），则回退为完全同步执行，保持向后兼容。
        """
        sid = (scope_id or "").strip()
        if not sid:
            raise ValueError("scope_id required")
        prod_key = (prod or "").strip()
        if not prod_key:
            raise ValueError("请选择产品（prod）")

        from synapse.rd_meeting.soul_instruction import save_soul_instruction_if_provided

        save_soul_instruction_if_provided(sid, soul_instruction)

        existing_dev = load_dev_status(sid)
        if existing_dev is not None:
            mr = existing_dev.get("meeting_room")
            if isinstance(mr, dict) and mr.get("active") is True:
                raise ValueError("meeting_room_already_active")

        from synapse.rd_meeting.pipeline import (
            STEP_OPEN_MEETING,
            PipelineRunContext,
            run_pipeline_until_waiting,
        )

        try:
            loop = asyncio.get_running_loop()
            in_async = True
        except RuntimeError:
            loop = None
            in_async = False

        api_thread_path = schedule_tail is False
        defer_external = in_async or api_thread_path
        should_schedule_tail = in_async if schedule_tail is None else bool(schedule_tail)

        ctx = PipelineRunContext(
            scope_type=scope_type,
            scope_id=sid,
            prod=prod_key,
            sync_userwork=sync_userwork,
            promote_to_processing=promote_to_processing,
            agent_pool=agent_pool,
            defer_external=defer_external,
        )
        run_pipeline_until_waiting(ctx, initial_flow_step=STEP_OPEN_MEETING, create=True)
        if ctx.node_run_scheduled:
            ctx.detail["node_run_scheduled"] = True

        if defer_external:
            ctx.detail["pipeline_async_pending"] = True
            if should_schedule_tail and loop is not None:
                self.schedule_open_meeting_async_tail(
                    loop,
                    scope_type=scope_type,
                    scope_id=sid,
                    prod_key=prod_key,
                    sync_userwork=sync_userwork,
                    agent_pool=agent_pool,
                )
        return ctx.detail

    def schedule_open_meeting_async_tail(
        self,
        loop: asyncio.AbstractEventLoop,
        *,
        scope_type: ScopeType,
        scope_id: str,
        prod_key: str,
        sync_userwork: bool,
        agent_pool: Any | None,
    ) -> None:
        """在 API 事件循环上调度开门 tail（去重；重活在线程池执行）。"""
        sid = (scope_id or "").strip()
        if not sid or loop.is_closed():
            return

        existing = _open_meeting_tail_tasks.get(sid)
        if existing is not None and not existing.done():
            logger.info("open_meeting async tail already running scope=%s", sid)
            return

        from synapse.rd_meeting.orchestrator import _remember_scheduler_loop

        _remember_scheduler_loop(loop)

        async def _runner() -> None:
            try:
                await self._open_meeting_async_tail(
                    scope_type=scope_type,
                    scope_id=sid,
                    prod_key=prod_key,
                    sync_userwork=sync_userwork,
                    agent_pool=agent_pool,
                )
            finally:
                _open_meeting_tail_tasks.pop(sid, None)

        task = loop.create_task(_runner())
        _open_meeting_tail_tasks[sid] = task

    def submit_meeting_prod(
        self,
        room_id: str,
        prod: str,
        *,
        agent_pool: Any | None = None,
    ) -> dict[str, Any]:
        """用户选择 prod 后回写 userwork 并从 node_init 继续 pipeline。"""
        rid = (room_id or "").strip()
        prod_key = (prod or "").strip()
        if not rid:
            raise ValueError("room_id required")
        if not prod_key:
            raise ValueError("请选择产品（prod）")

        detail = self.get_room_detail(rid)
        if detail is None:
            raise ValueError("meeting_room_not_found")

        sid = str(detail.get("scope_id") or "").strip()
        if not sid:
            raise ValueError("scope_id missing")

        scope = detail.get("scope_type") or "demand"
        scope_type: ScopeType = scope if scope in ("demand", "task") else "demand"

        rs = load_room_state(sid) or {}
        if str(rs.get("intervention_kind") or "") != "prod_selection":
            raise ValueError("prod_selection_not_active")

        from synapse.rd_meeting.pipeline import (
            STEP_NODE_INIT,
            STEP_REPROCESS_PREP,
            PipelineRunContext,
            run_pipeline_until_waiting,
        )
        from synapse.rd_meeting.orchestrator import schedule_pipeline_background
        from synapse.rd_meeting.product_context import (
            ensure_prod_in_catalog,
            save_prod_catalog_to_pipeline,
        )
        from synapse.rd_meeting.reprocess_assets import (
            clear_prod_selection_gate,
            force_refresh_product_assets,
        )

        patch_userwork_summary(
            scope_type=scope_type,
            scope_id=sid,
            prod=prod_key,
            local_process_state=str(
                (load_dev_status(sid) or {}).get("local_process_state") or "处理中"
            ),
            sop_node=str((load_dev_status(sid) or {}).get("sop_node_display") or ""),
        )

        dev = load_dev_status(sid) or {}
        mr = dev.get("meeting_room")
        if not isinstance(mr, dict):
            mr = {}
        dev["meeting_room"] = {**mr, "prod": prod_key, "active": True}
        save_dev_status(sid, dev)

        catalog_rows, catalog_err = ensure_prod_in_catalog(prod_key)
        if catalog_err:
            raise ValueError(catalog_err)
        save_prod_catalog_to_pipeline(sid, catalog_rows, selected_prod=prod_key)
        assets = force_refresh_product_assets(sid, prod_key, scope_type=scope_type)
        if str(assets.get("status") or "") == "failed":
            raise ValueError(str(assets.get("error") or "reprocess_assets_failed"))

        clear_prod_selection_gate(sid)

        ctx = PipelineRunContext(
            scope_type=scope_type,
            scope_id=sid,
            prod=prod_key,
            sync_userwork=True,
            promote_to_processing=False,
            agent_pool=agent_pool,
            dev_status=dev,
            detail=dict(detail),
        )

        pipe = MeetingPipeline.load(sid)
        completed = pipe.data.get("steps_completed") or []
        if STEP_REPROCESS_PREP not in completed:
            pipe.mark_step_completed(STEP_REPROCESS_PREP)
        pipe.set_flow_step(STEP_NODE_INIT, reason="用户已选择产品，重处理资产已刷新，继续节点初始化")
        pipe.save()

        def _resume_node_init() -> None:
            run_pipeline_until_waiting(ctx, initial_flow_step=STEP_NODE_INIT, create=False)

        schedule_pipeline_background(rid, _resume_node_init, scope_id=sid)

        append_history_event(
            sid,
            {
                "event": "prod_selection_submitted",
                "room_id": rid,
                "scope_id": sid,
                "prod": prod_key,
                "flow_stage": "重新处理准备",
                "log_type": "info",
                "chat_text": f"已绑定产品：{prod_key}",
            },
        )

        titles = build_title_index()
        payload = self._room_detail_payload(load_dev_status(sid) or dev, sid, titles)
        payload["status"] = "processing"
        payload["run_in_progress"] = True
        return payload

    def reprocess_current_node(
        self,
        room_id: str,
        *,
        reason: str | None = None,
        agent_pool: Any | None = None,
    ) -> dict[str, Any]:
        """重新处理当前 SOP 节点：清理过程数据、当前节点归档产出后从 node_init 重跑。"""
        rid = (room_id or "").strip()
        if not rid:
            raise ValueError("room_id required")

        detail = self.get_room_detail(rid)
        if detail is None:
            raise ValueError("meeting_room_not_found")

        sid = str(detail.get("scope_id") or "").strip()
        if not sid:
            raise ValueError("scope_id missing")

        scope = detail.get("scope_type") or "demand"
        scope_type: ScopeType = scope if scope in ("demand", "task") else "demand"

        from synapse.rd_meeting.pipeline import (
            STEP_REPROCESS_PREP,
            PipelineRunContext,
            clear_room_state_for_node_reprocess,
            run_pipeline_until_waiting,
        )
        from synapse.rd_meeting.orchestrator import schedule_pipeline_background

        cancel_room_run(rid)

        dev = load_dev_status(sid) or {}
        rs = load_room_state(sid) or {}
        current = str(
            rs.get("current_node_id") or detail.get("current_node_id") or "pending"
        ).strip()
        dev["local_process_state"] = "处理中"
        save_dev_status(sid, dev)
        if current and current != "pending":
            clear_room_state_for_node_reprocess(sid, current)
        else:
            rs2 = dict(rs) if isinstance(rs, dict) else {}
            rs2["status"] = "processing"
            rs2["phase"] = "running"
            save_room_state(sid, rs2)

        ctx = PipelineRunContext(
            scope_type=scope_type,
            scope_id=sid,
            sync_userwork=False,
            promote_to_processing=False,
            agent_pool=agent_pool,
            dev_status=dev,
            detail=dict(detail),
        )

        pipe = MeetingPipeline.load(sid)
        self._stash_reprocess_reason_on_pipeline(
            pipe,
            reason=reason,
            until_node_id=current,
        )
        pipe.set_flow_step(STEP_REPROCESS_PREP, reason="用户触发重新处理")
        pipe.save()

        def _run_reprocess_pipeline() -> None:
            run_pipeline_until_waiting(ctx, initial_flow_step=STEP_REPROCESS_PREP)

        schedule_pipeline_background(rid, _run_reprocess_pipeline, scope_id=sid)

        dev = load_dev_status(sid) or {}
        titles = build_title_index()
        payload = self._room_detail_payload(dev, sid, titles)
        payload["status"] = "processing"
        payload["run_in_progress"] = True
        return payload

    @staticmethod
    def _stash_reprocess_reason_on_pipeline(
        pipe: MeetingPipeline,
        *,
        reason: str | None,
        until_node_id: str,
    ) -> None:
        """将一次性重处理原因写入 pipeline context，供 reprocess_prep 落盘到 room_state。"""
        reason_text = (reason or "").strip()
        if not reason_text:
            return
        pctx = pipe._data.get("context")
        if not isinstance(pctx, dict):
            pctx = {}
        pctx["reprocess_reason"] = reason_text
        until = (until_node_id or "").strip()
        if until:
            pctx["reprocess_until_node_id"] = until
        pipe._data["context"] = pctx

    def reprocess_node(
        self,
        room_id: str,
        *,
        node_id: str | None = None,
        reason: str | None = None,
        agent_pool: Any | None = None,
    ) -> dict[str, Any]:
        """重新处理指定节点：当前节点或同阶段历史节点，prep→node_init 重跑。"""
        rid = (room_id or "").strip()
        detail = self.get_room_detail(rid)
        if detail is None:
            raise ValueError("meeting_room_not_found")
        sid = str(detail.get("scope_id") or "").strip()
        if not sid:
            raise ValueError("scope_id missing")
        rs = load_room_state(sid) or {}
        current = str(
            rs.get("current_node_id") or detail.get("current_node_id") or "pending"
        ).strip()
        target = (node_id or current).strip() or current
        if target == current:
            return self.reprocess_current_node(rid, reason=reason, agent_pool=agent_pool)
        if target == "auto_split" or is_system_node(target):
            raise ValueError("system_node_reprocess_forbidden")
        return self._reprocess_historical_node(
            rid,
            sid,
            target=target,
            current=current,
            detail=detail,
            reason=reason,
            agent_pool=agent_pool,
        )

    def _validate_historical_reprocess_target(self, *, target: str, current: str) -> list[str]:
        """校验历史重处理目标，返回 [target..current] 闭区间节点 id。"""
        if is_system_node(target):
            raise ValueError("system_node_reprocess_forbidden")

        ids = [str(n["id"]) for n in ALL_NODES]
        try:
            t_idx = ids.index(target)
            c_idx = ids.index(current)
        except ValueError as exc:
            raise ValueError("invalid_reprocess_target") from exc

        if t_idx >= c_idx:
            raise ValueError("invalid_reprocess_target")

        if stage_id_for_node_id(target) != stage_id_for_node_id(current):
            raise ValueError("cross_stage_reprocess_forbidden")

        node_range = ids[t_idx : c_idx + 1]
        for nid in node_range:
            if is_system_node(nid):
                raise ValueError("system_node_in_reprocess_range")
        return node_range

    def _reprocess_historical_node(
        self,
        room_id: str,
        scope_id: str,
        *,
        target: str,
        current: str,
        detail: dict[str, Any],
        reason: str | None = None,
        agent_pool: Any | None = None,
    ) -> dict[str, Any]:
        """历史节点重处理：回退光标到 target，清理 [target..current] 区间后从 node_init 重跑。"""
        if str(detail.get("status") or "").strip() == "completed":
            raise ValueError("room_completed")

        node_range = self._validate_historical_reprocess_target(target=target, current=current)

        scope = detail.get("scope_type") or "demand"
        scope_type: ScopeType = scope if scope in ("demand", "task") else "demand"

        from synapse.rd_meeting.pipeline import (
            STEP_REPROCESS_PREP,
            PipelineRunContext,
            clear_room_state_for_node_reprocess,
            run_pipeline_until_waiting,
        )
        from synapse.rd_meeting.orchestrator import schedule_pipeline_background

        cancel_room_run(room_id)

        dev = load_dev_status(scope_id) or {}
        dev["current_node_id"] = target
        dev["stage_id"] = stage_id_for_node_id(target)
        dev["sop_node_display"] = node_display_name(target)
        dev["local_process_state"] = "处理中"
        save_dev_status(scope_id, dev)
        room_id_val = str((dev.get("meeting_room") or {}).get("room_id") or room_id or "").strip()
        if room_id_val:
            sync_room_state_from_dev(
                scope_id,
                room_id=room_id_val,
                scope_type=scope_type,
                stage_id=int(dev.get("stage_id") or 0),
                current_node_id=target,
                local_process_state="处理中",
            )
        extra = [n for n in node_range if n != target]
        clear_room_state_for_node_reprocess(
            scope_id, target, extra_node_ids=extra or None
        )

        patch_userwork_summary(
            scope_type=scope_type,
            scope_id=scope_id,
            sop_node=node_display_name(target),
            local_process_state="处理中",
        )

        pipe = MeetingPipeline.load(scope_id)
        pctx = pipe._data.get("context")
        if not isinstance(pctx, dict):
            pctx = {}
        pctx["reprocess_node_ids"] = node_range
        pctx["reprocess_historical_target"] = target
        reason_text = (reason or "").strip()
        if reason_text:
            pctx["reprocess_reason"] = reason_text
            pctx["reprocess_until_node_id"] = current
        pipe._data["context"] = pctx
        pipe._data["current_node_id"] = target
        pipe.set_flow_step(
            STEP_REPROCESS_PREP,
            reason=f"用户触发历史节点重新处理：{node_display_name(target)}",
        )
        pipe.save()

        ctx = PipelineRunContext(
            scope_type=scope_type,
            scope_id=scope_id,
            sync_userwork=False,
            promote_to_processing=False,
            agent_pool=agent_pool,
            dev_status=dev,
            detail=dict(detail),
        )

        def _run_reprocess_pipeline() -> None:
            run_pipeline_until_waiting(ctx, initial_flow_step=STEP_REPROCESS_PREP)

        schedule_pipeline_background(room_id_val or room_id, _run_reprocess_pipeline, scope_id=scope_id)

        dev = load_dev_status(scope_id) or {}
        titles = build_title_index()
        payload = self._room_detail_payload(dev, scope_id, titles)
        payload["status"] = "processing"
        payload["run_in_progress"] = True
        return payload

    async def reset_demand_to_audit(
        self,
        room_id: str,
        *,
        comments: str = "",
    ) -> dict[str, Any]:
        """工单处理初始化：停跑、删除 work 目录、研发云回需求评审并回写 userwork。"""
        rid = (room_id or "").strip()
        if not rid:
            raise ValueError("room_id required")

        detail = self.get_room_detail(rid)
        scope_id = ""
        if detail is not None:
            scope = detail.get("scope_type") or "demand"
            if scope != "demand":
                raise ValueError("demand_scope_only")
            scope_id = str(detail.get("scope_id") or "").strip()

        from synapse.rd_meeting.demand_init_reset import (
            resolve_demand_scope_id,
            reset_demand_work_to_audit,
        )

        if not scope_id:
            scope_id = resolve_demand_scope_id(room_id=rid) or ""
        if not scope_id:
            raise ValueError("scope_id missing")

        return await reset_demand_work_to_audit(
            scope_id,
            room_id=rid,
            comments=comments,
        )

    def stop_room_run(self, room_id: str, *, reason: str = "user_stop") -> dict[str, Any]:
        """终止当前节点后台运行，会议室标为 stopped。"""
        rid = (room_id or "").strip()
        if not rid:
            raise ValueError("room_id required")
        detail = self.get_room_detail(rid)
        if detail is None:
            raise ValueError("meeting_room_not_found")
        sid = str(detail.get("scope_id") or "").strip()
        if not sid:
            raise ValueError("scope_id missing")

        st = str((load_room_state(sid) or {}).get("status") or detail.get("status") or "")
        if st != "processing":
            raise ValueError("room_not_running")

        cancel_room_run(rid)
        mark_room_stopped(sid, reason=reason or "user_stop")
        append_history_event(
            sid,
            {
                "event": "room_stopped",
                "room_id": rid,
                "node_id": str(detail.get("current_node_id") or "pending"),
                "text": "用户终止当前节点运行",
                "stopped_reason": reason or "user_stop",
                "log_type": "warning",
                "agent_id": "user",
            },
        )
        dev = load_dev_status(sid) or {}
        titles = build_title_index()
        return self._room_detail_payload(dev, sid, titles)

    def assess_node_recovery(
        self,
        room_id: str,
        *,
        node_id: str | None = None,
    ) -> dict[str, Any]:
        """检测当前节点是否可从服务重启停止态恢复人工门控。"""
        rid = (room_id or "").strip()
        detail = self.get_room_detail(rid)
        if detail is None:
            raise ValueError("meeting_room_not_found")
        sid = str(detail.get("scope_id") or "").strip()
        if not sid:
            raise ValueError("scope_id missing")
        from synapse.rd_meeting.room_recovery import RECOVERY_REASON_LABELS, assess_node_recovery

        out = assess_node_recovery(
            sid,
            node_id=node_id,
            run_in_progress=is_room_run_in_progress(rid),
        )
        code = out.get("reason_code")
        if code:
            out["reason"] = RECOVERY_REASON_LABELS.get(str(code), str(code))
        return out

    def recover_stopped_node(
        self,
        room_id: str,
        *,
        node_id: str | None = None,
    ) -> dict[str, Any]:
        """恢复 server_restart 停止态到人工门控，不清理节点过程数据。"""
        rid = (room_id or "").strip()
        detail = self.get_room_detail(rid)
        if detail is None:
            raise ValueError("meeting_room_not_found")
        sid = str(detail.get("scope_id") or "").strip()
        if not sid:
            raise ValueError("scope_id missing")

        from synapse.rd_meeting.room_recovery import recover_stopped_node as _recover

        _recover(
            sid,
            room_id=rid,
            node_id=node_id,
            run_in_progress=is_room_run_in_progress(rid),
        )
        dev = load_dev_status(sid) or {}
        titles = build_title_index()
        payload = self._room_detail_payload(dev, sid, titles)
        payload["node_recovery"] = self.assess_node_recovery(rid, node_id=node_id)
        return payload

    @staticmethod
    def _attach_node_recovery(
        payload: dict[str, Any],
        *,
        room_id: str,
        scope_id: str,
        node_id: str | None = None,
    ) -> dict[str, Any]:
        from synapse.rd_meeting.room_recovery import RECOVERY_REASON_LABELS, assess_node_recovery

        out = dict(payload)
        assessment = assess_node_recovery(
            scope_id,
            node_id=node_id,
            run_in_progress=is_room_run_in_progress(room_id),
        )
        code = assessment.get("reason_code")
        if code:
            assessment["reason"] = RECOVERY_REASON_LABELS.get(str(code), str(code))
        out["node_recovery"] = assessment
        return out

    def _open_meeting_sync_tail(
        self,
        *,
        scope_type: ScopeType,
        scope_id: str,
        prod_key: str,
        sync_userwork: bool,
        agent_pool: Any | None,
    ) -> None:
        """开门 tail 同步重活（catalog / git / userwork），在线程池执行。"""
        sid = (scope_id or "").strip()
        from synapse.rd_meeting.product_context import (
            ensure_prod_in_catalog,
            match_prod_row_by_prod,
            save_prod_catalog_to_pipeline,
        )
        from synapse.rd_meeting.userwork_sync import patch_userwork_summary

        dev = load_dev_status(sid) or {}
        sop_display = str(dev.get("sop_node_display") or "")
        local = str(dev.get("local_process_state") or "处理中")

        catalog_rows, catalog_err = ensure_prod_in_catalog(prod_key)
        if catalog_err:
            raise OpenMeetingTailError(catalog_err, stage="catalog")

        save_prod_catalog_to_pipeline(sid, catalog_rows, selected_prod=prod_key)

        from synapse.rd_meeting.product_assets import (
            bootstrap_product_assets,
            save_product_assets_to_pipeline,
        )

        wire_hit = match_prod_row_by_prod(catalog_rows, prod_key)
        assets = bootstrap_product_assets(
            sid, prod_key, wire_row=wire_hit, catalog_rows=catalog_rows
        )
        save_product_assets_to_pipeline(sid, assets)
        pipe = MeetingPipeline.load(sid)
        if pipe is not None:
            pctx = pipe.data.get("context")
            if not isinstance(pctx, dict):
                pctx = {}
            pctx["product_assets"] = assets
            pipe.data["context"] = pctx
            pipe.save()

        try:
            from synapse.rd_meeting.host_prompt import assemble_host_prompt_bundle
            from synapse.rd_meeting.host_prompt_cache import save_host_prompt_cache

            run_node = str(dev.get("current_node_id") or "pending")
            ticket_title = str(dev.get("ticket_title") or dev.get("demand_title") or "")
            run_binding = resolve_node_binding(
                run_node,
                scope_type=scope_type,
                scope_id=sid,
                ticket_title=ticket_title,
            )
            bundle = assemble_host_prompt_bundle(
                scope_type=scope_type,
                scope_id=sid,
                node_id=run_node,
                binding=run_binding,
                ticket_title=ticket_title,
            )
            save_host_prompt_cache(sid, bundle)
        except Exception as exc:
            logger.warning("refresh host prompt after product assets failed: %s", exc)

        if sync_userwork:
            patch_userwork_summary(
                scope_type=scope_type,  # type: ignore[arg-type]
                scope_id=sid,
                sop_node=sop_display,
                local_process_state=local,
                prod=prod_key,
            )

        room_id = ""
        mr = dev.get("meeting_room")
        if isinstance(mr, dict):
            room_id = str(mr.get("room_id") or "")
        if room_id:
            try:
                schedule_run_node(
                    scope_type=str(scope_type),
                    scope_id=sid,
                    room_id=room_id,
                    ticket_title=str(dev.get("ticket_title") or dev.get("demand_title") or ""),
                    agent_pool=agent_pool,
                )
            except Exception as exc:
                logger.warning("schedule_run_node in async tail failed scope=%s: %s", sid, exc)

    async def _open_meeting_async_tail(
        self,
        *,
        scope_type: ScopeType,
        scope_id: str,
        prod_key: str,
        sync_userwork: bool,
        agent_pool: Any | None,
    ) -> None:
        """开门后异步补做：产品 catalog 校验 + userwork 回写（重活在线程池）。

        失败通过 WebSocket 推 ``meeting_room_open_error``，由前端弹 toast；
        成功推 ``meeting_room_pipeline_ready``，前端刷新会议室即可。
        """
        sid = (scope_id or "").strip()
        try:
            await asyncio.to_thread(
                self._open_meeting_sync_tail,
                scope_type=scope_type,
                scope_id=sid,
                prod_key=prod_key,
                sync_userwork=sync_userwork,
                agent_pool=agent_pool,
            )
            await self._broadcast_meeting_event(
                "meeting_room_pipeline_ready",
                {"scope_id": sid, "prod": prod_key},
            )
        except OpenMeetingTailError as exc:
            await self._broadcast_meeting_event(
                "meeting_room_open_error",
                {"scope_id": sid, "error": str(exc), "stage": exc.stage},
            )
        except Exception as exc:
            logger.exception("open_meeting async tail failed scope=%s: %s", sid, exc)
            await self._broadcast_meeting_event(
                "meeting_room_open_error",
                {"scope_id": sid, "error": str(exc), "stage": "tail"},
            )

    async def _broadcast_meeting_event(self, event: str, data: dict[str, Any]) -> None:
        try:
            from synapse.api.routes.websocket import broadcast_event

            await broadcast_event(event, data)
        except Exception:
            pass

    def intervene(
        self,
        room_id: str,
        *,
        text: str,
        message_type: str = "instruction",
        resume_run: bool = False,
        form_values: dict[str, Any] | None = None,
        agent_pool: Any | None = None,
    ) -> dict[str, Any]:
        rid = (room_id or "").strip()
        text = (text or "").strip()
        if not rid:
            raise ValueError("room_id required")
        if not text:
            raise ValueError("text required")

        detail = self.get_room_detail(rid)
        if detail is None:
            raise ValueError("meeting_room_not_found")

        scope_id = str(detail.get("scope_id") or "")
        scope_type = str(detail.get("scope_type") or "demand")
        ticket_title = str(detail.get("ticket_title") or "")

        room_state = load_room_state(scope_id) or {}
        rs = dict(room_state) if isinstance(room_state, dict) else {}

        if is_hitl_form_submission(text) and rs.get("hitl_locked"):
            raise ValueError("hitl_form_already_locked")

        if is_hitl_form_submission(text) and message_type == "instruction":
            return self._handle_hitl_form_submission(
                rid,
                scope_type=scope_type,
                scope_id=scope_id,
                text=text,
                form_values=form_values if isinstance(form_values, dict) else None,
                ticket_title=ticket_title,
                room_state=rs,
                detail=detail,
                agent_pool=agent_pool,
            )

        append_user_context_pending(scope_id, text)

        append_history_event(
            scope_id,
            {
                "event": "human_intervene",
                "room_id": rid,
                "node_id": str(detail.get("current_node_id") or rs.get("current_node_id") or "pending"),
                "text": text,
                "message_type": message_type,
                "log_type": "user",
                "agent_id": "user",
                "id": uuid.uuid4().hex[:12],
            },
        )

        if rs.get("solution_review_blocked") and resume_run:
            raise ValueError("solution_review_blocked")
        if rs.get("func_solution_blocked") and resume_run:
            raise ValueError("func_solution_blocked")

        effective_resume = resume_run
        if message_type == "instruction":
            if str(rs.get("status") or "") == "human_intervention" and not rs.get(
                "solution_review_blocked"
            ):
                effective_resume = True
                rs["status"] = "processing"
                save_room_state(scope_id, rs)
        elif message_type == "chat":
            effective_resume = False

        out = self.get_room_detail(rid) or detail
        if effective_resume and message_type == "instruction":
            schedule_run_node(
                scope_type=scope_type,  # type: ignore[arg-type]
                scope_id=scope_id,
                room_id=rid,
                ticket_title=ticket_title,
                agent_pool=agent_pool,
            )
            out["resume_run_started"] = True
        return out

    def _handle_hitl_form_submission(
        self,
        room_id: str,
        *,
        scope_type: str,
        scope_id: str,
        text: str,
        form_values: dict[str, Any] | None = None,
        ticket_title: str,
        room_state: dict[str, Any],
        detail: dict[str, Any],
        agent_pool: Any | None = None,
    ) -> dict[str, Any]:
        """问卷提交：落地锁定 → 按 intervention_kind 分支继续处理。"""
        rid = room_id.strip()
        sid = scope_id.strip()
        parsed_values, comment, parsed_decision = parse_hitl_form_text(text)
        effective_values = dict(parsed_values)
        if isinstance(form_values, dict) and form_values:
            effective_values.update(form_values)
        schema_snapshot = room_state.get("hitl_form_schema")
        schema_for_validation = schema_snapshot if isinstance(schema_snapshot, dict) else None
        kind_pre = str(room_state.get("intervention_kind") or "interactive").strip().lower()
        if kind_pre == "interactive" and schema_for_validation:
            from synapse.rd_meeting.hitl_closure_guard import validate_user_closure_submission

            validate_user_closure_submission(effective_values, schema_for_validation)
        submission = record_hitl_submission_locked(
            sid, raw_text=text, values=effective_values
        )
        schema = submission.get("schema_snapshot") if isinstance(submission.get("schema_snapshot"), dict) else None
        if kind_pre == "interactive":
            from synapse.rd_meeting.hitl_closure_guard import set_closure_intent
            from synapse.rd_meeting.hitl_feedback import (
                user_selected_no_further_processing,
                user_wants_further_processing,
            )

            if user_wants_further_processing(effective_values, schema):
                set_closure_intent(sid, "further")
                from synapse.rd_meeting.work_plan import sync_interactive_required_after_closure

                sync_interactive_required_after_closure(sid, "further")
            elif user_selected_no_further_processing(effective_values, schema):
                set_closure_intent(sid, "done")
                from synapse.rd_meeting.work_plan import sync_interactive_required_after_closure

                sync_interactive_required_after_closure(sid, "done")

        from synapse.rd_meeting.work_plan import mark_archive_doc_pending

        mark_archive_doc_pending(sid)

        from synapse.rd_meeting.hitl_feedback import (
            build_hitl_round_record,
            classify_hitl_feedback_mode,
            format_hitl_current_round_prompt,
            format_hitl_feedback_structured,
            prompt_after_hitl_feedback,
        )
        from synapse.rd_meeting.hitl_lifecycle import (
            resolve_ready_for_node_review_after_hitl,
            set_hitl_feedback_mode,
            set_ready_for_node_review,
        )

        feedback_mode = classify_hitl_feedback_mode(effective_values, schema, comment=comment)
        instruction_text = format_hitl_feedback_structured(effective_values, schema, comment=comment)

        kind = str(room_state.get("intervention_kind") or "interactive").strip().lower()
        node_id = str(room_state.get("current_node_id") or "pending")
        followup_round = 0
        if kind == "interactive" and node_id not in ("", "pending"):
            try:
                from synapse.rd_meeting.binding import resolve_node_binding
                from synapse.rd_meeting.hitl_context import read_hitl_context

                hitl_binding = resolve_node_binding(node_id)
                prior = read_hitl_context(sid, node_id, binding=hitl_binding)
                followup_round = len(prior.get("rounds") or []) + 1
            except Exception:
                followup_round = 1
        round_record = build_hitl_round_record(
            effective_values,
            schema,
            comment=comment,
            intervention_kind=kind,
            feedback_mode=feedback_mode,
        )
        append_user_context_pending(sid, format_hitl_current_round_prompt(round_record))

        try:
            from synapse.rd_meeting.binding import resolve_node_binding
            from synapse.rd_meeting.hitl_confirmed import append_hitl_confirmed
            from synapse.rd_meeting.hitl_context import append_hitl_context_round

            hitl_binding = resolve_node_binding(node_id) if node_id not in ("", "pending") else None
            append_hitl_confirmed(
                sid,
                node_id,
                instruction_text,
                binding=hitl_binding,
                intervention_kind=kind,
            )
            if kind == "interactive":
                append_hitl_context_round(
                    sid,
                    node_id,
                    round_record,
                    binding=hitl_binding,
                )
            if kind == "interactive" and node_id not in ("", "pending"):
                from synapse.rd_meeting.clarify_followup import (
                    build_clarify_followup_brief,
                    write_clarify_fill_ctx,
                )

                write_clarify_fill_ctx(sid, node_id, binding=hitl_binding, scope_type=scope_type)
                followup_brief = build_clarify_followup_brief(sid, node_id, binding=hitl_binding)
                if followup_brief:
                    append_user_context_pending(sid, followup_brief)
        except Exception as exc:
            logger.debug("append hitl artifacts failed scope=%s: %s", sid, exc)
        pending = room_state.get("pending_delivery")
        if not isinstance(pending, dict):
            pending = {}

        append_history_event(
            sid,
            {
                "event": "hitl_form_submitted",
                "room_id": rid,
                "node_id": str(room_state.get("current_node_id") or detail.get("current_node_id") or "pending"),
                "text": text,
                "message_type": "instruction",
                "log_type": "user",
                "agent_id": "user",
                "intervention_kind": kind,
                "id": uuid.uuid4().hex[:12],
            },
        )

        try:
            from synapse.rd_meeting.agent_activity import record_host_human_input
            from synapse.rd_meeting.binding import resolve_node_binding

            node_id = str(room_state.get("current_node_id") or "pending")
            binding = resolve_node_binding(node_id)
            host_id = str(binding.get("host_profile_id") or "default").strip() or "default"
            record_host_human_input(
                sid,
                node_id,
                host_id,
                input_kind="questionnaire_feedback" if kind == "interactive" else "summary_feedback",
                title="人类问卷反馈" if kind == "interactive" else "人类总结反馈",
                summary=instruction_text[:1200],
                detail={"intervention_kind": kind, "form_values": effective_values},
            )
        except Exception as exc:
            logger.debug("hitl form activity record failed: %s", exc)

        orch = MeetingRoomOrchestrator()
        resume_started = False

        if kind == "result_confirm":
            approved, dec_comment = self._parse_hitl_decision(
                text, resume_run=True, explicit_decision=parsed_decision
            )
            if dec_comment and not comment:
                comment = dec_comment
            if not approved:
                from synapse.rd_meeting.work_plan import mark_archive_doc_pending

                mark_archive_doc_pending(sid)
                rs2 = dict(load_room_state(sid) or {})
                rs2["status"] = "processing"
                save_room_state(sid, rs2)
                orch.confirm_node_delivery(
                    scope_type=scope_type,  # type: ignore[arg-type]
                    scope_id=sid,
                    room_id=rid,
                    approved=False,
                    comment=comment,
                    ticket_title=ticket_title,
                    agent_pool=agent_pool,
                )
                out = self.get_room_detail(rid) or detail
                out["resume_run_started"] = True
                return out

            node_id = str(pending.get("node_id") or room_state.get("current_node_id") or "")
            report_body = resolve_delivery_body_for_archive(
                sid,
                node_id,
                str(pending.get("report_body") or "").strip(),
            )
            if report_body != str(pending.get("report_body") or "").strip():
                rs_fix = dict(load_room_state(sid) or {})
                pend = dict(rs_fix.get("pending_delivery") or pending)
                pend["report_body"] = report_body
                rs_fix["pending_delivery"] = pend
                save_room_state(sid, rs_fix)

            rs_proc = dict(load_room_state(sid) or {})
            rs_proc["status"] = "processing"
            save_room_state(sid, rs_proc)
            orch.confirm_node_delivery(
                scope_type=scope_type,  # type: ignore[arg-type]
                scope_id=sid,
                room_id=rid,
                approved=True,
                comment=comment,
                ticket_title=ticket_title,
                agent_pool=agent_pool,
            )
            out = self.get_room_detail(rid) or detail
            out["hitl_locked"] = True
            return out

        if kind == "exception":
            decision = (parsed_decision or str(effective_values.get("decision") or "")).lower()
            rs2 = dict(load_room_state(sid) or {})
            rs2["status"] = "processing"
            save_room_state(sid, rs2)
            if decision in ("abort", "reject"):
                rs2 = dict(load_room_state(sid) or {})
                rs2["status"] = "failed"
                rs2.pop("hitl_form_schema", None)
                save_room_state(sid, rs2)
                append_history_event(
                    sid,
                    {
                        "event": "hitl_exception_abort",
                        "room_id": rid,
                        "node_id": str(rs2.get("current_node_id") or detail.get("current_node_id") or "pending"),
                        "comment": comment,
                        "log_type": "warning",
                        "agent_id": "user",
                    },
                )
            else:
                schedule_run_node(
                    scope_type=scope_type,  # type: ignore[arg-type]
                    scope_id=sid,
                    room_id=rid,
                    ticket_title=ticket_title,
                    agent_pool=agent_pool,
                )
                resume_started = True
            out = self.get_room_detail(rid) or detail
            out["resume_run_started"] = resume_started
            out["hitl_locked"] = True
            return out

        # interactive / 会中澄清：结构化反馈 + 分模式续跑本节点

        set_ready_for_node_review(
            sid,
            resolve_ready_for_node_review_after_hitl(
                sid,
                node_id,
                feedback_mode,
                values=effective_values,
                schema=schema,
            ),
        )
        set_hitl_feedback_mode(sid, feedback_mode)
        rs2 = dict(load_room_state(sid) or {})
        rs2["status"] = "processing"
        rs2["rework_instruction"] = prompt_after_hitl_feedback(
            feedback_mode,
            followup_round=followup_round,
            values=effective_values,
            schema=schema,
        )
        save_room_state(sid, rs2)
        schedule_run_node(
            scope_type=scope_type,  # type: ignore[arg-type]
            scope_id=sid,
            room_id=rid,
            ticket_title=ticket_title,
            agent_pool=agent_pool,
        )
        out = self.get_room_detail(rid) or detail
        out["resume_run_started"] = True
        out["hitl_locked"] = True
        out["hitl_feedback_mode"] = feedback_mode
        return out

    def _parse_hitl_decision(
        self,
        text: str,
        *,
        resume_run: bool = False,
        explicit_decision: str | None = None,
    ) -> tuple[bool, str]:
        """解析人工确认表单或一键通过指令，返回 (是否通过, 补充说明)。"""
        lower = text.lower()
        comment = ""
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.lower().startswith("comment:") or stripped.startswith("补充说明:"):
                comment = stripped.split(":", 1)[-1].strip()

        dec = (explicit_decision or "").strip().lower()
        if dec in ("reject", "abort", "no"):
            return False, comment or text
        if dec in ("approve", "retry", "ok", "yes"):
            return True, comment

        if "decision: reject" in lower or "decision:reject" in lower:
            return False, comment or text
        if "decision: approve" in lower or "decision:approve" in lower:
            return True, comment
        if "不通过" in text or "需返工" in text:
            return False, comment or text
        if re.search(r"\breject\b", lower) and "approve" not in lower:
            return False, comment or text
        if resume_run or "人工确认通过" in text or "approve" in lower:
            return True, comment
        return True, comment or text

    def meeting_summary(self, scope_type: ScopeType, scope_id: str) -> dict[str, Any]:
        """工单侧只读聚合：dev.status + room_state + archive + 节点 metrics。"""
        sid = (scope_id or "").strip()
        dev = load_dev_status(sid)
        room_state = load_room_state(sid)
        history = read_history(sid, limit=100)
        archive_index = list_archive_index(sid)
        nodes = build_meeting_summary_nodes(dev, room_state, scope_id=sid)

        metrics = room_state.get("metrics") if isinstance(room_state, dict) else {}
        if not isinstance(metrics, dict):
            metrics = {}

        return {
            "scope_type": scope_type,
            "scope_id": sid,
            "dev_status": dev,
            "room_state": room_state,
            "room_id": self._extract_room_id(dev, room_state),
            "summary_metrics": {
                "stage_seconds": self._stage_elapsed_seconds(metrics),
                "stage_started_at": str(metrics.get("stage_started_at") or "").strip(),
                "tokens": int(metrics.get("tokens") or 0),
                "token_budget": compute_room_token_budget(
                    room_state if isinstance(room_state, dict) else None
                ),
                "human_interventions": sum(
                    1 for h in history if str(h.get("event") or "") == "human_intervene"
                ),
            },
            "nodes": nodes,
            "archive_index": archive_index,
            "recent_history": history[-20:],
            "recent_chat": history_to_chat_logs(history),
        }

    @staticmethod
    def _extract_room_id(
        dev: dict[str, Any] | None,
        room_state: dict[str, Any] | None,
    ) -> str:
        if isinstance(dev, dict):
            mr = dev.get("meeting_room")
            if isinstance(mr, dict):
                rid = str(mr.get("room_id") or "").strip()
                if rid:
                    return rid
        if isinstance(room_state, dict):
            return str(room_state.get("room_id") or "").strip()
        return ""

    def _room_detail_payload(
        self,
        data: dict[str, Any],
        scope_id: str,
        titles: dict[str, dict[str, str]],
    ) -> dict[str, Any]:
        item = self._to_list_item(data, scope_id, titles)
        room_state = load_room_state(scope_id)
        history = read_history(scope_id, limit=500)
        archive_index = list_archive_index(scope_id)

        if room_state and isinstance(room_state.get("metrics"), dict):
            m = room_state["metrics"]
            item["stageDuration"] = self._format_duration(self._stage_elapsed_seconds(m))
            item["tokenConsumed"] = int(m.get("tokens") or 0)
            item["tokenBudget"] = compute_room_token_budget(room_state)
            item["meetingStartedAt"] = str(m.get("stage_started_at") or "").strip()
            rs = str(room_state.get("status") or "")
            if rs in ("processing", "human_intervention", "completed", "failed", "stopped"):
                item["status"] = rs

        item["skipped_node_ids"] = extract_skipped_node_ids(history)
        scope = data.get("scope") if isinstance(data.get("scope"), dict) else {}
        scope_type = str(scope.get("type") or "demand")
        node_id = str(data.get("current_node_id") or "pending")
        ticket_title = str(item.get("ticket_title") or "")
        binding = resolve_node_binding(
            node_id,
            scope_type=scope_type,
            scope_id=scope_id,
            ticket_title=ticket_title,
        )
        binding["node_id"] = node_id
        participants = build_meeting_participants(binding)
        if isinstance(room_state, dict) and isinstance(room_state.get("participants"), list):
            participants = room_state["participants"]

        item["room_state"] = room_state
        item["history"] = history
        item["archive_index"] = archive_index
        item["chat_logs"] = history_to_chat_logs(history)
        item["current_node_binding"] = binding
        item["participants"] = participants
        if MeetingPipeline.exists(scope_id):
            item["pipeline"] = MeetingPipeline.load(scope_id).snapshot_for_api()
        room_id = str(item.get("room_id") or "")
        if room_id and scope_id:
            item = self._attach_node_recovery(
                item,
                room_id=room_id,
                scope_id=scope_id,
                node_id=str(item.get("current_node_id") or ""),
            )
        return item

    @staticmethod
    def _stage_elapsed_seconds(metrics: dict[str, Any]) -> int:
        started = str(metrics.get("stage_started_at") or "").strip()
        if started:
            return compute_stage_elapsed_seconds(started)
        return int(metrics.get("stage_seconds") or 0)

    @staticmethod
    def _format_duration(seconds: int) -> str:
        if seconds < 60:
            return f"{seconds}s"
        if seconds < 3600:
            return f"{seconds // 60}m"
        return f"{seconds // 3600}h {(seconds % 3600) // 60}m"

    def _userwork_row_for_scope(self, scope_type: ScopeType, scope_id: str) -> dict[str, Any] | None:
        from synapse.api.routes.dev_iwhalecloud import _snapshot_norm_id
        from synapse.rd_meeting.userwork_sync import _load_userwork_list

        sid = _snapshot_norm_id(scope_id)
        for demand in _load_userwork_list():
            if scope_type == "demand":
                if _snapshot_norm_id(demand.get("demand_no")) == sid:
                    return demand
                continue
            owned = demand.get("owned_work_items")
            if not isinstance(owned, list):
                continue
            for task in owned:
                if isinstance(task, dict) and _snapshot_norm_id(task.get("task_no")) == sid:
                    return task
        return None

    def _sync_userwork_from_dev_status(
        self, scope_type: ScopeType, scope_id: str, data: dict[str, Any]
    ) -> None:
        node_id = str(data.get("current_node_id") or "")
        display = str(data.get("sop_node_display") or "").strip() or node_display_name(node_id)
        local = str(data.get("local_process_state") or "").strip()
        patch_userwork_summary(
            scope_type=scope_type,
            scope_id=scope_id,
            sop_node=display,
            local_process_state=local or None,
        )

    def _to_list_item(
        self,
        data: dict[str, Any],
        scope_id: str,
        titles: dict[str, dict[str, str]],
    ) -> dict[str, Any]:
        data = ensure_room_id(data)
        scope = data.get("scope") if isinstance(data.get("scope"), dict) else {}
        scope_type = str(scope.get("type") or titles.get(scope_id, {}).get("scope_type") or "demand")
        stage_id = int(data.get("stage_id") or 0)
        node_id = str(data.get("current_node_id") or "pending")
        mr = data.get("meeting_room") if isinstance(data.get("meeting_room"), dict) else {}
        meta = titles.get(scope_id, {})
        local = str(data.get("local_process_state") or "")

        room_state = load_room_state(scope_id)
        ui_status: str = "processing"
        if room_state and str(room_state.get("status") or "") in (
            "processing",
            "human_intervention",
            "completed",
            "failed",
            "stopped",
        ):
            ui_status = str(room_state["status"])
        elif local not in ("处理中",):
            ui_status = "completed" if local == "已完成" else "human_intervention"

        token_consumed = 0
        token_budget = 0
        stage_duration = "—"
        meeting_started_at = ""
        if room_state and isinstance(room_state.get("metrics"), dict):
            m = room_state["metrics"]
            token_consumed = int(m.get("tokens") or 0)
            token_budget = compute_room_token_budget(room_state)
            stage_duration = self._format_duration(self._stage_elapsed_seconds(m))
            meeting_started_at = str(m.get("stage_started_at") or "").strip()

        return {
            "room_id": str(mr.get("room_id") or ""),
            "scope_type": scope_type,
            "scope_id": scope_id,
            "ticket_id": scope_id,
            "ticket_title": meta.get("title") or scope_id,
            "branch": meta.get("branch") or "",
            "stage_id": stage_id,
            "stage_name": stage_name_for_id(stage_id),
            "current_node_id": node_id,
            "current_node_name": node_display_name(node_id),
            "local_process_state": local,
            "status": ui_status,
            "pipeline_enabled": bool(data.get("pipeline_enabled")),
            "meeting_room_active": bool(mr.get("active")),
            "updated_at": data.get("updated_at"),
            "dev_status": data,
            "tokenConsumed": token_consumed,
            "tokenBudget": token_budget,
            "stageDuration": stage_duration,
            "meetingStartedAt": meeting_started_at,
        }
