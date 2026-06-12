"""独立测试 11928032：影响点同步/确认 + 六项影响评估。"""

from __future__ import annotations

import asyncio
import json

TASK_NO = "11928032"
DEMAND_NO = "21898803"
TASK_IMPACT_DESC = "非标账单错单回收优化"


async def _task_id(task_no: str) -> int | None:
    from synapse.api.routes.dev_iwhalecloud import (
        _gateway_api_task_owner_and_id,
        _load_dev_iwhalecloud_authorization,
    )
    import httpx

    bearer = _load_dev_iwhalecloud_authorization()
    async with httpx.AsyncClient(timeout=30) as client:
        _, tid = await _gateway_api_task_owner_and_id(client, task_no, bearer)
    return int(tid) if tid else None


async def _task_project_fields(task_id: int) -> list[dict]:
    """读取子单详情里的 project fields（对比硬编码 projectFieldId）。"""
    from synapse.api.routes.dev_iwhalecloud import (
        DEV_IWHALECLOUD_BASE_URL,
        _ensure_valid_creds_async,
        _PORTAL_ZCM_TASK_DETAIL_BODY,
        _build_get_task_patch_headers,
    )
    import httpx

    csrf, cookies = await _ensure_valid_creds_async()
    url = f"{DEV_IWHALECLOUD_BASE_URL}/portal/zcm-devspace/task/{task_id}/detail"
    headers = _build_get_task_patch_headers(csrf, cookies)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=_PORTAL_ZCM_TASK_DETAIL_BODY)
        raw = resp.json()
    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        return []
    fields = data.get("adTaskFieldDtoList") or data.get("taskFieldDtoList") or []
    if not isinstance(fields, list):
        return []
    return [dict(x) for x in fields if isinstance(x, dict)]


async def main() -> int:
    from synapse.api.routes.dev_iwhalecloud import (
        GetImpactListFromDemandRequest,
        GetImpactListFromTaskRequest,
        TaskImpactConfirmRequest,
        UpdateTaskImpactEvaluationRequest,
        _demand_impact_rows,
        _get_impact_list_from_demand,
        _get_impact_list_from_task,
        _get_task_current_stage,
        _load_userinfo_plain,
        _resolve_demand_task_id,
        _sync_task_impact_from_demand,
        _task_impact_confirm,
        _task_impact_detail_rows,
        _update_task_impact_evaluation,
    )

    userinfo = _load_userinfo_plain() or {}
    user_id = int(userinfo.get("userId") or 0)
    task_id = await _task_id(TASK_NO)
    demand_id = await _resolve_demand_task_id(DEMAND_NO)

    print("=== CONTEXT ===")
    print(json.dumps({"task_no": TASK_NO, "task_id": task_id, "demand_no": DEMAND_NO, "demand_id": demand_id, "user_id": user_id}, ensure_ascii=False, indent=2))
    if not task_id or not demand_id:
        print("ERROR: missing task_id or demand_id")
        return 2

    stage = await _get_task_current_stage(TASK_NO)
    print("\n=== TASK STAGE ===")
    print(json.dumps(stage, ensure_ascii=False, indent=2, default=str))

    demand_impacts = await _demand_impact_rows(int(demand_id))
    print("\n=== DEMAND IMPACTS (evaluateResult=Y) ===")
    print(json.dumps(demand_impacts, ensure_ascii=False, indent=2))

    task_impacts_before = await _task_impact_detail_rows(task_id)
    print("\n=== TASK IMPACT DETAIL (before) ===")
    print(json.dumps(task_impacts_before, ensure_ascii=False, indent=2))

    fields = await _task_project_fields(task_id)
    print("\n=== TASK PROJECT FIELDS (portal detail) ===")
    interesting = [
        {
            "projectFieldId": f.get("projectFieldId") or f.get("fieldId"),
            "fieldName": f.get("fieldName") or f.get("projectFieldName"),
            "fieldValue": f.get("fieldValue"),
        }
        for f in fields
    ]
    print(json.dumps(interesting[:30], ensure_ascii=False, indent=2))
    hardcoded = {20085: "performance", 20086: "functional", 20087: "cfg", 20088: "upgrade", 20089: "security", 20413: "compatibility"}
    portal_ids = {int(x["projectFieldId"]) for x in interesting if x.get("projectFieldId") is not None}
    print("hardcoded projectFieldIds:", sorted(hardcoded))
    print("portal projectFieldIds sample:", sorted(portal_ids)[:20] if portal_ids else [])

    print("\n=== TEST sync_task_impact_from_demand (dry: only if no detail rows) ===")
    if task_impacts_before:
        print("skip sync — task already has impact detail rows")
        sync_err = None
    else:
        sync_err = await _sync_task_impact_from_demand(
            child_task_id=task_id,
            demand_no=DEMAND_NO,
            user_id=user_id,
            task_impact_desc=TASK_IMPACT_DESC,
        )
        print("sync_err:", sync_err)

    task_impacts_mid = await _task_impact_detail_rows(task_id)
    print("\n=== TASK IMPACT DETAIL (after sync) ===")
    print(json.dumps(task_impacts_mid, ensure_ascii=False, indent=2))

    print("\n=== TEST task_impact_confirm ===")
    confirm_resp = await _task_impact_confirm(
        TaskImpactConfirmRequest(taskId=task_id, selfTestDesc=TASK_IMPACT_DESC)
    )
    print(json.dumps(confirm_resp, ensure_ascii=False, indent=2, default=str))

    print("\n=== TEST update_task_impact_evaluation ===")
    eval_body = UpdateTaskImpactEvaluationRequest(
        taskId=task_id,
        userId=user_id,
        performanceImpact="账期路由增加一次比较，影响可忽略",
        functionalImpact="receivableToItem=2 时按 BILLING_CYCLE 分流 OWE/SD",
        cfgChangeDescription="无",
        upgradeRisk="低",
        securityImpact="无",
        compatibilityImpact="向后兼容，缺省行为不变",
    )
    eval_resp = await _update_task_impact_evaluation(eval_body)
    print(json.dumps(eval_resp, ensure_ascii=False, indent=2, default=str))

    ok_confirm = isinstance(confirm_resp, dict) and confirm_resp.get("errorcode") in (None, 0)
    ok_eval = isinstance(eval_resp, dict) and eval_resp.get("errorcode") in (None, 0)
    return 0 if ok_confirm and ok_eval else 3


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
