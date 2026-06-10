"""按 skill_id（目录名）限定 Agent 启动时的技能磁盘加载范围。"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from contextlib import contextmanager
from contextvars import ContextVar
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from synapse.agents.profile import AgentProfile

logger = logging.getLogger(__name__)

_skill_load_extra_ids: ContextVar[frozenset[str] | None] = ContextVar(
    "skill_load_extra_ids",
    default=None,
)


def normalize_skill_dir_id(raw: str) -> str:
    """skill_id = 技能目录名（统一小写、下划线转连字符）。"""
    return (raw or "").strip().lower().replace("_", "-")


@contextmanager
def skill_load_scope(extra_ids: Iterable[str]):
    """在 ``get_or_create`` / ``initialize`` 期间追加本次 Agent 须从磁盘加载的 skill_id。"""
    normalized = frozenset(
        normalize_skill_dir_id(x) for x in extra_ids if str(x or "").strip()
    )
    token = _skill_load_extra_ids.set(normalized or None)
    try:
        yield
    finally:
        _skill_load_extra_ids.reset(token)


def get_skill_load_extra_ids() -> set[str]:
    val = _skill_load_extra_ids.get()
    return set(val) if val else set()


def ensure_agent_skills_loaded(agent: Any, skill_ids: Iterable[str]) -> int:
    """补载尚未 parse 的技能（share_from 复用 loader 时仍可能缺失）。"""
    loader = getattr(agent, "skill_loader", None)
    if loader is None:
        return 0
    wanted = {
        normalize_skill_dir_id(x) for x in skill_ids if str(x or "").strip()
    }
    if not wanted:
        return 0
    missing = {sid for sid in wanted if loader.get_skill(sid) is None}
    if not missing:
        return 0
    from synapse.config import settings

    loaded = loader.load_all(settings.project_root, only_ids=missing)
    logger.info(
        "ensure_agent_skills_loaded: requested=%d missing=%d loaded=%d",
        len(wanted),
        len(missing),
        loaded,
    )
    return loaded


async def get_or_create_with_skill_ids(
    pool: Any,
    session_id: str,
    profile: AgentProfile,
    skill_ids: Iterable[str],
) -> Any:
    """池化创建 Agent，并按目录名 id 限定本次须加载的技能。"""
    ids = [normalize_skill_dir_id(x) for x in skill_ids if str(x or "").strip()]
    with skill_load_scope(ids):
        agent = await pool.get_or_create(session_id, profile)
    ensure_agent_skills_loaded(agent, ids)
    return agent
