"""节点会议目标（NODE_INTENT）。"""

from __future__ import annotations

from typing import Any

from synapse.rd_sop.manifest import NODE_INTENTS, get_node_manifest_entry


def default_node_intent(node_id: str) -> str:
    """节点会议目标默认值（SOP Manifest）。"""
    entry = get_node_manifest_entry(node_id)
    if entry:
        return str(entry.get("intent") or "").strip()
    return str(NODE_INTENTS.get(node_id, "") or "").strip()


def resolve_node_intent(
    node_id: str,
    *,
    node_override: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """解析节点会议目标（写死为 SOP Manifest，不再读取会议室配置覆盖）。

    ``node_override`` 保留参数以兼容旧调用方，已忽略其中的 ``node_intent``。

    Returns:
        (node_intent, default_node_intent) — 二者相同
    """
    del node_override  # 会议目标不可配置
    def_node = default_node_intent(node_id)
    return def_node, def_node
