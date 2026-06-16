"""代码提交节点重处理。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.code_commit_reprocess import (
    CODE_COMMIT_NODE_ID,
    code_commit_reprocess_node_range,
    prepare_code_commit_reprocess,
)
from synapse.rd_meeting.dev_status import load_dev_status, save_dev_status
from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path, scope_dir
from synapse.rd_meeting.pipeline import MeetingPipeline
from synapse.rd_meeting.room_runtime import load_room_state, write_json_file
from synapse.rd_meeting.service import MeetingRoomService
from synapse.rd_sop.nodes import stage_name_for_id


def test_code_commit_reprocess_node_range():
    assert code_commit_reprocess_node_range("task_feedback") == [
        CODE_COMMIT_NODE_ID,
        "task_feedback",
    ]
    assert code_commit_reprocess_node_range(CODE_COMMIT_NODE_ID) == [CODE_COMMIT_NODE_ID]


def test_code_commit_reprocess_node_range_invalid():
    with pytest.raises(ValueError, match="code_commit_reprocess_invalid_cursor"):
        code_commit_reprocess_node_range("task_exec")


def test_prepare_code_commit_reprocess_clears_artifacts(tmp_path, monkeypatch):
    scope = "cc-reproc"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    stage_name = stage_name_for_id(4)
    for nid in (CODE_COMMIT_NODE_ID, "task_feedback"):
        ad = archive_node_dir(scope, stage_name, nid)
        ad.mkdir(parents=True)
        (ad / "out.md").write_text("x", encoding="utf-8")

    root = scope_dir(scope)
    save_dev_status(
        scope,
        {
            "scope": {"type": "demand", "id": scope},
            "current_node_id": "task_feedback",
            "stage_id": 4,
            "sop_node_display": "试飞方案",
            "local_process_state": "处理中",
            "meeting_room": {"active": True, "room_id": f"mr_d_{scope}_s1"},
        },
    )
    write_json_file(
        meeting_pipeline_path(scope),
        {
            "scope_id": scope,
            "current_node_id": "task_feedback",
            "flow_step": "waiting",
            "context": {"code_commit_assets": {"status": "ok"}},
            "steps_completed": ["system_node_exec", "node_finish"],
        },
    )
    write_json_file(
        root / "room_state.json",
        {
            "room_id": f"mr_d_{scope}_s1",
            "current_node_id": "task_feedback",
            "status": "processing",
            "node_metrics": {
                CODE_COMMIT_NODE_ID: {"completed_at": "t"},
                "task_feedback": {"started_at": "t"},
            },
        },
    )

    node_range = code_commit_reprocess_node_range("task_feedback")
    prepare_code_commit_reprocess(
        scope,
        scope_type="demand",
        node_range=node_range,
        reason="重提代码",
    )

    dev = load_dev_status(scope) or {}
    assert dev.get("current_node_id") == CODE_COMMIT_NODE_ID
    assert dev.get("sop_node_display") == "代码提交"
    assert not archive_node_dir(scope, stage_name, CODE_COMMIT_NODE_ID).is_dir()
    assert not archive_node_dir(scope, stage_name, "task_feedback").is_dir()
    rs = load_room_state(scope) or {}
    assert rs.get("current_node_id") == CODE_COMMIT_NODE_ID
    assert CODE_COMMIT_NODE_ID not in (rs.get("node_metrics") or {})
    pipe = MeetingPipeline.load(scope)
    assert pipe is not None
    assert "code_commit_assets" not in (pipe.data.get("context") or {})


def test_reprocess_node_routes_to_code_commit(monkeypatch):
    svc = MeetingRoomService()
    called = {"n": 0}

    def _fake_cc(room_id, *, reason=None, agent_pool=None):
        called["n"] += 1
        return {"ok": True, "room_id": room_id}

    monkeypatch.setattr(svc, "get_room_detail", lambda _rid: {"scope_id": "x", "status": "processing"})
    monkeypatch.setattr(svc, "reprocess_code_commit", _fake_cc)
    out = svc.reprocess_node("mr_x", node_id=CODE_COMMIT_NODE_ID, reason="again")
    assert called["n"] == 1
    assert out["ok"] is True


def test_validate_historical_still_blocks_auto_split():
    svc = MeetingRoomService()
    with pytest.raises(ValueError, match="system_node_reprocess_forbidden"):
        svc._validate_historical_reprocess_target(target="auto_split", current="sandbox_build")
