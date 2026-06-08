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
