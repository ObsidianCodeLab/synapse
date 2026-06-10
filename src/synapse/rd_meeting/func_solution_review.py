"""函数级方案节点：结构化评审 payload、逐条改造方案人工评审与裁决。"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from synapse.rd_meeting.paths import archive_node_dir

logger = logging.getLogger(__name__)

NODE_ID = "func_solution"
STAGE_NAME = "需求设计"
JSON_NAME = "func_solution_review.json"
MD_NAME = "函数级方案.md"
SCHEMA_VERSION = 1
MIN_HUMAN_REVIEW_COMMENT_LEN = 20

PlanReviewStatus = Literal["pending", "approved", "needs_change"]

_FUNC_SOLUTION_HITL_FORBIDDEN = (
    "func_solution 节点禁止使用 submit_hitl_questionnaire。"
    "请先产出 func_solution_review.json 与 函数级方案.md；"
    "人工在「函数级方案评审」面板逐条评审改造方案。"
)
FUNC_SOLUTION_HITL_FORBIDDEN = _FUNC_SOLUTION_HITL_FORBIDDEN

_TABLE_ROW_RE = re.compile(r"^\|(.+)\|$")
_SECTION_RE = re.compile(r"^#{1,4}\s+(.+)$")
_PLAN_HEADING_RE = re.compile(r"^#{3,4}\s+(.+)$", re.MULTILINE)
_BULLET_FIELD_RE = re.compile(
    r"^-\s+(?:\*\*(.+?)\*\*[：:]\s*(.*)|([^：:\*]+)[：:]\s*(.*))$"
)
_MODULE_HEADING_NUM_RE = re.compile(r"^1\.7\.\d+\s+")


def uses_func_solution_gate(node_id: str) -> bool:
    """该节点走专用函数级方案评审门控。"""
    return (node_id or "").strip() == NODE_ID


def archive_dir(scope_id: str) -> Path:
    return archive_node_dir(scope_id, STAGE_NAME, NODE_ID)


def json_path(scope_id: str) -> Path:
    return archive_dir(scope_id) / JSON_NAME


def md_path(scope_id: str) -> Path:
    return archive_dir(scope_id) / MD_NAME


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_json_file(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("func_solution_review json read failed %s: %s", path, exc)
        return None
    return data if isinstance(data, dict) else None


def _write_json_file(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _normalize_plan_row(row: dict[str, Any], *, fallback_id: str) -> dict[str, Any] | None:
    title = str(row.get("title") or row.get("plan_title") or "").strip()
    module = str(row.get("module_name") or row.get("module") or "").strip()
    if not title and not module:
        return None
    req_ref = str(row.get("requirement_ref") or row.get("requirement") or "").strip()
    req_summary = str(row.get("requirement_summary") or row.get("requirement_desc") or "").strip()
    review = row.get("human_review") if isinstance(row.get("human_review"), dict) else {}
    status = str(review.get("status") or "pending").strip().lower()
    if status not in ("pending", "approved", "needs_change"):
        status = "pending"
    evidence = row.get("design_evidence")
    if not isinstance(evidence, list):
        evidence = []
    return {
        "id": str(row.get("id") or fallback_id).strip() or fallback_id,
        "requirement_ref": req_ref,
        "requirement_summary": req_summary,
        "module_name": module,
        "title": title or module,
        "design_rationale": str(row.get("design_rationale") or row.get("rationale") or "").strip(),
        "design_evidence": [str(x).strip() for x in evidence if str(x).strip()],
        "expected_effect": str(row.get("expected_effect") or row.get("effect") or "").strip(),
        "content_markdown": str(row.get("content_markdown") or row.get("content") or "").strip(),
        "human_review": {
            "status": status,
            "comment": str(review.get("comment") or "").strip(),
        },
    }


def _extract_section(md: str, title_keyword: str) -> str:
    lines = (md or "").splitlines()
    start = -1
    level = 0
    kw = title_keyword.strip()
    for i, line in enumerate(lines):
        m = _SECTION_RE.match(line.strip())
        if not m:
            continue
        title = m.group(1).strip()
        lv = len(line) - len(line.lstrip("#"))
        if kw in title or title in kw:
            start = i + 1
            level = lv
            break
    if start < 0:
        return ""
    out: list[str] = []
    for line in lines[start:]:
        m = _SECTION_RE.match(line.strip())
        if m and (len(line) - len(line.lstrip("#"))) <= level:
            break
        out.append(line)
    return "\n".join(out).strip()


def _module_name_from_heading(title: str) -> str:
    text = (title or "").strip()
    if not text:
        return ""
    if _MODULE_HEADING_NUM_RE.match(text):
        return _MODULE_HEADING_NUM_RE.sub("", text).strip()
    if " " in text:
        head = text.split(" ", 1)[0]
        if head.replace(".", "").isdigit() or head.startswith("1.7"):
            return text.split(" ", 1)[-1].strip()
    return text


def _parse_bullet_fields(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in (body or "").splitlines():
        m = _BULLET_FIELD_RE.match(line.strip())
        if not m:
            continue
        key = (m.group(1) or m.group(3) or "").strip()
        val = (m.group(2) if m.group(1) else m.group(4) or "").strip()
        if key:
            fields[key] = val
    return fields


def _build_plan_fields_from_body(body: str, *, module_name: str, title: str) -> dict[str, Any]:
    """从模块改造小节正文提取需求、设计逻辑与依据。"""
    fields = _parse_bullet_fields(body)
    req_summary = fields.get("涉及功能点") or fields.get("功能点") or ""
    req_ref = req_summary.split("；")[0].split("、")[0].strip() if req_summary else ""
    rationale_parts: list[str] = []
    for key in ("改造类型", "职责", "所属层"):
        val = fields.get(key, "").strip()
        if val:
            rationale_parts.append(f"{key}：{val}")
    design_rationale = "；".join(rationale_parts)
    evidence: list[str] = []
    key_files = fields.get("关键文件", "").strip()
    if key_files:
        evidence = [x.strip() for x in re.split(r"[;；,，]", key_files) if x.strip()]
    expected_effect = ""
    if req_summary:
        expected_effect = f"满足需求「{req_summary}」在模块「{module_name}」内的改造落地"
    elif module_name:
        expected_effect = f"完成模块「{module_name}」的函数级改造"
    display_title = module_name or title
    if req_summary and module_name:
        display_title = f"{module_name} · {req_summary[:40]}"
    return {
        "requirement_ref": req_ref,
        "requirement_summary": req_summary,
        "module_name": module_name,
        "title": display_title,
        "design_rationale": design_rationale,
        "design_evidence": evidence,
        "expected_effect": expected_effect,
        "content_markdown": body,
    }


def _parse_plans_from_markdown(md: str) -> list[dict[str, Any]]:
    """从函数级方案 Markdown 解析改造方案（按 #### 1.7.x 模块小节）。"""
    section = _extract_section(md, "模块改造方案")
    if not section:
        section = _extract_section(md, "1.7")
    if not section:
        return []
    headings = list(_PLAN_HEADING_RE.finditer(section))
    if not headings:
        return []
    out: list[dict[str, Any]] = []
    for i, m in enumerate(headings):
        start = m.start()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(section)
        body = section[start:end].strip()
        title = m.group(1).strip()
        module_name = _module_name_from_heading(title)
        derived = _build_plan_fields_from_body(body, module_name=module_name, title=title)
        out.append(
            {
                "id": f"plan-{i + 1}",
                "human_review": {"status": "pending", "comment": ""},
                **derived,
            }
        )
    return out


