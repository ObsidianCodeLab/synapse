"""研发会议室 Worker prewarm 代数：避免 node_init 异步 prewarm 覆盖新节点配置。"""

from __future__ import annotations

_generation_by_room: dict[str, int] = {}


def bump_meeting_prewarm_generation(room_id: str) -> int:
    """递增会议室 prewarm 代数；返回本次代数。"""
    rid = (room_id or "").strip()
    if not rid:
        return 0
    n = _generation_by_room.get(rid, 0) + 1
    _generation_by_room[rid] = n
    return n


def is_meeting_prewarm_generation_current(room_id: str, generation: int) -> bool:
    """``generation`` 仍为该 room 最新代数时返回 True。"""
    rid = (room_id or "").strip()
    if not rid or generation <= 0:
        return True
    return _generation_by_room.get(rid, 0) == generation


def reset_meeting_prewarm_generations() -> None:
    """测试用：清空代数表。"""
    _generation_by_room.clear()
