"""门户下架且 SOP 已进入任务执行阶段时的工单丢失处理。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.owner_order_refresh import should_keep_orphan_demand
from synapse.rd_meeting.work_order_lost import (
    LOST_LOCAL_STATE,
    apply_work_order_lost,
    is_demand_sop_at_or_after_task_exec,
    should_mark_orphan_demand_lost,
)
from synapse.rd_sop.nodes import is_at_or_after_node_id


def test_is_at_or_after_task_exec():
    assert is_at_or_after_node_id("task_exec", "task_exec") is True
    assert is_at_or_after_node_id("exception_check", "task_exec") is True
    assert is_at_or_after_node_id("leader_review", "task_exec") is True
    assert is_at_or_after_node_id("sandbox_build", "task_exec") is False
    assert is_at_or_after_node_id("pending", "task_exec") is False


def test_should_mark_orphan_demand_lost_by_sop_node_name():
    demand = {
        "demand_no": "D1",
        "local_process_state": "处理中",
        "sop_node": "任务执行",
    }
    assert should_mark_orphan_demand_lost(demand) is True
    assert should_keep_orphan_demand({"local_process_state": LOST_LOCAL_STATE}) is True


def test_should_not_mark_completed_or_before_task_exec():
    assert should_mark_orphan_demand_lost({"local_process_state": "已完成", "sop_node": "任务执行"}) is False
    assert should_mark_orphan_demand_lost({"local_process_state": "处理中", "sop_node": "自动拆单"}) is False


def test_merge_owner_order_marks_lost_instead_of_cleanup():
    from synapse.api.routes.dev_iwhalecloud import _merge_owner_order_lists

    old = [
        {
            "demand_no": "D-lost",
            "local_process_state": "处理中",
            "sop_node": "任务执行",
            "demand_title": "丢失单",
        },
        {
            "demand_no": "D-remove",
            "local_process_state": "处理中",
            "sop_node": "需求澄清",
            "demand_title": "删除单",
        },
    ]
    merged, cleanup, marked_lost = _merge_owner_order_lists(old, [])
    by_dn = {x["demand_no"]: x for x in merged}
    assert by_dn["D-lost"]["local_process_state"] == LOST_LOCAL_STATE
    assert "D-remove" not in by_dn
    assert cleanup == ["D-remove"]
    assert marked_lost == ["D-lost"]


def test_apply_work_order_lost_updates_dev_status(monkeypatch, tmp_path):
    dn = "D888"
    work = tmp_path / "work" / dn
    work.mkdir(parents=True)
    (work / "dev.status").write_text(
        json.dumps(
            {
                "scope": {"type": "demand", "id": dn},
                "local_process_state": "处理中",
                "current_node_id": "task_exec",
                "meeting_room": {"active": True, "room_id": f"mr_d_{dn}_s4"},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    stopped: list[str] = []

    monkeypatch.setattr("synapse.rd_meeting.dev_status.dev_status_path", lambda sid: tmp_path / "work" / sid / "dev.status")
    monkeypatch.setattr(
        "synapse.rd_meeting.dev_status.dev_status_lock_path",
        lambda sid: tmp_path / "work" / sid / "dev.status.lock",
    )
    monkeypatch.setattr("synapse.rd_meeting.work_order_lost.cancel_room_run", lambda _rid: True)
    monkeypatch.setattr(
        "synapse.rd_meeting.work_order_lost.mark_room_stopped",
        lambda sid, **kwargs: stopped.append(sid) or {},
    )

    apply_work_order_lost(dn)

    data = json.loads((work / "dev.status").read_text(encoding="utf-8"))
    assert data["local_process_state"] == LOST_LOCAL_STATE
    assert data["pipeline_enabled"] is False
    assert stopped == [dn]


def test_assert_scope_operable_blocks_lost(monkeypatch, tmp_path):
    from synapse.rd_meeting.work_order_lost import assert_scope_operable

    dn = "D777"
    work = tmp_path / "work" / dn
    work.mkdir(parents=True)
    (work / "dev.status").write_text(
        json.dumps({"local_process_state": LOST_LOCAL_STATE}, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr("synapse.rd_meeting.work_order_lost.load_dev_status", lambda sid: {"local_process_state": LOST_LOCAL_STATE})
    with pytest.raises(ValueError, match="work_order_lost"):
        assert_scope_operable(dn)
