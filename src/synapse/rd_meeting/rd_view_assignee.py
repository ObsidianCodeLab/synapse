"""研发统一服务 rd_view：处理人登记（引导验证后同步）。"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from synapse.api.routes.dev_iwhalecloud import _load_userinfo_plain
from synapse.rd_meeting.devservice import unified_service_base_url

logger = logging.getLogger(__name__)

RD_VIEW_ASSIGNEE_SAVE_PATH = "/dev/iwhalecloud/synapse/rd_view_assignee_save"


def build_rd_view_assignee_save_payload(
    *,
    assignee_id: str,
    assignee: str,
    department: str,
    team: str,
    position: str,
) -> dict[str, str]:
    """组装统一服务 ``rd_view_assignee_save`` 请求体。"""
    return {
        "assignee_id": (assignee_id or "").strip(),
        "assignee": (assignee or "").strip(),
        "department": (department or "").strip(),
        "team": (team or "").strip(),
        "position": (position or "").strip(),
    }


def sync_rd_view_assignee_to_unified_service(
    *,
    assignee_id: str,
    assignee: str,
    department: str,
    team: str,
    position: str,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """POST 研发统一服务 ``rd_view_assignee_save``；未配置 devservice.ip 时跳过。"""
    base = unified_service_base_url()
    if not base:
        return {"status": "skipped", "reason": "missing_devservice_ip"}

    payload = build_rd_view_assignee_save_payload(
        assignee_id=assignee_id,
        assignee=assignee,
        department=department,
        team=team,
        position=position,
    )
    if not payload["assignee_id"]:
        return {"status": "skipped", "reason": "missing_assignee_id"}

    url = f"{base}{RD_VIEW_ASSIGNEE_SAVE_PATH}"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            body = resp.json()
    except Exception as exc:
        logger.warning("rd_view_assignee_save failed: %s", exc)
        return {"status": "failed", "error": str(exc)}

    code = body.get("code") if isinstance(body, dict) else None
    if code not in (0, "0", None):
        message = ""
        if isinstance(body, dict):
            message = str(body.get("message") or body.get("msg") or "")
        err = message or f"code={code}"
        logger.warning("rd_view_assignee_save rejected: %s", err)
        return {"status": "failed", "error": err}

    saved_id = payload["assignee_id"]
    data = body.get("data") if isinstance(body, dict) else None
    if isinstance(data, dict):
        saved_id = str(data.get("assignee_id") or saved_id).strip() or saved_id
    return {"status": "ok", "assignee_id": saved_id}


def sync_rd_view_assignee_from_userinfo(*, timeout: float = 30.0) -> dict[str, Any]:
    """从本机 ``userinfo.encryption`` 读取处理人信息并同步到统一服务。"""
    try:
        data = _load_userinfo_plain() or {}
    except (ValueError, OSError):
        return {"status": "skipped", "reason": "missing_userinfo"}

    return sync_rd_view_assignee_to_unified_service(
        assignee_id=str(data.get("employee_id") or data.get("username") or "").strip(),
        assignee=str(data.get("name") or "").strip(),
        department=str(data.get("department") or "").strip(),
        team=str(data.get("team") or "").strip(),
        position=str(data.get("position") or "").strip(),
        timeout=timeout,
    )
