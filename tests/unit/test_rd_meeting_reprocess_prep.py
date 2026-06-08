"""重新处理：清理当前节点归档、room_state 与 pipeline 缓存。"""

from __future__ import annotations

import json

from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path, scope_dir
from synapse.rd_meeting.pipeline import (
    clear_current_node_reprocess_artifacts,
    clear_room_state_for_node_reprocess,
)
from synapse.rd_sop.nodes import stage_name_for_id


def test_clear_current_node_reprocess_artifacts_removes_archive_and_pipeline(
    tmp_path, monkeypatch
):
    scope = "reproc-scope"
    node_id = "req_clarify"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    stage_name = stage_name_for_id(1)
    archive = archive_node_dir(scope, stage_name, node_id)
    archive.mkdir(parents=True)
    (archive / "需求澄清.md").write_text("# 需求澄清\n\n旧内容", encoding="utf-8")

    root = scope_dir(scope)
    (root / "host_prompt_snapshot.md").write_text("snapshot", encoding="utf-8")
    (root / "hitl.flag.json").write_text("{}", encoding="utf-8")

    pipe_path = meeting_pipeline_path(scope)
    pipe_path.write_text(
        json.dumps(
            {
                "phase": "result_gate",
                "context": {
                    "node_review": {node_id: {"report_body": "old"}},
                    "host_prompt": {"meeting_prompt": "cached"},
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    clear_current_node_reprocess_artifacts(scope, node_id, stage_id=1)

    assert not archive.is_dir()
    assert not (root / "host_prompt_snapshot.md").is_file()
    assert not (root / "hitl.flag.json").is_file()

    raw = json.loads(pipe_path.read_text(encoding="utf-8"))
    assert raw["phase"] == "running"
    assert node_id not in raw.get("context", {}).get("node_review", {})
    assert "host_prompt" not in raw.get("context", {})


def test_clear_room_state_for_node_reprocess(monkeypatch):
    store: dict[str, dict] = {}

    def _load(sid: str):
        return dict(store.get(sid, {}))

    def _save(sid: str, rs: dict):
        store[sid] = dict(rs)

    monkeypatch.setattr("synapse.rd_meeting.pipeline.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.pipeline.save_room_state", _save)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.save_room_state", _save)

    scope = "rs-scope"
    node_id = "req_clarify"
    store[scope] = {
        "status": "stopped",
        "phase": "clarify_gate",
        "host_prompt_cache": {"node_id": node_id, "meeting_prompt": "x"},
        "node_metrics": {node_id: {"tokens": 99}, "other": {"tokens": 1}},
        "participants": [{"profile_id": "default"}],
        "pending_host_llm_begin_kind": "start_work",
        "stopped_at": "t",
        "stopped_reason": "user_stop",
        "hitl_locked": True,
    }

    clear_room_state_for_node_reprocess(scope, node_id)

    rs = store[scope]
    assert rs["status"] == "processing"
    assert rs["phase"] == "running"
    assert "host_prompt_cache" not in rs
    assert node_id not in rs.get("node_metrics", {})
    assert "other" in rs.get("node_metrics", {})
    assert "participants" not in rs
    assert "stopped_at" not in rs
    assert "hitl_locked" not in rs
