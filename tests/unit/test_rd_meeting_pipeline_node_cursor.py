"""pipeline：dev.status 与 meeting_pipeline 节点光标同步。"""

from __future__ import annotations

from synapse.rd_meeting.pipeline import MeetingPipeline, _resolve_run_node_id


def test_resolve_run_node_id_prefers_dev_over_stale_pipe():
    pipe = MeetingPipeline(
        "scope1",
        {
            "scope_id": "scope1",
            "current_node_id": "req_clarify",
            "flow_step": "waiting",
        },
    )
    run_node = _resolve_run_node_id(pipe, {"current_node_id": "module_func"})
    assert run_node == "module_func"
    assert pipe.current_node_id == "module_func"


def test_resolve_run_node_id_falls_back_to_pipe_when_dev_pending():
    pipe = MeetingPipeline(
        "scope1",
        {"scope_id": "scope1", "current_node_id": "boundary", "flow_step": "waiting"},
    )
    run_node = _resolve_run_node_id(pipe, {"current_node_id": "pending"})
    assert run_node == "boundary"
    assert pipe.current_node_id == "boundary"
