"""Reset meeting room scope to req_risk for stage-hook retest."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

SCOPE_ID = "21881451"
NODE_ID = "req_risk"
NODE_DISPLAY = "需求风险"
STAGE_ID = 1
WORK_ROOT = Path.home() / ".synapse" / "work"
SCOPE_DIR = WORK_ROOT / SCOPE_ID


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _save_json(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    now = _now_iso()

    # userwork.json
    uw_path = WORK_ROOT / "userwork.json"
    uw = _load_json(uw_path)
    for row in uw.get("list", []):
        if str(row.get("demand_no")) == SCOPE_ID:
            row["sop_node"] = NODE_DISPLAY
            row["demand_status"] = "需求评审"
            row["local_process_state"] = "处理中"
    uw["updated_at"] = now
    _save_json(uw_path, uw)

    # dev.status
    dev_path = SCOPE_DIR / "dev.status"
    dev = _load_json(dev_path)
    dev["current_node_id"] = NODE_ID
    dev["stage_id"] = STAGE_ID
    dev["sop_node_display"] = NODE_DISPLAY
    dev["local_process_state"] = "处理中"
    dev["updated_at"] = now
    _save_json(dev_path, dev)

    # meeting_pipeline.json
    pipe_path = SCOPE_DIR / "meeting_pipeline.json"
    pipe = _load_json(pipe_path)
    pipe["current_node_id"] = NODE_ID
    pipe["flow_step"] = "waiting"
    pipe["phase"] = "running"
    pipe["updated_at"] = now
    ctx = pipe.get("context")
    if isinstance(ctx, dict):
        ctx.pop("host_prompt", None)
        ctx.pop("reprocess_reason", None)
        ctx.pop("reprocess_until_node_id", None)
        ctx.pop("reprocess_node_ids", None)
        ctx.pop("reprocess_historical_target", None)
        ctx.pop("pending_finish_node_ids", None)
        ctx.pop("last_finished_node_id", None)
        ctx["last_transition_reason"] = "手动回退到需求风险节点，供跨阶段转单钩子重测"
    _save_json(pipe_path, pipe)

    # room_state.json
    rs_path = SCOPE_DIR / "room_state.json"
    rs = _load_json(rs_path)
    rs["stage_id"] = STAGE_ID
    rs["current_node_id"] = NODE_ID
    rs["status"] = "processing"
    rs["phase"] = "running"
    rs["updated_at"] = now
    rs["agents_active"] = []
    for key in (
        "pending_delivery",
        "host_prompt_cache",
        "intervention_kind",
        "ready_for_node_review",
        "hitl_clarify_round",
        "last_error",
        "last_pipeline_error",
    ):
        rs.pop(key, None)
    rs["current_node_binding"] = {
        "node_id": NODE_ID,
        "node_name": NODE_DISPLAY,
        "host_profile_id": "default",
        "worker_profile_ids": [],
        "node_intent": "高风险需求人工评估影响与工作量。",
        "human_confirm": True,
    }
    nm = rs.get("node_metrics")
    if isinstance(nm, dict):
        keep = ("req_clarify", "boundary", "module_func", "acceptance", NODE_ID)
        rs["node_metrics"] = {k: v for k, v in nm.items() if k in keep}
        entry = rs["node_metrics"].get(NODE_ID)
        if isinstance(entry, dict):
            entry.pop("completed_at", None)
            entry.setdefault("started_at", now)
            entry["seconds"] = int(entry.get("seconds") or 0)
            entry["tokens"] = int(entry.get("tokens") or 0)
    _save_json(rs_path, rs)

    print(f"Reset scope {SCOPE_ID} -> node {NODE_ID} (stage {STAGE_ID})")
    print(f"  userwork: sop_node={NODE_DISPLAY}, demand_status=需求评审")
    print(f"  pipeline: flow_step=waiting, phase=running")
    print(f"  room_state: status=processing")


if __name__ == "__main__":
    main()