def _plan_match_key(plan: dict[str, Any]) -> str:
    mod = str(plan.get("module_name") or "").strip().lower()
    title = str(plan.get("title") or "").strip().lower()
    return mod or title


def _merge_plan_fields(target: dict[str, Any], source: dict[str, Any]) -> None:
    """用 Markdown 解析结果补全 JSON 改造方案的空字段。"""
    for key in (
        "requirement_ref",
        "requirement_summary",
        "module_name",
        "title",
        "design_rationale",
        "expected_effect",
        "content_markdown",
    ):
        if not str(target.get(key) or "").strip() and str(source.get(key) or "").strip():
            target[key] = source[key]
    if not target.get("design_evidence") and source.get("design_evidence"):
        target["design_evidence"] = list(source.get("design_evidence") or [])


def _merge_plans_with_markdown(
    plans: list[dict[str, Any]],
    md_plans: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not md_plans:
        return plans
    if not plans:
        return md_plans
    by_key = {_plan_match_key(p): p for p in md_plans if _plan_match_key(p)}
    merged: list[dict[str, Any]] = []
    used_keys: set[str] = set()
    for plan in plans:
        key = _plan_match_key(plan)
        src = by_key.get(key)
        if src:
            _merge_plan_fields(plan, src)
            used_keys.add(key)
        merged.append(plan)
    for j, mp in enumerate(md_plans):
        key = _plan_match_key(mp)
        if key and key in used_keys:
            continue
        extra = dict(mp)
        extra["id"] = extra.get("id") or f"plan-md-{j + 1}"
        merged.append(extra)
    return merged


def _read_context_modules(scope_id: str) -> list[dict[str, Any]]:
    ctx_path = archive_dir(scope_id) / ".tmp" / "function_solution_context.json"
    data = _read_json_file(ctx_path)
    if not data:
        return []
    modules = data.get("modules")
    return [m for m in modules if isinstance(m, dict)] if isinstance(modules, list) else []


def _plans_from_context_modules(modules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, mod in enumerate(modules):
        module_name = str(mod.get("module_name") or "").strip()
        if not module_name:
            continue
        req_summary = str(mod.get("feature_points") or "").strip()
        rationale_parts: list[str] = []
        for key, label in (
            ("change_type", "改造类型"),
            ("responsibility", "职责"),
            ("layer", "所属层"),
        ):
            val = str(mod.get(key) or "").strip()
            if val:
                rationale_parts.append(f"{label}：{val}")
        key_files = str(mod.get("key_files") or "").strip()
        evidence = [x.strip() for x in re.split(r"[;；,，]", key_files) if x.strip()]
        fn_lines: list[str] = []
        for fn in mod.get("functions") or []:
            if not isinstance(fn, dict):
                continue
            sig = str(fn.get("signature") or "").strip()
            if sig:
                fn_lines.append(f"- {sig}（{fn.get('change_type') or '改造'}）")
        content_parts = ["**模块概要**"]
        if rationale_parts:
            content_parts.extend(f"- {p}" for p in rationale_parts)
        if fn_lines:
            content_parts.append("\n**函数设计清单**")
            content_parts.extend(fn_lines)
        internal = str(mod.get("internal_call_graph") or "").strip()
        if internal:
            content_parts.append(f"\n**模块内部调用关系**\n\n{internal}")
        out.append(
            {
                "id": f"plan-ctx-{i + 1}",
                "requirement_ref": req_summary.split("；")[0].split("、")[0].strip() if req_summary else "",
                "requirement_summary": req_summary,
                "module_name": module_name,
                "title": f"{module_name} · {req_summary[:40]}" if req_summary else module_name,
                "design_rationale": "；".join(rationale_parts),
                "design_evidence": evidence,
                "expected_effect": (
                    f"满足需求「{req_summary}」在模块「{module_name}」内的改造落地"
                    if req_summary
                    else f"完成模块「{module_name}」的函数级改造"
                ),
                "content_markdown": "\n".join(content_parts),
                "human_review": {"status": "pending", "comment": ""},
            }
        )
    return out


def format_revision_brief(payload: dict[str, Any], overall_comment: str = "") -> str:
    """将逐条评审意见格式化为重处理原因（注入 room_skill）。"""
    lines: list[str] = []
    overall = (overall_comment or "").strip()
    if overall:
        lines.append(f"【总体】{overall}")
    plans = payload.get("transformation_plans") or []
    for plan in plans:
        if not isinstance(plan, dict):
            continue
        review = plan.get("human_review") if isinstance(plan.get("human_review"), dict) else {}
        if str(review.get("status") or "") != "needs_change":
            continue
        comment = str(review.get("comment") or "").strip()
        if not comment:
            continue
        title = str(plan.get("title") or plan.get("module_name") or "改造方案").strip()
        mod = str(plan.get("module_name") or "").strip()
        req = str(plan.get("requirement_summary") or plan.get("requirement_ref") or "").strip()
        meta = " · ".join(x for x in (f"模块={mod}" if mod else "", f"需求={req}" if req else "") if x)
        lines.append(f"【{title}】{meta}：{comment}" if meta else f"【{title}】：{comment}")
    if lines:
        lines.insert(0, "函数级方案评审未通过，请按下列意见调整对应改造方案后重新落盘：")
    return "\n".join(lines).strip()


def _normalize_overview(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    diagrams = raw.get("diagrams")
    if not isinstance(diagrams, list):
        diagrams = raw.get("flow_diagrams")
    if not isinstance(diagrams, list):
        diagrams = []
    norm_diagrams: list[dict[str, str]] = []
    for i, d in enumerate(diagrams):
        if not isinstance(d, dict):
            continue
        mermaid = str(d.get("mermaid") or d.get("source") or "").strip()
        if not mermaid:
            continue
        norm_diagrams.append(
            {
                "id": str(d.get("id") or f"diagram-{i + 1}").strip(),
                "title": str(d.get("title") or f"图 {i + 1}").strip(),
                "kind": str(d.get("kind") or "flowchart").strip(),
                "mermaid": mermaid,
            }
        )
    return {
        "architecture_summary": str(
            raw.get("architecture_summary") or raw.get("summary") or ""
        ).strip(),
        "diagrams": norm_diagrams,
    }


def _normalize_consistency(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}
    checks = raw.get("contradiction_checks")
    if not isinstance(checks, list):
        checks = []
    notes = raw.get("compatibility_notes")
    if not isinstance(notes, list):
        notes = []
    return {
        "summary": str(raw.get("summary") or "").strip(),
        "compatibility_notes": [str(x).strip() for x in notes if str(x).strip()],
        "contradiction_checks": [
            str(x).strip() for x in checks if str(x).strip()
        ],
    }


def normalize_payload(data: dict[str, Any]) -> dict[str, Any]:
    """规范化 func_solution_review.json 结构。"""
    plans_raw = data.get("transformation_plans")
    if not isinstance(plans_raw, list):
        plans_raw = data.get("plans")
    if not isinstance(plans_raw, list):
        plans_raw = []
    plans: list[dict[str, Any]] = []
    for i, row in enumerate(plans_raw):
        if not isinstance(row, dict):
            continue
        norm = _normalize_plan_row(row, fallback_id=f"plan-{i + 1}")
        if norm:
            plans.append(norm)

    hr = data.get("human_review") if isinstance(data.get("human_review"), dict) else {}
    status = str(hr.get("status") or "pending").strip().lower()
    if status not in ("pending", "approved", "rejected", "needs_revision"):
        status = "pending"
    return {
        "schema_version": int(data.get("schema_version") or SCHEMA_VERSION),
        "demand_no": str(data.get("demand_no") or "").strip(),
        "requirement_name": str(data.get("requirement_name") or "").strip(),
        "reviewed_at": str(data.get("reviewed_at") or "").strip() or None,
        "overview": _normalize_overview(data.get("overview")),
        "consistency_analysis": _normalize_consistency(data.get("consistency_analysis")),
        "transformation_plans": plans,
        "human_review": {
            "status": status,
            "comment": str(hr.get("comment") or "").strip(),
            "decided_at": hr.get("decided_at"),
        },
    }


def enrich_payload_from_archive(scope_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """从 函数级方案.md / context JSON 补全或增强 transformation_plans。"""
    out = normalize_payload(payload)
    fpath = md_path(scope_id)
    md = ""
    if fpath.is_file():
        try:
            md = fpath.read_text(encoding="utf-8")
        except OSError:
            md = ""

    md_plans = _parse_plans_from_markdown(md) if md else []
    ctx_plans = _plans_from_context_modules(_read_context_modules(scope_id))

    if out["transformation_plans"]:
        out["transformation_plans"] = _merge_plans_with_markdown(out["transformation_plans"], md_plans)
        if ctx_plans:
            out["transformation_plans"] = _merge_plans_with_markdown(
                out["transformation_plans"], ctx_plans
            )
    elif md_plans:
        out["transformation_plans"] = md_plans
    elif ctx_plans:
        out["transformation_plans"] = ctx_plans

    if md and not out["overview"]["architecture_summary"]:
        overview_sec = (
            _extract_section(md, "改造范围概述")
            or _extract_section(md, "总览")
            or _extract_section(md, "方案总览")
        )
        if overview_sec:
            out["overview"]["architecture_summary"] = overview_sec[:2000]
    return out


def load_func_solution_review_payload(scope_id: str) -> dict[str, Any] | None:
    data = _read_json_file(json_path(scope_id))
    if not data:
        return None
    return enrich_payload_from_archive(scope_id, data)


def validate_func_solution_review_json(scope_id: str) -> tuple[bool, list[str]]:
    errors: list[str] = []
    jpath = json_path(scope_id)
    mpath = md_path(scope_id)
    if not mpath.is_file():
        errors.append(f"缺少约定产出物：{MD_NAME}")
    if not jpath.is_file():
        errors.append(f"缺少结构化评审产物：{JSON_NAME}")
        return False, errors
    data = load_func_solution_review_payload(scope_id)
    if not data:
        errors.append(f"{JSON_NAME} 无法解析")
        return False, errors
    if not data.get("transformation_plans"):
        errors.append("transformation_plans 为空")
    overview = data.get("overview") if isinstance(data.get("overview"), dict) else {}
    diagrams = overview.get("diagrams") if isinstance(overview.get("diagrams"), list) else []
    if not diagrams and not str(overview.get("architecture_summary") or "").strip():
        errors.append("overview 须包含 mermaid 图或 architecture_summary")
    for i, plan in enumerate(data.get("transformation_plans") or []):
        if not str(plan.get("module_name") or "").strip():
            errors.append(f"plan[{i}] 缺少 module_name")
        if not str(plan.get("design_rationale") or "").strip():
            errors.append(f"plan[{i}] 缺少 design_rationale")
        if not str(plan.get("expected_effect") or "").strip():
            errors.append(f"plan[{i}] 缺少 expected_effect")
    return len(errors) == 0, errors


def ensure_human_review_pending_for_gate(
    scope_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    out = normalize_payload(payload)
    hr = out.get("human_review") if isinstance(out.get("human_review"), dict) else {}
    if str(hr.get("status") or "pending") == "approved":
        return out
    hr["status"] = "pending"
    hr.setdefault("comment", "")
    hr["decided_at"] = None
    out["human_review"] = hr
    for plan in out.get("transformation_plans") or []:
        pr = plan.get("human_review") if isinstance(plan.get("human_review"), dict) else {}
        if str(pr.get("status") or "pending") != "approved":
            pr["status"] = "pending"
        plan["human_review"] = pr
    _write_json_file(json_path(scope_id), out)
    return out


def save_plan_reviews(
    scope_id: str,
    plan_updates: list[dict[str, Any]],
) -> dict[str, Any]:
    payload = load_func_solution_review_payload(scope_id)
    if not payload:
        raise ValueError("func_solution_review_not_found")
    by_id = {str(p.get("id") or ""): p for p in payload.get("transformation_plans") or []}
    for upd in plan_updates:
        if not isinstance(upd, dict):
            continue
        pid = str(upd.get("id") or "").strip()
        if not pid or pid not in by_id:
            continue
        plan = by_id[pid]
        pr = plan.get("human_review") if isinstance(plan.get("human_review"), dict) else {}
        if "status" in upd:
            st = str(upd.get("status") or "pending").strip().lower()
            if st in ("pending", "approved", "needs_change"):
                pr["status"] = st
        if "comment" in upd:
            pr["comment"] = str(upd.get("comment") or "").strip()
        plan["human_review"] = pr
    _write_json_file(json_path(scope_id), payload)
    return payload


def apply_human_decision(
    scope_id: str,
    *,
    decision: Literal["approve", "revise"],
    comment: str = "",
    plan_updates: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload = load_func_solution_review_payload(scope_id)
    if not payload:
        raise ValueError("func_solution_review_not_found")
    if plan_updates:
        save_plan_reviews(scope_id, plan_updates)
        payload = load_func_solution_review_payload(scope_id) or payload

    plans = payload.get("transformation_plans") or []
    if decision == "approve":
        pending = [
            p for p in plans if str((p.get("human_review") or {}).get("status") or "") != "approved"
        ]
        if pending:
            raise ValueError("not_all_plans_approved")
        if len(comment.strip()) < MIN_HUMAN_REVIEW_COMMENT_LEN:
            raise ValueError("comment_too_short")
        payload["human_review"] = {
            "status": "approved",
            "comment": comment.strip(),
            "decided_at": _now_iso(),
        }
        payload["reviewed_at"] = _now_iso()
    else:
        needs_change = [
            p
            for p in plans
            if str((p.get("human_review") or {}).get("status") or "") == "needs_change"
        ]
        if not needs_change:
            raise ValueError("no_plans_need_change")
        missing_comment = [
            p
            for p in needs_change
            if not str((p.get("human_review") or {}).get("comment") or "").strip()
        ]
        if missing_comment:
            raise ValueError("plan_comment_required")
        payload["human_review"] = {
            "status": "needs_revision",
            "comment": comment.strip(),
            "decided_at": _now_iso(),
        }
        payload["reviewed_at"] = _now_iso()
    _write_json_file(json_path(scope_id), payload)
    return payload
