"""需求澄清多轮续跑：hitl_context → 文档 CONTEXT_JSON、调研简报、问卷护栏。"""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from synapse.rd_meeting.hitl_form import (
    HUMAN_CLOSURE_DETAIL_ID,
    HUMAN_CLOSURE_QUESTION_ID,
    HUMAN_SUPPLEMENT_QUESTION_ID,
)

_SKIP_QIDS = frozenset(
    {
        HUMAN_CLOSURE_QUESTION_ID,
        HUMAN_CLOSURE_DETAIL_ID,
        HUMAN_SUPPLEMENT_QUESTION_ID,
    }
)

_ECHO_CONFIRM_RE = re.compile(
    r"(是否|是不是|对吗|正确吗|同意|确认|指.*吗|您说的|您提到|按您|根据您)",
    re.IGNORECASE,
)

CLARIFY_FILL_CTX_FILENAME = "clarify_fill_ctx.json"
CLARIFY_SECTIONS_FILENAME = "clarify_sections.json"
_UNDERSTANDING_PENDING = "（待归纳）"

_CLARIFY_SECTION_SCALAR_MAP: dict[str, str] = {
    "motivation_trigger": "trigger_scenario",
    "trigger_scenario": "trigger_scenario",
    "motivation_pain": "pain_point",
    "pain_point": "pain_point",
    "motivation_benefit": "expected_benefit",
    "expected_benefit": "expected_benefit",
    "scope_in": "scope_in",
    "scope_out": "scope_out",
    "background": "BACKGROUND",
    "tech_constraint": "tech_constraint",
    "module_dependency": "module_dependency",
    "data_dependency": "data_dependency",
}

_CLARIFY_SECTION_LIST_KEYS = ("feature_points", "scenarios", "acceptance_criteria")


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", "", (text or "").strip().lower())


def _similarity(a: str, b: str) -> float:
    na, nb = _normalize_text(a), _normalize_text(b)
    if not na or not nb:
        return 0.0
    if na in nb or nb in na:
        return max(len(na), len(nb)) / max(min(len(na), len(nb)), 1)
    return SequenceMatcher(None, na, nb).ratio()


def list_confirmed_question_ids(hitl_doc: dict[str, Any] | None) -> set[str]:
    """已确认题 id（不含收口/补充题）。"""
    if not isinstance(hitl_doc, dict):
        return set()
    confirmed = hitl_doc.get("confirmed_by_id")
    if not isinstance(confirmed, dict):
        return set()
    return {
        str(qid).strip()
        for qid in confirmed
        if str(qid).strip() and str(qid).strip() not in _SKIP_QIDS
    }


def parse_open_research_items(
    hitl_doc: dict[str, Any] | None,
    *,
    latest_round_only: bool = True,
) -> list[dict[str, Any]]:
    """用户补充/纠偏 → 待系统调研条目（不是问卷题面）。"""
    if not isinstance(hitl_doc, dict):
        return []
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    def _add(source: str, text: str, kind: str) -> None:
        body = (text or "").strip()
        if not body or body in seen:
            return
        seen.add(body)
        items.append(
            {
                "id": f"open_{len(items) + 1}",
                "source": source,
                "text": body,
                "kind": kind,
            }
        )

    rounds = hitl_doc.get("rounds")
    target: list[Any] = []
    if isinstance(rounds, list) and rounds:
        target = [rounds[-1]] if latest_round_only else list(rounds)

    for rnd in target:
        if not isinstance(rnd, dict):
            continue
        for q in rnd.get("questions") or []:
            if not isinstance(q, dict):
                continue
            qid = str(q.get("id") or "").strip()
            if qid == HUMAN_CLOSURE_DETAIL_ID:
                _add("human_closure_detail", str(q.get("user_input") or ""), "research_brief")
                continue
            if qid in _SKIP_QIDS:
                continue
            user_input = str(q.get("user_input") or "").strip()
            if user_input:
                _add(f"question:{qid}", user_input, "correction")

    confirmed = hitl_doc.get("confirmed_by_id")
    if isinstance(confirmed, dict):
        detail = confirmed.get(HUMAN_CLOSURE_DETAIL_ID)
        if isinstance(detail, dict):
            _add(
                "human_closure_detail",
                str(detail.get("user_input") or ""),
                "research_brief",
            )

    return items


