"""One-off: reset meeting scope to auto_split failed for re-verification."""

from __future__ import annotations

import json
import shutil
import sys

from filelock import FileLock

from synapse.api.routes.dev_iwhalecloud import (
    _atomic_write_json_file,
    _owner_order_file_lock_path,
    _owner_order_file_name,
    _snapshot_norm_id,
)
from synapse.rd_meeting.binding import resolve_node_binding
from synapse.rd_meeting.dev_status import load_dev_status, save_dev_status
from synapse.rd_meeting.paths import env_root, sandbox_root, scope_dir
from synapse.rd_meeting.pipeline import (
    STEP_WAITING,
    MeetingPipeline,
    clear_nodes_for_historical_reprocess,
    clear_room_state_for_node_reprocess,
)
from synapse.rd_meeting.room_runtime import save_room_state
from synapse.rd_meeting.userwork_sync import patch_userwork_summary
from synapse.rd_sop.nodes import node_display_name, stage_id_for_node_id


def reset_scope_to_auto_split_failed(
    scope_id: str,
    *,
    remove_task_nos: list[str] | None = None,
) -> None:
    sid = (scope_id or "").strip()
    target = "auto_split"
    downstream = ["auto_split", "sandbox_build", "env_pregen"]
    stage_id = stage_id_for_node_id(target)
    remove_nos = {str(x).strip() for x in (remove_task_nos or []) if str(x).strip()}

    clear_nodes_for_historical_reprocess(sid, downstream)

    for root_fn in (sandbox_root, env_root):
        root = root_fn(sid)
        if root.is_dir():
            shutil.rmtree(root, ignore_errors=True)

    for nid in downstream:
        agent_dir = scope_dir(sid) / "agents" / nid
        if agent_dir.is_dir():
            shutil.rmtree(agent_dir, ignore_errors=True)

    pipe = MeetingPipeline.load(sid)
    ctx = pipe._data.get("context")
    if not isinstance(ctx, dict):
        ctx = {}
    for key in (
        "auto_split_assets",
        "sandbox_assets",
        "env_pregen_assets",
        "last_system_node_result",
        "last_finished_node_id",
        "reprocess_node_ids",
        "reprocess_historical_target",
        "reprocess_reason",
        "reprocess_until_node_id",
    ):
        ctx.pop(key, None)
    node_review = ctx.get("node_review")
    if isinstance(node_review, dict):
        for nid in downstream:
            node_review.pop(nid, None)
        ctx["node_review"] = node_review
    ctx["last_transition_reason"] = (
        "manual reset: auto_split failed, waiting for reprocess to verify feature_id flow"
    )
    pipe._data["context"] = ctx
    pipe._data["current_node_id"] = target
    pipe._data["steps_completed"] = [
        s
        for s in (pipe._data.get("steps_completed") or [])
        if s not in ("system_node_exec", "node_finish", "reprocess_prep")
    ]
    pipe.set_flow_step(STEP_WAITING, reason="auto_split failed, waiting for reprocess")
    pipe.set_phase("running", sync_room_state=False)
    pipe.save()

    dev = load_dev_status(sid) or {}
    dev["current_node_id"] = target
    dev["stage_id"] = stage_id
    dev["sop_node_display"] = node_display_name(target)
    dev["local_process_state"] = "处理中"
    save_dev_status(sid, dev)

    rs = clear_room_state_for_node_reprocess(
        sid,
        target,
        extra_node_ids=["sandbox_build", "env_pregen"],
    )
    rs["current_node_id"] = target
    rs["stage_id"] = stage_id
    rs["status"] = "failed"
    rs["phase"] = "running"
    rs["current_node_binding"] = resolve_node_binding(
        target,
        scope_type="demand",
        scope_id=sid,
    )
    rs.pop("stopped_at", None)
    rs.pop("stopped_reason", None)
    save_room_state(sid, rs)

    if remove_nos:
        path = _owner_order_file_name()
        lock = FileLock(str(_owner_order_file_lock_path()), timeout=30)
        with lock:
            raw = json.loads(path.read_text(encoding="utf-8"))
            lst = raw.get("list") or []
            for demand in lst:
                if _snapshot_norm_id(demand.get("demand_no")) != sid:
                    continue
                owned = demand.get("owned_work_items")
                if isinstance(owned, list):
                    demand["owned_work_items"] = [
                        t
                        for t in owned
                        if not (
                            isinstance(t, dict)
                            and str(t.get("task_no") or "").strip() in remove_nos
                        )
                    ]
                demand["sop_node"] = node_display_name(target)
                demand["local_process_state"] = "处理中"
                break
            _atomic_write_json_file(
                path,
                {"list": lst, "updated_at": dev["updated_at"]},
            )

    patch_userwork_summary(
        scope_type="demand",
        scope_id=sid,
        sop_node=node_display_name(target),
        local_process_state="处理中",
    )


if __name__ == "__main__":
    scope = sys.argv[1] if len(sys.argv) > 1 else "21881451"
    task_nos = sys.argv[2:] if len(sys.argv) > 2 else ["11923579"]
    reset_scope_to_auto_split_failed(scope, remove_task_nos=task_nos)
    print(f"reset ok: scope={scope} node=auto_split status=failed removed_tasks={task_nos}")
