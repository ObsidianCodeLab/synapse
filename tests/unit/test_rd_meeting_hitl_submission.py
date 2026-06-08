"""人机问卷提交锁定与解析。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.hitl_submission import (
    format_hitl_form_instruction,
    parse_hitl_form_text,
    record_hitl_submission_locked,
)


@pytest.fixture
def scope_work(tmp_path, monkeypatch):
    scope_id = "hitl-lock-scope"
    work = tmp_path / scope_id
    work.mkdir(parents=True)
    (work / "room_state.json").write_text(
        json.dumps(
            {
                "status": "human_intervention",
                "intervention_kind": "interactive",
                "hitl_form_schema": {"type": "questionnaire", "questions": [{"id": "q1", "type": "text", "title": "Q1"}]},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "synapse.rd_meeting.hitl_submission.load_room_state",
        lambda s: json.loads((work / "room_state.json").read_text(encoding="utf-8")),
    )

    def _save(sid: str, state: dict) -> None:
        work.joinpath("room_state.json").write_text(
            json.dumps(state, ensure_ascii=False),
            encoding="utf-8",
        )

    monkeypatch.setattr("synapse.rd_meeting.hitl_submission.save_room_state", _save)
    return scope_id, work


def test_parse_hitl_form_text_other_and_decision():
    text = """[人工确认表单]
q1: OTHER:自定义答案
decision: approve
补充说明: 请继续
"""
    values, comment, decision = parse_hitl_form_text(text)
    assert values["q1"] == "自定义答案"
    assert comment == "请继续"
    assert decision == "approve"


def test_record_hitl_submission_locked(scope_work):
    scope_id, work = scope_work
    raw = "[人工确认表单]\nq1: 答案A"
    sub = record_hitl_submission_locked(scope_id, raw_text=raw)
    assert sub["locked"] is True
    state = json.loads((work / "room_state.json").read_text(encoding="utf-8"))
    assert state["hitl_locked"] is True
    assert state["hitl_submission"]["values"]["q1"] == "答案A"
    assert state.get("hitl_form_schema") is None
    assert state["hitl_submission"]["schema_snapshot"]["questions"]


def test_format_hitl_form_instruction():
    out = format_hitl_form_instruction({"q1": "x", "q2": ["a", "b"]}, comment="note")
    assert "[人工确认表单]" in out
    assert "q2: a, b" in out
    assert "补充说明: note" in out
