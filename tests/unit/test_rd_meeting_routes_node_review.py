"""PR3：/node-review /agent-trace /artifact-file /review-decision 路由单测。"""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi import FastAPI

from synapse.api.routes.meeting_rooms import router as meeting_router
from synapse.rd_meeting.dev_status import save_dev_status
from synapse.rd_meeting.paths import (
    agent_node_dir,
    archive_root,
    meeting_pipeline_path,
    room_state_path,
    scope_dir,
)

SCOPE_ID = "scope-rt"
ROOM_ID = "room-rt"
NODE_ID = "req_clarify"
STAGE_ID = 2


def _seed_workdir():
    """模拟一份「待人工确认」的工单状态。"""
    scope_dir(SCOPE_ID).mkdir(parents=True, exist_ok=True)
    dev = {
        "scope_type": "demand",
        "scope_id": SCOPE_ID,
        "current_node_id": NODE_ID,
        "stage_id": STAGE_ID,
        "meeting_room": {"active": True, "room_id": ROOM_ID},
    }
    save_dev_status(SCOPE_ID, dev)

    # room_state pending_delivery
    rs = {
        "status": "human_intervention",
        "intervention_kind": "result_confirm",
        "current_node_id": NODE_ID,
        "pending_delivery": {
            "node_id": NODE_ID,
            "report_body": "# 交付结论\nOK",
            "await_confirm": True,
            "tokens_used": 200,
            "duration_seconds": 12,
            "stage_id": STAGE_ID,
        },
    }
    room_state_path(SCOPE_ID).write_text(json.dumps(rs, ensure_ascii=False), encoding="utf-8")

    # 归档文件
    arc = archive_root(SCOPE_ID) / str(STAGE_ID) / NODE_ID
    arc.mkdir(parents=True)
    (arc / "需求澄清.md").write_text("# 交付结论\nOK", encoding="utf-8")

    # agent trace 内容
    base = agent_node_dir(SCOPE_ID, "default", NODE_ID)
    base.mkdir(parents=True)
    (base / "conversation.jsonl").write_text(
        "\n".join(
            json.dumps(r, ensure_ascii=False)
            for r in [
                {"index": 0, "role": "user", "speaker": {"kind": "user", "display_name": "用户"}, "text": "请开始"},
                {"index": 1, "role": "assistant", "speaker": {"kind": "host", "display_name": "小鲸"}, "text": "好的"},
            ]
        ),
        encoding="utf-8",
    )
    (base / "tools.json").write_text(json.dumps({"tools_executed": ["shell"]}, ensure_ascii=False), encoding="utf-8")
    (base / "usage.json").write_text(
        json.dumps({"last_usage": {"total_tokens": 200}}, ensure_ascii=False),
        encoding="utf-8",
    )
    (base / "events.jsonl").write_text(
        json.dumps({"ts": "t", "event": "configured", "node_id": NODE_ID}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    # pipeline.json with node_review payload
    pipe_path = meeting_pipeline_path(SCOPE_ID)
    pipe_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "scope_id": SCOPE_ID,
                "flow_step": "waiting",
                "context": {
                    "node_review": {
                        NODE_ID: {
                            "schema_version": 1,
                            "scope_id": SCOPE_ID,
                            "node_id": NODE_ID,
                            "node_name": "需求澄清",
                            "stage_id": STAGE_ID,
                            "metrics": {
                                "node_token_total": 200,
                                "node_duration_seconds": 12,
                                "delegation_total": 1,
                                "tool_call_total": 1,
                                "skill_call_total": 0,
                                "host": {
                                    "profile_id": "default",
                                    "display_name": "小鲸",
                                    "role": "host",
                                    "delegations": 1,
                                    "tool_calls": 1,
                                    "skill_calls": 0,
                                    "tokens": 200,
                                    "tools": [{"name": "shell", "count": 1}],
                                    "skills": [],
                                },
                                "workers": [],
                            },
                            "summaries": [
                                {
                                    "profile_id": "default",
                                    "display_name": "小鲸",
                                    "role": "host",
                                    "summary_markdown": "### 小鲸\n做完了",
                                    "source": "llm",
                                    "conversation_path": "agents/default/nodes/req_clarify/conversation.jsonl",
                                }
                            ],
                            "artifacts": [
                                {
                                    "name": "需求澄清.md",
                                    "relative_path": f"archive/{STAGE_ID}/{NODE_ID}/需求澄清.md",
                                    "size": 18,
                                    "mtime": "t",
                                    "ext": ".md",
                                }
                            ],
                            "report_body": "# 交付结论\nOK",
                        }
                    }
                },
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


@pytest.fixture
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    monkeypatch.setattr("synapse.rd_meeting.room_skill.resolve_agent_profile", lambda pid: None)
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.room_history_path",
        lambda sid, node_id="pending": scope_dir(sid) / "room_history.jsonl",
    )
    return tmp_path


@pytest.fixture
async def client(_isolate):
    app = FastAPI()
    app.include_router(meeting_router)
    app.state.agent_pool = None
    _seed_workdir()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as c:
        yield c


async def test_node_review_returns_cached_payload(client):
    resp = await client.get(f"/api/dev/meeting-rooms/{ROOM_ID}/node-review")
    assert resp.status_code == 200
    body = resp.json()
    data = body.get("data") if isinstance(body, dict) and "data" in body else body
    assert data["node_id"] == NODE_ID
    assert data["metrics"]["host"]["delegations"] == 1
    assert data["artifacts"][0]["name"] == "需求澄清.md"


async def test_node_review_refresh_skips_generate_agent_summaries(client, monkeypatch):
    async def _forbidden(**_kwargs):
        raise AssertionError("generate_agent_summaries must not run on refresh=true")

    monkeypatch.setattr(
        "synapse.rd_meeting.node_review.generate_agent_summaries",
        _forbidden,
    )
    resp = await client.get(
        f"/api/dev/meeting-rooms/{ROOM_ID}/node-review",
        params={"refresh": "true"},
    )
    assert resp.status_code == 200
    body = resp.json()
    data = body.get("data") if isinstance(body, dict) and "data" in body else body
    assert data["summaries"][0]["source"] == "llm"
    assert data["node_id"] == NODE_ID


async def test_node_review_explicit_node_id_param(client):
    resp = await client.get(
        f"/api/dev/meeting-rooms/{ROOM_ID}/node-review",
        params={"node_id": NODE_ID},
    )
    assert resp.status_code == 200


async def test_node_review_unknown_room_404(client):
    resp = await client.get("/api/dev/meeting-rooms/no-such-room/node-review")
    assert resp.status_code == 200  # 业务错误码不抛 HTTP 4xx
    body = resp.json()
    assert body.get("errorcode") == 404


async def test_agent_trace_returns_conversation(client):
    resp = await client.get(
        f"/api/dev/meeting-rooms/{ROOM_ID}/agent-trace",
        params={"profile_id": "default", "node_id": NODE_ID},
    )
    assert resp.status_code == 200
    body = resp.json()
    data = body.get("data") if isinstance(body, dict) and "data" in body else body
    assert data["profile_id"] == "default"
    assert len(data["conversation"]) == 2
    assert data["tools"]["tools_executed"] == ["shell"]
    assert data["usage"]["last_usage"]["total_tokens"] == 200
    assert any(e.get("event") == "configured" for e in data["events"])


async def test_agent_trace_missing_params(client):
    resp = await client.get(
        f"/api/dev/meeting-rooms/{ROOM_ID}/agent-trace",
        params={"profile_id": "", "node_id": ""},
    )
    body = resp.json()
    assert body.get("errorcode") == 400


async def test_artifact_file_reads_md(client):
    resp = await client.get(
        f"/api/dev/meeting-rooms/{ROOM_ID}/artifact-file",
        params={"path": f"archive/{STAGE_ID}/{NODE_ID}/需求澄清.md"},
    )
    assert resp.status_code == 200
    body = resp.json()
    data = body.get("data") if isinstance(body, dict) and "data" in body else body
    assert data["ext"] == ".md"
    assert "交付结论" in data["content"]


async def test_artifact_file_blocks_escape(client):
    resp = await client.get(
        f"/api/dev/meeting-rooms/{ROOM_ID}/artifact-file",
        params={"path": "../../../etc/passwd"},
    )
    body = resp.json()
    assert body.get("errorcode") == 404


async def test_review_decision_escalate(client, monkeypatch):
    captured = {}

    def _fake_confirm(self, **kwargs):
        captured.update(kwargs)
        return {"status": "escalated", "node_id": kwargs.get("node_id", NODE_ID)}

    # MeetingRoomOrchestrator 是新建实例使用，需要 patch 类方法
    monkeypatch.setattr(
        "synapse.api.routes.meeting_rooms.MeetingRoomOrchestrator.confirm_node_delivery",
        _fake_confirm,
    )
    resp = await client.post(
        f"/api/dev/meeting-rooms/{ROOM_ID}/review-decision",
        json={"mode": "escalate", "comment": "需要人介入"},
    )
    assert resp.status_code == 200
    assert captured["mode"] == "escalate"
    assert captured["scope_id"] == SCOPE_ID
    assert captured["comment"] == "需要人介入"
    assert captured["approved"] is False


async def test_review_decision_approve(client, monkeypatch):
    captured = {}

    def _fake_confirm(self, **kwargs):
        captured.update(kwargs)
        return {"status": "approved"}

    monkeypatch.setattr(
        "synapse.api.routes.meeting_rooms.MeetingRoomOrchestrator.confirm_node_delivery",
        _fake_confirm,
    )
    resp = await client.post(
        f"/api/dev/meeting-rooms/{ROOM_ID}/review-decision",
        json={"mode": "approve", "comment": ""},
    )
    assert resp.status_code == 200
    assert captured["mode"] == "approve"
    assert captured["approved"] is True


async def test_review_decision_invalid_mode(client):
    resp = await client.post(
        f"/api/dev/meeting-rooms/{ROOM_ID}/review-decision",
        json={"mode": "foo"},
    )
    assert resp.status_code == 422  # pydantic 校验失败
