"""系统节点结构化展示 payload 构建。"""

from __future__ import annotations

from synapse.rd_meeting.system_node_display import (
    build_auto_split_display,
    build_env_path_inventory,
    build_sandbox_build_display,
    build_task_sandbox_bindings,
    collect_task_rows,
    display_kind_for_system_node,
)


def test_display_kind_for_system_nodes():
    assert display_kind_for_system_node("auto_split") == "system_auto_split"
    assert display_kind_for_system_node("sandbox_build") == "system_sandbox_build"
    assert display_kind_for_system_node("env_pregen") == "system_env_pregen"
    assert display_kind_for_system_node("env_start") == "system_exec"


def test_collect_task_rows_merges_sources():
    assets = {
        "split_plan_tasks": [
            {"taskNo": "T1", "taskTitle": "子单A", "productModuleName": "ZMDB"},
        ],
        "create_task_results": [
            {
                "status": "ok",
                "taskTitle": "子单A",
                "task_no": "T1",
                "work_item": {"product_module_name": "ZMDB", "task_no": "T1"},
            }
        ],
        "local_tasks": [
            {"task_no": "T1", "task_title": "子单A", "sop_node": "pending", "local_process_state": "open"},
        ],
    }
    rows = collect_task_rows(assets)
    assert len(rows) == 1
    assert rows[0]["task_no"] == "T1"
    assert rows[0]["sop_node"] == "pending"


def test_build_task_sandbox_bindings_matches_module():
    auto_split = {
        "split_plan_tasks": [
            {"taskNo": "T1", "taskTitle": "改造A", "productModuleName": "演示模块"},
        ],
    }
    wire = {
        "prod": "p1",
        "repo_info": [
            {
                "repo_url": "https://git.example.com/demo.git",
                "repo_module": "1|演示模块",
                "code_path": "src/core",
                "repo_branch": "main",
            }
        ],
    }
    sandbox = {
        "repos": [
            {
                "repo_name": "demo",
                "local_path": "/work/x/sandbox/demo",
                "status": "ok",
            }
        ]
    }
    bindings = build_task_sandbox_bindings(auto_split, wire, sandbox)
    assert len(bindings) == 1
    assert bindings[0]["match_status"] == "ok"
    assert bindings[0]["repos"][0]["code_path"] == "src/core"
    assert bindings[0]["repos"][0]["local_path"] == "/work/x/sandbox/demo"


def test_build_auto_split_display_includes_tasks():
    payload = build_auto_split_display(
        {
            "status": "ok",
            "demand_no": "D1",
            "split_plan_tasks": [{"taskTitle": "A", "productModuleName": "M"}],
            "local_tasks": [],
        }
    )
    assert payload["node_id"] == "auto_split"
    assert payload["tasks"]


def test_build_env_path_inventory_lists_engineering_files():
    entries = build_env_path_inventory(
        {
            "engineering": {
                "layouts": [
                    {
                        "module": "演示模块",
                        "code_path": "src",
                        "engineering_root": "/work/x/sandbox/demo/src",
                        "dev_templates": {"status": "ok", "files": ["AGENTS.md"]},
                        "work_order_docs": {"status": "ok", "files": ["需求分析/req_clarify/需求澄清.md"]},
                    }
                ]
            },
            "entropy": {"status": "ok", "local_path": "/work/x/env/entropy", "files": ["agent.md"]},
        }
    )
    paths = {e["path"] for e in entries}
    assert "/work/x/sandbox/demo/src/AGENTS.md" in paths
    assert "/work/x/sandbox/demo/src/synapse_archive/需求分析/req_clarify/需求澄清.md" in paths
    assert "/work/x/env/entropy/agent.md" in paths


def test_build_sandbox_build_display_has_bindings(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.system_node_display._load_pipeline_context_asset",
        lambda _sid, _key: {
            "split_plan_tasks": [{"taskNo": "T1", "taskTitle": "A", "productModuleName": "M"}],
        },
    )
    wire = {
        "repo_info": [
            {"repo_url": "https://git.example.com/r.git", "repo_module": "M", "code_path": ""},
        ]
    }
    display = build_sandbox_build_display(
        {"status": "ok", "repos": [{"repo_name": "r", "status": "ok", "local_path": "/p/r"}]},
        scope_id="scope1",
        wire_row=wire,
    )
    assert display["node_id"] == "sandbox_build"
    assert display["task_bindings"]
