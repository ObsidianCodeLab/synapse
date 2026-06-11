"""需求澄清多轮续跑：台账转换、简报、问卷护栏。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.clarify_followup import (
    _format_all_options,
    _format_user_answer,
    build_clarify_followup_brief,
    build_doc_generate_context_json,
    enrich_clarify_ctx_from_disk,
    list_confirmed_question_ids,
    merge_confirmed_into_clarify_ctx,
    merge_sections_into_ctx,
    parse_open_research_items,
    seed_clarify_base_ctx,
    validate_clarify_followup_questionnaire,
    validate_clarify_context_completeness,
    rewrite_clarify_fill_ctx_at_path,
    write_clarify_fill_ctx,
)
from synapse.rd_meeting.hitl_feedback import build_hitl_round_record
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
                        "question_type": "single",
                        "options_snapshot": [
                            {"value": "a", "label": "全量备份"},
                            {"value": "b", "label": "增量备份"},
                        ],
                        "selected_options": ["a"],
                        "option_labels": ["全量备份"],
                        "user_input": "",
                        "context_snapshot": "请选择备份策略",
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
                "question_type": "single",
                "options_snapshot": [
                    {"value": "a", "label": "全量备份"},
                    {"value": "b", "label": "增量备份"},
                ],
                "option_labels": ["全量备份"],
                "user_input": "",
                "context_snapshot": "请选择备份策略",
            },
            HUMAN_CLOSURE_DETAIL_ID: {
                "id": HUMAN_CLOSURE_DETAIL_ID,
                "title": "进一步处理要求",
                "user_input": "需要调研对象存储备份方案与现有 BakeImageFile 的关系",
            },
        },
    }


def test_build_hitl_round_record_persists_options_snapshot():
    schema = {
        "questions": [
            {
                "id": "Q1",
                "type": "single",
                "title": "备份粒度",
                "context": "请选择备份策略",
                "options": [
                    {"value": "a", "label": "全量备份"},
                    {"value": "b", "label": "增量备份"},
                ],
            }
        ]
    }
    rec = build_hitl_round_record({"Q1": "a"}, schema)
    q1 = rec["questions"][0]
    assert len(q1["options_snapshot"]) == 2
    assert q1["context_snapshot"] == "请选择备份策略"
    assert q1["option_labels"] == ["全量备份"]


def test_format_options_and_user_answer_separated():
    rec = _sample_hitl_doc()["confirmed_by_id"]["Q1"]
    all_opts = _format_all_options(rec)
    user_ans = _format_user_answer(rec)
    assert "全量备份" in all_opts
    assert "增量备份" in all_opts
    assert user_ans == "全量备份"
    assert all_opts != user_ans


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

    confirmed_row = next(u for u in ctx["unclear"] if u.get("state") == "confirmed")
    assert confirmed_row["answer_org"] == "全量备份"
    assert confirmed_row["answer"] == "（待归纳）"
    assert "增量备份" in confirmed_row["options_all"]
    assert confirmed_row["context"] == "请选择备份策略"

    dialogue = ctx["dialogue"][0]
    assert "增量备份" in dialogue["options"]
    assert dialogue["user_answer"] == "全量备份"


def test_merge_sections_populates_scalars_and_understanding():
    base = {"scope_in": "[待补充]"}
    sections = {
        "scope_in": "备份模块",
        "scope_out": "恢复流程",
        "understanding_by_qid": {"Q1": "用户选择全量备份，覆盖现有增量策略"},
    }
    understanding = merge_sections_into_ctx(base, sections)
    assert base["scope_in"] == "备份模块"
    assert base["scope_out"] == "恢复流程"
    assert understanding["Q1"].startswith("用户选择全量")

    ctx = merge_confirmed_into_clarify_ctx(_sample_hitl_doc(), sections=sections)
    row = next(u for u in ctx["unclear"] if u.get("state") == "confirmed")
    assert row["answer"] == "用户选择全量备份，覆盖现有增量策略"


def test_enrich_clarify_ctx_from_disk(tmp_path):
    tmp = tmp_path / ".tmp"
    tmp.mkdir()
    ctx = {
        "unclear": [
            {
                "ref": "hitl_context.confirmed_by_id.Q1",
                "answer": "（待归纳）",
            }
        ]
    }
    (tmp / "clarify_fill_ctx.json").write_text(json.dumps(ctx), encoding="utf-8")
    (tmp / "clarify_sections.json").write_text(
        json.dumps({"understanding_by_qid": {"Q1": "归纳结论"}}),
        encoding="utf-8",
    )
    enriched = enrich_clarify_ctx_from_disk(ctx, tmp / "clarify_fill_ctx.json")
    assert enriched["unclear"][0]["answer"] == "归纳结论"


def test_seed_clarify_base_ctx(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.userwork_sync.load_scope_work_order_context",
        lambda _t, _s: {"demand_title": "测试需求", "demand_desc": "原始描述"},
    )
    ctx = seed_clarify_base_ctx("demand", "123")
    assert ctx["REQUIREMENT_NAME"] == "测试需求"
    assert ctx["DEMAND_DESC"] == "原始描述"


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
    monkeypatch.setattr(
        "synapse.rd_meeting.userwork_sync.load_scope_work_order_context",
        lambda _t, _s: {"demand_desc": "工单描述"},
    )

    path = write_clarify_fill_ctx(scope, "req_clarify")
    assert path is not None and path.is_file()
    ctx = json.loads(path.read_text(encoding="utf-8"))
    assert ctx["conclusions"]
    assert ctx["DEMAND_DESC"] == "工单描述"

    brief = build_clarify_followup_brief(scope, "req_clarify")
    assert "Phase R" in brief
    assert "clarify_sections.json" in brief
    assert "对象存储" in brief


def test_validate_clarify_context_completeness_strict():
    ctx = merge_confirmed_into_clarify_ctx(_sample_hitl_doc())
    issues = validate_clarify_context_completeness(ctx, strict=True)
    assert any("scope_in" in x for x in issues)
    assert any("待归纳" in x for x in issues)


def test_validate_passes_with_full_sections():
    ctx = merge_confirmed_into_clarify_ctx(
        _sample_hitl_doc(),
        sections={
            "scope_in": "备份模块",
            "scope_out": "恢复流程",
            "trigger_scenario": "大促",
            "pain_point": "手工备份慢",
            "expected_benefit": "自动化",
            "understanding_by_qid": {"Q1": "用户选择全量备份策略"},
            "feature_points": [{"point": "支持全量备份"}],
            "scenarios": [{"title": "备份", "feature": "Backup", "given": "g", "when": "w", "then": "t"}],
            "acceptance_criteria": [{"criterion": "可全量备份"}],
        },
    )
    issues = validate_clarify_context_completeness(ctx, strict=True)
    assert issues == []


def test_rewrite_clarify_fill_ctx_at_path(tmp_path):
    tmp = tmp_path / ".tmp"
    tmp.mkdir()
    ctx_path = tmp / "clarify_fill_ctx.json"
    ctx_path.write_text(
        json.dumps(
            {
                "unclear": [
                    {
                        "ref": "hitl_context.confirmed_by_id.Q1",
                        "answer": "（待归纳）",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    (tmp / "clarify_sections.json").write_text(
        json.dumps(
            {
                "scope_in": "备份",
                "understanding_by_qid": {"Q1": "归纳后"},
            }
        ),
        encoding="utf-8",
    )
    rewrite_clarify_fill_ctx_at_path(ctx_path)
    saved = json.loads(ctx_path.read_text(encoding="utf-8"))
    assert saved["scope_in"] == "备份"
    assert saved["unclear"][0]["answer"] == "归纳后"


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
    monkeypatch.setattr(
        "synapse.rd_meeting.userwork_sync.load_scope_work_order_context",
        lambda _t, _s: {},
    )

    ctx = build_doc_generate_context_json(scope, "req_clarify")
    assert ctx["open_research_items"]
