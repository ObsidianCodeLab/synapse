"""函数级方案节点：结构化评审 payload、逐条改造方案人工评审与裁决。"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import shutil
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from synapse.rd_meeting.paths import archive_node_dir

logger = logging.getLogger(__name__)

NODE_ID = "func_solution"
STAGE_NAME = "需求设计"
JSON_NAME = "func_solution_review.json"
REVISION_CONTEXT_NAME = "revision_context.json"
MD_NAME = "函数级方案.md"
SCHEMA_VERSION = 1
REVISION_CONTEXT_SCHEMA_VERSION = 1
_PLAN_SUMMARY_MAX_LEN = 240
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
_MERMAID_BLOCK_RE = re.compile(r"```mermaid\s*\n(.*?)```", re.DOTALL | re.IGNORECASE)
_MIN_MERMAID_SOURCE_LEN = 12
_MIN_ARCHITECTURE_SUMMARY_LEN = 20
_MERMAID_PLACEHOLDER_RE = re.compile(r"\b(?:TODO|TBD|占位符?|placeholder)\b", re.IGNORECASE)
_MERMAID_DECL_LINE_RE = re.compile(
    r"^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt)\b",
    re.IGNORECASE,
)
_MIN_DIAGRAM_COUNT = 2

# LLM 生成 flowchart 时最高频的语法错误：节点矩形标签 `id[text]` 中
# text 含 {}()/\ 等特殊字符却未加引号，mermaid 会解析失败。
# 仅处理最常见的方括号矩形节点：捕获 节点ID + `[` + 标签 + `]`，
# 标签未以引号开头且不含 [] " 时，若含特殊字符则补引号（确定性修复，零 LLM 往返）。
_MERMAID_RECT_LABEL_RE = re.compile(r"([A-Za-z0-9_\u4e00-\u9fff]+)\[([^\[\]\"\n]+)\]")
_MERMAID_LABEL_SPECIAL_RE = re.compile(r"[{}()/\\]")


def uses_func_solution_gate(node_id: str) -> bool:
    """该节点走专用函数级方案评审门控。"""
    return (node_id or "").strip() == NODE_ID


def archive_dir(scope_id: str) -> Path:
    return archive_node_dir(scope_id, STAGE_NAME, NODE_ID)


def json_path(scope_id: str) -> Path:
    return archive_dir(scope_id) / JSON_NAME


def md_path(scope_id: str) -> Path:
    return archive_dir(scope_id) / MD_NAME


def revision_context_path(scope_id: str) -> Path:
    return archive_dir(scope_id) / REVISION_CONTEXT_NAME


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


_CONTENT_SECTION_MARKERS = (
    "**模块概要**",
    "**函数设计清单**",
    "**函数伪代码**",
    "**模块内部调用关系**",
)


def _content_markdown_is_structured(text: str) -> bool:
    """评审面板 PlanTransformationContent 依赖 **小节** 或 1.7.x 标题切分四类卡片。"""
    t = (text or "").strip()
    if not t:
        return False
    if any(marker in t for marker in _CONTENT_SECTION_MARKERS):
        return True
    return bool(_PLAN_HEADING_RE.search(t))


def _merge_plan_fields(target: dict[str, Any], source: dict[str, Any]) -> None:
    """用 Markdown 解析结果补全 JSON 改造方案的空字段。"""
    for key in (
        "requirement_ref",
        "requirement_summary",
        "module_name",
        "title",
        "design_rationale",
        "expected_effect",
    ):
        if not str(target.get(key) or "").strip() and str(source.get(key) or "").strip():
            target[key] = source[key]
    src_body = str(source.get("content_markdown") or "").strip()
    tgt_body = str(target.get("content_markdown") or "").strip()
    if src_body and (not tgt_body or not _content_markdown_is_structured(tgt_body)):
        target["content_markdown"] = source["content_markdown"]
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


def _plan_content_snapshot(plan: dict[str, Any]) -> str:
    """已通过改造方案的内容指纹（供 revision_context 冻结校验）。"""
    raw = json.dumps(
        {
            "module_name": str(plan.get("module_name") or "").strip(),
            "title": str(plan.get("title") or "").strip(),
            "design_rationale": str(plan.get("design_rationale") or "").strip(),
            "expected_effect": str(plan.get("expected_effect") or "").strip(),
            "content_markdown": str(plan.get("content_markdown") or "").strip(),
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _plan_immutable_summary(plan: dict[str, Any]) -> str:
    """已通过改造方案的简短摘要（供 revision_context 冻结说明）。"""
    for key in ("design_rationale", "expected_effect", "content_markdown"):
        text = str(plan.get(key) or "").strip()
        if text:
            one_line = " ".join(text.split())
            if len(one_line) > _PLAN_SUMMARY_MAX_LEN:
                return one_line[: _PLAN_SUMMARY_MAX_LEN - 1] + "…"
            return one_line
    title = str(plan.get("title") or plan.get("module_name") or "").strip()
    return title or "（无摘要）"


def build_revision_context(
    payload: dict[str, Any],
    overall_comment: str = "",
) -> dict[str, Any]:
    """构建函数级方案增量修订上下文（写入 revision_context.json）。"""
    plans = payload.get("transformation_plans") or []
    plans_to_revise: list[dict[str, Any]] = []
    approved_plans: list[dict[str, Any]] = []
    for plan in plans:
        if not isinstance(plan, dict):
            continue
        pid = str(plan.get("id") or "").strip()
        review = plan.get("human_review") if isinstance(plan.get("human_review"), dict) else {}
        status = str(review.get("status") or "").strip().lower()
        base = {
            "id": pid,
            "title": str(plan.get("title") or "").strip(),
            "module_name": str(plan.get("module_name") or "").strip(),
            "requirement_ref": str(plan.get("requirement_ref") or "").strip(),
            "requirement_summary": str(plan.get("requirement_summary") or "").strip(),
        }
        if status == "needs_change":
            plans_to_revise.append(
                {
                    **base,
                    "comment": str(review.get("comment") or "").strip(),
                }
            )
        elif status == "approved":
            approved_plans.append(
                {
                    **base,
                    "summary": _plan_immutable_summary(plan),
                    "content_snapshot": _plan_content_snapshot(plan),
                }
            )
    return {
        "schema_version": REVISION_CONTEXT_SCHEMA_VERSION,
        "node_id": NODE_ID,
        "created_at": _now_iso(),
        "overall_comment": (overall_comment or "").strip(),
        "plans_to_revise": plans_to_revise,
        "approved_plans": approved_plans,
        "archive_files": {
            "review_json": JSON_NAME,
            "markdown": MD_NAME,
            "revision_context": REVISION_CONTEXT_NAME,
        },
    }


def write_revision_context(
    scope_id: str,
    payload: dict[str, Any],
    overall_comment: str = "",
) -> dict[str, Any]:
    ctx = build_revision_context(payload, overall_comment)
    if not ctx.get("plans_to_revise"):
        raise ValueError("no_plans_need_change")
    _write_json_file(revision_context_path(scope_id), ctx)
    logger.info(
        "func_solution_revision: wrote %s scope=%s revise=%d approved=%d",
        REVISION_CONTEXT_NAME,
        scope_id,
        len(ctx.get("plans_to_revise") or []),
        len(ctx.get("approved_plans") or []),
    )
    return ctx


def load_revision_context(scope_id: str) -> dict[str, Any] | None:
    return _read_json_file(revision_context_path(scope_id))


def has_revision_context(scope_id: str) -> bool:
    return revision_context_path(scope_id).is_file()


def clear_revision_context(scope_id: str) -> None:
    path = revision_context_path(scope_id)
    if path.is_file():
        try:
            path.unlink()
            logger.info("func_solution_revision: cleared %s scope=%s", REVISION_CONTEXT_NAME, scope_id)
        except OSError as exc:
            logger.warning("func_solution_revision: clear failed %s: %s", path, exc)


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
        # LLM 实际产出常用 content/code/diagram/definition 等别名承载 mermaid 源，
        # type 承载图类型；此处统一兼容，避免有效图被静默丢弃导致「至少 2 张」误判。
        mermaid = str(
            d.get("mermaid")
            or d.get("source")
            or d.get("content")
            or d.get("code")
            or d.get("diagram")
            or d.get("definition")
            or ""
        ).strip()
        if not mermaid:
            continue
        norm_diagrams.append(
            {
                "id": str(d.get("id") or f"diagram-{i + 1}").strip(),
                "title": str(d.get("title") or f"图 {i + 1}").strip(),
                "kind": str(d.get("kind") or d.get("type") or "flowchart").strip(),
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
    # 增量修订：marked plan 的 content_markdown 以 MD §1.7.N 为唯一真相源强制回灌，
    # 消灭「JSON 面板旧正文 + MD §1.7 已改」两套并存（--patch-modules 已保证 §1.7 正确）。
    _backfill_marked_plans_from_md(scope_id, out, md_plans)
    return out


def _backfill_marked_plans_from_md(
    scope_id: str,
    payload: dict[str, Any],
    md_plans: list[dict[str, Any]],
) -> None:
    """修订模式下，用 MD §1.7.N 正文强制覆盖 marked plan 的 content_markdown。"""
    if not has_revision_context(scope_id) or not md_plans:
        return
    ctx = load_revision_context(scope_id)
    if not isinstance(ctx, dict):
        return
    to_revise = ctx.get("plans_to_revise")
    if not isinstance(to_revise, list) or not to_revise:
        return
    marked_ids = {str(r.get("id") or "").strip() for r in to_revise if isinstance(r, dict)}
    md_by_key = {_plan_match_key(p): p for p in md_plans if _plan_match_key(p)}
    for plan in payload.get("transformation_plans") or []:
        if not isinstance(plan, dict):
            continue
        if str(plan.get("id") or "").strip() not in marked_ids:
            continue
        src = md_by_key.get(_plan_match_key(plan))
        body = str((src or {}).get("content_markdown") or "").strip()
        if body and _content_markdown_is_structured(body):
            plan["content_markdown"] = src["content_markdown"]


def load_func_solution_review_payload(scope_id: str) -> dict[str, Any] | None:
    data = _read_json_file(json_path(scope_id))
    if not data:
        return None
    return enrich_payload_from_archive(scope_id, data)


def _infer_diagram_kind(mermaid: str) -> str:
    first = (mermaid or "").split("\n", 1)[0].strip().lower()
    if "sequencediagram" in first:
        return "sequenceDiagram"
    if first.startswith("graph"):
        return "graph"
    if "flowchart" in first:
        return "flowchart"
    return "other"


def _diagram_label(diagram: dict[str, Any], index: int) -> str:
    return str(diagram.get("id") or diagram.get("title") or f"diagram-{index + 1}").strip()


def _validate_mermaid_diagrams_structure(diagrams: list[Any]) -> list[str]:
    """结构门控：数量、类型组合、非空与非占位。"""
    errors: list[str] = []
    norm: list[dict[str, Any]] = [d for d in diagrams if isinstance(d, dict)]
    if len(norm) < _MIN_DIAGRAM_COUNT:
        errors.append(
            f"overview.diagrams 至少需要 {_MIN_DIAGRAM_COUNT} 张 Mermaid 图"
            "（flowchart + graph/sequenceDiagram）"
        )
        return errors

    kinds: set[str] = set()
    for i, diagram in enumerate(norm):
        label = _diagram_label(diagram, i)
        mermaid = str(diagram.get("mermaid") or "").strip()
        if not mermaid:
            errors.append(f"diagram[{label}] mermaid 为空")
            continue
        if len(mermaid) < _MIN_MERMAID_SOURCE_LEN:
            errors.append(f"diagram[{label}] mermaid 过短（至少 {_MIN_MERMAID_SOURCE_LEN} 字符）")
        if _MERMAID_PLACEHOLDER_RE.search(mermaid):
            errors.append(f"diagram[{label}] 含占位符，须填写可渲染的真实图表")
        first_line = mermaid.split("\n", 1)[0].strip()
        if not _MERMAID_DECL_LINE_RE.match(first_line):
            errors.append(
                f"diagram[{label}] 首行须为合法 Mermaid 声明"
                "（flowchart / graph / sequenceDiagram 等）"
            )
        kinds.add(_infer_diagram_kind(mermaid))

    if "flowchart" not in kinds:
        errors.append("overview.diagrams 须包含 flowchart 类型图（主业务流程/改造流程）")
    if "graph" not in kinds and "sequenceDiagram" not in kinds:
        errors.append(
            "overview.diagrams 须包含 graph 或 sequenceDiagram 类型图（模块关系或关键时序）"
        )
    return errors


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _local_mmdc_executable() -> Path | None:
    """``apps/setup-center`` 内 ``npm install`` 后的 mmdc（见 package.json devDependencies）。"""
    bin_dir = _repo_root() / "apps" / "setup-center" / "node_modules" / ".bin"
    for name in ("mmdc.cmd", "mmdc"):
        candidate = bin_dir / name
        if candidate.is_file():
            return candidate
    return None


def _resolve_mmdc_argv() -> list[str] | None:
    """解析 mmdc：PATH 全局 → setup-center 本地 node_modules → npx 拉取。"""
    mmdc = shutil.which("mmdc")
    if mmdc:
        return [mmdc]
    local = _local_mmdc_executable()
    if local:
        return [str(local)]
    npx = shutil.which("npx")
    if npx:
        return [npx, "-y", "@mermaid-js/mermaid-cli", "mmdc"]
    return None


def _validate_mermaid_syntax_with_mmdc(mermaid: str, *, diagram_id: str) -> str | None:
    """mmdc 语法门控：可渲染则返回 None，否则返回错误文案。"""
    argv_prefix = _resolve_mmdc_argv()
    if not argv_prefix:
        return None

    with tempfile.TemporaryDirectory(prefix="synapse-mermaid-") as tmp:
        tmp_path = Path(tmp)
        inp = tmp_path / "diagram.mmd"
        out = tmp_path / "diagram.svg"
        inp.write_text(mermaid, encoding="utf-8")
        cmd = [*argv_prefix, "-i", str(inp), "-o", str(out)]
        run_kwargs: dict[str, Any] = {
            "capture_output": True,
            "text": True,
            "encoding": "utf-8",
            "errors": "replace",
            "timeout": 60,
        }
        if hasattr(subprocess, "CREATE_NO_WINDOW"):
            run_kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        try:
            proc = subprocess.run(cmd, **run_kwargs)
        except subprocess.TimeoutExpired:
            return f"diagram[{diagram_id}] Mermaid 语法校验超时"
        except (FileNotFoundError, OSError) as exc:
            return f"diagram[{diagram_id}] Mermaid 语法校验失败: {exc}"

        if proc.returncode != 0:
            msg = (proc.stderr or proc.stdout or "").strip().replace("\n", " ")
            if len(msg) > 240:
                msg = msg[:240] + "…"
            return f"diagram[{diagram_id}] Mermaid 语法错误: {msg or 'mmdc 退出非零'}"
    return None


def _sanitize_mermaid_source(mermaid: str) -> str:
    """确定性修复：给含特殊字符的方括号节点标签补引号（如 ``J[/bake/{iNo}]`` → ``J["/bake/{iNo}"]``）。"""

    def _repl(m: re.Match[str]) -> str:
        node_id, label = m.group(1), m.group(2)
        if not _MERMAID_LABEL_SPECIAL_RE.search(label):
            return m.group(0)
        return f'{node_id}["{label.strip()}"]'

    return _MERMAID_RECT_LABEL_RE.sub(_repl, mermaid)


def sanitize_mermaid_diagrams(diagrams: list[Any]) -> bool:
    """就地清洗每张图的 mermaid 源；有改动返回 True（供调用方决定是否回写）。"""
    changed = False
    for diagram in diagrams:
        if not isinstance(diagram, dict):
            continue
        original = str(diagram.get("mermaid") or "")
        if not original.strip():
            continue
        fixed = _sanitize_mermaid_source(original)
        if fixed != original:
            diagram["mermaid"] = fixed
            changed = True
    return changed


def sanitize_func_solution_review_diagrams(scope_id: str) -> bool:
    """读取 func_solution_review.json，清洗 overview.diagrams 标签并按需回写。"""
    data = load_func_solution_review_payload(scope_id)
    if not isinstance(data, dict):
        return False
    overview = data.get("overview") if isinstance(data.get("overview"), dict) else None
    if not isinstance(overview, dict):
        return False
    diagrams = overview.get("diagrams")
    if not isinstance(diagrams, list):
        return False
    if not sanitize_mermaid_diagrams(diagrams):
        return False
    _write_json_file(json_path(scope_id), data)
    logger.info("func_solution_review: 已确定性清洗 mermaid 标签并回写 %s", scope_id)
    return True


def _validate_mermaid_diagrams_syntax(diagrams: list[Any]) -> list[str]:
    """对每张图执行 mmdc 语法校验；环境无 mmdc 时跳过门控（降级为非硬错误）。"""
    argv_prefix = _resolve_mmdc_argv()
    if not argv_prefix:
        logger.warning(
            "func_solution_review: 未找到 mmdc（PATH / setup-center node_modules / npx 均不可用），"
            "跳过 Mermaid 语法门控；建议在 apps/setup-center 执行 npm install"
        )
        return []

    errors: list[str] = []
    for i, diagram in enumerate(diagrams):
        if not isinstance(diagram, dict):
            continue
        mermaid = str(diagram.get("mermaid") or "").strip()
        if not mermaid:
            continue
        label = _diagram_label(diagram, i)
        err = _validate_mermaid_syntax_with_mmdc(mermaid, diagram_id=label)
        if err:
            errors.append(err)
    return errors


def _diagrams_from_markdown(md: str) -> list[dict[str, str]]:
    """从 Markdown 代码块提取 Mermaid 图（供评审 JSON 兜底补全）。"""
    diagrams: list[dict[str, str]] = []
    for i, block in enumerate(_MERMAID_BLOCK_RE.findall(md or "")):
        mermaid = block.strip()
        if not mermaid:
            continue
        first = mermaid.split("\n", 1)[0].strip().lower()
        kind = "flowchart"
        if "sequencediagram" in first:
            kind = "sequenceDiagram"
        elif first.startswith("graph"):
            kind = "graph"
        diagrams.append(
            {
                "id": f"diagram-{i + 1}",
                "title": f"架构图 {i + 1}",
                "kind": kind,
                "mermaid": mermaid,
            }
        )
    return diagrams


def _validate_func_solution_payload(data: dict[str, Any] | None) -> list[str]:
    errors: list[str] = []
    if not data:
        errors.append(f"{JSON_NAME} 无法解析")
        return errors
    if not data.get("transformation_plans"):
        errors.append("transformation_plans 为空")
    overview = data.get("overview") if isinstance(data.get("overview"), dict) else {}
    diagrams = overview.get("diagrams") if isinstance(overview.get("diagrams"), list) else []
    summary = str(overview.get("architecture_summary") or "").strip()
    if not summary:
        errors.append("overview 缺少 architecture_summary（架构总述）")
    elif len(summary) < _MIN_ARCHITECTURE_SUMMARY_LEN:
        errors.append(
            f"overview.architecture_summary 过短（至少 {_MIN_ARCHITECTURE_SUMMARY_LEN} 字符）"
        )
    errors.extend(_validate_mermaid_diagrams_structure(diagrams))
    if diagrams and not any(e.startswith("overview.diagrams 至少需要") for e in errors):
        errors.extend(_validate_mermaid_diagrams_syntax(diagrams))
    for i, plan in enumerate(data.get("transformation_plans") or []):
        if not str(plan.get("module_name") or "").strip():
            errors.append(f"plan[{i}] 缺少 module_name")
        if not str(plan.get("design_rationale") or "").strip():
            errors.append(f"plan[{i}] 缺少 design_rationale")
        if not str(plan.get("expected_effect") or "").strip():
            errors.append(f"plan[{i}] 缺少 expected_effect")
    return errors


def ensure_func_solution_review_json_from_archive(scope_id: str) -> bool:
    """JSON 缺失时从 ``函数级方案.md`` / context 自动补全并落盘（评审门控兜底）。"""
    if json_path(scope_id).is_file():
        return True
    mpath = md_path(scope_id)
    if not mpath.is_file():
        return False
    try:
        md = mpath.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("ensure func_solution_review: read md failed %s: %s", mpath, exc)
        return False

    seed: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "overview": {"diagrams": _diagrams_from_markdown(md)},
        "consistency_analysis": {
            "summary": "（系统从函数级方案.md 自动生成的评审 payload，请在面板中核对）",
            "compatibility_notes": [],
            "contradiction_checks": [],
        },
        "transformation_plans": [],
        "human_review": {"status": "pending", "comment": ""},
    }
    payload = enrich_payload_from_archive(scope_id, seed)
    payload_errors = _validate_func_solution_payload(payload)
    if payload_errors:
        logger.info(
            "ensure func_solution_review: bootstrap incomplete scope=%s errors=%s",
            scope_id,
            payload_errors,
        )
        return False
    _write_json_file(json_path(scope_id), payload)
    logger.info("ensure func_solution_review: bootstrapped %s from %s", scope_id, MD_NAME)
    return True


def validate_func_solution_review_json(scope_id: str) -> tuple[bool, list[str]]:
    errors: list[str] = []
    mpath = md_path(scope_id)
    if not mpath.is_file():
        errors.append(f"缺少约定产出物：{MD_NAME}")

    if mpath.is_file():
        ensure_func_solution_review_json_from_archive(scope_id)

    jpath = json_path(scope_id)
    if not jpath.is_file():
        errors.append(f"缺少结构化评审产物：{JSON_NAME}")
        return False, errors
    # L1 确定性清洗：mmdc 校验前先给含特殊字符的节点标签补引号并回写
    sanitize_func_solution_review_diagrams(scope_id)
    data = load_func_solution_review_payload(scope_id)
    errors.extend(_validate_func_solution_payload(data))
    # 闸 3：增量修订模式下，已通过（冻结）方案禁止被改动
    errors.extend(validate_revision_frozen_plans(scope_id, data))
    return len(errors) == 0, errors


def validate_revision_frozen_plans(
    scope_id: str,
    data: dict[str, Any] | None,
) -> list[str]:
    """闸 3：增量修订时校验 approved_plans 冻结内容未被改动、状态仍为 approved。

    无 revision_context 时返回空（非修订模式不约束）。命中的 plan 内容指纹与冻结
    快照不一致、或评审状态被改掉 → 报错，门控不放行，自愈循环会打回让模型还原。
    """
    if not has_revision_context(scope_id):
        return []
    ctx = load_revision_context(scope_id)
    if not isinstance(ctx, dict):
        return []
    frozen = ctx.get("approved_plans")
    if not isinstance(frozen, list) or not frozen:
        return []
    if not isinstance(data, dict):
        return ["增量修订校验：无法解析 func_solution_review.json"]

    by_id = {
        str(p.get("id") or ""): p
        for p in (data.get("transformation_plans") or [])
        if isinstance(p, dict)
    }
    errors: list[str] = []
    for row in frozen:
        if not isinstance(row, dict):
            continue
        pid = str(row.get("id") or "").strip()
        snap = str(row.get("content_snapshot") or "").strip()
        title = str(row.get("title") or row.get("module_name") or pid).strip()
        if not pid or not snap:
            # 旧版 revision_context 无快照，跳过逐字校验（向后兼容）
            continue
        cur = by_id.get(pid)
        if cur is None:
            errors.append(f"已冻结方案 `{pid}` {title} 被删除，禁止改动 approved 方案")
            continue
        cur_status = str((cur.get("human_review") or {}).get("status") or "").strip().lower()
        if cur_status != "approved":
            errors.append(
                f"已冻结方案 `{pid}` {title} 的评审状态被改为 {cur_status or '空'}，必须保持 approved"
            )
        if _plan_content_snapshot(cur) != snap:
            errors.append(
                f"已冻结方案 `{pid}` {title} 的内容被改动，本次仅允许修订 plans_to_revise 中的方案，请还原"
            )
    # 闸 3b：待修订（marked）方案的修订质量校验——确保改干净、与评审意见对齐。
    errors.extend(_validate_marked_plans_revised(ctx, by_id))
    return errors


# 「增量修订要点 / 修订要点」类附录标记：禁止在已修订正文里叠一层 diff 说明而保留旧正文。
_REVISION_APPENDIX_RE = re.compile(r"(?:增量)?修订要点|修订说明|本次修订|revision\s*note", re.IGNORECASE)


def _validate_marked_plans_revised(
    ctx: dict[str, Any],
    by_id: dict[str, dict[str, Any]],
) -> list[str]:
    """闸 3b：plans_to_revise 必须改干净——状态已流转、无「修订要点」附录。"""
    to_revise = ctx.get("plans_to_revise")
    if not isinstance(to_revise, list) or not to_revise:
        return []
    errors: list[str] = []
    for row in to_revise:
        if not isinstance(row, dict):
            continue
        pid = str(row.get("id") or "").strip()
        title = str(row.get("title") or row.get("module_name") or pid).strip()
        if not pid:
            continue
        cur = by_id.get(pid)
        if cur is None:
            errors.append(f"待修订方案 `{pid}` {title} 缺失，必须在 func_solution_review.json 中保留并改干净")
            continue
        status = str((cur.get("human_review") or {}).get("status") or "").strip().lower()
        if status == "needs_change":
            errors.append(
                f"待修订方案 `{pid}` {title} 的 `human_review.status` 仍为 needs_change，修订后须重置为 pending"
            )
        body = str(cur.get("content_markdown") or "")
        if _REVISION_APPENDIX_RE.search(body):
            errors.append(
                f"待修订方案 `{pid}` {title} 含「修订要点」类附录：必须整段重写 content_markdown，"
                "禁止保留旧正文再追加 diff 说明"
            )
    return errors


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
