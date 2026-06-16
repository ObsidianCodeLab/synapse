"""代码提交系统节点：按子单提交与试飞轮询。"""

from __future__ import annotations

from datetime import datetime

import pytest

from synapse.rd_meeting.code_commit_assets import (
    _FLIGHT_POLL_MAX_WAIT_SEC,
    _build_commit_message,
    _flight_result_is_fresh,
    _normalize_flight_data,
    _resolve_code_commit_pipeline_steps,
    _resolve_overall_status,
    bootstrap_code_commit,
)
from synapse.rd_meeting.system_node_display import build_code_commit_display, collect_task_rows
from synapse.rd_meeting.task_exec import _extract_commit_summary


def test_build_commit_message_feature_id_first():
    assert _build_commit_message("F-123", "修复计费逻辑") == "F-123 修复计费逻辑"


def test_extract_commit_summary_from_report():
    report = """## 完成状态
completed

## 变更摘要
优化订单查询接口性能

## 修改文件列表
- a.java
"""
    assert _extract_commit_summary(report) == "优化订单查询接口性能"


def test_normalize_flight_data_success():
    resp = {
        "errorcode": 0,
        "message": "success",
        "data": {
            "taskId": 1925706,
            "ciFlowInstBeginDate": "2026-06-11 14:01:48",
            "ciFlowInstEndDate": "2026-06-11 14:19:09",
            "ciFlowInstRunState": "0",
            "ciFlowInstRunStateDesc": "构建成功",
            "buildResult": [],
        },
    }
    out = _normalize_flight_data(resp)
    assert out["status"] == "ok"
    assert out["data"]["taskId"] == 1925706


def test_normalize_flight_data_failed_with_attachments():
    resp = {
        "errorcode": 0,
        "data": {
            "taskId": 1,
            "ciFlowInstRunState": "1",
            "ciFlowInstRunStateDesc": "构建失败",
            "buildResult": [
                {
                    "nodeName": "JAVAPMD代码检查",
                    "attachments": [{"resultType": "JAVAPMD代码检查", "attachmentDesc": "违规详情"}],
                }
            ],
        },
    }
    out = _normalize_flight_data(resp)
    assert out["status"] == "failed"
    assert out["data"]["buildResult"][0]["resultType"] == "JAVAPMD代码检查"
    assert "违规详情" in out["data"]["buildResult"][0]["resultMsg"]


def test_normalize_flight_data_building_pending():
    resp = {
        "errorcode": 0,
        "data": {"taskId": 1, "ciFlowInstRunState": "-1", "ciFlowInstRunStateDesc": "构建中"},
    }
    out = _normalize_flight_data(resp)
    assert out["status"] == "pending"


def test_normalize_flight_data_no_history_as_pending():
    resp = {"errorcode": 502, "message": "获取构建历史失败"}
    out = _normalize_flight_data(resp, treat_no_history_as_pending=True)
    assert out["status"] == "pending"


def test_flight_result_is_fresh_rejects_stale_success():
    commit_at = datetime(2026, 6, 16, 12, 0, 0)
    stale = {
        "status": "ok",
        "data": {
            "ciFlowInstRunState": "0",
            "ciFlowInstBeginDate": "2026-06-16 11:00:00",
        },
    }
    fresh = {
        "status": "ok",
        "data": {
            "ciFlowInstRunState": "0",
            "ciFlowInstBeginDate": "2026-06-16 12:05:00",
        },
    }
    assert _flight_result_is_fresh(stale, commit_at) is False
    assert _flight_result_is_fresh(fresh, commit_at) is True


def test_resolve_overall_status_timeout_is_failed():
    status = _resolve_overall_status(
        commit_errors=[],
        all_commits_ok=True,
        commit_ok=1,
        flight_summary={"status": "timeout", "error": "等待试飞结果超时"},
    )
    assert status == "failed"


def test_flight_poll_max_wait_is_30_minutes():
    assert _FLIGHT_POLL_MAX_WAIT_SEC == 1800


