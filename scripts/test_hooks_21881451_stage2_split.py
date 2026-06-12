"""单独测试 21881451：需求设计→需求开发转单钩子 + 自动拆单。"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path

DEMAND_NO = "21881451"
WORK_ROOT = Path.home() / ".synapse" / "work"
UW_PATH = WORK_ROOT / "userwork.json"
SCOPE_DIR = WORK_ROOT / DEMAND_NO
SPLIT_PLAN_PATH = (
    SCOPE_DIR / "archive" / "需求设计" / "solution_review" / "split_plan.json"
)


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _load_uw_row() -> dict:
    data = json.loads(UW_PATH.read_text(encoding="utf-8"))
    for row in data.get("list", []):
        if str(row.get("demand_no")) == DEMAND_NO:
            return row
    raise ValueError(f"demand {DEMAND_NO} not in userwork")


def _ensure_split_plan() -> Path:
    if SPLIT_PLAN_PATH.is_file():
        return SPLIT_PLAN_PATH
    SPLIT_PLAN_PATH.parent.mkdir(parents=True, exist_ok=True)
    plan = {
        "schema_version": 1,
        "demand_no": DEMAND_NO,
        "approved_at": _now_iso(),
        "human_comment": "Synapse 单独测试自动拆单（手工落盘 split_plan）",
        "tasks": [
            {
                "taskNo": DEMAND_NO,
                "taskTitle": "MDB定时备份能力-自动拆单测试子单",
                "comments": "21881451 自动拆单钩子单独测试",
                "projectId": 562722,
                "productModuleName": "ZMDB",
                "branchVersionName": "CBOSS_BSS_ZMDB_V9.0_主分支",
                "patchName": "CBOSS_BSS_ZMDB_V9.0",
                "taskImpactDesc": "涉及功能和性能影响，功能影响多中心同步",
                "performanceImpact": "性能上主要考虑阻塞同步",
                "functionalImpact": "涉及功能影响、兼容性、界面变动",
                "cfgChangeDescription": "mdb_table_group.xml 新增备份配置字段",
                "upgradeRisk": "低风险，向后兼容缺省配置",
                "securityImpact": "无新增安全风险",
                "compatibilityImpact": "旧部署缺省字段不参与备份",
            }
        ],
    }
    SPLIT_PLAN_PATH.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return SPLIT_PLAN_PATH


async def main() -> int:
    from synapse.rd_meeting.auto_split_assets import bootstrap_auto_split
    from synapse.rd_meeting.sop_stage_hooks import run_sop_stage_transition_hook

    print("=== BEFORE ===")
    row = _load_uw_row()
    print(
        json.dumps(
            {
                "demand_status": row.get("demand_status"),
                "sop_node": row.get("sop_node"),
                "owned_work_items": row.get("owned_work_items"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    print("\n=== TEST 1: 需求设计 → 需求开发 (sop_stage_hook) ===")
    out1 = await run_sop_stage_transition_hook(
        scope_type="demand",
        scope_id=DEMAND_NO,
        from_stage=2,
        to_stage=3,
        completed_node_id="solution_review",
        next_node_id="auto_split",
    )
    print(json.dumps(out1, ensure_ascii=False, indent=2, default=str))

    row1 = _load_uw_row()
    print(
        "after hook:",
        json.dumps(
            {
                "demand_status": row1.get("demand_status"),
                "userwork_applied": out1.get("userwork_applied"),
            },
            ensure_ascii=False,
        ),
    )

    print("\n=== TEST 2: 自动拆单 (bootstrap_auto_split / create_task) ===")
    plan_path = _ensure_split_plan()
    print(f"split_plan: {plan_path}")
    assets = bootstrap_auto_split("demand", DEMAND_NO)
    print(json.dumps(assets, ensure_ascii=False, indent=2, default=str))

    row2 = _load_uw_row()
    print(
        "\n=== AFTER ===",
        json.dumps(
            {
                "demand_status": row2.get("demand_status"),
                "sop_node": row2.get("sop_node"),
                "owned_work_items": row2.get("owned_work_items"),
            },
            ensure_ascii=False,
            indent=2,
        ),
    )

    ok1 = out1.get("status") == "ok"
    ok2 = assets.get("status") in ("ok", "partial")
    return 0 if ok1 and ok2 else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
