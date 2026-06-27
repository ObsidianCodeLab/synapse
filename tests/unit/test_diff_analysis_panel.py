"""diff_analysis_panel 单元测试。"""

import pytest

from synapse.rd_meeting.diff_analysis_panel import extract_markdown_section, extract_plan_items


def test_extract_markdown_section_optimize_plan() -> None:
    md = """# 试飞优化方案

## 已识别问题清单

- item

## 优化研发计划

### 计划项 1

- **改动说明**：foo

## 回归风险

- bar
"""
    section = extract_markdown_section(md, "优化研发计划")
    assert "## 优化研发计划" in section
    assert "计划项 1" in section
    assert "回归风险" not in section


def test_extract_plan_items_splits_tabs() -> None:
    md = """## 优化研发计划

> 按推荐执行顺序排列

### 计划项 1：重构 A

- step a

### 计划项 2：评估 B

- step b
"""
    intro, items = extract_plan_items(md)
    assert "按推荐执行顺序" in intro
    assert len(items) == 2
    assert items[0]["item_no"] == 1
    assert items[1]["item_no"] == 2
    assert "step a" in items[0]["markdown"]
    assert "step b" in items[1]["markdown"]
    assert "计划项 2" in items[1]["label"]


def test_resolve_identified_issues_markdown(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "synapse.rd_meeting.diff_analysis_panel._latest_plan_markdown",
        lambda _sid: """## 已识别问题清单

| # | 子单 | 检查项 |
|---|------|--------|
| 1 | T1 | CCN |

## 优化研发计划
""",
    )
    from synapse.rd_meeting.diff_analysis_panel import resolve_identified_issues_markdown

    out = resolve_identified_issues_markdown("21881451")
    assert out is not None
    assert "已识别问题清单" in out
    assert "CCN" in out
    assert "优化研发计划" not in out


def test_resolve_flight_key_content_done_ignores_exception_check_gate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """本轮提交试飞已通过时，不因 exception_check 旧失败而 has_issues=true。"""
    monkeypatch.setattr(
        "synapse.rd_meeting.diff_analysis_panel.evaluate_flight_optimize_need",
        lambda _sid: "needed",
    )
    from synapse.rd_meeting.diff_analysis_panel import resolve_flight_key_content

    payload = {
        "commit_phase": "done",
        "flight_failed": False,
        "optimization_round": 1,
        "code_commit": {
            "status": "ok",
            "optimization_round": 1,
            "flight": {"status": "ok"},
            "tasks": [{"task_no": "T1", "flight": {"status": "ok"}}],
        },
    }
    out = resolve_flight_key_content("21942031", payload)
    assert out["has_issues"] is False
    assert out["source"] == "diff_analysis_commit"


def test_resolve_flight_key_content_await_confirm_uses_gate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "synapse.rd_meeting.diff_analysis_panel.evaluate_flight_optimize_need",
        lambda _sid: "needed",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.diff_analysis_panel._initial_code_commit_display",
        lambda _sid: {"status": "ok", "flight": {"status": "ok"}},
    )
    from synapse.rd_meeting.diff_analysis_panel import resolve_flight_key_content

    payload = {
        "commit_phase": "await_confirm",
        "flight_failed": False,
        "code_commit": None,
    }
    out = resolve_flight_key_content("21942031", payload)
    assert out["has_issues"] is True