def test_bootstrap_code_commit_per_task(tmp_path, monkeypatch):
    scope_id = "cc-1"
    sandbox = tmp_path / "sandbox" / "proj"
    sandbox.mkdir(parents=True)

    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")

    auto_ctx = {
        "split_plan_tasks": [
            {
                "taskNo": "T-plan",
                "taskTitle": "子单A",
                "productModuleName": "ZMDB",
                "comments": "改造摘要来自拆单",
            }
        ],
        "create_task_results": [
            {
                "status": "ok",
                "task_no": "11923497",
                "work_item": {
                    "task_no": "11923497",
                    "feature_id": "11923497",
                    "portal_task_id": 1925706,
                },
            }
        ],
    }

    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._auto_split_context_for_bindings",
        lambda _sid: auto_ctx,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets.load_task_exec_payload",
        lambda _sid: {
            "tasks": [
                {
                    "task_no": "11923497",
                    "sandbox_path": str(sandbox),
                    "commit_summary": "实现计费模块改造",
                }
            ]
        },
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._commit_task_or_skip",
        lambda **kwargs: {
            "status": "ok",
            "commit_hash": "abc123",
            "local_path": kwargs["local_path"],
            "error": "",
            "commit_skipped": False,
            "commit_finished_at": datetime.now().isoformat(timespec="seconds"),
        },
    )
    def _mock_wait(portal_task_id, *, on_poll=None, not_before=None):
        result = {
            "status": "failed",
            "error": "构建失败",
            "data": {
                "taskId": portal_task_id,
                "ciFlowInstRunState": "1",
                "ciFlowInstRunStateDesc": "构建失败",
                "buildResult": [{"resultType": "CheckStyle", "resultMsg": "格式错误"}],
            },
        }
        if on_poll:
            on_poll(result)
        return result

    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._wait_for_flight_result",
        _mock_wait,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._persist_code_commit_state",
        lambda *args, **kwargs: None,
    )

    assets = bootstrap_code_commit(scope_id, scope_type="demand", stage_name="开发中")
    assert len(assets["tasks"]) == 1
    task = assets["tasks"][0]
    assert task["commit_message"] == "11923497 实现计费模块改造"
    assert task["status"] == "ok"
    assert task["flight"]["status"] == "failed"
    assert task["flight"]["data"]["buildResult"][0]["resultType"] == "CheckStyle"
    assert assets["status"] == "partial"

    display = build_code_commit_display(assets)
    assert display["tasks"][0]["flight_data"]["ciFlowInstRunState"] == "1"
    assert display["progress"]["phase"] == "done"
    assert display["progress"]["steps"]["commit"] == "ok"
    assert display["progress"]["steps"]["flight"] == "failed"
    assert any(a.get("name") == "试飞结果.md" for a in display.get("archives") or [])


def test_resolve_code_commit_pipeline_steps_three_phase_flow():
    running_commit = {
        "status": "running",
        "progress": {"phase": "commit"},
        "tasks": [{"status": "pending"}],
        "summary": {"total": 1, "commit_ok": 0, "commit_failed": 0},
        "flight": {"status": "pending"},
    }
    assert _resolve_code_commit_pipeline_steps(running_commit) == {
        "commit": "active",
        "compile": "pending",
        "flight": "pending",
    }

    polling = {
        "status": "running",
        "progress": {"phase": "flight_poll"},
        "tasks": [
            {
                "status": "ok",
                "flight": {
                    "status": "pending",
                    "data": {"pipelineSteps": {"compile": "ok", "flight": "active"}},
                },
            }
        ],
        "summary": {"total": 1, "commit_ok": 1, "commit_failed": 0},
        "flight": {"status": "pending"},
    }
    steps = _resolve_code_commit_pipeline_steps(polling)
    assert steps["commit"] == "ok"
    assert steps["compile"] == "ok"
    assert steps["flight"] == "active"


def test_collect_task_rows_includes_portal_task_id():
    rows = collect_task_rows(
        {
            "split_plan_tasks": [{"taskNo": "P1", "taskTitle": "A", "productModuleName": "M"}],
            "create_task_results": [
                {
                    "status": "ok",
                    "task_no": "C1",
                    "work_item": {"task_no": "C1", "portal_task_id": 9001, "feature_id": "C1"},
                }
            ],
        }
    )
    assert rows[0]["portal_task_id"] == 9001


def test_bootstrap_skips_commit_when_sandbox_clean(tmp_path, monkeypatch):
    scope_id = "cc-reprocess"
    sandbox = tmp_path / "sandbox" / "proj"
    sandbox.mkdir(parents=True)

    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    auto_ctx = {
        "split_plan_tasks": [{"taskNo": "T-plan", "taskTitle": "子单A", "productModuleName": "ZMDB"}],
        "create_task_results": [
            {
                "status": "ok",
                "task_no": "11923497",
                "work_item": {
                    "task_no": "11923497",
                    "feature_id": "11923497",
                    "portal_task_id": 1925706,
                },
            }
        ],
    }
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._auto_split_context_for_bindings",
        lambda _sid: auto_ctx,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets.load_task_exec_payload",
        lambda _sid: {
            "tasks": [
                {
                    "task_no": "11923497",
                    "sandbox_path": str(sandbox),
                    "commit_summary": "已完成改造",
                }
            ]
        },
    )

    commit_called = {"n": 0}

    def _fake_commit_and_push(**kwargs):
        commit_called["n"] += 1
        return {"status": "ok", "commit_hash": "deadbeef", "local_path": kwargs["local_path"], "error": ""}

    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._commit_and_push",
        _fake_commit_and_push,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._sandbox_commit_pending",
        lambda _path: (True, "", []),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._git_toplevel",
        lambda path: str(path),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._run_git",
        lambda args, timeout=30.0: (True, "deadbeef"),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._wait_for_flight_result",
        lambda portal_task_id, **kwargs: {
            "status": "ok",
            "error": "",
            "data": {"taskId": portal_task_id, "ciFlowInstRunState": "0"},
        },
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._persist_code_commit_state",
        lambda *args, **kwargs: None,
    )

    assets = bootstrap_code_commit(scope_id, scope_type="demand", stage_name="开发中")
    assert commit_called["n"] == 0
    assert assets["tasks"][0]["commit_skipped"] is True
    assert assets["tasks"][0]["status"] == "ok"
    assert assets["status"] == "ok"
