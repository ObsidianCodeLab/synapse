"""代码提交系统节点：按子单提交与试飞轮询。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.code_commit_assets import (
    _build_commit_message,
    _normalize_flight_data,
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
        "synapse.rd_meeting.code_commit_assets._commit_and_push",
        lambda **kwargs: {
            "status": "ok",
            "commit_hash": "abc123",
            "local_path": kwargs["local_path"],
            "error": "",
        },
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.code_commit_assets._wait_for_flight_result",
        lambda portal_task_id: {
            "status": "failed",
            "error": "构建失败",
            "data": {
                "taskId": portal_task_id,
                "ciFlowInstRunState": "1",
                "ciFlowInstRunStateDesc": "构建失败",
                "buildResult": [{"resultType": "CheckStyle", "resultMsg": "格式错误"}],
            },
        },
    )

    assets = bootstrap_code_commit(scope_id, scope_type="demand")
    assert len(assets["tasks"]) == 1
    task = assets["tasks"][0]
    assert task["commit_message"] == "11923497 实现计费模块改造"
    assert task["status"] == "ok"
    assert task["flight"]["status"] == "failed"
    assert task["flight"]["data"]["buildResult"][0]["resultType"] == "CheckStyle"
    assert assets["status"] == "partial"

    display = build_code_commit_display(assets)
    assert display["tasks"][0]["flight_data"]["ciFlowInstRunState"] == "1"


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
