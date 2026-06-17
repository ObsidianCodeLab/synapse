"""试飞优化方案模板填充脚本：契约校验与渲染。"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "skills" / "whalecloud-dev-tool-doc-generate" / "scripts" / "fill_flight_optimize_plan.py"
TEMPLATE = ROOT / "skills" / "whalecloud-dev-tool-doc-generate" / "templates" / "试飞优化方案.md"
SKELETON = (
    ROOT
    / "skills"
    / "whalecloud-dev-tool-doc-generate"
    / "references"
    / "flight_optimize_plan_context.skeleton.json"
)


def _load_module():
    spec = importlib.util.spec_from_file_location("fill_flight_optimize_plan", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def _minimal_ctx(**overrides):
    ctx = json.loads(SKELETON.read_text(encoding="utf-8"))
    ctx.update(
        {
            "WORK_ORDER_DIR": "work/21881451",
            "OVERALL_FLIGHT_STATUS": "failed",
            "flight_summary": [
                {
                    "task_no": "11929917",
                    "feature_id": "11929917",
                    "flight_status": "failed",
                    "build_conclusion": "SOURCEMONITOR 圈复杂度超标",
                }
            ],
            "identified_issues": [
                {
                    "sub_task": "11929917",
                    "check_item": "SOURCEMONITOR 代码检查",
                    "failure_summary": "CCN 超标",
                    "root_cause": "嵌套分支过多",
                    "priority": "P1",
                }
            ],
            "plan_items": [
                {
                    "title": "降低圈复杂度",
                    "problem_ref": "#1",
                    "change_scope": "Helper/ZmdbConfig.cpp",
                    "change_description": "1. 提取辅助函数",
                    "standard_alignment": "CCN ≤ 10",
                    "verification_steps": ["重新扫描 CCN"],
                }
            ],
            "conclusion": {
                "needs_code_change": True,
                "affected_sub_tasks": ["11929917"],
                "downstream_suggestions": ["重新提交试飞"],
                "summary": "建议进入 diff_analysis 节点实施。",
            },
        }
    )
    ctx.update(overrides)
    return ctx


@pytest.fixture(scope="module")
def fill_mod():
    return _load_module()


def test_validate_context_requires_work_order_dir(fill_mod):
    ctx = _minimal_ctx()
    ctx["WORK_ORDER_DIR"] = ""
    issues = fill_mod.validate_context(ctx)
    assert any("WORK_ORDER_DIR" in x for x in issues)


def test_validate_context_requires_plan_items_when_issues_exist(fill_mod):
    ctx = _minimal_ctx(plan_items=[])
    issues = fill_mod.validate_context(ctx)
    assert any("plan_items" in x for x in issues)


def test_fill_renders_required_sections(fill_mod, tmp_path: Path):
    ctx = _minimal_ctx()
    ctx_path = tmp_path / "ctx.json"
    out_path = tmp_path / "试飞优化方案.md"
    ctx_path.write_text(json.dumps(ctx, ensure_ascii=False), encoding="utf-8")

    fill_mod.fill(TEMPLATE, ctx_path, out_path)
    text = out_path.read_text(encoding="utf-8")

    assert "## 试飞结果摘要" in text
    assert "## 已识别问题清单" in text
    assert "## 优化研发计划" in text
    assert "### 计划项 1：降低圈复杂度" in text
    assert "## 回归风险与防引入策略" in text
    assert "## 执行结论" in text
    assert "## 附录：代码变更摘要" in text
    assert "{{" not in text
