"""读取本机 userinfo，供统一服务全局通知 OR 检索使用。"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from synapse.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class InboxUserContext:
    employee_id: str = ""
    team: str = ""
    department: str = ""


def load_inbox_user_context() -> InboxUserContext | None:
    try:
        from synapse.api.routes.dev_iwhalecloud import _load_userinfo_plain

        data = _load_userinfo_plain()
    except Exception as exc:
        logger.debug("[Inbox] userinfo unavailable: %s", exc)
        return None
    if not data:
        return None
    employee_id = str(data.get("employee_id") or "").strip()
    if not employee_id:
        return None
    return InboxUserContext(
        employee_id=employee_id,
        team=str(data.get("team") or "").strip(),
        department=str(data.get("department") or "").strip(),
    )


def resolve_unified_service_base_url() -> str | None:
    configured = (getattr(settings, "inbox_unified_service_url", None) or "").strip()
    if configured:
        return configured.rstrip("/")
    ip_path = settings.synapse_home / "devservice.ip"
    legacy = settings.project_root / "data" / "devservice.ip"
    host = ""
    for path in (ip_path, legacy):
        try:
            if path.is_file():
                host = path.read_text(encoding="utf-8").strip()
                if host:
                    break
        except OSError:
            continue
    if not host:
        return None
    if "://" in host:
        return host.rstrip("/")
    port = int(getattr(settings, "inbox_unified_service_port", 10001) or 10001)
    return f"http://{host}:{port}"
