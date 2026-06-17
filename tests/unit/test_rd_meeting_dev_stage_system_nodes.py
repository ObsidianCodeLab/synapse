"""开发阶段系统节点：代码提交 / 任务检查。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.task_check_assets import bootstrap_task_check
from synapse.rd_sop.manifest import NODE_INTENTS, NODE_TYPES
from synapse.rd_sop.nodes import node_display_name


def test_dev_stage_sop_metadata():
    assert node_display_name("exception_check") == "代码提交"
    assert node_display_name("task_feedback") == "试飞方案"
    assert node_display_name("diff_analysis") == "试飞优化"
    assert node_display_name("env_start") == "任务检查"
    assert node_display_name("unit_test") == "测试案例"
    assert NODE_TYPES["task_exec"] == "ai_human"
    assert NODE_TYPES["exception_check"] == "system"
    assert NODE_TYPES["task_feedback"] == "ai"
    assert NODE_TYPES["diff_analysis"] == "ai_human"
    assert NODE_TYPES["unit_test"] == "ai_human"
    assert "函数级方案" in NODE_INTENTS["task_exec"]
    assert "试飞" in NODE_INTENTS["exception_check"]
    assert "三次" in NODE_INTENTS["env_start"]


def test_task_check_feature_incomplete_redirects_to_task_exec(tmp_path, monkeypatch):
    scope_id = "T-check-1"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path
    from synapse.rd_sop.nodes import stage_name_for_id

    stage = stage_name_for_id(4)
    design_stage = stage_name_for_id(2)
    exec_dir = archive_node_dir(scope_id, stage, "task_exec")
    exec_dir.mkdir(parents=True)
    (exec_dir / "任务执行记录.md").write_text("功能未完成，待开发", encoding="utf-8")
    func_dir = archive_node_dir(scope_id, design_stage, "func_solution")
    func_dir.mkdir(parents=True)
    (func_dir / "函数级方案.md").write_text("- 功能点A\n- 功能点B", encoding="utf-8")

    pipe_path = meeting_pipeline_path(scope_id)
    pipe_path.write_text(json.dumps({"context": {}}, ensure_ascii=False), encoding="utf-8")

    assets = bootstrap_task_check(scope_id)
    assert assets["outcome"] == "feature_incomplete"
    assert assets["redirect_to_node"] == "task_exec"
    assert assets["status"] == "failed"


def test_task_check_flight_fail_redirects_to_task_feedback(tmp_path, monkeypatch):
    scope_id = "T-check-2"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path
    from synapse.rd_sop.nodes import stage_name_for_id

    stage = stage_name_for_id(4)
    exec_dir = archive_node_dir(scope_id, stage, "task_exec")
    exec_dir.mkdir(parents=True)
    (exec_dir / "任务执行记录.md").write_text("功能点已完成开发", encoding="utf-8")
    opt_dir = archive_node_dir(scope_id, stage, "diff_analysis")
    opt_dir.mkdir(parents=True)
    (opt_dir / "试飞优化执行记录.md").write_text("已按方案完成修改", encoding="utf-8")

    pipe_path = meeting_pipeline_path(scope_id)
    pipe_path.write_text(
        json.dumps(
            {
                "context": {
                    "code_commit_assets": {
                        "status": "partial",
                        "tasks": [
                            {
                                "task_no": "T1",
                                "flight": {
                                    "status": "failed",
                                    "error": "编译失败",
                                    "data": {
                                        "ciFlowInstRunState": "1",
                                        "ciFlowInstRunStateDesc": "构建失败",
                                    },
                                },
                            }
                        ],
                        "flight": {"status": "failed", "error": "编译失败"},
                    }
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    assets = bootstrap_task_check(scope_id)
    assert assets["outcome"] == "flight_fail"
    assert assets["redirect_to_node"] == "task_feedback"
    assert assets["fail_count"] == 1

    commit_archive = archive_node_dir(scope_id, stage, "exception_check") / "试飞结果.md"
    assert commit_archive.is_file()
    assert "编译失败" in commit_archive.read_text(encoding="utf-8")


def test_downstream_advance_not_blocked_for_dev_cli_nodes():
    from synapse.rd_sop.manifest import downstream_advance_block_reason, next_node_id

    assert not downstream_advance_block_reason("task_feedback")
    assert not downstream_advance_block_reason("diff_analysis")
    assert next_node_id("task_feedback") == "diff_analysis"
    assert next_node_id("diff_analysis") == "env_start"


def test_on_node_complete_clears_stale_downstream_block_on_advance(monkeypatch):
    """manifest 门控迁移后，旧 downstream_blocked 不应阻止推进 diff_analysis。"""
    from synapse.rd_meeting.dev_status import load_dev_status, save_dev_status
    from synapse.rd_meeting.orchestrator import MeetingRoomOrchestrator
    from synapse.rd_meeting.room_runtime import default_room_state, load_room_state, save_room_state

    scope_id = "stale-gate-task_feedback"
    save_dev_status(
        scope_id,
        {
            "scope_type": "demand",
            "scope_id": scope_id,
            "stage_id": 4,
            "current_node_id": "task_feedback",
            "local_process_state": "待人工",
        },
    )
    save_room_state(
        scope_id,
        {
            **default_room_state(
                room_id="room-stale",
                scope_type="demand",
                scope_id=scope_id,
                stage_id=4,
                current_node_id="task_feedback",
                status="human_intervention",
            ),
            "downstream_blocked": True,
            "downstream_block_reason": "试飞优化方案待人工评估，评估通过后再继续执行试飞优化。",
            "intervention_kind": "result_confirm",
            "pending_delivery": {
                "node_id": "task_feedback",
                "await_confirm": True,
            },
        },
    )

    monkeypatch.setattr("synapse.rd_meeting.orchestrator.set_phase", lambda *_a, **_k: None)
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.schedule_human_intervention_notify",
        lambda **_k: None,
    )

    orch = MeetingRoomOrchestrator()
    out = orch.on_node_complete(
        scope_type="demand",
        scope_id=scope_id,
        room_id="room-stale",
        node_id="task_feedback",
        advance=True,
        schedule_pipeline_advance=False,
        sync_userwork=False,
    )

    assert out["next_node_id"] == "diff_analysis"
    dev = load_dev_status(scope_id) or {}
    assert dev.get("current_node_id") == "diff_analysis"
    assert dev.get("local_process_state") == "处理中"
    rs = load_room_state(scope_id) or {}
    assert rs.get("downstream_blocked") is not True
    assert "downstream_block_reason" not in rs
    assert "pending_delivery" not in rs
