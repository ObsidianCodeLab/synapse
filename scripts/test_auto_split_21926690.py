"""模拟 21926690 自动拆单：bootstrap_auto_split + 打印完整 create_task 错误。"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

DEMAND_NO = "21926690"
WORK_ROOT = Path.home() / ".synapse" / "work"
UW_PATH = WORK_ROOT / "userwork.json"
SPLIT_PLAN = WORK_ROOT / DEMAND_NO / "archive" / "需求设计" / "solution_review" / "split_plan.json"


def _load_uw_row() -> dict:
    data = json.loads(UW_PATH.read_text(encoding="utf-8"))
    for row in data.get("list", []):
        if str(row.get("demand_no")) == DEMAND_NO:
            return row
    raise ValueError(f"demand {DEMAND_NO} not in userwork")


async def main() -> int:
    from synapse.rd_meeting.auto_split_assets import bootstrap_auto_split, format_auto_split_report

    print("split_plan exists:", SPLIT_PLAN.is_file(), SPLIT_PLAN)
    print("\n=== BEFORE userwork ===")
    row = _load_uw_row()
    print(
        json.dumps(
            {
                "demand_status": row.get("demand_status"),
                "owned_work_items_count": len(row.get("owned_work_items") or []),
                "owned_task_nos": [
                    str(t.get("task_no")) for t in (row.get("owned_work_items") or []) if isinstance(t, dict)
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    print("\n=== bootstrap_auto_split ===")
    assets = bootstrap_auto_split("demand", DEMAND_NO)
    print(json.dumps(assets, ensure_ascii=False, indent=2, default=str))

    report = format_auto_split_report(assets, node_name="自动拆单")
    out = WORK_ROOT / DEMAND_NO / "archive" / "需求研发" / "auto_split" / "研发子单拆分清单.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(f"\nreport written: {out}")

    row2 = _load_uw_row()
    print("\n=== AFTER userwork ===")
    print(
        json.dumps(
            {
                "demand_status": row2.get("demand_status"),
                "owned_work_items_count": len(row2.get("owned_work_items") or []),
                "owned_task_nos": [
                    str(t.get("task_no")) for t in (row2.get("owned_work_items") or []) if isinstance(t, dict)
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    return 0 if assets.get("status") == "ok" else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
