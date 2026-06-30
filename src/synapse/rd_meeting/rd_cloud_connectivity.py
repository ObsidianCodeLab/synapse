"""研发云连通性：关键环节执行前统一探测（门户凭据 + 产品公共服务端口）。"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Literal

from synapse.rd_meeting.devservice import (
    format_host_authority,
    probe_devservice_ports,
    read_devservice_host,
)
from synapse.rd_sop.nodes import node_display_name

logger = logging.getLogger(__name__)

RdCloudCheckContext = Literal[
    "cross_stage_hook",
    "auto_split",
    "code_commit",
    "flight_optimize",
    "leader_review",
]

_CONTEXT_LABELS: dict[RdCloudCheckContext, str] = {
    "cross_stage_hook": "跨阶段转单",
    "auto_split": "自动拆单",
    "code_commit": "代码提交",
    "flight_optimize": "试飞优化",
    "leader_review": "研发组长评审",
}

_NODE_ID_TO_CONTEXT: dict[str, RdCloudCheckContext] = {
    "auto_split": "auto_split",
    "exception_check": "code_commit",
    "diff_analysis": "flight_optimize",
    "leader_review": "leader_review",
}


@dataclass
class RdCloudConnectivityResult:
    ok: bool
    message: str = ""
    context: RdCloudCheckContext = "auto_split"
    devservice_host: str = ""
    devservice_ok: bool = False
    portal_credential_ok: bool = False
    portal_http_ok: bool = False
    failed_ports: list[int] = field(default_factory=list)
    port_results: list[dict[str, Any]] = field(default_factory=list)


def context_for_node_id(node_id: str) -> RdCloudCheckContext | None:
    """SOP 节点 id → 连通性检测上下文；未配置则返回 None。"""
    return _NODE_ID_TO_CONTEXT.get((node_id or "").strip())


def _check_portal_credentials() -> tuple[bool, str]:
    from synapse.api.routes.dev_iwhalecloud import _load_userinfo_plain, _userinfo_encryption_path

    path = _userinfo_encryption_path()
    try:
        exists = path.is_file() and path.stat().st_size > 0
    except OSError:
        exists = False
    if not exists:
        return False, "未找到 userinfo.encryption，请先在引导页完成研发云登录"

    try:
        data = _load_userinfo_plain()
    except (ValueError, FileNotFoundError) as exc:
        return False, str(exc)
    if not data:
        return False, "userinfo.encryption 为空或无法解密"
    token = str(data.get("token") or "").strip()
    if not token:
        return False, "userinfo 中缺少研发云 API Token（Authorization），请重新完成研发云引导"
    return True, ""


def _check_portal_http(*, timeout: float = 5.0) -> tuple[bool, str]:
    import httpx

    from synapse.api.routes.dev_iwhalecloud import DEV_IWHALECLOUD_BASE_URL

    try:
        resp = httpx.get(
            DEV_IWHALECLOUD_BASE_URL,
            timeout=timeout,
            follow_redirects=True,
        )
    except httpx.TimeoutException:
        return False, "研发云门户连接超时"
    except httpx.RequestError as exc:
        return False, f"研发云门户连接失败：{exc}"

    if resp.status_code >= 500:
        return False, f"研发云门户不可达（HTTP {resp.status_code}）"
    return True, ""


def _check_devservice(*, timeout: float = 3.0) -> tuple[bool, str, str, list[dict[str, Any]], list[int]]:
    host_raw = read_devservice_host()
    if not host_raw:
        return False, "未配置 devservice.ip（产品公共服务地址），请在引导页完成公共服务探测", "", [], []

    authority = format_host_authority(host_raw)
    if not authority:
        return False, f"devservice.ip 内容无效：{host_raw!r}", host_raw, [], []

    results = probe_devservice_ports(host_raw, timeout=timeout)
    failed = [int(r["port"]) for r in results if not r.get("ok")]
    if failed:
        ports_text = "、".join(str(p) for p in failed)
        return (
            False,
            f"产品公共服务端口不可达（{ports_text}），请检查 devservice.ip={host_raw} 与网络",
            host_raw,
            results,
            failed,
        )
    return True, "", host_raw, results, []


def check_rd_cloud_connectivity(
    *,
    context: RdCloudCheckContext,
    timeout: float = 3.0,
    portal_timeout: float = 5.0,
) -> RdCloudConnectivityResult:
    """统一研发云连通性检测：本地凭据 + 门户 HTTP + 产品公共服务 TCP。"""
    label = _CONTEXT_LABELS.get(context, context)
    cred_ok, cred_err = _check_portal_credentials()
    if not cred_ok:
        return RdCloudConnectivityResult(
            ok=False,
            message=f"{label}前研发云连通性检测失败：{cred_err}",
            context=context,
            portal_credential_ok=False,
        )

    http_ok, http_err = _check_portal_http(timeout=portal_timeout)
    if not http_ok:
        return RdCloudConnectivityResult(
            ok=False,
            message=f"{label}前研发云连通性检测失败：{http_err}",
            context=context,
            portal_credential_ok=True,
            portal_http_ok=False,
        )

    dev_ok, dev_err, host, port_results, failed_ports = _check_devservice(timeout=timeout)
    if not dev_ok:
        return RdCloudConnectivityResult(
            ok=False,
            message=f"{label}前研发云连通性检测失败：{dev_err}",
            context=context,
            devservice_host=host,
            devservice_ok=False,
            portal_credential_ok=True,
            portal_http_ok=True,
            failed_ports=failed_ports,
            port_results=port_results,
        )

    return RdCloudConnectivityResult(
        ok=True,
        message="",
        context=context,
        devservice_host=host,
        devservice_ok=True,
        portal_credential_ok=True,
        portal_http_ok=True,
        port_results=port_results,
    )


def require_rd_cloud_connectivity(
    *,
    context: RdCloudCheckContext,
    node_id: str = "",
    scope_id: str = "",
) -> str | None:
    """检测通过返回 None；失败返回用户可读错误文案。"""
    _ = scope_id
    result = check_rd_cloud_connectivity(context=context)
    if result.ok:
        return None
    node_label = node_display_name(node_id) if node_id else _CONTEXT_LABELS.get(context, context)
    logger.warning(
        "rd_cloud_connectivity failed context=%s node=%s scope=%s message=%s failed_ports=%s",
        context,
        node_id,
        scope_id,
        result.message,
        result.failed_ports,
    )
    if node_id and node_label not in result.message:
        return f"「{node_label}」{result.message}"
    return result.message


def build_system_node_connectivity_failure(*, node_id: str, error: str) -> dict[str, Any]:
    """系统节点因连通性失败时的标准返回结构。"""
    return {
        "status": "failed",
        "error": error,
        "rd_cloud_connectivity_failed": True,
        "node_id": node_id,
    }


def apply_rd_cloud_connectivity_block(
    *,
    scope_type: str,
    scope_id: str,
    room_id: str,
    node_id: str,
    error: str,
    context: RdCloudCheckContext,
    ticket_title: str = "",
) -> dict[str, Any]:
    """在当前节点进入 exception_gate 并写 history（供 pipeline / orchestrator 调用）。"""
    from synapse.rd_meeting.binding import resolve_node_binding
    from synapse.rd_meeting.hitl_form import resolve_hitl_schema_for_gate
    from synapse.rd_meeting.notifications import schedule_human_intervention_notify
    from synapse.rd_meeting.orchestrator import MeetingRoomOrchestrator
    from synapse.rd_meeting.phase import set_phase
    from synapse.rd_meeting.room_runtime import (
        append_history_event,
        load_room_state,
        save_room_state,
    )
    from synapse.rd_sop.nodes import stage_id_for_node_id

    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    node_label = node_display_name(nid) if nid else _CONTEXT_LABELS.get(context, context)
    reason = error or f"{node_label}前研发云连通性检测失败"

    binding = resolve_node_binding(nid, scope_type=scope_type, scope_id=sid, ticket_title=ticket_title)
    schema = resolve_hitl_schema_for_gate(
        binding,
        dynamic_schema=None,
        reason=reason,
        intervention_kind="exception",
    )
    stage_id = int(binding.get("stage_id") or stage_id_for_node_id(nid))

    orch = MeetingRoomOrchestrator()
    gate = orch.mark_human_gate(
        scope_type=scope_type,
        scope_id=sid,
        room_id=room_id,
        node_id=nid,
        reason=reason,
        ticket_title=ticket_title,
        hitl_form_schema=schema,
        pending_delivery={
            "node_id": nid,
            "report_body": f"# 研发云连通性异常\n\n{reason}\n",
            "await_confirm": False,
            "stage_id": stage_id,
            "error": reason,
            "rd_cloud_connectivity": {
                "context": context,
                "message": reason,
            },
        },
        intervention_kind="exception",
    )
    set_phase(sid, "exception_gate")
    rs = dict(load_room_state(sid) or {})
    rs["rd_cloud_connectivity_blocked"] = True
    rs["escalate_reason"] = reason
    save_room_state(sid, rs)
    append_history_event(
        sid,
        {
            "event": "rd_cloud_connectivity_failed",
            "room_id": room_id,
            "node_id": nid,
            "context": context,
            "text": reason,
            "log_type": "error",
            "agent_id": "system",
        },
    )
    schedule_human_intervention_notify(
        scope_id=sid,
        room_id=room_id,
        node_id=nid,
        ticket_title=ticket_title,
        reason=reason,
    )
    return {"status": "human_intervention", "node_id": nid, "exception": True, **gate}
