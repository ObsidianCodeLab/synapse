"""Inbox 聚合：全局通知（DB）+ 会议室介入 + 待审批（虚拟项）。"""

from __future__ import annotations

import logging
from typing import Any

from synapse.core.pending_approvals import get_pending_approvals_store

from .models import InboxMessage
from .store import InboxStore

logger = logging.getLogger(__name__)

InboxCategory = str  # system | meeting | approval


def message_category(message: InboxMessage | dict[str, Any]) -> str:
    if isinstance(message, dict):
        raw = message.get("raw") if isinstance(message.get("raw"), dict) else {}
        category = raw.get("_category") or message.get("category")
        if category:
            return str(category)
        msg_id = str(message.get("id") or "")
    else:
        category = message.raw.get("_category")
        if category:
            return str(category)
        msg_id = message.id
    if msg_id.startswith("virtual:meeting:"):
        return "meeting"
    if msg_id.startswith("virtual:approval:"):
        return "approval"
    if msg_id.startswith("sys:"):
        return "system"
    return "system"


def _serialize_message(message: InboxMessage | dict[str, Any]) -> dict[str, Any]:
    if isinstance(message, dict):
        data = dict(message)
    else:
        data = {
            "id": message.id,
            "title": message.title,
            "body_markdown": message.body_markdown,
            "type": message.type,
            "priority": message.priority,
            "cta": message.cta,
            "target_rule": message.target_rule,
            "rollout_percent": message.rollout_percent,
            "publish_at": message.publish_at,
            "expire_at": message.expire_at,
            "source": message.source,
            "raw": message.raw,
            "received_at": message.raw.get("received_at") if message.raw else None,
            "read_at": message.raw.get("read_at"),
            "clicked_at": message.raw.get("clicked_at"),
            "dismissed_at": message.raw.get("dismissed_at"),
        }
    data["category"] = message_category(data)
    raw = data.get("raw") if isinstance(data.get("raw"), dict) else {}
    if raw.get("action"):
        data["action"] = raw["action"]
    return data


def _is_unread(row: dict[str, Any]) -> bool:
    category = message_category(row)
    if category in ("meeting", "approval"):
        return True
    return not row.get("read_at") and not row.get("dismissed_at")


async def _load_meeting_virtual_messages() -> list[dict[str, Any]]:
    try:
        import asyncio

        from synapse.rd_meeting.service import MeetingRoomService

        service = MeetingRoomService()
        items = await asyncio.to_thread(service.list_pending_human_intervention)
    except Exception as exc:
        logger.debug("[Inbox] meeting virtual messages skipped: %s", exc)
        return []

    messages: list[dict[str, Any]] = []
    for item in items or []:
        if not isinstance(item, dict):
            continue
        room_id = str(item.get("room_id") or "").strip()
        if not room_id:
            continue
        title = str(item.get("ticket_title") or item.get("scope_id") or room_id)
        node = str(item.get("current_node_name") or item.get("stage_name") or "")
        body = f"会议室待人工介入：{title}"
        if node:
            body += f"\n\n当前节点：{node}"
        messages.append(
            {
                "id": f"virtual:meeting:{room_id}",
                "title": title,
                "body_markdown": body,
                "type": "activity",
                "priority": "high",
                "category": "meeting",
                "source": "meeting_room",
                "publish_at": item.get("updated_at"),
                "raw": {
                    "_category": "meeting",
                    "action": {
                        "kind": "open_meeting",
                        "room_id": room_id,
                        "scope_type": item.get("scope_type"),
                        "scope_id": item.get("scope_id"),
                    },
                    **item,
                },
            }
        )
    return messages


def _load_approval_virtual_messages() -> list[dict[str, Any]]:
    try:
        entries = get_pending_approvals_store().list_active()
    except Exception as exc:
        logger.debug("[Inbox] approval virtual messages skipped: %s", exc)
        return []

    messages: list[dict[str, Any]] = []
    for entry in entries:
        data = entry.to_dict()
        pending_id = str(data.get("id") or "").strip()
        if not pending_id:
            continue
        tool_name = str(data.get("tool_name") or "tool")
        reason = str(data.get("reason") or "待审批操作")
        messages.append(
            {
                "id": f"virtual:approval:{pending_id}",
                "title": f"待审批 · {tool_name}",
                "body_markdown": reason,
                "type": "notice",
                "priority": "high",
                "category": "approval",
                "source": "pending_approval",
                "raw": {
                    "_category": "approval",
                    "action": {"kind": "open_approval", "pending_id": pending_id},
                    **data,
                },
            }
        )
    return messages


async def list_hub_messages(store: InboxStore) -> dict[str, Any]:
    db_rows = await store.list_messages(include_dismissed=False)
    system_rows = []
    for row in db_rows:
        serialized = _serialize_message(row)
        if serialized.get("category") == "system":
            system_rows.append(serialized)
    meeting_rows = await _load_meeting_virtual_messages()
    approval_rows = _load_approval_virtual_messages()

    all_messages = system_rows + meeting_rows + approval_rows
    all_messages.sort(
        key=lambda row: str(row.get("publish_at") or row.get("received_at") or ""),
        reverse=True,
    )

    def _stats(rows: list[dict[str, Any]]) -> dict[str, int]:
        unread = sum(1 for row in rows if _is_unread(row))
        return {"total": len(rows), "unread": unread}

    categories = {
        "system": _stats(system_rows),
        "meeting": _stats(meeting_rows),
        "approval": _stats(approval_rows),
    }
    unread_count = sum(item["unread"] for item in categories.values())
    return {
        "messages": all_messages,
        "unread_count": unread_count,
        "categories": categories,
    }


async def hub_unread_count(store: InboxStore) -> int:
    payload = await list_hub_messages(store)
    return int(payload.get("unread_count") or 0)
