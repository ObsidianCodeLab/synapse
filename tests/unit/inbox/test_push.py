"""POST /api/inbox/push — unified service ingress."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from synapse.api.server import create_app


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("SYNAPSE_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(
        "synapse.config.settings.inbox_enabled",
        True,
        raising=False,
    )
    monkeypatch.setattr(
        "synapse.config.settings.inbox_push_enabled",
        True,
        raising=False,
    )
    monkeypatch.setattr(
        "synapse.config.settings.inbox_push_token",
        "",
        raising=False,
    )
    return create_app()


@pytest.mark.asyncio
async def test_push_from_localhost(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/inbox/push",
            json={
                "messages": [
                    {
                        "id": "unified-test-1",
                        "title": "Hello",
                        "body_markdown": "From unified service",
                        "priority": "normal",
                    }
                ],
                "source": "unified_service",
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["stored"] == 1
    assert body["unread_count"] >= 1
