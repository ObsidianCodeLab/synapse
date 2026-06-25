"""unit_test_gate 解析、pytest 执行与裁决单元测试。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.unit_test_gate import (
    JSON_NAME,
    MD_NAME,
    apply_human_decision,
    normalize_payload,
    run_unit_tests,
    uses_unit_test_gate,
    validate_unit_test_review_json,
)


def test_uses_unit_test_gate():
    assert uses_unit_test_gate("unit_test")
    assert not uses_unit_test_gate("task_exec")


def test_validate_requires_json_and_md(tmp_path, monkeypatch):
    scope_id = "T-ut-1"
    monkeypatch.setattr(
        "synapse.rd_meeting.unit_test_gate.json_path",
        lambda sid: tmp_path / sid / JSON_NAME,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.unit_test_gate.md_path",
        lambda sid: tmp_path / sid / MD_NAME,
    )

    ok, errors = validate_unit_test_review_json(scope_id)
    assert not ok
    assert any(JSON_NAME in e for e in errors)

    base = tmp_path / scope_id
    base.mkdir(parents=True)
    (base / JSON_NAME).write_text(
        json.dumps(
            {
                "schema_version": 1,
                "test_suite": {"test_files": ["tests/unit/test_x.py"]},
                "test_cases": [
                    {
                        "id": "tc-1",
                        "name": "示例",
                        "test_file": "tests/unit/test_x.py",
                        "test_function": "test_ok",
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    md_body = "# 测试案例说明\n\n" + ("覆盖验收标准与边界场景。" * 20) + "\n"
    (base / MD_NAME).write_text(md_body, encoding="utf-8")
    ok, errors = validate_unit_test_review_json(scope_id)
    assert ok, errors


def test_apply_human_decision_approve_requires_comment(tmp_path, monkeypatch):
    scope_id = "T-ut-2"
    payload = {
        "schema_version": 1,
        "test_suite": {"test_files": ["tests/unit/test_x.py"]},
        "test_cases": [
            {
                "id": "tc-1",
                "name": "A",
                "human_review": {"status": "approved", "comment": ""},
                "last_result": {"status": "passed"},
            }
        ],
        "last_run": {"failed": 0, "total": 1, "passed": 1},
        "human_review": {},
    }

    monkeypatch.setattr(
        "synapse.rd_meeting.unit_test_gate.load_unit_test_review_payload",
        lambda sid: normalize_payload(payload),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.unit_test_gate.json_path",
        lambda sid: tmp_path / sid / JSON_NAME,
    )
    (tmp_path / scope_id).mkdir(parents=True)

    with pytest.raises(ValueError, match="comment_too_short"):
        apply_human_decision(scope_id, decision="approve", comment="短")

    out = apply_human_decision(
        scope_id,
        decision="approve",
        comment="测试覆盖验收标准核心场景，执行结果全部通过，可进入代码走查。",
    )
    assert out["human_review"]["decision"] == "approve"


def test_run_unit_tests_updates_last_run(tmp_path, monkeypatch):
    scope_id = "T-ut-3"
    eng = tmp_path / "eng"
    eng.mkdir()
    tests_dir = eng / "tests" / "unit"
    tests_dir.mkdir(parents=True)
    test_file = tests_dir / "test_sample.py"
    test_file.write_text(
        "def test_ok():\n    assert 1 + 1 == 2\n",
        encoding="utf-8",
    )

    payload = {
        "schema_version": 1,
        "test_suite": {"test_files": ["tests/unit/test_sample.py"]},
        "test_cases": [
            {
                "id": "tc-1",
                "name": "加法",
                "test_file": "tests/unit/test_sample.py",
                "test_function": "test_ok",
            }
        ],
    }

    monkeypatch.setattr("synapse.rd_meeting.unit_test_gate.resolve_test_cwd", lambda sid: eng)
    monkeypatch.setattr(
        "synapse.rd_meeting.unit_test_gate.json_path",
        lambda sid: tmp_path / sid / JSON_NAME,
    )
    (tmp_path / scope_id).mkdir(parents=True)

    result = run_unit_tests(scope_id, payload=payload)
    assert result["last_run"]["passed"] == 1
    assert result["last_run"]["failed"] == 0
    assert result["test_cases"][0]["last_result"]["status"] == "passed"


def test_intervention_panel_unit_test():
    from synapse.rd_meeting.intervention_panel import resolve_intervention_panel

    panel = resolve_intervention_panel(
        node_id="unit_test",
        intervention_kind="unit_test_review",
        pending_delivery={"unit_test_review_payload": {"schema_version": 1}},
    )
    assert panel == "unit_test_review"
