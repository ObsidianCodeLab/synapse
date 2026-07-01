"""interactive 门控 schema 竞态丢失后的恢复。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.hitl_lifecycle import (
    load_room_state_with_hitl_recovery,
    recover_missing_hitl_form_schema,
)
from synapse.rd_meeting.hitl_submit import PENDING_QUESTIONNAIRE_KEY
from synapse.rd_meeting.paths import scope_dir
from synapse.rd_meeting.room_runtime import default_room_state, load_room_state, save_room_state


@pytest.fixture(autouse=True)
def _isolate_work(monkeypatch, tmp_path):
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")


def _gate_room_state(scope_id: str) -> dict:
    rs = default_room_state(
        room_id="room-recover",
        scope_type="demand",
        scope_id=scope_id,
        stage_id=1,
        current_node_id="req_clarify",
        status="human_intervention",
    )
    rs["intervention_kind"] = "interactive"
    return rs


def test_recover_from_pending_questionnaire() -> None:
    scope_id = "hitl_recover_pending"
    schema = {
        "type": "questionnaire",
        "version": "1.0",
        "questions": [{"id": "q1", "type": "single", "title": "范围确认", "options": []}],
    }
    rs = _gate_room_state(scope_id)
    rs[PENDING_QUESTIONNAIRE_KEY] = {
        "schema": schema,
        "kind": "interactive",
        "consumed": True,
    }
    recovered = recover_missing_hitl_form_schema(rs, scope_id=scope_id)
    assert recovered is not None
    qids = [q.get("id") for q in (recovered.get("questions") or []) if isinstance(q, dict)]
    assert "q1" in qids


def test_recover_from_questions_json_file() -> None:
    scope_id = "hitl_recover_file"
    root = scope_dir(scope_id)
    root.mkdir(parents=True)
    schema = {
        "type": "questionnaire",
        "questions": [{"id": "f1", "type": "boolean", "title": "是否接受", "options": []}],
    }
    (root / ".questions.json").write_text(json.dumps(schema, ensure_ascii=False), encoding="utf-8")

    rs = _gate_room_state(scope_id)
    recovered = recover_missing_hitl_form_schema(rs, scope_id=scope_id)
    assert recovered is not None
    assert recovered["questions"][0]["id"] == "f1"


def test_load_room_state_with_hitl_recovery_persists_schema() -> None:
    scope_id = "hitl_recover_persist"
    schema = {
        "type": "questionnaire",
        "questions": [{"id": "p1", "type": "textarea", "title": "补充", "options": []}],
    }
    rs = _gate_room_state(scope_id)
    rs[PENDING_QUESTIONNAIRE_KEY] = {"schema": schema, "kind": "interactive", "consumed": False}
    save_room_state(scope_id, rs)

    loaded = load_room_state_with_hitl_recovery(scope_id)
    assert loaded is not None
    assert loaded.get("hitl_form_schema") is not None
    qids = [q.get("id") for q in (loaded["hitl_form_schema"].get("questions") or []) if isinstance(q, dict)]
    assert "p1" in qids

    again = load_room_state(scope_id)
    assert again is not None
    again_qids = [q.get("id") for q in (again.get("hitl_form_schema", {}).get("questions") or []) if isinstance(q, dict)]
    assert "p1" in again_qids


def test_recover_skips_when_schema_present() -> None:
    scope_id = "hitl_recover_skip"
    rs = _gate_room_state(scope_id)
    rs["hitl_form_schema"] = {
        "type": "questionnaire",
        "questions": [{"id": "ok", "type": "single", "title": "已有", "options": []}],
    }
    assert recover_missing_hitl_form_schema(rs, scope_id=scope_id) is None
