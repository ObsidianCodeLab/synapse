#!/usr/bin/env python3
"""将需求单会议室回退到 auto_split，清理后续系统节点产物，便于重跑拆单→沙箱流程。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from synapse.rd_meeting.dev_status import load_dev_status, save_dev_status
from synapse.rd_meeting.paths import meeting_pipeline_path, sandbox_code_dir, scope_dir
from synapse.rd_meeting.pipeline import (
    STEP_REPROCESS_PREP,
    STEP_WAITING,
    MeetingPipeline,
    clear_nodes_for_historical_reprocess,
    clear_room_state_for_node_reprocess,
)
from synapse.rd_meeting.room_runtime import load_room_state, read_json_file, sync_room_state_from_dev, write_json_file
from synapse.rd_meeting.userwork_sync import patch_userwork_summary
from synapse.rd_sop.nodes import node_display_name, stage_id_for_node_id

RESET_NODES = ("auto_split", "sandbox_build", "env_pregen", "task_exec")
CONTEXT_ASSET_KEYS = (
    "auto_split_assets",
    "sandbox_assets",
    "env_pregen_assets",
    "task_exec_assets",
    "last_system_node_result",
    "last_finished_node_id",
    "last_transition_reason",
    "task_exec_assets",
)


def _clear_pipeline_context_assets(scope_id: str) -> None:
    path = meeting_pipeline_path(scope_id)
    raw = read_json_file(path)
    if not isinstance(raw, dict):
        return
    ctx = raw.get("context")
    if not isinstance(ctx, dict):
        ctx = {}
    for key in CONTEXT_ASSET_KEYS:
        ctx.pop(key, None)
    raw["context"] = ctx
    node_results = raw.get("node_results")
    if isinstance(node_results, dict):
        nr = dict(node_results)
        for nid in RESET_NODES:
            nr.pop(nid, None)
        raw["node_results"] = nr
    write_json_file(path, raw)


def _remove_sandbox_repos(scope_id: str) -> None:
    from synapse.rd_meeting.sandbox_assets import clear_sandbox_workspace

    clear_sandbox_workspace(scope_id)


def reset_to_auto_split(scope_id: str, *, run_reprocess: bool = False) -> dict:
    sid = (scope_id or "").strip()
    if not sid:
        raise ValueError("scope_id required")

    dev = load_dev_status(sid) or {}
    mr = dev.get("meeting_room") if isinstance(dev.get("meeting_room"), dict) else {}
    room_id = str(mr.get("room_id") or f"mr_d_{sid}_s1").strip()
    scope_type = str((dev.get("scope") or {}).get("type") or "demand")
    if scope_type not in ("demand", "task"):
        scope_type = "demand"

    target = "auto_split"
    stage_id = stage_id_for_node_id(target)
    sop_display = node_display_name(target)

    clear_nodes_for_historical_reprocess(sid, list(RESET_NODES))
    _clear_pipeline_context_assets(sid)
    _remove_sandbox_repos(sid)

    dev["current_node_id"] = target
    dev["stage_id"] = stage_id
    dev["sop_node_display"] = sop_display
    dev["local_process_state"] = "处理中"
    save_dev_status(sid, dev)

    sync_room_state_from_dev(
        sid,
        room_id=room_id,
        scope_type=scope_type,  # type: ignore[arg-type]
        stage_id=stage_id,
        current_node_id=target,
        local_process_state="处理中",
    )
    clear_room_state_for_node_reprocess(sid, target, extra_node_ids=[n for n in RESET_NODES if n != target])

    rs = load_room_state(sid) or {}
    rs["current_node_id"] = target
    rs["stage_id"] = stage_id
    rs["status"] = "processing"
    rs["phase"] = "running"
    rs.pop("pending_delivery", None)
    rs.pop("intervention_kind", None)
    rs.pop("reprocess_reason", None)
    rs.pop("reprocess_until_node_id", None)
    from synapse.rd_meeting.room_runtime import save_room_state

    save_room_state(sid, rs)

    patch_userwork_summary(
        scope_type=scope_type,  # type: ignore[arg-type]
        scope_id=sid,
        sop_node=sop_display,
        local_process_state="处理中",
    )

    pipe = MeetingPipeline.load(sid)
    pipe._data["current_node_id"] = target
    pipe._data["phase"] = "running"
    pctx = pipe._data.get("context")
    if not isinstance(pctx, dict):
        pctx = {}
    for key in CONTEXT_ASSET_KEYS:
        pctx.pop(key, None)
    pctx.pop("reprocess_node_ids", None)
    pctx.pop("reprocess_historical_target", None)
    pipe._data["context"] = pctx
    pipe._data["steps_completed"] = [
        s
        for s in (pipe._data.get("steps_completed") or [])
        if s not in ("system_node_exec", "task_exec_cli", "node_finish", "node_review")
    ]

    if run_reprocess:
        from synapse.rd_meeting.pipeline import PipelineRunContext, run_pipeline_until_waiting
        from synapse.rd_meeting.service import MeetingRoomService

        MeetingRoomService._stash_reprocess_reason_on_pipeline(
            pipe,
            reason="还原至自动拆单，重新执行拆单与沙箱构建",
            until_node_id=target,
        )
        pipe.set_flow_step(STEP_REPROCESS_PREP, reason="还原至自动拆单重试")
        pipe.save()

        ctx = PipelineRunContext(
            scope_type=scope_type,  # type: ignore[arg-type]
            scope_id=sid,
            sync_userwork=False,
            promote_to_processing=False,
            dev_status=dev,
            detail={},
        )
        run_pipeline_until_waiting(ctx, initial_flow_step=STEP_REPROCESS_PREP)
        pipe = MeetingPipeline.load(sid)
    else:
        pipe.set_flow_step(STEP_WAITING, reason="已还原至自动拆单，等待执行")
        pipe.save()

    result = {
        "scope_id": sid,
        "room_id": room_id,
        "current_node_id": target,
        "flow_step": pipe.flow_step,
        "dev_local_process_state": dev.get("local_process_state"),
        "context_keys": sorted((pipe._data.get("context") or {}).keys()),
        "has_auto_split_assets": "auto_split_assets" in (pipe._data.get("context") or {}),
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scope_id", help="工单 scope_id，如 21881451")
    parser.add_argument(
        "--run-reprocess",
        action="store_true",
        help="还原后自动跑 reprocess_prep→node_init（默认仅落盘，由用户在界面触发）",
    )
    args = parser.parse_args()
    out = reset_to_auto_split(args.scope_id, run_reprocess=args.run_reprocess)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
