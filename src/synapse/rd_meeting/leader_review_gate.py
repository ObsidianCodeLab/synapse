"""研发组长评审节点：专用门控（不走通用 node_review 确认总结）。"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from synapse.rd_meeting.paths import archive_node_dir
from synapse.rd_sop.nodes import stage_name_for_id, stage_id_for_node_id

logger = logging.getLogger(__name__)

NODE_ID = "leader_review"
JSON_NAME = "leader_review.json"
HTML_NAME = "研发组长评审报告.html"
AI_REVIEW_NAME = "ai_review.md"


def uses_leader_review_gate(node_id: str) -> bool:
    """该节点走研发组长评审专用面板，不走 NODE_REVIEW / generate_agent_summaries。"""
    return (node_id or "").strip() == NODE_ID


def archive_dir(scope_id: str) -> Path:
    stage_name = stage_name_for_id(stage_id_for_node_id(NODE_ID))
    return archive_node_dir(scope_id, stage_name, NODE_ID)


def validate_leader_review_artifacts(scope_id: str) -> tuple[bool, list[str]]:
    """校验 AI 阶段应落盘的三件套是否存在且可读。"""
    base = archive_dir(scope_id)
    errors: list[str] = []
    json_path = base / JSON_NAME
    html_path = base / HTML_NAME
    ai_path = base / AI_REVIEW_NAME

    if not json_path.is_file():
        errors.append(f"缺少 {JSON_NAME}")
    else:
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                errors.append(f"{JSON_NAME} 不是 JSON 对象")
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{JSON_NAME} 无法解析：{exc}")

    if not html_path.is_file():
        errors.append(f"缺少 {HTML_NAME}")
    elif html_path.stat().st_size < 512:
        errors.append(f"{HTML_NAME} 体积过小（<512B）")

    if not ai_path.is_file():
        errors.append(f"缺少 {AI_REVIEW_NAME}")
    elif ai_path.stat().st_size < 200:
        errors.append(f"{AI_REVIEW_NAME} 体积过小（<200B）")

    return (len(errors) == 0, errors)


def load_leader_review_html(scope_id: str) -> str:
    """读取自动化研发报告 HTML，供前端 iframe 展示。"""
    path = archive_dir(scope_id) / HTML_NAME
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("leader_review html read failed scope=%s: %s", scope_id, exc)
        return ""


def build_leader_review_gate_payload(scope_id: str) -> dict[str, Any]:
    """组装 pending_delivery 扩展字段（可选）。"""
    ok, errors = validate_leader_review_artifacts(scope_id)
    return {
        "artifacts_ready": ok,
        "validation_errors": errors,
        "html_report_path": str(archive_dir(scope_id) / HTML_NAME),
    }


def load_leader_review_task_nos(scope_id: str) -> list[str]:
    """从 userwork.json 读取需求单下研发子单号列表。"""
    sid = (scope_id or "").strip()
    if not sid:
        return []
    try:
        from synapse.rd_meeting.auto_split_gate import existing_owned_tasks

        rows = existing_owned_tasks("demand", sid)
        return [str(r.get("task_no") or "").strip() for r in rows if str(r.get("task_no") or "").strip()]
    except Exception as exc:
        logger.warning("leader_review task_nos read failed scope=%s: %s", sid, exc)
        return []


def is_demand_merge_completed(scope_id: str, task_nos: list[str] | None = None) -> bool:
    """需求单 local_process_state=已完成 且目标研发单均为提交完成/已完成。"""
    sid = (scope_id or "").strip()
    if not sid:
        return False
    try:
        from synapse.api.routes.dev_iwhalecloud import (
            OWNED_WORK_ITEM_STATE_COMMIT_DONE,
            OWNED_WORK_ITEM_STATE_COMPLETED,
            _normalize_owned_work_item_state,
            _snapshot_norm_id,
        )
        from synapse.rd_meeting.init_context import get_userwork_row

        row = get_userwork_row("demand", sid) or {}
        if _snapshot_norm_id(row.get("local_process_state")) != OWNED_WORK_ITEM_STATE_COMPLETED:
            return False
        owned = row.get("owned_work_items")
        if not isinstance(owned, list) or not owned:
            return False
        targets = {_snapshot_norm_id(t) for t in (task_nos or []) if _snapshot_norm_id(t)}
        checked = False
        for item in owned:
            if not isinstance(item, dict):
                continue
            tn = _snapshot_norm_id(item.get("task_no"))
            if targets and tn not in targets:
                continue
            checked = True
            state = _normalize_owned_work_item_state(item.get("state"))
            if state not in (OWNED_WORK_ITEM_STATE_COMMIT_DONE, OWNED_WORK_ITEM_STATE_COMPLETED):
                return False
        return checked if targets else True
    except Exception as exc:
        logger.warning("is_demand_merge_completed failed scope=%s: %s", sid, exc)
        return False


def load_leader_review_panel_payload(scope_id: str) -> dict[str, Any]:
    """供前端 LeaderReviewSopPanel 拉取：归档 HTML + 研发单号 + prod。"""
    sid = (scope_id or "").strip()
    ok, errors = validate_leader_review_artifacts(sid)
    prod = ""
    try:
        from synapse.rd_meeting.init_context import get_userwork_row

        row = get_userwork_row("demand", sid) or {}
        prod = str(row.get("prod") or "").strip()
    except Exception:
        prod = ""
    task_nos = load_leader_review_task_nos(sid)
    return {
        "report_html": load_leader_review_html(sid),
        "task_nos": task_nos,
        "prod": prod,
        "artifacts_ready": ok,
        "validation_errors": errors,
        "merge_completed": is_demand_merge_completed(sid, task_nos),
    }
