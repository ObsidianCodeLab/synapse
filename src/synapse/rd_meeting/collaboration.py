"""研发会议室协作阵容：除 Host 外可委派的 Worker 判定。"""

from __future__ import annotations

from typing import Any


def collaboration_worker_ids(
    host_profile_id: str,
    worker_profile_ids: list[str] | None,
) -> list[str]:
    """除 Host 外、可作为委派对象的 Worker profile id 列表。"""
    hid = (host_profile_id or "").strip()
    return [
        str(w).strip()
        for w in (worker_profile_ids or [])
        if str(w).strip() and str(w).strip() != hid
    ]


def has_collaboration_workers(binding: dict[str, Any] | None) -> bool:
    if not isinstance(binding, dict):
        return False
    host_id = str(binding.get("host_profile_id") or "default").strip() or "default"
    workers = binding.get("worker_profile_ids")
    return bool(collaboration_worker_ids(host_id, workers if isinstance(workers, list) else []))
