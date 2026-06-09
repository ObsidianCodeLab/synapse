"""任务执行节点：CLI 工具、提示词、持久化与人工评审门控。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.binding import resolve_node_binding
from synapse.rd_meeting.cli_tools import DEFAULT_CLI_TOOL, is_cli_tool_implemented, normalize_cli_tool
from synapse.rd_meeting.orchestrator import MeetingRoomOrchestrator
from synapse.rd_meeting.pipeline import FLOW_STEP_LABEL, STEP_TASK_EXEC_CLI
from synapse.rd_meeting.task_exec import (
    NODE_ID,
    bootstrap_task_exec,
    build_task_develop_prompt,
    build_task_verify_prompt,
    load_task_exec_payload,
    render_task_exec_report_markdown,
    uses_task_exec_cli,
)


def test_cli_tool_defaults():
    assert normalize_cli_tool(None) == DEFAULT_CLI_TOOL
    assert normalize_cli_tool("bogus") == DEFAULT_CLI_TOOL
    assert is_cli_tool_implemented("cursor_cli") is True
    assert is_cli_tool_implemented("claude_code") is False


def test_task_exec_binding_exposes_cli_tool(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.binding.load_meeting_room_config",
        lambda: {"node_overrides": {"task_exec": {"cli_tool": "cursor_cli"}}},
    )
    binding = resolve_node_binding("task_exec")
    assert binding["cli_tool"] == "cursor_cli"
    assert binding["worker_profile_ids"] == []


def test_build_task_prompts_cover_goal_scheme_and_human_notes():
    order = {
        "task_no": "T-100",
        "task_title": "子单标题",
        "goal": "完成登录模块改造",
        "coverage": ["登录校验", "会话续期"],
    }
    dev = build_task_develop_prompt(
        order=order,
        func_doc="/sandbox/synapse_archive/需求设计/func_solution/函数级方案.md",
        accept_doc="/sandbox/synapse_archive/需求分析/acceptance/验收标准.md",
        human_suggestions="优先覆盖边界用例",
    )
    assert "任务目标：完成登录模块改造" in dev
    assert "功能覆盖范围：登录校验、会话续期" in dev
    assert "函数级方案文档" in dev
    assert "人工建议与补充：优先覆盖边界用例" in dev

    verify = build_task_verify_prompt(
        order=order,
        func_doc="/sandbox/synapse_archive/需求设计/func_solution/函数级方案.md",
        human_suggestions="优先覆盖边界用例",
        develop_log_hint="/logs/develop.log",
    )
    assert "完成检测轮" in verify
    assert "任务报告" in verify
    assert "完成状态（completed / partial / failed）" in verify


def test_uses_task_exec_cli_only_for_task_exec_node():
    assert uses_task_exec_cli(NODE_ID) is True
    assert uses_task_exec_cli("sandbox_build") is False


def test_bootstrap_task_exec_fails_without_work_orders(tmp_path, monkeypatch):
    scope_id = "te-empty"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    result = bootstrap_task_exec("demand", scope_id)
    assert result["status"] == "failed"
    assert "未找到可执行的研发子单" in result["error"]


def test_bootstrap_task_exec_runs_develop_and_verify_rounds(tmp_path, monkeypatch):
    scope_id = "te-run"
    sandbox = tmp_path / "sandbox" / "proj"
    sandbox.mkdir(parents=True)
    (sandbox / "synapse_archive" / "需求设计" / "func_solution").mkdir(parents=True)
    (sandbox / "synapse_archive" / "需求设计" / "func_solution" / "函数级方案.md").write_text(
        "# 方案", encoding="utf-8"
    )

    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    monkeypatch.setattr(
        "synapse.rd_meeting.task_exec._collect_work_orders",
        lambda _sid: [
            {
                "task_no": "T1",
                "task_title": "子单",
                "goal": "实现功能点",
                "coverage": ["功能A"],
                "sandbox_path": str(sandbox),
                "product_module": "ZMDB",
            }
        ],
    )
    monkeypatch.setattr("synapse.rd_meeting.task_exec._resolve_demand_no", lambda _st, _sid: "D1")
    monkeypatch.setattr("synapse.rd_meeting.task_exec.patch_owned_work_item_task_exec", lambda *a, **k: True)
    monkeypatch.setattr("synapse.rd_meeting.task_exec.patch_userwork_summary", lambda **k: None)

    rounds: list[str] = []

    def fake_cli_round(**kwargs):
        target = str(kwargs.get("target") or "")
        if "【任务执行 · 开发轮】" in target:
            rounds.append("develop")
        elif "【任务执行 · 完成检测轮】" in target:
            rounds.append("verify")
        log_path = kwargs["log_path"]
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(
            "SYNAPSE_CURSOR_SUCCESS=1\n[cursor-output] ## 完成状态\ncompleted\n",
            encoding="utf-8",
        )
        return {
            "status": "ok",
            "tokens_used": 120,
            "duration_seconds": 8,
            "log_path": str(log_path),
            "error": "",
        }

    monkeypatch.setattr("synapse.rd_meeting.task_exec._run_cursor_cli_round", fake_cli_round)

    result = bootstrap_task_exec("demand", scope_id, human_suggestions="注意回归")
    assert rounds == ["develop", "verify"]
    assert result["cli_tool"] == "cursor_cli"
    assert len(result["tasks"]) == 1
    assert result["tasks"][0]["status"] == "ok"
    assert result["tasks"][0]["sandbox_path"] == str(sandbox)
    assert result["summary"]["total_tokens"] == 240

    payload = load_task_exec_payload(scope_id)
    assert payload is not None
    assert payload["human_review"]["status"] == "pending"
    md = render_task_exec_report_markdown(payload)
    assert "任务执行记录" in md
    assert "T1" in md


def test_confirm_task_exec_decision_reject(tmp_path, monkeypatch):
    scope_id = "te-gate-reject"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    from synapse.rd_meeting.paths import archive_node_dir
    from synapse.rd_meeting.room_runtime import save_room_state
    from synapse.rd_sop.nodes import stage_name_for_id

    dest = archive_node_dir(scope_id, stage_name_for_id(4), NODE_ID)
    dest.mkdir(parents=True)
    result_doc = {
        "status": "partial",
        "cli_tool": "cursor_cli",
        "summary": {"total_tokens": 10, "total_duration_sec": 1},
        "tasks": [],
        "human_review": {"status": "pending", "comment": "", "decided_at": None},
    }
    (dest / "task_exec_result.json").write_text(json.dumps(result_doc, ensure_ascii=False), encoding="utf-8")

    save_room_state(
        scope_id,
        {
            "room_id": "room-te",
            "current_node_id": NODE_ID,
            "status": "human_intervention",
            "pending_delivery": {
                "node_id": NODE_ID,
                "tokens_used": 10,
                "duration_seconds": 1,
                "stage_id": 4,
            },
        },
    )

    orch = MeetingRoomOrchestrator()
    out = orch.confirm_task_exec_decision(
        scope_type="demand",
        scope_id=scope_id,
        room_id="room-te",
        decision="reject",
        comment="需补测",
    )
    assert out["status"] == "blocked"
    from synapse.rd_meeting.room_runtime import load_room_state

    rs = load_room_state(scope_id) or {}
    assert rs.get("task_exec_blocked") is True


def test_pipeline_registers_task_exec_cli_step():
    assert STEP_TASK_EXEC_CLI in FLOW_STEP_LABEL
    assert "CLI" in FLOW_STEP_LABEL[STEP_TASK_EXEC_CLI]


@pytest.mark.asyncio
async def test_run_current_node_rejects_task_exec(monkeypatch, tmp_path):
    scope_id = "te-orch"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.load_dev_status",
        lambda _sid: {"stage_id": 4, "meeting_room": {"room_id": "r1"}},
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.MeetingRoomOrchestrator.advance_past_disabled_nodes",
        lambda self, **kwargs: {
            "status": "processing",
            "current_node_id": NODE_ID,
            "skipped_nodes": [],
        },
    )

    orch = MeetingRoomOrchestrator()
    with pytest.raises(ValueError, match="task_exec_use_pipeline"):
        await orch.run_current_node(scope_type="demand", scope_id=scope_id, room_id="r1")
