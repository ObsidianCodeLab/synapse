"""Phase 0：work/<scope>/dev.status 与会议室列表扫描。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.dev_status import default_dev_status, should_list_in_meeting_rooms
from synapse.rd_meeting.paths import iter_work_order_directories
from synapse.rd_meeting.service import MeetingRoomService


@pytest.fixture
def synapse_work_home(monkeypatch: pytest.MonkeyPatch, tmp_path):
    work = tmp_path / "work"
    work.mkdir()

    def _work_root():
        return work

    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", _work_root)
    return work


def test_should_list_processing(synapse_work_home):
    data = default_dev_status(scope_type="demand", scope_id="21878317", local_process_state="处理中")
    assert should_list_in_meeting_rooms(data) is True
    data["local_process_state"] = "待处理"
    data["pipeline_enabled"] = False
    data["meeting_room"] = {"active": False}
    assert should_list_in_meeting_rooms(data) is False


def test_should_list_excludes_archived(synapse_work_home):
    data = default_dev_status(scope_type="demand", scope_id="21878318", local_process_state="archived")
    data["pipeline_enabled"] = True
    data["meeting_room"] = {"active": True}
    assert should_list_in_meeting_rooms(data) is False


def test_scan_skips_userwork_file(synapse_work_home):
    (synapse_work_home / "userwork.json").write_text("{}", encoding="utf-8")
    d1 = synapse_work_home / "21878317"
    d1.mkdir()
    (d1 / "dev.status").write_text(
        json.dumps(
            default_dev_status(
                scope_type="demand",
                scope_id="21878317",
                local_process_state="处理中",
                stage_id=1,
                current_node_id="module_func",
                pipeline_enabled=True,
            ),
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    names = [p.name for p in iter_work_order_directories()]
    assert names == ["21878317"]
    assert "userwork.json" not in names


def test_list_meeting_rooms_skips_scope_dir_mismatch(synapse_work_home):
    """目录名与 dev.status.scope.id 不一致时不得出现在会议室列表（避免 room_id 撞车）。"""
    stale = synapse_work_home / "21881453"
    stale.mkdir()
    stale_payload = default_dev_status(
        scope_type="demand",
        scope_id="21881454",
        local_process_state="处理中",
        stage_id=3,
        current_node_id="auto_split",
        pipeline_enabled=True,
    )
    stale_payload["meeting_room"] = {"active": True, "room_id": "mr_d_21881454_s1"}
    (stale / "dev.status").write_text(json.dumps(stale_payload, ensure_ascii=False), encoding="utf-8")

    current = synapse_work_home / "21881454"
    current.mkdir()
    current_payload = default_dev_status(
        scope_type="demand",
        scope_id="21881454",
        local_process_state="处理中",
        stage_id=1,
        current_node_id="req_clarify",
        pipeline_enabled=True,
    )
    current_payload["meeting_room"] = {"active": True, "room_id": "mr_d_21881454_s1"}
    (current / "dev.status").write_text(json.dumps(current_payload, ensure_ascii=False), encoding="utf-8")

    items = MeetingRoomService().list_meeting_rooms()
    assert len(items) == 1
    assert items[0]["scope_id"] == "21881454"
    detail = MeetingRoomService().get_room_detail("mr_d_21881454_s1")
    assert detail is not None
    assert detail["scope_id"] == "21881454"
    assert detail["current_node_id"] == "req_clarify"


def test_list_meeting_rooms(synapse_work_home):
    d1 = synapse_work_home / "11879580"
    d1.mkdir()
    payload = default_dev_status(
        scope_type="task",
        scope_id="11879580",
        local_process_state="处理中",
        stage_id=4,
        current_node_id="diff_analysis",
        pipeline_enabled=True,
    )
    payload["meeting_room"] = {"active": True, "room_id": "mr_t_11879580_s4"}
    (d1 / "dev.status").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    items = MeetingRoomService().list_meeting_rooms()
    assert len(items) == 1
    assert items[0]["scope_id"] == "11879580"
    assert items[0]["room_id"] == "mr_t_11879580_s4"
    assert items[0]["current_node_id"] == "diff_analysis"