def _confirmed_answer_text(rec: dict[str, Any]) -> str:
    """用户确认内容（选项 + 自定义输入），供摘要/台账表格使用。"""
    return _format_user_answer(rec)


def _format_all_options(rec: dict[str, Any]) -> str:
    snapshot = rec.get("options_snapshot")
    if isinstance(snapshot, list) and snapshot:
        labels: list[str] = []
        for idx, opt in enumerate(snapshot, 1):
            if not isinstance(opt, dict):
                continue
            label = str(opt.get("label") or opt.get("value") or "").strip()
            if label:
                labels.append(f"{idx}. {label}")
        if labels:
            return "；".join(labels)
    labels_raw = rec.get("option_labels")
    if isinstance(labels_raw, list) and labels_raw:
        return "；".join(str(x).strip() for x in labels_raw if str(x).strip())
    return "（无选项）"


def _format_user_answer(rec: dict[str, Any]) -> str:
    parts: list[str] = []
    labels = rec.get("option_labels")
    if isinstance(labels, list) and labels:
        parts.extend(str(x).strip() for x in labels if str(x).strip())
    user_input = str(rec.get("user_input") or "").strip()
    if user_input:
        parts.append(user_input)
    return "；".join(parts) if parts else ""


def _format_understanding(
    rec: dict[str, Any],
    understanding_by_qid: dict[str, str] | None = None,
) -> str:
    qid = str(rec.get("id") or "").strip()
    if understanding_by_qid and qid:
        summary = str(understanding_by_qid.get(qid) or "").strip()
        if summary:
            return summary
    summary = str(rec.get("understanding_summary") or "").strip()
    if summary:
        return summary
    return _UNDERSTANDING_PENDING


def _question_context(rec: dict[str, Any]) -> str:
    for key in ("context_snapshot", "context"):
        text = str(rec.get(key) or "").strip()
        if text:
            return text
    return str(rec.get("title") or "").strip()


def seed_clarify_base_ctx(scope_type: str, scope_id: str) -> dict[str, Any]:
    """从工单快照注入模板标量默认值。"""
    from synapse.rd_meeting.userwork_sync import load_scope_work_order_context

    sid = (scope_id or "").strip()
    if not sid:
        return {}
    wo = load_scope_work_order_context(scope_type, sid)  # type: ignore[arg-type]
    title = str(wo.get("demand_title") or wo.get("task_title") or "").strip()
    return {
        "REQUIREMENT_NAME": title or "[待补充]",
        "DEMAND_DESC": str(wo.get("demand_desc") or "").strip() or "[待补充]",
        "BACKGROUND": str(wo.get("demand_impact") or "").strip() or "[待补充]",
        "trigger_scenario": "[待补充]",
        "pain_point": "[待补充]",
        "expected_benefit": "[待补充]",
        "scope_in": "[待补充]",
        "scope_out": "[待补充]",
        "tech_constraint": "[待补充]",
        "module_dependency": "[待补充]",
        "data_dependency": "[待补充]",
    }


def _is_placeholder(value: Any) -> bool:
    text = str(value or "").strip()
    return not text or text in ("[待补充]", "（无）", _UNDERSTANDING_PENDING)


