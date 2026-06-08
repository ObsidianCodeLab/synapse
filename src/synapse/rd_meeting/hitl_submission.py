"""人机问卷提交：解析、落地、锁定（提交后不可再改）。"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from synapse.rd_meeting.room_runtime import load_room_state, save_room_state

_HITL_FORM_PREFIX = "[人工确认表单]"
_FIELD_KEY_LINE = re.compile(r"^([a-zA-Z][a-zA-Z0-9_-]*):\s*(.*)$")


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _looks_like_field_key(key: str) -> bool:
    return bool(re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_-]*", key or ""))


def _coerce_parsed_field_value(raw: str) -> Any:
    """将单行或多行字段原始文本转为 str / list。"""
    s = (raw or "").strip()
    if not s:
        return s
    if s[0] in "[{\"":
        try:
            parsed = json.loads(s)
            if isinstance(parsed, (str, list)):
                return parsed
        except json.JSONDecodeError:
            pass
    if s.startswith("OTHER:"):
        return s[6:].strip() or s
    if "," in s and "\n" not in s:
        return [p.strip() for p in s.split(",") if p.strip()]
    return s


def _assign_parsed_field(values: dict[str, Any], key: str, raw: str) -> None:
    val = _coerce_parsed_field_value(raw)
    if key.lower() == "decision":
        return
    values[key] = val


def parse_hitl_form_text(text: str) -> tuple[dict[str, Any], str, str | None]:
    """解析 ``[人工确认表单]`` 文本 → (values, comment, decision)。

    values 键为题 id；值为 str / list（多选逗号分隔已拆成 list 时由调用方处理）。
    decision 取自 ``decision`` 题或文本中的 decision: 行。

    支持：
    - 多行 ``textarea`` / ``human_supplement``（续行无 ``key:`` 前缀时并入上一字段）
    - 前端 ``JSON.stringify`` 编码的多行/多选值
    """
    raw = (text or "").strip()
    if not raw.startswith(_HITL_FORM_PREFIX):
        return {}, raw, None

    values: dict[str, Any] = {}
    comment_parts: list[str] = []
    decision: str | None = None
    current_key: str | None = None
    current_lines: list[str] = []

    def flush_field() -> None:
        nonlocal current_key, current_lines
        if not current_key:
            return
        _assign_parsed_field(values, current_key, "\n".join(current_lines))
        current_key = None
        current_lines = []

    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("["):
            continue
        if stripped.lower().startswith("decision:"):
            flush_field()
            decision = stripped.split(":", 1)[-1].strip().lower()
            continue
        if stripped.startswith("补充说明:") or stripped.lower().startswith("comment:"):
            flush_field()
            comment_parts.append(stripped.split(":", 1)[-1].strip())
            continue

        matched = _FIELD_KEY_LINE.match(stripped)
        if matched:
            key = matched.group(1).strip()
            rest = matched.group(2)
            if _looks_like_field_key(key):
                flush_field()
                current_key = key
                current_lines = [rest] if rest else []
                continue

        if current_key:
            current_lines.append(stripped)

    flush_field()

    if decision is None and "decision" in values:
        decision = str(values.pop("decision")).lower()

    comment = "\n".join(comment_parts).strip()
    return values, comment, decision


def record_hitl_submission_locked(
    scope_id: str,
    *,
    raw_text: str,
    values: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """落地并锁定问卷提交；返回写入的 submission 对象。"""
    sid = (scope_id or "").strip()
    if not sid:
        raise ValueError("scope_id required")

    parsed_values, _, _ = parse_hitl_form_text(raw_text)
    merged = dict(parsed_values)
    if values:
        merged.update(values)

    rs = dict(load_room_state(sid) or {})
    kind = str(rs.get("intervention_kind") or "interactive").strip().lower()
    schema = rs.get("hitl_form_schema") if isinstance(rs.get("hitl_form_schema"), dict) else None

    rules_meta: dict[str, str] | None
    try:
        from synapse.rd_meeting.room_skill import get_meeting_room_rules_meta

        rules_meta = get_meeting_room_rules_meta()
    except Exception:
        rules_meta = None

    submission = {
        "locked": True,
        "submitted_at": _now_iso(),
        "values": merged,
        "raw_text": raw_text.strip(),
        "kind": kind,
        "schema_snapshot": schema,
        "rules_meta": rules_meta,
    }
    rs["hitl_submission"] = submission
    rs["hitl_locked"] = True
    rs.pop("hitl_form_schema", None)
    rs.pop("pending_questionnaire", None)
    save_room_state(sid, rs)
    return submission


def load_archive_delivery_body(scope_id: str, node_id: str) -> str:
    """读取归档目录下主交付 Markdown（供 result_confirm 归档校验）。"""
    from synapse.rd_meeting.paths import archive_node_dir
    from synapse.rd_sop.manifest import node_output_artifacts
    from synapse.rd_sop.nodes import stage_id_for_node_id, stage_name_for_id

    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or not nid:
        return ""
    stage_name = stage_name_for_id(stage_id_for_node_id(nid))
    dest = archive_node_dir(sid, stage_name, nid)
    if not dest.is_dir():
        return ""

    candidates: list[str] = []
    for name in node_output_artifacts(nid):
        if isinstance(name, str) and name.lower().endswith(".md") and not name.startswith("（"):
            candidates.append(name)

    for name in candidates:
        path = dest / name
        if path.is_file():
            try:
                body = path.read_text(encoding="utf-8").strip()
            except OSError:
                continue
            if body:
                return body
    return ""


def format_hitl_form_instruction(
    values: dict[str, Any],
    *,
    comment: str = "",
    schema: dict[str, Any] | None = None,
) -> str:
    """将结构化表单答案格式化为 host 可读的指令块。"""
    if schema:
        from synapse.rd_meeting.hitl_feedback import format_hitl_feedback_structured

        return format_hitl_feedback_structured(values, schema, comment=comment)

    lines = [_HITL_FORM_PREFIX, ""]
    for k, v in values.items():
        if isinstance(v, list):
            lines.append(f"{k}: {', '.join(str(x) for x in v)}")
        else:
            lines.append(f"{k}: {v}")
    if comment.strip():
        lines.append(f"补充说明: {comment.strip()}")
    return "\n".join(lines)
