"""create_task / repair_task_impact 影响评估辅助逻辑。"""

from __future__ import annotations

from synapse.api.routes import dev_iwhalecloud as ic


def test_impact_ids_from_rows_skips_invalid():
    rows = [{"taskImpactId": 101}, {"taskImpactId": None}, {"taskImpactId": "bad"}, {"taskImpactId": 102}]
    assert ic._impact_ids_from_rows(rows) == [101, 102]


def test_build_task_impact_confirm_payload_one_per_id():
    payload = ic._build_task_impact_confirm_payload(9001, 42, "自测说明", [101, 102])
    assert len(payload) == 2
    assert payload[0]["taskId"] == 9001
    assert payload[0]["taskImpactId"] == "101"
    assert payload[0]["confirmUserId"] == 42
    assert payload[0]["selfTestDesc"] == "自测说明"
    assert payload[1]["taskImpactId"] == "102"


def test_envelope_data_list():
    assert ic._envelope_data_list({"errorcode": 0, "data": [{"a": 1}]}) == [{"a": 1}]
    assert ic._envelope_data_list({"errorcode": 502, "data": [{"a": 1}]}) == []
    assert ic._envelope_data_list({"errorcode": 0, "data": "x"}) == []


def _sample_project_fields_response() -> dict:
    def row(field_id: int, field_name: str) -> dict:
        return {
            "projectFieldDto": {
                "adProjectField": {"projectFieldId": field_id, "projectId": 562161},
                "customFieldDto": {"adCustomField": {"fieldName": field_name}},
                "adProjectFieldGroup": {"groupName": "影响评估"},
            },
            "adTaskField": None,
        }

    return {
        "data": [
            row(20090, "性能影响"),
            row(20091, "功能影响"),
            row(20092, "配置变更说明"),
            row(20093, "升级风险"),
            row(20094, "安全影响"),
            row(20415, "兼容性影响"),
        ]
    }


def test_flatten_project_fields_response():
    rows = ic._flatten_project_fields_response(_sample_project_fields_response())
    assert len(rows) == 6
    assert rows[0]["projectFieldId"] == 20090
    assert rows[0]["fieldName"] == "性能影响"
    assert rows[0]["groupName"] == "影响评估"


def test_impact_evaluation_field_ids_from_rows_by_name():
    rows = ic._flatten_project_fields_response(_sample_project_fields_response())
    field_ids = ic._impact_evaluation_field_ids_from_rows(rows)
    assert field_ids == {
        "performanceImpact": 20090,
        "functionalImpact": 20091,
        "cfgChangeDescription": 20092,
        "upgradeRisk": 20093,
        "securityImpact": 20094,
        "compatibilityImpact": 20415,
    }


def test_build_update_task_impact_evaluation_payload_uses_resolved_ids():
    body = ic.UpdateTaskImpactEvaluationRequest(
        taskId=1928032,
        userId=3190,
        performanceImpact="性能说明",
        functionalImpact="功能说明",
        cfgChangeDescription="无",
        upgradeRisk="低",
        securityImpact="无",
        compatibilityImpact="兼容",
    )
    field_ids = {
        "performanceImpact": 20090,
        "functionalImpact": 20091,
        "cfgChangeDescription": 20092,
        "upgradeRisk": 20093,
        "securityImpact": 20094,
        "compatibilityImpact": 20415,
    }
    payload = ic._build_update_task_impact_evaluation_payload(body, field_ids)
    assert [item["projectFieldId"] for item in payload] == [20090, 20091, 20092, 20093, 20094, 20415]
    assert payload[0]["fieldValue"] == "性能说明"
    assert all(item["userId"] == 3190 for item in payload)
