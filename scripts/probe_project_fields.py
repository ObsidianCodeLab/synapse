"""对比硬编码 projectFieldId 与门户实际字段映射。"""
from __future__ import annotations

import asyncio
import json

HARDCODED = {
    20085: "性能(硬编码)",
    20086: "功能(硬编码)",
    20087: "配置(硬编码)",
    20088: "升级(硬编码)",
    20089: "安全(硬编码)",
    20413: "兼容(硬编码)",
}


async def field_map(task_no: str) -> tuple[str, int, list[dict]]:
    from synapse.api.routes.dev_iwhalecloud import (
        DEV_IWHALECLOUD_BASE_URL,
        _build_get_task_patch_headers,
        _ensure_valid_creds_async,
        _gateway_api_task_owner_and_id,
        _load_dev_iwhalecloud_authorization,
    )
    import httpx

    bearer = _load_dev_iwhalecloud_authorization()
    async with httpx.AsyncClient(timeout=30) as client:
        _, tid = await _gateway_api_task_owner_and_id(client, task_no, bearer)
    csrf, ck = await _ensure_valid_creds_async()
    headers = _build_get_task_patch_headers(csrf, ck)
    url = f"{DEV_IWHALECLOUD_BASE_URL}/portal/zcm-devspace/task/{tid}/project-fields"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=headers)
    rows = resp.json().get("data") or []
    out: list[dict] = []
    for row in rows:
        pf = (row or {}).get("projectFieldDto") or {}
        apf = pf.get("adProjectField") or {}
        cf = (pf.get("customFieldDto") or {}).get("adCustomField") or {}
        grp = (pf.get("adProjectFieldGroup") or {}).get("groupName")
        atf = (row or {}).get("adTaskField") or {}
        out.append(
            {
                "projectFieldId": apf.get("projectFieldId"),
                "fieldName": cf.get("fieldName"),
                "groupName": grp,
                "fieldValue": atf.get("fieldValue") if atf else None,
            }
        )
    return task_no, int(tid), out


async def main() -> int:
    for task_no in ("11928032", "11927964"):
        task_no, tid, out = await field_map(task_no)
        print(f"\n=== {task_no} (id={tid}) project-fields ===")
        for row in out:
            pid = row["projectFieldId"]
            hc = HARDCODED.get(pid, "")
            val = (row.get("fieldValue") or "")[:50]
            print(
                f"  {pid:>6} | {row.get('groupName') or '':8} | "
                f"{row.get('fieldName') or '':12} | value={val!r} {hc}"
            )
        portal_ids = {row["projectFieldId"] for row in out}
        match = {k: k in portal_ids for k in sorted(HARDCODED)}
        print("  hardcoded in portal?", json.dumps(match, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
