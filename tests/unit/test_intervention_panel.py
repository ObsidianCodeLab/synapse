"""会议室中栏 intervention_panel 解析。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.intervention_panel import resolve_intervention_panel
from synapse.rd_sop.manifest import default_human_confirm
from synapse.rd_meeting.binding import resolve_node_binding


def test_resolve_solution_review_panel() -> None:
    panel = resolve_intervention_panel(
        node_id="solution_review",
        intervention_kind="solution_review",
        pending_delivery={"solution_review_payload": {"schema_version": 1}},
    )
    assert panel == "solution_review"


def test_resolve_prod_selection_panel() -> None:
    panel = resolve_intervention_panel(
        node_id="reprocess_prep",
        intervention_kind="prod_selection",
    )
    assert panel == "prod_selection"


def test_resolve_auto_split_choice_panel() -> None:
    panel = resolve_intervention_panel(
        node_id="auto_split",
        intervention_kind="auto_split_choice",
    )
    assert panel == "auto_split_choice"


def test_resolve_hitl_for_human_node() -> None:
    panel = resolve_intervention_panel(
        node_id="req_clarify",
        intervention_kind="interactive",
        hitl_form_schema={"title": "澄清", "questions": [{"id": "q1", "title": "Q"}]},
    )
    assert panel == "hitl"


def test_interactive_hitl_wins_over_stale_review_payload() -> None:
    panel = resolve_intervention_panel(
        node_id="req_clarify",
        intervention_kind="interactive",
        hitl_form_schema={"title": "澄清", "questions": [{"id": "q1", "title": "Q"}]},
        pending_delivery={"review_payload": {"node_id": "req_clarify", "summaries": []}},
    )
    assert panel == "hitl"


def test_ai_human_default_human_confirm() -> None:
    assert default_human_confirm("solution_review") is True
    assert default_human_confirm("boundary") is False


def test_binding_ai_human_forces_human_confirm_on() -> None:
    b = resolve_node_binding("solution_review")
    assert b.get("type") == "ai_human"
    assert b.get("human_confirm") is True
    assert b.get("worker_profile_ids") == []


def test_binding_ai_human_strips_worker_overrides(
    monkeypatch: pytest.MonkeyPatch, tmp_path,
) -> None:
    from synapse.rd_meeting.config_store import save_meeting_room_config

    cfg_dir = tmp_path / "rd_meeting"
    cfg_dir.mkdir(parents=True)
    monkeypatch.setattr(
        "synapse.rd_meeting.config_store.rd_meeting_config_dir",
        lambda: cfg_dir,
    )
    save_meeting_room_config(
        {
            "node_overrides": {
                "solution_review": {
                    "worker_profile_ids": ["whalecloud-rd-expert", "doc-gen"],
                },
                "leader_review": {
                    "worker_profile_ids": ["code-explorer"],
                },
            }
        }
    )
    assert resolve_node_binding("solution_review")["worker_profile_ids"] == []
    assert resolve_node_binding("leader_review")["worker_profile_ids"] == []


def test_binding_ai_forces_human_confirm_off() -> None:
    b = resolve_node_binding("boundary")
    assert b.get("type") == "ai"
    assert b.get("human_confirm") is False


def test_func_solution_binding_has_no_default_hitl_schema() -> None:
    b = resolve_node_binding("func_solution")
    assert b.get("type") == "ai_human"
    assert b.get("human_confirm") is True
    assert b.get("hitl_form_schema") is None


def test_func_solution_stale_hitl_schema_uses_review_panel() -> None:
    """残留蓝色结果确认问卷时，仍须走函数级方案评审面板。"""
    panel = resolve_intervention_panel(
        node_id="func_solution",
        intervention_kind="gate",
        hitl_form_schema={
            "title": "函数级方案 — 人工确认",
            "render": {"accent": "blue"},
            "questions": [{"id": "quality_check", "title": "产出质量"}],
        },
    )
    assert panel == "func_solution_review"


def test_resolve_diff_analysis_cli_panel() -> None:
    panel = resolve_intervention_panel(
        node_id="diff_analysis",
        intervention_kind="task_exec",
        pending_delivery={"diff_analysis_payload": {"status": "ok", "commit_phase": "await_confirm"}},
    )
    assert panel == "task_exec"


def test_diff_analysis_payload_wins_over_stale_node_review() -> None:
    panel = resolve_intervention_panel(
        node_id="diff_analysis",
        intervention_kind="result_confirm",
        pending_delivery={
            "diff_analysis_payload": {"status": "ok"},
            "review_payload": {"node_id": "diff_analysis", "summaries": []},
        },
    )
    assert panel == "task_exec"


def test_func_solution_exception_still_uses_hitl() -> None:
    panel = resolve_intervention_panel(
        node_id="func_solution",
        intervention_kind="exception",
        hitl_form_schema={
            "title": "异常裁决",
            "questions": [{"id": "decision", "title": "下一步"}],
        },
    )
    assert panel == "hitl"