def load_clarify_sections(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw if isinstance(raw, dict) else {}


def clarify_sections_path(scope_id: str, stage_name: str, node_id: str) -> Path:
    return clarify_fill_ctx_path(scope_id, stage_name, node_id).parent / CLARIFY_SECTIONS_FILENAME


def _merge_scalar_sections(ctx: dict[str, Any], sections: dict[str, Any]) -> None:
    scalar_keys = (
        "BACKGROUND",
        "trigger_scenario",
        "pain_point",
        "expected_benefit",
        "scope_in",
        "scope_out",
        "tech_constraint",
        "module_dependency",
        "data_dependency",
    )
    for key in scalar_keys:
        val = sections.get(key)
        if val is not None and not _is_placeholder(val):
            ctx[key] = str(val).strip()


def _merge_list_sections(ctx: dict[str, Any], sections: dict[str, Any]) -> None:
    for key in _CLARIFY_SECTION_LIST_KEYS:
        val = sections.get(key)
        if isinstance(val, list) and val:
            ctx[key] = val


def _apply_confirmed_section_tags(ctx: dict[str, Any], confirmed: dict[str, Any]) -> None:
    """有 clarify_section 标签的已确认题 → 写入对应章节（用户原始回答）。"""
    for rec in confirmed.values():
        if not isinstance(rec, dict):
            continue
        tag = str(rec.get("clarify_section") or "").strip()
        if not tag:
            continue
        answer = _format_user_answer(rec)
        if not answer:
            continue
        scalar_key = _CLARIFY_SECTION_SCALAR_MAP.get(tag)
        if scalar_key and _is_placeholder(ctx.get(scalar_key)):
            ctx[scalar_key] = answer
        elif tag == "feature":
            fp = ctx.setdefault("feature_points", [])
            if isinstance(fp, list):
                fp.append({"point": answer})
        elif tag == "scenario" and isinstance(rec.get("scenario"), dict):
            scenarios = ctx.setdefault("scenarios", [])
            if isinstance(scenarios, list):
                scenarios.append(dict(rec["scenario"]))
        elif tag == "acceptance":
            ac = ctx.setdefault("acceptance_criteria", [])
            if isinstance(ac, list):
                ac.append({"criterion": answer})


def merge_sections_into_ctx(ctx: dict[str, Any], sections: dict[str, Any] | None) -> dict[str, str]:
    """合并 Host/专家写入的 clarify_sections.json。"""
    if not isinstance(sections, dict) or not sections:
        return {}
    _merge_scalar_sections(ctx, sections)
    _merge_list_sections(ctx, sections)
    raw_map = sections.get("understanding_by_qid")
    if isinstance(raw_map, dict):
        return {str(k): str(v).strip() for k, v in raw_map.items() if str(v or "").strip()}
    return {}


def merge_confirmed_into_clarify_ctx(
    hitl_doc: dict[str, Any] | None,
    *,
    base: dict[str, Any] | None = None,
    sections: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """hitl_context → ``fill_clarify.py`` / ``需求澄清.md`` 模板 CONTEXT_JSON。"""
    ctx: dict[str, Any] = dict(base or {})
    ctx.setdefault("STATUS", "in_progress")
    ctx.setdefault("unclear", [])
    ctx.setdefault("dialogue", [])
    ctx.setdefault("conclusions", [])
    ctx.setdefault("scenarios", [])
    ctx.setdefault("acceptance_criteria", [])
    ctx.setdefault("feature_points", [])

    understanding_by_qid = merge_sections_into_ctx(ctx, sections)

    if not isinstance(hitl_doc, dict):
        ctx["open_research_items"] = []
        ctx["confirmed_snapshot"] = {}
        return ctx

    confirmed = hitl_doc.get("confirmed_by_id")
    if not isinstance(confirmed, dict):
        confirmed = {}

    _apply_confirmed_section_tags(ctx, confirmed)

    dialogue: list[dict[str, Any]] = []
    conclusions: list[dict[str, Any]] = []
    unclear: list[dict[str, Any]] = []

    for qid, rec in confirmed.items():
        if not isinstance(rec, dict):
            continue
        qid_s = str(qid).strip()
        if not qid_s or qid_s in _SKIP_QIDS:
            continue
        title = str(rec.get("title") or qid_s).strip()
        user_answer = _format_user_answer(rec)
        all_options = _format_all_options(rec)
        understanding = _format_understanding(rec, understanding_by_qid)
        qtype = str(rec.get("question_type") or "confirmed").strip() or "confirmed"
        context = _question_context(rec)
        conclusions.append({"title": title, "summary": user_answer or understanding})
        dialogue.append(
            {
                "question_title": title,
                "type": qtype,
                "options": all_options,
                "user_answer": user_answer or "（无）",
            }
        )
        unclear.append(
            {
                "question": title,
                "title": title,
                "context": context,
                "options_all": all_options,
                "ref": f"hitl_context.confirmed_by_id.{qid_s}",
                "state": "confirmed",
                "answer_org": user_answer or "（无）",
                "answer": understanding,
            }
        )

    open_items = parse_open_research_items(hitl_doc)
    for item in open_items:
        text = str(item.get("text") or "").strip()
        unclear.append(
            {
                "question": f"[待调研] {text[:120]}",
                "title": str(item.get("source") or "open_research"),
                "context": text,
                "options_all": "（无选项）",
                "ref": str(item.get("source") or ""),
                "state": "researching",
                "answer_org": text,
                "answer": "[待系统调研后形成澄清问题]",
            }
        )

    ctx["dialogue"] = dialogue
    ctx["conclusions"] = conclusions
    ctx["unclear"] = unclear
    ctx["open_research_items"] = open_items
    ctx["confirmed_snapshot"] = {
        k: dict(v) for k, v in confirmed.items() if isinstance(v, dict)
    }
    ctx["hitl_round_count"] = len(hitl_doc.get("rounds") or [])
    return ctx


def enrich_clarify_ctx_from_disk(ctx: dict[str, Any], ctx_path: Path | str) -> dict[str, Any]:
    """渲染前合并同目录 ``clarify_sections.json``（Host 可能在系统写入 ctx 之后更新）。"""
    path = Path(ctx_path)
    sections = load_clarify_sections(path.parent / CLARIFY_SECTIONS_FILENAME)
    understanding_by_qid = merge_sections_into_ctx(ctx, sections)
    if not understanding_by_qid:
        return ctx
    for item in ctx.get("unclear") or []:
        if not isinstance(item, dict):
            continue
        ref = str(item.get("ref") or "")
        match = re.search(r"confirmed_by_id\.([^.]+)$", ref)
        if not match:
            continue
        qid = match.group(1)
        summary = understanding_by_qid.get(qid)
        if summary:
            item["answer"] = summary
    return ctx


def rewrite_clarify_fill_ctx_at_path(ctx_path: Path | str) -> Path:
    """doc-generate 前回写：合并 ``clarify_sections.json`` 并更新 ``clarify_fill_ctx.json``。"""
    path = Path(ctx_path)
    ctx = json.loads(path.read_text(encoding="utf-8"))
    ctx = enrich_clarify_ctx_from_disk(ctx, path)
    path.write_text(json.dumps(ctx, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


_CLARIFY_REQUIRED_SCALARS_WHEN_CONFIRMED = (
    "scope_in",
    "scope_out",
    "trigger_scenario",
    "pain_point",
    "expected_benefit",
)


def validate_clarify_context_completeness(
    ctx: dict[str, Any],
    *,
    strict: bool = False,
) -> list[str]:
    """已有问卷确认时，检查范围/动机/理解总结是否仍为空。"""
    issues: list[str] = []
    confirmed = ctx.get("confirmed_snapshot")
    has_confirmed = isinstance(confirmed, dict) and any(
        str(k).strip() not in _SKIP_QIDS for k in confirmed
    )
    if not has_confirmed:
        return issues

    for key in _CLARIFY_REQUIRED_SCALARS_WHEN_CONFIRMED:
        if _is_placeholder(ctx.get(key)):
            issues.append(f"已有用户确认项但 {key} 仍为待补充（须写入 clarify_sections.json）")

    for item in ctx.get("unclear") or []:
        if not isinstance(item, dict) or item.get("state") != "confirmed":
            continue
        title = str(item.get("title") or item.get("question") or "").strip() or "未命名题"
        if str(item.get("answer") or "").strip() == _UNDERSTANDING_PENDING:
            issues.append(f"题「{title}」理解总结仍为待归纳（须写入 understanding_by_qid）")

    if strict:
        if not ctx.get("feature_points"):
            issues.append("已有确认项但 feature_points 为空")
        if not ctx.get("scenarios"):
            issues.append("已有确认项但 scenarios 为空")
        if not ctx.get("acceptance_criteria"):
            issues.append("已有确认项但 acceptance_criteria 为空")
    return issues


def build_doc_generate_context_json(
    scope_id: str,
    node_id: str,
    *,
    binding: dict[str, Any] | None = None,
    base: dict[str, Any] | None = None,
    scope_type: str = "demand",
) -> dict[str, Any]:
    from synapse.rd_meeting.hitl_confirmed import resolve_stage_name_for_node
    from synapse.rd_meeting.hitl_context import read_hitl_context

    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    doc = read_hitl_context(sid, nid, binding=binding)
    seed = seed_clarify_base_ctx(scope_type, sid)
    merged_base = {**seed, **(base or {})}
    stg = resolve_stage_name_for_node(nid, binding)
    sections: dict[str, Any] = {}
    if stg:
        sections = load_clarify_sections(clarify_sections_path(sid, stg, nid))
    return merge_confirmed_into_clarify_ctx(
        doc,
        base=merged_base,
        sections=sections,
    )


def clarify_fill_ctx_path(scope_id: str, stage_name: str, node_id: str) -> Path:
    from synapse.rd_meeting.hitl_context import hitl_context_path

    return hitl_context_path(scope_id, stage_name, node_id).parent / ".tmp" / CLARIFY_FILL_CTX_FILENAME


def write_clarify_fill_ctx(
    scope_id: str,
    node_id: str,
    *,
    binding: dict[str, Any] | None = None,
    base: dict[str, Any] | None = None,
    scope_type: str = "demand",
) -> Path | None:
    """落盘 doc-generate 用的 clarify CONTEXT_JSON（相对归档目录 .tmp/）。"""
    from synapse.rd_meeting.hitl_confirmed import resolve_stage_name_for_node

    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or not nid or nid == "pending":
        return None
    stg = resolve_stage_name_for_node(nid, binding)
    if not stg:
        return None
    ctx = build_doc_generate_context_json(
        sid,
        nid,
        binding=binding,
        base=base,
        scope_type=scope_type,
    )
    path = clarify_fill_ctx_path(sid, stg, nid)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(ctx, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def build_confirmed_snapshot_markdown(hitl_doc: dict[str, Any] | None) -> str:
    if not isinstance(hitl_doc, dict):
        return "（无已确认项）"
    confirmed = hitl_doc.get("confirmed_by_id")
    if not isinstance(confirmed, dict) or not confirmed:
        return "（无已确认项）"
    lines = ["| 题号 | 标题 | 用户确认 |", "|------|------|----------|"]
    for qid, rec in confirmed.items():
        if not isinstance(rec, dict):
            continue
        qid_s = str(qid).strip()
        if qid_s in _SKIP_QIDS:
            continue
        title = str(rec.get("title") or qid_s).strip()
        ans = _confirmed_answer_text(rec) or str(rec.get("user_input") or "").strip()
        lines.append(f"| {qid_s} | {title} | {ans or '—'} |")
    return "\n".join(lines) if len(lines) > 2 else "（无已确认项）"


def build_open_research_markdown(open_items: list[dict[str, Any]]) -> str:
    if not open_items:
        return "（本轮无待调研补充项）"
    lines = [
        "以下为用户要求**系统继续调研分析**的条目，**禁止**原样改写成「您是否同意…」类确认题：",
        "",
    ]
    for item in open_items:
        text = str(item.get("text") or "").strip()
        kind = str(item.get("kind") or "research").strip()
        lines.append(f"- **[{kind}]** {text}")
    return "\n".join(lines)


def build_clarify_followup_brief(
    scope_id: str,
    node_id: str,
    *,
    binding: dict[str, Any] | None = None,
) -> str:
    """注入 Host 续跑 prompt 的多轮澄清工序简报。"""
    from synapse.rd_meeting.hitl_confirmed import resolve_stage_name_for_node
    from synapse.rd_meeting.hitl_context import hitl_context_path, read_hitl_context
    from synapse.rd_meeting.paths import archive_node_dir

    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or not nid or nid == "pending":
        return ""

    doc = read_hitl_context(sid, nid, binding=binding)
    open_items = parse_open_research_items(doc)
    stg = resolve_stage_name_for_node(nid, binding)
    ctx_path = str(hitl_context_path(sid, stg, nid).resolve()) if stg else ""
    fill_path = ""
    clarify_md = ""
    if stg:
        fill_path = str(clarify_fill_ctx_path(sid, stg, nid).resolve())
        sections_path = str(clarify_sections_path(sid, stg, nid).resolve())
        clarify_md = str((archive_node_dir(sid, stg, nid) / "需求澄清.md").resolve())
    else:
        sections_path = ""

    rounds = len(doc.get("rounds") or []) if isinstance(doc, dict) else 0
    round_n = max(2, rounds + 1)

    return "\n".join(
        [
            f"## 系统提示：需求澄清第 {round_n} 轮续跑工序（强制）",
            "",
            "用户末题选择「仍需进一步处理」或提供了纠偏/补充文本。"
            "**用户写的是调研任务，不是让你原样做成确认题。**",
            "",
            "### 已确认项（既成事实，禁止再次入题）",
            build_confirmed_snapshot_markdown(doc),
            "",
            "### 待调研补充项（须先调研，再形成新澄清题）",
            build_open_research_markdown(open_items),
            "",
            "### 强制工序（按序，不可跳步）",
            "1. `read_file` 人机台账：`" + ctx_path + "`，综合 `confirmed_by_id` 全量历史。",
            "2. 综合 Phase 1–4 / Phase R 分析，**write_file** 更新结构化章节：`"
            + sections_path
            + "`（含 `understanding_by_qid`、scope_in/out、scenarios 等；见 skeleton）。",
            "3. 系统已生成 doc-generate 上下文：`" + fill_path + "`（含工单种子 + 台账 + sections）；"
            "doc-generate 时 **必须** 以其为 `CONTEXT_JSON`。",
            "4. **必须** `whalecloud-dev-tool-doc-generate` 重生成 `需求澄清.md`（保留已确认结论，待调研项标记为 researching）。",
            "   - 产出路径：`" + clarify_md + "`",
            "5. **必须**委派 `whalecloud-requirement-expert` 执行技能 **Phase R（会中续澄清）**：",
            "   - 注入 `OPEN_RESEARCH_ITEMS`（上方待调研列表）与 `CONFIRMED_SNAPSHOT`；",
            "   - 在代码/文档中检索证据后产出**新** `unclear[]` 条目；",
            "   - **禁止**把用户补充原文改写成「请确认您是否指…」。",
            "6. 仅对 Phase R 调研后的**新未决点**调用 `submit_hitl_questionnaire(kind=interactive)`；",
            "   - `questions[]` 不得包含已确认题 id；",
            "   - 不得出现对用户补充原文的回声确认题（工具会拒绝）。",
            "7. 提交问卷后立即停止。",
            "",
            "### OPEN_RESEARCH_ITEMS（JSON，委派时附带）",
            "```json",
            json.dumps(open_items, ensure_ascii=False, indent=2),
            "```",
        ]
    ).strip()


def prompt_clarify_followup_workflow(round_n: int = 2) -> str:
    """短版工序提示（orchestrator 注入用）。"""
    n = max(2, int(round_n or 2))
    return f"""
## 系统提示：第 {n} 轮需求澄清续跑

- 已确认项视为既成事实，**禁止**再次入题。
- 用户补充/末题说明 = **调研任务**；须委派 Phase R 调研后再出题。
- 重生成 `需求澄清.md` 后再交问卷；禁止回声确认题。
""".strip()


def _looks_like_echo_question(
    question: dict[str, Any],
    open_items: list[dict[str, Any]],
) -> str | None:
    """若题面疑似把用户补充原文改写成确认题，返回原因。"""
    if not open_items:
        return None
    title = str(question.get("title") or "").strip()
    context = str(question.get("context") or "").strip()
    combined = f"{title}\n{context}"
    if not combined.strip():
        return None

    for item in open_items:
        text = str(item.get("text") or "").strip()
        if len(text) < 8:
            continue
        sim = _similarity(combined, text)
        if sim >= 0.55 and _ECHO_CONFIRM_RE.search(combined):
            return f"题面与用户补充高度相似且为确认口吻（相似度≈{sim:.0%}）"
        if _normalize_text(text) in _normalize_text(combined) and _ECHO_CONFIRM_RE.search(combined):
            return "题面包含用户补充原文且为确认口吻"
    return None


def validate_clarify_followup_questionnaire(
    questions: list[dict[str, Any]],
    hitl_doc: dict[str, Any] | None,
    *,
    node_id: str = "",
) -> None:
    """需求澄清多轮问卷护栏：禁止复核已确认题、禁止回声确认题。"""
    nid = (node_id or "").strip()
    if nid and nid != "req_clarify":
        return
    if not isinstance(questions, list):
        return

    confirmed_ids = list_confirmed_question_ids(hitl_doc)
    open_items = parse_open_research_items(hitl_doc)

    for idx, q in enumerate(questions):
        if not isinstance(q, dict):
            continue
        qid = str(q.get("id") or "").strip() or f"q{idx + 1}"
        if qid in _SKIP_QIDS:
            continue
        if qid in confirmed_ids:
            raise ValueError(
                f"questions[{idx}]（id={qid}）已在上一轮用户确认，禁止再次入题。"
                "只应对 Phase R 调研后的新未决点出题。"
            )
        echo = _looks_like_echo_question(q, open_items)
        if echo:
            raise ValueError(
                f"questions[{idx}]（id={qid}）疑似回声确认题：{echo}。"
                "用户补充须先委派调研，不得原样改成「您是否…」类题目。"
            )
