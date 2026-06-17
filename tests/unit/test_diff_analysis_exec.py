"""试飞优化 CLI 节点。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.diff_analysis_exec import (
    NODE_ID,
    _extract_optimize_goal,
    _plan_requires_code_change,
    bootstrap_diff_analysis,
    uses_diff_analysis_cli,
)


def test_uses_diff_analysis_cli():
    assert uses_diff_analysis_cli(NODE_ID) is True
    assert uses_diff_analysis_cli("task_exec") is False


def test_plan_requires_code_change():
    assert _plan_requires_code_change("**是否需代码改动**：否") is False
    assert _plan_requires_code_change("是否需代码改动：是\n修复编译") is True


def test_extract_optimize_goal_prefers_task_section():
    plan = """
## 优化研发计划
### 计划项 1：修复 T-100 编译
- **改动说明**：修 App.java
"""
    goal = _extract_optimize_goal(plan, task_no="T-100", task_title="子单A")
    assert "T-100" in goal or "App.java" in goal


def test_bootstrap_diff_analysis_fails_without_plan(tmp_path, monkeypatch):
    scope_id = "T-da-1"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    result = bootstrap_diff_analysis("demand", scope_id)
    assert result["status"] == "failed"
    assert "试飞优化方案" in str(result.get("error") or "")


def test_bootstrap_diff_analysis_skips_when_no_code_change(tmp_path, monkeypatch):
    scope_id = "T-da-2"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    from synapse.rd_meeting.paths import archive_node_dir
    from synapse.rd_sop.nodes import stage_name_for_id

    stage = stage_name_for_id(4)
    plan_dir = archive_node_dir(scope_id, stage, "task_feedback")
    plan_dir.mkdir(parents=True)
    (plan_dir / "试飞优化方案.md").write_text(
        "# 试飞优化方案\n\n**是否需代码改动**：否\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "synapse.rd_meeting.diff_analysis_exec._collect_optimize_orders",
        lambda _st, _sid: (
            [
                {
                    "task_no": "T1",
                    "task_title": "子单1",
                    "goal": "无需改动",
                    "sandbox_path": "",
                    "product_module": "",
                    "plan_doc_path": str(plan_dir / "试飞优化方案.md"),
                }
            ],
            str(plan_dir / "试飞优化方案.md"),
            "**是否需代码改动**：否",
        ),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.diff_analysis_exec._run_code_commit_phase",
        lambda *_a, **_k: {
            "status": "ok",
            "flight": {"status": "ok", "error": ""},
            "tasks": [],
            "summary": {"total": 1, "commit_ok": 1, "flight_ok": 1},
        },
    )
    monkeypatch.setattr("synapse.rd_meeting.diff_analysis_exec.patch_userwork_summary", lambda **_k: None)
    monkeypatch.setattr("synapse.rd_meeting.diff_analysis_exec._emit_progress", lambda *_a, **_k: None)
    monkeypatch.setattr("synapse.rd_meeting.diff_analysis_exec.check_cursor_agent_cli", lambda: {"ready": True})

    result = bootstrap_diff_analysis("demand", scope_id, cli_tool="cursor_cli")
    assert result["status"] == "ok"
    assert result["tasks"][0]["status"] == "skipped"
