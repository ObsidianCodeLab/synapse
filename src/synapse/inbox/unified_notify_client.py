"""从研发统一服务拉取 SYNAPSE_RD_VIEW_SYSTEM_INFO 全局通知。"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from synapse.config import settings

from .models import InboxMessage
from .user_context import InboxUserContext, load_inbox_user_context, resolve_unified_service_base_url

logger = logging.getLogger(__name__)

_QUERY_PATH = "/dev/iwhalecloud/synapse/system_notice/query"


def _map_event_type(event_type: str) -> tuple[str, str]:
    normalized = str(event_type or "一般").strip()
    if normalized == "升级":
        return "update", "normal"
    if normalized == "重要":
        return "notice", "high"
    return "notice", "normal"


class UnifiedNotifyClient:
    def __init__(self, *, timeout_seconds: float = 20.0) -> None:
        self.timeout_seconds = timeout_seconds

    async def fetch_system_notices(
        self,
        context: InboxUserContext | None = None,
    ) -> list[InboxMessage]:
        if not getattr(settings, "inbox_unified_pull_enabled", True):
            return []
        base = resolve_unified_service_base_url()
        if not base:
            return []
        ctx = context or load_inbox_user_context()
        if ctx is None:
            return []

        payload = {
            "owner_info": ctx.employee_id,
            "team": ctx.team,
            "department": ctx.department,
        }
        url = f"{base.rstrip('/')}{_QUERY_PATH}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                body = response.json()
        except Exception as exc:
            logger.warning("[Inbox] unified system_notice/query failed: %s", exc)
            return []

        if not isinstance(body, dict):
            return []
        code = body.get("code")
        if code not in (0, "0", None):
            logger.warning("[Inbox] unified query rejected: %s", body.get("message"))
            return []
        rows = body.get("data")
        if not isinstance(rows, list):
            return []

        messages: list[InboxMessage] = []
        for raw in rows:
            if not isinstance(raw, dict):
                continue
            notice_id = str(raw.get("id") or raw.get("notice_id") or "").strip()
            title = str(raw.get("title") or "").strip()
            if not notice_id or not title:
                continue
            msg_type, priority = _map_event_type(str(raw.get("event_type") or "一般"))
            cta = raw.get("cta") if isinstance(raw.get("cta"), dict) else None
            if cta is None and raw.get("cta_url"):
                cta = {"label": raw.get("cta_label") or "查看详情", "url": raw.get("cta_url")}
            enriched = dict(raw)
            enriched["_category"] = "system"
            messages.append(
                InboxMessage(
                    id=f"sys:{notice_id}",
                    title=title,
                    body_markdown=str(raw.get("body_markdown") or raw.get("body") or ""),
                    type=msg_type,
                    priority=priority,
                    cta=cta,
                    publish_at=raw.get("publish_at"),
                    expire_at=raw.get("expire_at"),
                    source="unified_service",
                    raw=enriched,
                )
            )
        return messages
