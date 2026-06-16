#!/usr/bin/env python3
"""将需求单会议室回退到 exception_check（代码提交），可选自动调度重跑。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from synapse.rd_meeting.code_commit_reprocess import (
    CODE_COMMIT_NODE_ID,
    code_commit_reprocess_node_range,
    prepare_code_commit_reprocess,
)
from synapse.rd_meeting.dev_status import load_dev_status
from synapse.rd_meeting.pipeline import (
    STEP_NODE_INIT,
    MeetingPipeline,
    PipelineRunContext,
    run_pipeline_until_waiting,
)
from synapse.rd_meeting.service import MeetingRoomService


def reset_to_code_commit(scope_id: str, *, run_reprocess: bool = False) -> dict:
    sid = (scope_id or "").strip()
    dev = load_dev_status(sid) or {}
    scope_type = str((dev.get("scope") or {}).get("type") or "demand")
    if scope_type not in ("demand", "task"):
        scope_type = "demand"
    current = str(dev.get("current_node_id") or CODE_COMMIT_NODE_ID).strip()
    node_range = code_commit_reprocess_node_range(current)
    prep = prepare_code_commit_reprocess(
        sid,
        scope_type=scope_type,  # type: ignore[arg-type]
        node_range=node_range,
    )
    if run_reprocess:
        mr = dev.get("meeting_room") if isinstance(dev.get("meeting_room"), dict) else {}
        room_id = str(mr.get("room_id") or prep.get("room_id") or "").strip()
        svc = MeetingRoomService()
        if room_id:
            out = svc.reprocess_code_commit(room_id)
            prep["run_in_progress"] = out.get("run_in_progress")
        else:
            dev = load_dev_status(sid) or {}
            ctx = PipelineRunContext(
                scope_type=scope_type,  # type: ignore[arg-type]
                scope_id=sid,
                sync_userwork=True,
                promote_to_processing=False,
                dev_status=dev,
                detail={},
            )
            pipe = MeetingPipeline.load(sid)
            if pipe is not None:
                pipe.set_flow_step(STEP_NODE_INIT, reason="脚本触发代码提交重跑")
                pipe.save()
                run_pipeline_until_waiting(ctx, initial_flow_step=STEP_NODE_INIT, create=False)
    pipe = MeetingPipeline.load(sid)
    prep["flow_step"] = pipe.flow_step if pipe else None
    return prep


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scope_id", help="工单 scope_id，如 21881451")
    parser.add_argument(
        "--run-reprocess",
        action="store_true",
        help="回退后自动调度代码提交 system_node_exec",
    )
    args = parser.parse_args()
    out = reset_to_code_commit(args.scope_id, run_reprocess=args.run_reprocess)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
