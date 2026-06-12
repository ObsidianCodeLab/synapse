"""研发云子单工作流 stageId 缓存与解析辅助。"""

from __future__ import annotations

import json

from synapse.api.routes import dev_iwhalecloud as ic


def test_task_stage_inner_from_response_nested():
    data = {"data": {"data": {"taskFlowStageId": 12537, "stageCode": "DEVELOPING"}}}
    inner = ic._task_stage_inner_from_response(data)
    assert inner["taskFlowStageId"] == 12537
    assert inner["stageCode"] == "DEVELOPING"


def test_is_task_stage_not_exist():
    resp = {
        "message": "任务阶段不存在[开发中-3919]",
        "data": {"error": "'code': 'ZCM-AGILE-TASK-00010'"},
    }
    assert ic._is_task_stage_not_exist(resp) is True
    assert ic._is_task_stage_not_exist({"message": "您没有编辑权限"}) is False


def test_task_flow_stage_cache_roundtrip(tmp_path, monkeypatch):
    cache_file = tmp_path / "iwhalecloud_task_flow_stage_cache.json"
    monkeypatch.setattr(ic, "_task_flow_stage_cache_path", lambda: cache_file)

    assert ic._cache_get_task_flow_stage_id(5266, "DEVELOPING") is None
    ic._cache_put_task_flow_stage_id(5266, "DEVELOPING", 12537)
    ic._cache_put_task_flow_stage_id(5266, "START", 12535)

    assert ic._cache_get_task_flow_stage_id(5266, "DEVELOPING") == 12537
    assert ic._cache_get_task_flow_stage_id(5266, "START") == 12535

    raw = json.loads(cache_file.read_text(encoding="utf-8"))
    assert raw["by_branch_version"]["5266"]["DEVELOPING"] == 12537


def test_task_stage_matches_target_by_code_or_name():
    assert ic._task_stage_matches_target(
        {"stageCode": "DEVELOPING", "stageName": "开发中"},
        "DEVELOPING",
    )
    assert ic._task_stage_matches_target({"stageName": "开发中"}, "DEVELOPING")
    assert not ic._task_stage_matches_target({"stageName": "设计中"}, "DEVELOPING")
