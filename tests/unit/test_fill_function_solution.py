"""函数级方案模板填充脚本：repos.app_module 契约与渲染。"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "skills" / "whalecloud-dev-tool-doc-generate" / "scripts" / "fill_function_solution.py"
TEMPLATE = ROOT / "skills" / "whalecloud-dev-tool-doc-generate" / "templates" / "函数级方案.md"
SKELETON = (
    ROOT
    / "skills"
    / "whalecloud-dev-tool-function-solution"
    / "references"
    / "function_solution_context.skeleton.json"
)


def _load_module():
    spec = importlib.util.spec_from_file_location("fill_function_solution", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def _minimal_ctx(**overrides):
    ctx = json.loads(SKELETON.read_text(encoding="utf-8"))
    ctx.update(
        {
            "REQUIREMENT_NAME": "测试需求",
            "DEMAND_DESC": "背景",
            "scope_overview": "范围",
            "tech_stack_constraints": "C++17",
            "data_flow_diagram": "A→B",
            "function_stats": "共计 1 个函数",
            "code_confirm_rate": "100%",
            "PROD": "TEST",
            "STATUS": "draft",
            "repos": [
                {
                    "branch_id": "4531",
                    "app_module": "ZMDB",
                    "repo_url": "https://git.example/ZMDB.git",
                    "change_desc": "索引改造",
                }
            ],
            "modules": [
                {
                    "module_name": "索引模块",
                    "functions": [{"signature": "setPriority()"}],
                }
            ],
        }
    )
    ctx.update(overrides)
    return ctx


@pytest.fixture(scope="module")
def fill_mod():
    return _load_module()


def test_validate_context_requires_app_module(fill_mod):
    ctx = _minimal_ctx()
    del ctx["repos"][0]["app_module"]
    issues = fill_mod.validate_context(ctx)
    assert any("repos[0]" in x and "app_module" in x for x in issues)


def test_validate_context_rejects_product_module_name(fill_mod):
    ctx = _minimal_ctx()
    row = dict(ctx["repos"][0])
    row.pop("app_module")
    row["product_module_name"] = "ZMDB"
    ctx["repos"] = [row]
    issues = fill_mod.validate_context(ctx)
    assert any("product_module_name" in x or "app_module" in x for x in issues)


def test_render_repos_table_includes_app_module(fill_mod):
    tmpl = TEMPLATE.read_text(encoding="utf-8")
    out = fill_mod.render(tmpl, _minimal_ctx())
    assert "| 产品分支ID | 应用模块 | 仓库地址 | 改造内容 |" in out
    assert "| 4531 | ZMDB | https://git.example/ZMDB.git | 索引改造 |" in out
    issues = fill_mod.validate_filled(out)
    assert issues == []


def test_empty_list_emits_table_placeholder_row(fill_mod):
    tmpl = TEMPLATE.read_text(encoding="utf-8")
    ctx = _minimal_ctx(terms=[])
    out = fill_mod.render(tmpl, ctx)
    terms_idx = out.find("### 1.5")
    assert terms_idx >= 0
    section = out[terms_idx : terms_idx + 120]
    assert "| 术语 | 含义 |" in section
    assert "| （无） |" in section
    assert "\n（无）\n" not in section


def test_pipe_in_cell_is_escaped(fill_mod):
    ctx = _minimal_ctx(
        repos=[
            {
                "branch_id": "4531|主分支",
                "app_module": "ZMDB",
                "repo_url": "https://git.example/ZMDB.git",
                "change_desc": "索引改造",
            }
        ]
    )
    out = fill_mod.render(TEMPLATE.read_text(encoding="utf-8"), ctx)
    assert "4531\\|主分支" in out


def test_fill_writes_markdown(tmp_path, fill_mod):
    ctx_path = tmp_path / "ctx.json"
    out_path = tmp_path / "out.md"
    ctx_path.write_text(json.dumps(_minimal_ctx(), ensure_ascii=False), encoding="utf-8")
    fill_mod.fill(TEMPLATE, ctx_path, out_path)
    text = out_path.read_text(encoding="utf-8")
    assert "ZMDB" in text
    assert "{{" not in text
