"""历史节点重新处理：校验与区间清理。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.pipeline import (
    clear_nodes_for_historical_reprocess,
    sop_reprocess_node_id_range,
)
from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path, scope_dir
from synapse.rd_meeting.service import MeetingRoomService
from synapse.rd_sop.nodes import stage_name_for_id


def test_sop_reprocess_node_id_range():
    assert sop_reprocess_node_id_range("req_clarify", "acceptance") == [
        "req_clarify",
        "boundary",
        "module_func",
        "acceptance",
    ]


def test_sop_reprocess_node_id_range_invalid():
    with pytest.raises(ValueError, match="invalid_reprocess_target"):
        sop_reprocess_node_id_range("acceptance", "req_clarify")


def test_validate_historical_reprocess_cross_stage():
    svc = MeetingRoomService()
    with pytest.raises(ValueError, match="cross_stage_reprocess_forbidden"):
        svc._validate_historical_reprocess_target(target="req_clarify", current="func_assign")


def test_validate_historical_reprocess_system_target():
    svc = MeetingRoomService()
    with pytest.raises(ValueError, match="system_node_reprocess_forbidden"):
        svc._validate_historical_reprocess_target(target="auto_split", current="sandbox_build")


def test_clear_nodes_for_historical_reprocess_range(tmp_path, monkeypatch):
    scope = "hist-reproc"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    stage_name = stage_name_for_id(1)
    for nid in ("req_clarify", "boundary"):
        archive = archive_node_dir(scope, stage_name, nid)
        archive.mkdir(parents=True)
        (archive / "out.md").write_text("x", encoding="utf-8")

    root = scope_dir(scope)
    (root / "host_prompt_snapshot.md").write_text("snap", encoding="utf-8")

    pipe_path = meeting_pipeline_path(scope)
    pipe_path.write_text(
        json.dumps(
            {
                "phase": "result_gate",
                "context": {
                    "node_review": {
                        "req_clarify": {"report_body": "a"},
                        "boundary": {"report_body": "b"},
                    },
                    "host_prompt": {"meeting_prompt": "cached"},
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    clear_nodes_for_historical_reprocess(scope, ["req_clarify", "boundary"])

    assert not archive_node_dir(scope, stage_name, "req_clarify").is_dir()
    assert not archive_node_dir(scope, stage_name, "boundary").is_dir()
    assert not (root / "host_prompt_snapshot.md").is_file()

    raw = json.loads(pipe_path.read_text(encoding="utf-8"))
    nr = raw.get("context", {}).get("node_review", {})
    assert "req_clarify" not in nr
    assert "boundary" not in nr
    assert "host_prompt" not in raw.get("context", {})
