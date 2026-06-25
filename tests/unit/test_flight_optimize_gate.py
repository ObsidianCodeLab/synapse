"""试飞优化门控：根据代码提交试飞结果决定是否跳过试飞方案/优化 SOP。"""

from __future__ import annotations

from typing import Any

import pytest

from synapse.rd_meeting.flight_optimize_gate import (
    evaluate_flight_optimize_need,
    write_skipped_flight_optimize_plan,
)
from synapse.rd_meeting.paths import archive_node_dir
from synapse.rd_sop.nodes import stage_name_for_id

DEV_STAGE = stage_name_for_id(4)


def test_evaluate_not_needed_when_flight_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.load_code_commit_assets",
        lambda _sid: {
            "status": "ok",
            "flight": {"status": "ok"},
            "tasks": [{"task_no": "T1", "flight": {"status": "ok"}}],
        },
    )
    assert evaluate_flight_optimize_need("21881451") == "not_needed"


def test_evaluate_needed_when_flight_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.load_code_commit_assets",
        lambda _sid: {
            "status": "failed",
            "flight": {"status": "failed", "error": "构建失败"},
            "tasks": [{"task_no": "T1", "flight": {"status": "failed", "error": "构建失败"}}],
        },
    )
    assert evaluate_flight_optimize_need("21881451") == "needed"


def test_evaluate_unknown_when_no_assets(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.load_code_commit_assets",
        lambda _sid: {},
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate._read_flight_result_archive",
        lambda _sid: "",
    )
    assert evaluate_flight_optimize_need("21881451") == "unknown"


def test_evaluate_needed_from_archive_md(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.load_code_commit_assets",
        lambda _sid: {},
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate._read_flight_result_archive",
        lambda _sid: "# 试飞结果\n\n- 总体试飞状态：failed\n",
    )
    assert evaluate_flight_optimize_need("21881451") == "needed"


def test_write_skipped_flight_optimize_plan(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    scope_id = "test-scope"
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.archive_node_dir",
        lambda _sid, _stage, _node: tmp_path / "archive",
    )
    out = write_skipped_flight_optimize_plan(scope_id, reason="试飞全部通过")
    path = tmp_path / "archive" / "试飞优化方案.md"
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    assert "无需试飞优化" in text
    assert "是否需代码改动：否" in text
    assert out["name"] == "试飞优化方案.md"


def test_write_skipped_preserves_existing_substantive_plan(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    scope_id = "test-scope"
    archive = tmp_path / "archive"
    archive.mkdir(parents=True)
    path = archive / "试飞优化方案.md"
    substantive = "\n".join(
        [
            "# 试飞优化方案",
            "",
            "## 构建失败根因",
            "",
            "DealWithDataRecover CCN=13，main CCN=21。",
            "",
            "## 优化研发计划",
            "",
            "- 拆分 DealWithDataRecover",
        ]
    )
    path.write_text(substantive, encoding="utf-8")
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.archive_node_dir",
        lambda _sid, _stage, _node: archive,
    )
    out = write_skipped_flight_optimize_plan(scope_id, reason="代码提交试飞已全部通过")
    assert out.get("preserved") is True
    assert path.read_text(encoding="utf-8") == substantive


def test_write_skipped_can_replace_existing_placeholder(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    scope_id = "test-scope"
    archive = tmp_path / "archive"
    archive.mkdir(parents=True)
    path = archive / "试飞优化方案.md"
    path.write_text("# 试飞优化方案\n\n**无需试飞优化**\n", encoding="utf-8")
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.archive_node_dir",
        lambda _sid, _stage, _node: archive,
    )
    write_skipped_flight_optimize_plan(scope_id, reason="试飞全部通过")
    assert "无需试飞优化" in path.read_text(encoding="utf-8")


def test_evaluate_unknown_when_commit_failed_skips_flight(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.load_code_commit_assets",
        lambda _sid: {
            "status": "failed",
            "error": "11932298: 代码未提交成功，跳过试飞",
            "flight": {"status": "skipped", "error": "11932298: 代码未提交成功，跳过试飞"},
            "summary": {"commit_failed": 1, "commit_ok": 0},
            "tasks": [
                {
                    "task_no": "11932298",
                    "status": "failed",
                    "flight": {"status": "skipped", "error": "代码未提交成功，跳过试飞"},
                }
            ],
        },
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate._read_flight_result_archive",
        lambda _sid: "",
    )
    assert evaluate_flight_optimize_need("21929118") == "unknown"


def test_evaluate_needed_when_commit_failed_but_archive_flight_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.load_code_commit_assets",
        lambda _sid: {
            "status": "failed",
            "flight": {"status": "skipped", "error": "代码未提交成功，跳过试飞"},
            "summary": {"commit_failed": 1},
            "tasks": [
                {
                    "task_no": "11932298",
                    "status": "failed",
                    "flight": {"status": "skipped", "error": "代码未提交成功，跳过试飞"},
                }
            ],
        },
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate._read_flight_result_archive",
        lambda _sid: "# 试飞结果\n\n- 总体试飞状态：failed\n",
    )
    assert evaluate_flight_optimize_need("21929118") == "needed"


def test_evaluate_not_needed_when_flight_benign_skip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "synapse.rd_meeting.flight_optimize_gate.load_code_commit_assets",
        lambda _sid: {
            "status": "ok",
            "flight": {"status": "skipped", "error": "缺少 portal taskId，跳过试飞轮询"},
            "tasks": [
                {
                    "task_no": "T1",
                    "status": "ok",
                    "flight": {"status": "skipped", "error": "缺少 portal taskId，跳过试飞轮询"},
                }
            ],
        },
    )
    assert evaluate_flight_optimize_need("21881451") == "not_needed"
