"""环境预生成：沙箱工程路径文档落盘。"""

from __future__ import annotations

from pathlib import Path

import pytest

from synapse.rd_meeting.env_pregen_layout import (
    bootstrap_engineering_layout,
    copy_dev_templates_to_engineering,
    copy_work_order_docs_to_engineering,
    resolve_engineering_targets,
    strip_dev_version_suffix,
)
from synapse.rd_meeting.paths import archive_node_dir, sandbox_engineering_dir
from synapse.rd_sop.nodes import stage_name_for_id


@pytest.fixture
def work_root(tmp_path, monkeypatch):
    root = tmp_path / "work"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: root)
    return root


def test_strip_dev_version_suffix():
    assert strip_dev_version_suffix("agents.md.template_202606") == "AGENTS.md"
    assert strip_dev_version_suffix("Python研发规范_202606.md") == "Python研发规范.md"
    assert strip_dev_version_suffix("readme.md") is None


def test_sandbox_engineering_dir(work_root):
    scope_id = "D-100"
    eng = sandbox_engineering_dir(scope_id, "ZMDB核心", "src/main")
    assert eng == work_root / "D-100" / "sandbox" / "ZMDB核心" / "src" / "main"


def test_resolve_engineering_targets(work_root):
    wire = {
        "prod": "p1",
        "repo_info": [
            {
                "repo_url": "https://git.example.com/zmdb-core.git",
                "repo_module": "100|ZMDB核心",
                "code_path": "src/core",
            }
        ],
        "doc_process": [],
    }
    targets = resolve_engineering_targets("D-100", wire)
    assert len(targets) == 1
    assert targets[0]["module"] == "ZMDB核心"
    assert targets[0]["code_path"] == "src/core"
    assert "sandbox" in targets[0]["engineering_root"]
    assert "ZMDB核心" in targets[0]["engineering_root"]


def test_copy_dev_templates_strips_version(work_root, tmp_path):
    dev_dir = tmp_path / "dev"
    dev_dir.mkdir()
    (dev_dir / "agents.md.template_202606").write_text("# AGENTS", encoding="utf-8")
    (dev_dir / "Python研发规范_202606.md").write_text("# Python", encoding="utf-8")
    (dev_dir / "ignored.txt").write_text("x", encoding="utf-8")

    eng = work_root / "D-1" / "sandbox" / "mod" / "code"
    row = copy_dev_templates_to_engineering(eng, dev_dir=dev_dir)
    assert row["status"] == "ok"
    assert (eng / "AGENTS.md").read_text(encoding="utf-8") == "# AGENTS"
    assert (eng / "synapse_archive" / "产品规范" / "Python研发规范.md").read_text(encoding="utf-8") == "# Python"


def test_copy_work_order_docs_only_template_list(work_root):
    scope_id = "D-2"
    stage = stage_name_for_id(1)
    clarify = archive_node_dir(scope_id, stage, "req_clarify")
    clarify.mkdir(parents=True)
    (clarify / "需求澄清.md").write_text("# 澄清", encoding="utf-8")
    review = archive_node_dir(scope_id, stage_name_for_id(2), "solution_review")
    review.mkdir(parents=True)
    (review / "方案评审结论.md").write_text("# 不应拷贝", encoding="utf-8")

    eng = work_root / scope_id / "sandbox" / "mod"
    row = copy_work_order_docs_to_engineering(scope_id, eng)
    assert row["status"] in ("ok", "partial")
    assert (
        eng / "synapse_archive" / "需求分析" / "req_clarify" / "需求澄清.md"
    ).read_text(encoding="utf-8") == "# 澄清"
    assert not (eng / "synapse_archive" / "方案评审结论.md").exists()


def test_bootstrap_engineering_layout_end_to_end(work_root, tmp_path):
    scope_id = "D-3"
    dev_dir = tmp_path / "dev"
    dev_dir.mkdir()
    (dev_dir / "agents.md.template_202606").write_text("# tpl", encoding="utf-8")

    stage = stage_name_for_id(1)
    boundary = archive_node_dir(scope_id, stage, "boundary")
    boundary.mkdir(parents=True)
    (boundary / "边界确认说明.md").write_text("# 边界", encoding="utf-8")

    wire = {
        "prod": "p1",
        "repo_info": [
            {
                "repo_url": "https://git.example.com/app.git",
                "repo_module": "200|计费模块",
                "code_path": "billing",
            }
        ],
        "doc_process": [],
    }
    assets = bootstrap_engineering_layout(scope_id, wire, dev_dir=dev_dir)
    assert assets["status"] in ("ok", "partial")
    eng = Path(assets["layouts"][0]["engineering_root"])
    assert (eng / "AGENTS.md").exists()
    assert (eng / "synapse_archive" / "需求分析" / "boundary" / "边界确认说明.md").exists()
