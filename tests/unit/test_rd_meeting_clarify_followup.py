"""需求澄清多轮续跑：台账转换、简报、问卷护栏。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.clarify_followup import (
    build_clarify_followup_brief,
    build_doc_generate_context_json,
    list_confirmed_question_ids,
    merge_confirmed_into_clarify_ctx,
    parse_open_research_items,
    validate_clarify_followup_questionnaire,
    write_clarify_fill_ctx,
)
from synapse.rd_meeting.hitl_form import HUMAN_CLOSURE_DETAIL_ID


def _sample_hitl_doc() -> dict:
    return {
        "rounds": [
            {
                "round": 1,
                "questions": [
                    {
                        "id": "Q1",
                        "title": "备份粒度",
                        "selected_options": ["A"],
                        "option_labels": ["全量备份"],
                        "user_input": "",
                    },
                    {
                        "id": HUMAN_CLOSURE_DETAIL_ID,
                        "title": "进一步处理要求",
                        "user_input": "需要调研对象存储备份方案与现有 BakeImageFile 的关系",
                    },
                ],
            }
        ],
        "confirmed_by_id": {
            "Q1": {
                "id": "Q1",
                "title": "备份粒度",
                "option_labels": ["全量备份"],
                "user_input": "",
            },
            HUMAN_CLOSURE_DETAIL_ID: {
                "id": HUMAN_CLOSURE_DETAIL_ID,
                "title": "进一步处理要求",
                "user_input": "需要调研对象存储备份方案与现有 BakeImageFile 的关系",
            },
        },
    }


def test_parse_open_research_items_from_closure_detail():
    items = parse_open_research_items(_sample_hitl_doc())
    assert len(items) >= 1
    assert "对象存储" in items[0]["text"]


def test_merge_confirmed_into_clarify_ctx():
    ctx = merge_confirmed_into_clarify_ctx(_sample_hitl_doc())
    assert len(ctx["conclusions"]) == 1
    assert ctx["conclusions"][0]["title"] == "备份粒度"
    states = {u.get("state") for u in ctx["unclear"]}
    assert "confirmed" in states
    assert "researching" in states


def test_list_confirmed_question_ids():
    ids = list_confirmed_question_ids(_sample_hitl_doc())
    assert "Q1" in ids
    assert HUMAN_CLOSURE_DETAIL_ID not in ids


def test_validate_rejects_reconfirmed_question():
    with pytest.raises(ValueError, match="已在上一轮用户确认"):
        validate_clarify_followup_questionnaire(
            [
                {
                    "id": "Q1",
                    "type": "single",
                    "title": "备份粒度",
                    "options": [{"value": "a", "label": "全量"}],
                }
            ],
            _sample_hitl_doc(),
            node_id="req_clarify",
        )


def test_validate_rejects_echo_confirm_question():
    doc = _sample_hitl_doc()
    with pytest.raises(ValueError, match="回声确认题"):
        validate_clarify_followup_questionnaire(
            [
                {
                    "id": "Q_new",
                    "type": "single",
                    "title": "请确认您是否指需要调研对象存储备份方案",
                    "context": "需要调研对象存储备份方案与现有 BakeImageFile 的关系",
                    "options": [
                        {"value": "yes", "label": "是"},
                        {"value": "no", "label": "否"},
                    ],
                }
            ],
            doc,
            node_id="req_clarify",
        )


def test_write_clarify_fill_ctx_and_brief(tmp_path, monkeypatch):
    scope = "clarify_scope"
    work = tmp_path / scope
    archive = work / "archive" / "需求分析" / "req_clarify"
    archive.mkdir(parents=True)
    (work / "room_state.json").write_text("{}", encoding="utf-8")

    hitl_path = archive / "hitl_context.json"
    hitl_path.write_text(json.dumps(_sample_hitl_doc(), ensure_ascii=False), encoding="utf-8")

    def _archive(sid, stg, nid):
        return tmp_path / sid / "archive" / stg / nid

    monkeypatch.setattr("synapse.rd_meeting.paths.archive_node_dir", _archive)
    monkeypatch.setattr("synapse.rd_meeting.hitl_context.archive_node_dir", _archive)

    path = write_clarify_fill_ctx(scope, "req_clarify")
    assert path is not None and path.is_file()
    ctx = json.loads(path.read_text(encoding="utf-8"))
    assert ctx["conclusions"]

    brief = build_clarify_followup_brief(scope, "req_clarify")
    assert "Phase R" in brief
    assert "禁止" in brief
    assert "对象存储" in brief


def test_build_doc_generate_context_json_reads_file(tmp_path, monkeypatch):
    scope = "ctx_scope"
    archive = tmp_path / scope / "archive" / "需求分析" / "req_clarify"
    archive.mkdir(parents=True)
    (archive / "hitl_context.json").write_text(
        json.dumps(_sample_hitl_doc(), ensure_ascii=False), encoding="utf-8"
    )

    monkeypatch.setattr(
        "synapse.rd_meeting.hitl_context.archive_node_dir",
        lambda sid, stg, nid: tmp_path / sid / "archive" / stg / nid,
    )

    ctx = build_doc_generate_context_json(scope, "req_clarify")
    assert ctx["open_research_items"]
