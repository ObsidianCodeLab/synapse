"""工单处理初始化：停跑、删 work、转需求评审、回写 userwork。"""

from __future__ import annotations

from pathlib import Path

import pytest

from synapse.rd_meeting.demand_init_reset import (
    deactivate_meeting_listing,
    resolve_demand_scope_id,
    reset_demand_work_to_audit,
)


def test_resolve_demand_scope_id_from_room_id_pattern():
    assert resolve_demand_scope_id(room_id="mr_d_21881451_s2") == "21881451"
    assert resolve_demand_scope_id(room_id="", scope_id="999") == "999"


def test_deactivate_meeting_listing(monkeypatch: pytest.MonkeyPatch):
    scope_id = "D-deact"
    saved: list[dict] = []

    monkeypatch.setattr(
        "synapse.rd_meeting.demand_init_reset.load_dev_status",
        lambda _sid: {
            "local_process_state": "处理中",
            "pipeline_enabled": True,
            "meeting_room": {"active": True, "room_id": "mr_d_D-deact_s1"},
        },
    )

    def _save(_sid, payload):
        saved.append(payload)
        return payload

    monkeypatch.setattr("synapse.rd_meeting.demand_init_reset.save_dev_status", _save)

    assert deactivate_meeting_listing(scope_id) is True
    assert saved[0]["local_process_state"] == "待处理"
    assert saved[0]["pipeline_enabled"] is False
    assert saved[0]["meeting_room"]["active"] is False


@pytest.mark.asyncio
async def test_reset_demand_work_to_audit_happy_path(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    work_root = tmp_path / "work"
    scope_id = "D-reset"
    scope_dir = work_root / scope_id
    scope_dir.mkdir(parents=True)
    (scope_dir / "dev.status").write_text("{}", encoding="utf-8")

    monkeypatch.setattr("synapse.rd_meeting.demand_init_reset.scope_dir", lambda sid: work_root / sid)

    cancelled: list[str] = []

    def _cancel(room_id: str) -> bool:
        cancelled.append(room_id)
        return True

    monkeypatch.setattr("synapse.rd_meeting.demand_init_reset.cancel_room_run", _cancel)
    monkeypatch.setattr(
        "synapse.rd_meeting.demand_init_reset.deactivate_meeting_listing",
        lambda _sid: True,
    )

    async def _transfer(_body):
        return {"errorcode": 0, "message": "success", "data": {"ok": True}}

    monkeypatch.setattr(
        "synapse.rd_meeting.demand_init_reset.transfer_demand_to_audit",
        _transfer,
    )

    patched: dict[str, str] = {}

    def _patch(**kwargs):
        patched.update(kwargs)
        return {
            "demand_status": kwargs.get("demand_status", ""),
            "sop_node": kwargs.get("sop_node", ""),
            "local_process_state": kwargs.get("local_process_state", ""),
        }

    monkeypatch.setattr("synapse.rd_meeting.demand_init_reset.patch_userwork_summary", _patch)

    out = await reset_demand_work_to_audit(scope_id, room_id="mr_d_D-reset_s1")

    assert cancelled == ["mr_d_D-reset_s1"]
    assert not scope_dir.exists()
    assert out["work_dir_removed"] is True
    assert patched["demand_status"] == "需求评审"
    assert patched["sop_node"] == "等待调度"
    assert patched["local_process_state"] == "待处理"


@pytest.mark.asyncio
async def test_reset_demand_work_to_audit_transfer_failure(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    work_root = tmp_path / "work"
    scope_id = "D-fail"
    scope_dir = work_root / scope_id
    scope_dir.mkdir(parents=True)

    monkeypatch.setattr("synapse.rd_meeting.demand_init_reset.scope_dir", lambda sid: work_root / sid)
    monkeypatch.setattr("synapse.rd_meeting.demand_init_reset.cancel_room_run", lambda _rid: False)

    async def _transfer(_body):
        return {"errorcode": 502, "message": "portal rejected"}

    monkeypatch.setattr(
        "synapse.rd_meeting.demand_init_reset.transfer_demand_to_audit",
        _transfer,
    )

    with pytest.raises(ValueError, match="portal rejected"):
        await reset_demand_work_to_audit(scope_id, room_id="mr_d_D-fail_s3")
