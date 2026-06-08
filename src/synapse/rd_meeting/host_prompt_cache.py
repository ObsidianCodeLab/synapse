"""第三步主控提示词缓存：供第四步 run_node 复用，避免重复 build_room_skill_prompt。"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from synapse.rd_meeting.room_runtime import load_room_state, save_room_state

logger = logging.getLogger(__name__)

ROOM_STATE_CACHE_KEY = "host_prompt_cache"

# 会议室提示词 schema 版本：每次提示词拼装结构有破坏性变更时 +1，强制旧缓存失效。
# v2: 提示词改为完整 system prompt（含运行时头 + 能力卡片 + 规范主体），不再追加于通用编译段。
# v3: 通用规范内嵌于代码，移除 meeting_skill_id 维度；角色卡片按 host/worker 分别渲染。
MEETING_PROMPT_SCHEMA_VERSION = "v3"


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def cache_binding_key(binding: dict[str, Any]) -> dict[str, str]:
    return {
        "node_id": str(binding.get("node_id") or "").strip(),
        "host_profile_id": str(binding.get("host_profile_id") or "default").strip() or "default",
    }


def save_host_prompt_cache(scope_id: str, bundle: dict[str, Any]) -> None:
    """将第三步组装结果写入 room_state，供主控 run_node 复用。"""
    sid = (scope_id or "").strip()
    if not sid:
        return
    meeting_prompt = str(bundle.get("meeting_prompt") or "").strip()
    if not meeting_prompt:
        return
    bind_key = cache_binding_key(
        {
            "node_id": bundle.get("node_id"),
            "host_profile_id": bundle.get("host_profile_id"),
        }
    )
    rs = dict(load_room_state(sid) or {})
    rs[ROOM_STATE_CACHE_KEY] = {
        **bind_key,
        "schema_version": MEETING_PROMPT_SCHEMA_VERSION,
        "scope_type": str(bundle.get("scope_type") or "demand"),
        "scope_id": str(bundle.get("scope_id") or sid),
        "meeting_prompt": meeting_prompt,
        "user_prompt": str(bundle.get("user_prompt") or "").strip(),
        "assembled_at": _now_iso(),
    }
    save_room_state(sid, rs)
    logger.debug(
        "host_prompt_cache saved scope=%s node=%s chars=%s",
        sid,
        bind_key.get("node_id"),
        len(meeting_prompt),
    )


def clear_host_prompt_cache(scope_id: str) -> None:
    sid = (scope_id or "").strip()
    if not sid:
        return
    rs = dict(load_room_state(sid) or {})
    if ROOM_STATE_CACHE_KEY in rs:
        rs.pop(ROOM_STATE_CACHE_KEY, None)
        save_room_state(sid, rs)


def get_host_prompt_cache(scope_id: str, binding: dict[str, Any]) -> dict[str, Any] | None:
    """binding 与缓存键一致时返回缓存条目，否则 None。"""
    sid = (scope_id or "").strip()
    if not sid:
        return None
    rs = load_room_state(sid) or {}
    cache = rs.get(ROOM_STATE_CACHE_KEY)
    if not isinstance(cache, dict):
        return None
    expected = cache_binding_key(binding)
    for key, val in expected.items():
        if str(cache.get(key) or "").strip() != val:
            return None
    if str(cache.get("schema_version") or "").strip() != MEETING_PROMPT_SCHEMA_VERSION:
        return None
    meeting_prompt = str(cache.get("meeting_prompt") or "").strip()
    if not meeting_prompt:
        return None
    return cache


def resolve_cached_host_meeting_prompt(
    scope_id: str,
    binding: dict[str, Any],
) -> tuple[str | None, bool]:
    """返回 (meeting_prompt, reused)。无缓存时 (None, False)。"""
    cache = get_host_prompt_cache(scope_id, binding)
    if cache is None:
        return None, False
    return str(cache["meeting_prompt"]), True


def resolve_cached_host_user_prompt(
    scope_id: str,
    binding: dict[str, Any],
) -> tuple[str | None, bool]:
    cache = get_host_prompt_cache(scope_id, binding)
    if cache is None:
        return None, False
    user = str(cache.get("user_prompt") or "").strip()
    if not user:
        return None, False
    return user, True
