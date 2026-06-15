"""函数级方案增量修订 pipeline 步骤单元测试。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synapse.rd_meeting.pipeline import (
    STEP_NODE_INIT,
    STEP_RESUME_REVISION,
    MeetingPipeline,
    PipelineRunContext,
    _step_resume_revision,
)


@pytest.fixture
def revision_archive(tmp_path, monkeypatch):
    scope_id = "scope-resume-rev"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"
    archive.mkdir(parents=True)
    md_text = "# 函数级方案\n\n" + ("正文 " * 50)
    (archive / "函数级方案.md").write_text(md_text, encoding="utf-8")
    (archive / "func_solution_review.json").write_text(
        json.dumps({"transformation_plans": []}, ensure_ascii=False),
        encoding="utf-8",
    )
    (archive / "revision_context.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "node_id": "func_solution",
                "plans_to_revise": [{"id": "plan-1", "comment": "改"}],
                "approved_plans": [],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.archive_dir",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.revision_context_path",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "revision_context.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.pipeline._remove_agent_sop_node_dir",
        lambda _sid, _nid: None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.pipeline.clear_room_state_for_revision_resume",
        lambda sid, nid: {"status": "processing", "current_node_id": nid},
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.pipeline.load_dev_status",
        lambda _sid: {
            "stage_id": 2,
            "meeting_room": {"room_id": "room-1", "current_node_id": "func_solution"},
            "sop_node": "func_solution",
        },
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.pipeline._resolve_run_node_id",
        lambda _pipe, _data: "func_solution",
    )
    monkeypatch.setattr("synapse.rd_meeting.pipeline.append_history_event", lambda *a, **k: None)
    monkeypatch.setattr(
        "synapse.rd_meeting.hitl_lifecycle.reset_human_confirm_lifecycle",
        lambda _sid: None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.hitl_submit.clear_pending_questionnaire",
        lambda _sid: None,
    )

    return scope_id, archive, md_text


def test_resume_revision_preserves_archive_and_advances_to_node_init(revision_archive):
    scope_id, archive, md_text = revision_archive
    pipe = MeetingPipeline.create(scope_id, scope_type="demand", flow_step=STEP_RESUME_REVISION)
    pipe._data["room_id"] = "room-1"
    ctx = PipelineRunContext(scope_type="demand", scope_id=scope_id, detail={})

    _step_resume_revision(pipe, ctx)

    assert (archive / "函数级方案.md").read_text(encoding="utf-8") == md_text
    assert (archive / "revision_context.json").is_file()
    assert pipe.flow_step == STEP_NODE_INIT
    assert STEP_RESUME_REVISION in (pipe.data.get("steps_completed") or [])
