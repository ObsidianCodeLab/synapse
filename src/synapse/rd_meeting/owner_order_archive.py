"""工单完成归档（预留）。

TODO — 后续实现：
1. ``userwork.json`` 中 ``local_process_state=已完成`` 且门户已下架的条目迁入历史快照；
2. ``work/<demand_no>/`` 下产出文档、SOP 节点内容、代码等分层归档；
3. 通知统一服务工单归档态。

当前刷新流程仅保留「已完成」孤儿单于 userwork，待本模块承接后做真正归档。
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def archive_completed_demand_if_needed(*, demand_no: str) -> dict[str, Any]:
    """预留：工单完成归档入口（当前为 no-op）。"""
    dn = (demand_no or "").strip()
    logger.debug("owner_order_archive TODO: demand_no=%s (skipped)", dn or "?")
    return {"status": "todo", "demand_no": dn, "archived": False}
