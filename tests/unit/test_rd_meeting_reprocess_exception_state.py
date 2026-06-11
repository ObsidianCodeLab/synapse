"""重新处理应即时清除异常门控残留，避免节点仍显示异常态。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.service import MeetingRoomService


def test_reprocess_current_node_clears_exception_gate_state(monkeypatch):
    scope = "reproc-exc-scope"
    room_id = "mr_d_reproc_exc"
    node_id = "req_clarify"

    store: dict[str, dict] = {
        scope: {
            "status": "human_intervention",
            "current_node_id": node_id,
            "intervention_kind": "exception",
            "hitl_form_schema": {"title": "异常"},
            "pending_delivery": {"report_body": "fail", "node_id": node_id},
        }
    }
    dev = {
        "scope": {"type": "demand", "id": scope},
        "current_node_id": node_id,
        "stage_id": 1,
        "local_process_state": "待人工",
        "meeting_room": {"room_id": room_id, "active": True},
    }

    def _load_rs(sid: str):
        return dict(store.get(sid, {}))

    def _save_rs(sid: str, rs: dict):
        store[sid] = dict(rs)

    monkeypatch.setattr("synapse.rd_meeting.pipeline.load_room_state", _load_rs)
    monkeypatch.setattr("synapse.rd_meeting.pipeline.save_room_state", _save_rs)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.load_room_state", _load_rs)
    monkeypatch.setattr("synapse.rd_meeting.host_prompt_cache.save_room_state", _save_rs)
    monkeypatch.setattr("synapse.rd_meeting.service.load_room_state", _load_rs)
    monkeypatch.setattr("synapse.rd_meeting.service.save_room_state", _save_rs)
    monkeypatch.setattr("synapse.rd_meeting.service.cancel_room_run", lambda _rid: False)
    monkeypatch.setattr("synapse.rd_meeting.service.load_dev_status", lambda _sid: dict(dev))
    monkeypatch.setattr("synapse.rd_meeting.service.save_dev_status", lambda _sid, data: dev.update(data))

    class _Pipe:
        def set_flow_step(self, *_a, **_k):
            return None

        def save(self):
            return None

        @staticmethod
        def load(_sid: str):
            return _Pipe()

    monkeypatch.setattr("synapse.rd_meeting.service.MeetingPipeline", _Pipe)
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.schedule_pipeline_background",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.service.MeetingRoomService.get_room_detail",
        lambda self, _rid: {
            "scope_id": scope,
            "scope_type": "demand",
            "current_node_id": node_id,
            "status": "human_intervention",
        },
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.service.MeetingRoomService._room_detail_payload",
        lambda self, _dev, _sid, _titles: {"status": "processing"},
    )
    monkeypatch.setattr("synapse.rd_meeting.service.build_title_index", lambda: {})

    svc = MeetingRoomService()
    out = svc.reprocess_current_node(room_id)

    assert store[scope]["status"] == "processing"
    assert "intervention_kind" not in store[scope]
    assert "hitl_form_schema" not in store[scope]
    assert "pending_delivery" not in store[scope]
    assert "last_error" not in store[scope]
    assert out["status"] == "processing"


@pytest.mark.asyncio
async def test_pipeline_background_error_does_not_fail_room_while_run_node_active(monkeypatch):
    """pipeline 落盘失败但 run_node 已启动时，不应把会议室标为 failed。"""
    import asyncio

    from synapse.rd_meeting.orchestrator import _pipeline_tasks, schedule_pipeline_background

    scope = "pipe-err-scope"
    room_id = "mr_d_pipe_err"
    store: dict[str, dict] = {scope: {"status": "processing", "current_node_id": "req_clarify"}}

    def _load_rs(_sid: str):
        return dict(store.get(scope, {}))

    def _save_rs(_sid: str, rs: dict):
        store[scope] = dict(rs)

    monkeypatch.setattr("synapse.rd_meeting.orchestrator.load_room_state", _load_rs)
    monkeypatch.setattr("synapse.rd_meeting.orchestrator.save_room_state", _save_rs)
    monkeypatch.setattr("synapse.rd_meeting.orchestrator.is_room_run_in_progress", lambda _rid: True)

    def _boom() -> None:
        raise OSError(5, "拒绝访问", "meeting_pipeline.json")

    schedule_pipeline_background(room_id, _boom, scope_id=scope)
    await asyncio.sleep(0.05)
    task = _pipeline_tasks.get(room_id)
    if task is not None:
        await task

    assert store[scope]["status"] == "processing"
    assert "last_error" not in store[scope]
    assert "meeting_pipeline" in str(store[scope].get("last_pipeline_error") or "")


def test_save_meeting_pipeline_concurrent_writes(tmp_path, monkeypatch) -> None:
    """并发写 pipeline 不应因固定 .tmp 文件名触发 WinError 2。"""
    import concurrent.futures

    from synapse.rd_meeting.paths import meeting_pipeline_path, scope_dir
    from synapse.rd_meeting.room_runtime import read_json_file, save_meeting_pipeline

    scope = "pipe-concurrent"
    monkeypatch.setattr("synapse.rd_meeting.paths.scope_dir", lambda _sid: tmp_path / scope)
    scope_dir(scope).mkdir(parents=True, exist_ok=True)

    def _write(i: int) -> None:
        save_meeting_pipeline(scope, {"schema_version": 1, "n": i, "context": {"i": i}})

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(_write, range(24)))

    raw = read_json_file(meeting_pipeline_path(scope))
    assert isinstance(raw, dict)
    assert "n" in raw
    leftovers = list(scope_dir(scope).glob("meeting_pipeline.json.tmp.*"))
    assert leftovers == []
