"""重新处理应即时清除异常门控残留，避免节点仍显示异常态。"""

from __future__ import annotations

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
    assert out["status"] == "processing"
