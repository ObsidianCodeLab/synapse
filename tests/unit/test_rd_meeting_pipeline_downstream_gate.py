"""下游门控后 pipeline 应停在 waiting，不得 node_finish → node_init 重跑。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.dev_status import load_dev_status, save_dev_status
from synapse.rd_meeting.paths import meeting_pipeline_path
from synapse.rd_meeting.pipeline import (
    STEP_SYSTEM_NODE_EXEC,
    STEP_WAITING,
    PipelineRunContext,
    run_pipeline_until_waiting,
)
from synapse.rd_meeting.room_runtime import default_room_state, save_room_state


@pytest.fixture(autouse=True)
def _isolate_work_root(monkeypatch, tmp_path):
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.append_history_event",
        lambda *_a, **_k: {},
    )
    return tmp_path


def test_system_node_exec_stops_pipeline_on_downstream_gate(monkeypatch):
    scope_id = "gate-stop-1"
    room_id = f"mr_d_{scope_id}_s1"

    save_dev_status(
        scope_id,
        {
            "scope_type": "demand",
            "scope_id": scope_id,
            "stage_id": 4,
            "current_node_id": "exception_check",
            "local_process_state": "处理中",
            "meeting_room": {"room_id": room_id, "prod": "p"},
        },
    )
    save_room_state(
        scope_id,
        default_room_state(
            room_id=room_id,
            scope_type="demand",
            scope_id=scope_id,
            stage_id=4,
            current_node_id="exception_check",
            status="processing",
        ),
    )

    meeting_pipeline_path(scope_id).write_text(
        json.dumps(
            {
                "scope_id": scope_id,
                "scope_type": "demand",
                "flow_step": STEP_SYSTEM_NODE_EXEC,
                "phase": "running",
                "context": {},
                "steps_completed": [],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    init_calls = {"n": 0}

    def _fake_system_init(*_a, **_k):
        init_calls["n"] += 1

    monkeypatch.setattr(
        "synapse.rd_meeting.bootstrap.append_system_node_init_chat",
        _fake_system_init,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.system_nodes.run_system_node",
        lambda *_a, **_k: {
            "status": "partial",
            "artifacts": [{"name": "代码提交日志.md", "path": "/tmp/x.md"}],
            "duration_seconds": 1,
        },
    )

    ctx = PipelineRunContext(
        scope_type="demand",
        scope_id=scope_id,
        dev_status=load_dev_status(scope_id),
        detail={"ticket_title": "T"},
    )
    pipe = run_pipeline_until_waiting(ctx, initial_flow_step=STEP_SYSTEM_NODE_EXEC)

    assert pipe.flow_step == STEP_WAITING
    assert init_calls["n"] == 0
