"""会中问卷末题收口护栏：工具拒绝与 orchestrator 路径纠正。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.hitl_closure_guard import (
    HITL_CLOSURE_INTENT_KEY,
    apply_ready_for_review_guard,
    assert_tool_questionnaire_kind_allowed,
    evaluate_host_run_guard,
    load_closure_intent,
    set_closure_intent,
    validate_user_closure_submission,
)
from synapse.rd_meeting.hitl_form import HUMAN_CLOSURE_DETAIL_ID, HUMAN_CLOSURE_QUESTION_ID


def _schema_with_closure() -> dict:
    return {
        "questions": [
            {"id": HUMAN_CLOSURE_QUESTION_ID, "type": "boolean", "title": "是否还需处理"},
            {"id": HUMAN_CLOSURE_DETAIL_ID, "type": "text", "title": "进一步要求"},
        ]
    }


@pytest.fixture
def room_store(monkeypatch):
    store: dict[str, dict] = {}

    def _load(sid: str):
        return dict(store.get(sid, {}))

    def _save(sid: str, rs: dict):
        store[sid] = dict(rs)

    monkeypatch.setattr("synapse.rd_meeting.hitl_closure_guard.load_room_state", _load)
    monkeypatch.setattr("synapse.rd_meeting.hitl_closure_guard.save_room_state", _save)
    return store


def test_set_and_load_closure_intent(room_store):
    scope = "guard_scope"
    room_store[scope] = {"current_node_id": "req_clarify"}
    set_closure_intent(scope, "further")
    assert load_closure_intent(scope, "req_clarify") == "further"
    set_closure_intent(scope, "done")
    assert load_closure_intent(scope, "req_clarify") == "done"


def test_assert_tool_rejects_interactive_when_user_done(room_store):
    scope = "guard_done"
    room_store[scope] = {
        "current_node_id": "req_clarify",
        HITL_CLOSURE_INTENT_KEY: "done",
    }
    with pytest.raises(ValueError, match="禁止再次调用"):
        assert_tool_questionnaire_kind_allowed(scope, "req_clarify", "interactive")


def test_assert_tool_rejects_result_confirm_when_user_further(room_store):
    scope = "guard_further"
    room_store[scope] = {
        "current_node_id": "req_clarify",
        HITL_CLOSURE_INTENT_KEY: "further",
    }
    with pytest.raises(ValueError, match="禁止 submit_hitl_questionnaire"):
        assert_tool_questionnaire_kind_allowed(scope, "req_clarify", "result_confirm")


def test_validate_closure_yes_requires_detail():
    schema = _schema_with_closure()
    with pytest.raises(ValueError, match="必须填写"):
        validate_user_closure_submission({HUMAN_CLOSURE_QUESTION_ID: "true"}, schema)
    validate_user_closure_submission(
        {HUMAN_CLOSURE_QUESTION_ID: "true", HUMAN_CLOSURE_DETAIL_ID: "补充接口说明"},
        schema,
    )


def test_evaluate_guard_discards_questionnaire_when_done(room_store):
    scope = "eval_done"
    room_store[scope] = {HITL_CLOSURE_INTENT_KEY: "done", "current_node_id": "req_clarify"}
    guard = evaluate_host_run_guard(
        scope,
        "req_clarify",
        tool_questionnaire={"kind": "interactive", "schema": {"questions": []}},
        ready_for_review=False,
    )
    assert guard.discard_tool_questionnaire
    assert guard.required == "enter_node_review"


def test_evaluate_guard_blocks_node_review_when_further(room_store):
    scope = "eval_further"
    room_store[scope] = {HITL_CLOSURE_INTENT_KEY: "further", "current_node_id": "req_clarify"}
    guard = evaluate_host_run_guard(
        scope,
        "req_clarify",
        tool_questionnaire=None,
        ready_for_review=True,
    )
    assert guard.block_node_review
    assert guard.required == "submit_interactive"
    assert not apply_ready_for_review_guard(scope, "req_clarify", True)


def test_evaluate_guard_allows_interactive_when_further(room_store):
    scope = "eval_further_ok"
    room_store[scope] = {HITL_CLOSURE_INTENT_KEY: "further", "current_node_id": "req_clarify"}
    guard = evaluate_host_run_guard(
        scope,
        "req_clarify",
        tool_questionnaire={"kind": "interactive", "schema": {"questions": [{"id": "q1"}]}},
        ready_for_review=False,
    )
    assert guard.required == "none"
    assert not guard.discard_tool_questionnaire
