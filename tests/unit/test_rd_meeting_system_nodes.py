"""系统节点：sandbox_build / auto_split / env_pregen / human_confirm 约束。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synapse.rd_meeting.auto_split_assets import bootstrap_auto_split, format_auto_split_report
from synapse.rd_meeting.binding import resolve_node_binding
from synapse.rd_meeting.env_pregen_assets import _copy_tree_files, bootstrap_env_pregen
from synapse.rd_meeting.sandbox_assets import materialize_repo_to_sandbox
from synapse.rd_sop.manifest import default_human_confirm, is_system_node

_SAMPLE_SPLIT_TASK = {
    "taskNo": "D12345",
    "taskTitle": "子单A",
    "comments": "desc",
    "productModuleName": "ZMDB",
    "branchVersionName": "main",
    "patchName": "patch-1",
    "taskImpactDesc": "自测说明",
    "performanceImpact": "无",
    "functionalImpact": "无",
    "cfgChangeDescription": "无",
    "upgradeRisk": "无",
    "securityImpact": "无",
    "compatibilityImpact": "无",
}


def test_sandbox_build_is_system_type():
    assert is_system_node("sandbox_build")
    assert default_human_confirm("sandbox_build") is False


def test_auto_split_and_env_pregen_are_system_type():
    assert is_system_node("auto_split")
    assert is_system_node("env_pregen")
    assert default_human_confirm("auto_split") is False
    assert default_human_confirm("env_pregen") is False


def test_dev_stage_system_nodes_are_system_type():
    assert is_system_node("exception_check")
    assert is_system_node("env_start")
    assert default_human_confirm("exception_check") is False
    assert default_human_confirm("env_start") is False


def test_system_node_binding_forbids_human_confirm(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.binding.load_meeting_room_config",
        lambda: {
            "node_overrides": {
                "sandbox_build": {"human_confirm": True},
                "auto_split": {"human_confirm": True},
            }
        },
    )
    for nid in ("sandbox_build", "auto_split", "env_pregen"):
        b = resolve_node_binding(nid)
        assert b["type"] == "system"
        assert b["human_confirm"] is False
        assert b["hitl_form_schema"] is None


def test_materialize_repo_to_sandbox_skips_utf8(monkeypatch, tmp_path):
    scope_id = "sb-scope"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    dest = tmp_path / "work" / scope_id / "sandbox" / "demo"
    dest.mkdir(parents=True)
    (dest / ".git").mkdir()
    legacy = dest / "legacy.txt"
    legacy.write_bytes("编码测试".encode("gbk"))

    monkeypatch.setattr(
        "synapse.rd_meeting.sandbox_assets._run_git",
        lambda *args, **kwargs: (True, ""),
    )

    entry = materialize_repo_to_sandbox(
        scope_id,
        {"repo_name": "demo", "repo_url": "https://example.com/demo.git", "repo_branch": "main"},
    )
    assert entry["status"] == "ok"
    assert legacy.read_bytes() == "编码测试".encode("gbk")


def test_materialize_repo_to_sandbox_checkouts_feature_branch(monkeypatch, tmp_path):
    scope_id = "sb-feature"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    dest = tmp_path / "work" / scope_id / "sandbox" / "demo"
    dest.mkdir(parents=True)
    (dest / ".git").mkdir()
    git_calls: list[list[str]] = []

    def _fake_git(args, **kwargs):
        git_calls.append(list(args))
        return True, ""

    monkeypatch.setattr(
        "synapse.rd_meeting.sandbox_assets._run_git",
        _fake_git,
    )

    entry = materialize_repo_to_sandbox(
        scope_id,
        {"repo_name": "demo", "repo_url": "https://example.com/demo.git", "repo_branch": "main"},
        feature_branch="feat-11923497",
    )
    assert entry["status"] == "ok"
    assert entry["feature_branch"] == "feat-11923497"
    assert any("fetch" in cmd and "feat-11923497" in cmd for cmd in git_calls)
    assert any("checkout" in cmd and "feat-11923497" in cmd for cmd in git_calls)


def test_auto_split_from_userwork(monkeypatch, tmp_path):
    scope_id = "D12345"
    uw_path = tmp_path / "userwork.json"
    uw_path.write_text(
        json.dumps(
            {
                "list": [
                    {
                        "demand_no": scope_id,
                        "owned_work_items": [
                            {"task_no": "T001", "task_title": "子单A", "sop_node": "pending"},
                        ],
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.userwork_sync._owner_order_file_name",
        lambda: uw_path,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.userwork_sync._owner_order_file_lock_path",
        lambda: tmp_path / "userwork.lock",
    )
    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud._owner_order_file_name",
        lambda: uw_path,
    )
    monkeypatch.setattr(
        "synapse.api.routes.dev_iwhalecloud._owner_order_file_lock_path",
        lambda: tmp_path / "userwork.lock",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.auto_split_assets._load_split_plan_tasks",
        lambda _sid: [dict(_SAMPLE_SPLIT_TASK)],
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.auto_split_assets._create_tasks_from_split_plan_sync",
        lambda _dn, _tasks: [
            {
                "status": "ok",
                "taskTitle": "子单A",
                "task_no": "T002",
                "work_item": {
                    "task_no": "T002",
                    "task_title": "子单A",
                    "task_desc": "desc",
                    "created_date": "2026-06-08 10:00:00",
                    "sccb_work_hours": None,
                    "stage_name": "开发中",
                    "product_module_id": 1,
                    "product_module_name": "ZMDB",
                    "repo_url": "https://example.com/repo.git",
                    "sop_node": "任务执行",
                },
            }
        ],
    )
    assets = bootstrap_auto_split("demand", scope_id)
    assert assets["status"] == "ok"
    assert assets["userwork_added_task_nos"] == ["T002"]
    assert len(assets["local_tasks"]) == 1
    assert assets["local_tasks"][0]["task_no"] == "T002"
    assert assets["create_task_results"][0]["task_no"] == "T002"
    assert len(assets["split_plan_tasks"]) == 1
    report = format_auto_split_report(assets, node_name="自动拆单")
    assert "研发子单拆分清单" in report
    assert "拆单结果" in report
    assert "T002" in report
    assert "T001" not in report

    saved = json.loads(uw_path.read_text(encoding="utf-8"))
    task_nos = [t["task_no"] for t in saved["list"][0]["owned_work_items"]]
    assert task_nos == ["T001", "T002"]


def test_auto_split_does_not_fetch_portal_task_list(monkeypatch):
    scope_id = "D99999"
    calls: list[str] = []

    def _forbidden_portal_fetch(_dn):
        calls.append(_dn)
        raise AssertionError("portal task list should not be fetched during auto_split")

    monkeypatch.setattr(
        "synapse.rd_meeting.auto_split_assets._load_split_plan_tasks",
        lambda _sid: [dict(_SAMPLE_SPLIT_TASK, taskNo=scope_id)],
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.auto_split_assets._create_tasks_from_split_plan_sync",
        lambda _dn, _tasks: [{"status": "ok", "taskTitle": "子单A", "task_no": "T901"}],
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.auto_split_assets._load_userwork_list",
        lambda: [{"demand_no": scope_id, "owned_work_items": []}],
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.auto_split_assets._fetch_portal_task_nos",
        _forbidden_portal_fetch,
    )

    assets = bootstrap_auto_split("demand", scope_id)
    assert assets["status"] == "ok"
    assert assets["create_task_results"][0]["task_no"] == "T901"
    assert calls == []


@pytest.mark.asyncio
async def test_auto_split_create_tasks_from_split_plan(monkeypatch):
    from synapse.api.routes.dev_iwhalecloud import CreateTaskRequest

    created: list[CreateTaskRequest] = []

    async def _fake_create(body):
        created.append(body)
        return {
            "errorcode": 0,
            "data": {
                "task_no": "T-NEW-1",
                "task_title": body.taskTitle,
                "feature_id": "feat-branch-1",
            },
        }

    monkeypatch.setattr("synapse.api.routes.dev_iwhalecloud.create_task", _fake_create)

    from synapse.rd_meeting.auto_split_assets import _create_tasks_from_split_plan_async

    rows = await _create_tasks_from_split_plan_async("D100", [_SAMPLE_SPLIT_TASK])
    assert len(created) == 1
    assert created[0].taskTitle == "子单A"
    assert rows[0]["status"] == "ok"
    assert rows[0]["task_no"] == "T-NEW-1"
    assert rows[0]["work_item"]["task_no"] == "T-NEW-1"
    assert rows[0]["work_item"]["task_title"] == "子单A"
    assert rows[0]["work_item"]["feature_id"] == "feat-branch-1"


def test_env_pregen_test_sleep(monkeypatch):
    slept: list[float] = []
    monkeypatch.setenv("SYNAPSE_ENV_PREGEN_TEST_SLEEP", "1")
    monkeypatch.setattr("synapse.rd_meeting.env_pregen_assets.time.sleep", lambda s: slept.append(s))
    from synapse.rd_meeting.env_pregen_assets import _env_pregen_test_sleep

    _env_pregen_test_sleep()
    assert slept == [100_000]


def test_env_pregen_copies_entropy(monkeypatch, tmp_path):
    scope_id = "env-scope"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    from synapse.rd_meeting.paths import archive_node_dir, env_entropy_dir
    from synapse.rd_sop.nodes import stage_name_for_id

    stage = stage_name_for_id(2)
    src = archive_node_dir(scope_id, stage, "entropy_gen")
    src.mkdir(parents=True)
    (src / "agent.md").write_text("# agent", encoding="utf-8")
    (src / "rule.md").write_text("# rule", encoding="utf-8")

    copied = _copy_tree_files(src, env_entropy_dir(scope_id))
    assert len(copied) == 2
    assert (env_entropy_dir(scope_id) / "agent.md").read_text(encoding="utf-8") == "# agent"


def test_bootstrap_env_pregen_partial_without_catalog(monkeypatch, tmp_path):
    scope_id = "env2"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    from synapse.rd_meeting.paths import archive_node_dir, product_doc_root
    from synapse.rd_sop.nodes import stage_name_for_id

    stage = stage_name_for_id(2)
    src = archive_node_dir(scope_id, stage, "entropy_gen")
    src.mkdir(parents=True)
    (src / "agent.md").write_text("x", encoding="utf-8")

    doc_root = product_doc_root(scope_id)
    (doc_root / "产品架构").mkdir(parents=True)
    (doc_root / "产品架构" / "arch.md").write_text("doc", encoding="utf-8")

    monkeypatch.setattr(
        "synapse.rd_meeting.env_pregen_assets._materialize_doc",
        lambda *a, **k: {"doc_type": "x", "status": "skipped", "error": "skip"},
    )

    wire = {
        "prod": "prod-x",
        "repo_info": [
            {
                "repo_url": "https://git.example.com/demo.git",
                "repo_module": "1|演示模块",
                "code_path": "src",
            }
        ],
        "doc_process": [],
    }
    dev_dir = tmp_path / "dev"
    dev_dir.mkdir()
    (dev_dir / "agents.md.template_202606").write_text("# agents", encoding="utf-8")
    monkeypatch.setattr(
        "synapse.rd_meeting.env_pregen_layout.resolve_dev_dir",
        lambda: dev_dir,
    )

    assets = bootstrap_env_pregen(scope_id, "prod-x", wire_row=wire)
    assert assets["status"] in ("ok", "partial")
    assert assets["entropy"].get("status") == "ok"
    assert assets["product_docs"].get("status") == "ok"
    engineering = assets.get("engineering") or {}
    assert engineering.get("status") in ("ok", "partial")
    layouts = engineering.get("layouts") or []
    assert layouts
    eng_root = Path(layouts[0]["engineering_root"])
    assert (eng_root / "AGENTS.md").read_text(encoding="utf-8") == "# agents"
