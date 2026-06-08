"""会议室 /live 路由：node_id 仅影响 chat 视图，不覆盖 current_node_id。"""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

from synapse.api.routes.meeting_rooms import router as meeting_router
from synapse.rd_meeting.dev_status import save_dev_status
from synapse.rd_meeting.paths import scope_dir
from synapse.rd_meeting.room_runtime import append_history_event

SCOPE_ID = "scope-live"
ROOM_ID = "room-live"
CURRENT_NODE = "module_func"
VIEW_NODE = "req_clarify"


@pytest.fixture
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    monkeypatch.setattr("synapse.rd_meeting.room_skill.resolve_agent_profile", lambda pid: None)
    return tmp_path


@pytest.fixture
async def client(_isolate):
    scope_dir(SCOPE_ID).mkdir(parents=True, exist_ok=True)
    save_dev_status(
        SCOPE_ID,
        {
            "scope_type": "demand",
            "scope_id": SCOPE_ID,
            "current_node_id": CURRENT_NODE,
            "stage_id": 3,
            "meeting_room": {"active": True, "room_id": ROOM_ID},
        },
    )
    append_history_event(
        SCOPE_ID,
        {
            "event": "chat",
            "node_id": VIEW_NODE,
            "text": "历史节点消息",
            "speaker": {"kind": "host", "display_name": "小鲸"},
        },
    )
    append_history_event(
        SCOPE_ID,
        {
            "event": "chat",
            "node_id": CURRENT_NODE,
            "text": "当前节点消息",
            "speaker": {"kind": "host", "display_name": "小鲸"},
        },
    )

    app = FastAPI()
    app.include_router(meeting_router)
    app.state.agent_pool = None
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


async def test_live_without_node_id_returns_pipeline_current_node(client):
    resp = await client.get(f"/api/dev/meeting-rooms/{ROOM_ID}/live")
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["current_node_id"] == CURRENT_NODE
    assert "view_node_id" not in body


async def test_live_with_node_id_does_not_override_current_node(client):
    resp = await client.get(
        f"/api/dev/meeting-rooms/{ROOM_ID}/live?node_id={VIEW_NODE}",
    )
    assert resp.status_code == 200
    body = resp.json()["data"]
    assert body["current_node_id"] == CURRENT_NODE
    assert body.get("view_node_id") == VIEW_NODE
    hist = body.get("recent_history") or []
    assert any(str(ev.get("node_id") or "") == VIEW_NODE for ev in hist)
