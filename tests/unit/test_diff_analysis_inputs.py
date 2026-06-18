"""试飞优化节点：上游产物快照与本节点 archive 隔离。"""

from __future__ import annotations

from pathlib import Path

import pytest

from synapse.rd_meeting.diff_analysis_inputs import (
    INPUT_FLIGHT_FILENAME,
    INPUT_PLAN_FILENAME,
    ensure_diff_analysis_input_snapshots,
    flight_round_filename,
    plan_round_filename,
    read_diff_analysis_plan,
    sync_diff_analysis_commit_result,
    write_diff_analysis_flight_round,
)
from synapse.rd_meeting.paths import archive_node_dir
from synapse.rd_sop.nodes import stage_name_for_id

STAGE = stage_name_for_id(4)


def _setup_upstream(tmp_path: Path, scope_id: str) -> None:
    fb = archive_node_dir(scope_id, STAGE, "task_feedback")
    fb.mkdir(parents=True)
    (fb / INPUT_PLAN_FILENAME).write_text("# 试飞优化方案\n\n## 优化研发计划\n修复 CCN\n", encoding="utf-8")
    exc = archive_node_dir(scope_id, STAGE, "exception_check")
    exc.mkdir(parents=True)
    (exc / INPUT_FLIGHT_FILENAME).write_text("# 试飞结果\n\n- 总体试飞状态：failed\n", encoding="utf-8")
    (exc / "代码提交日志.md").write_text("# 提交\n", encoding="utf-8")


def test_ensure_snapshots_copies_upstream_once(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    scope_id = "snap-1"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    _setup_upstream(tmp_path, scope_id)

    out1 = ensure_diff_analysis_input_snapshots(scope_id)
    assert INPUT_PLAN_FILENAME in out1
    inputs_plan = Path(out1[INPUT_PLAN_FILENAME])
    assert "修复 CCN" in inputs_plan.read_text(encoding="utf-8")

    fb_plan = archive_node_dir(scope_id, STAGE, "task_feedback") / INPUT_PLAN_FILENAME
    fb_plan.write_text("被上游篡改\n", encoding="utf-8")

    out2 = ensure_diff_analysis_input_snapshots(scope_id)
    assert "修复 CCN" in Path(out2[INPUT_PLAN_FILENAME]).read_text(encoding="utf-8")


def test_read_plan_prefers_latest_round(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    scope_id = "snap-2"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    _setup_upstream(tmp_path, scope_id)
    ensure_diff_analysis_input_snapshots(scope_id)

    da = archive_node_dir(scope_id, STAGE, "diff_analysis")
    da.mkdir(parents=True, exist_ok=True)
    (da / plan_round_filename(2)).write_text("# 第2轮方案\n", encoding="utf-8")

    path, text = read_diff_analysis_plan(scope_id)
    assert plan_round_filename(2) in path
    assert "第2轮方案" in text


def test_sync_commit_writes_flight_round_not_exception_check(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    scope_id = "snap-3"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    _setup_upstream(tmp_path, scope_id)
    exc_flight = archive_node_dir(scope_id, STAGE, "exception_check") / INPUT_FLIGHT_FILENAME
    original = exc_flight.read_text(encoding="utf-8")

    commit_result = {
        "status": "partial",
        "flight": {"status": "failed", "error": "构建失败"},
        "tasks": [{"task_no": "T1", "flight": {"status": "failed", "error": "CCN"}}],
    }
    out_path = sync_diff_analysis_commit_result(scope_id, commit_result, round_no=1)
    assert out_path is not None
    assert flight_round_filename(1) in str(out_path)
    assert "构建失败" in out_path.read_text(encoding="utf-8")
    assert exc_flight.read_text(encoding="utf-8") == original


def test_write_flight_round_standalone(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    scope_id = "snap-4"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    path = write_diff_analysis_flight_round(
        scope_id,
        {"status": "failed", "flight": {"status": "failed"}, "tasks": []},
        round_no=3,
    )
    assert path.name == flight_round_filename(3)
