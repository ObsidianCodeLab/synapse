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
    labels = rec.get("option_labels")
    if isinstance(labels, list) and labels:
        return "；".join(str(x).strip() for x in labels if str(x).strip())
    return str(rec.get("user_input") or "").strip()


def merge_confirmed_into_clarify_ctx(
    hitl_doc: dict[str, Any] | None,
    *,
    base: dict[str, Any] | None = None,
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

    if not isinstance(hitl_doc, dict):
        ctx["open_research_items"] = []
        ctx["confirmed_snapshot"] = {}
        return ctx

    confirmed = hitl_doc.get("confirmed_by_id")
    if not isinstance(confirmed, dict):
        confirmed = {}

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
        answer = _confirmed_answer_text(rec)
        user_input = str(rec.get("user_input") or "").strip()
        conclusions.append({"title": title, "summary": answer or user_input})
        dialogue.append(
            {
                "question_title": title,
                "type": "confirmed",
                "options": answer,
                "user_answer": answer or user_input,
            }
        )
        unclear.append(
            {
                "question": title,
                "title": title,
                "context": user_input or answer,
                "ref": f"hitl_context.confirmed_by_id.{qid_s}",
                "state": "confirmed",
                "answer_org": user_input or answer,
                "answer": answer or user_input,
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


def build_doc_generate_context_json(
    scope_id: str,
    node_id: str,
    *,
    binding: dict[str, Any] | None = None,
    base: dict[str, Any] | None = None,
) -> dict[str, Any]:
    from synapse.rd_meeting.hitl_context import read_hitl_context

    doc = read_hitl_context(scope_id, node_id, binding=binding)
    return merge_confirmed_into_clarify_ctx(doc, base=base)


def clarify_fill_ctx_path(scope_id: str, stage_name: str, node_id: str) -> Path:
    from synapse.rd_meeting.hitl_context import hitl_context_path

    return hitl_context_path(scope_id, stage_name, node_id).parent / ".tmp" / CLARIFY_FILL_CTX_FILENAME


def write_clarify_fill_ctx(
    scope_id: str,
    node_id: str,
    *,
    binding: dict[str, Any] | None = None,
    base: dict[str, Any] | None = None,
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
    ctx = build_doc_generate_context_json(sid, nid, binding=binding, base=base)
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
        clarify_md = str((archive_node_dir(sid, stg, nid) / "需求澄清.md").resolve())

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
            "2. 使用系统已生成的 doc-generate 上下文：`" + fill_path + "` 作为 `CONTEXT_JSON`（若不存在须先由系统写入）。",
            "3. **必须** `whalecloud-dev-tool-doc-generate` 重生成 `需求澄清.md`（保留已确认结论，待调研项标记为 researching）。",
            "   - 产出路径：`" + clarify_md + "`",
            "4. **必须**委派 `whalecloud-requirement-expert` 执行技能 **Phase R（会中续澄清）**：",
            "   - 注入 `OPEN_RESEARCH_ITEMS`（上方待调研列表）与 `CONFIRMED_SNAPSHOT`；",
            "   - 在代码/文档中检索证据后产出**新** `unclear[]` 条目；",
            "   - **禁止**把用户补充原文改写成「请确认您是否指…」。",
            "5. 仅对 Phase R 调研后的**新未决点**调用 `submit_hitl_questionnaire(kind=interactive)`；",
            "   - `questions[]` 不得包含已确认题 id；",
            "   - 不得出现对用户补充原文的回声确认题（工具会拒绝）。",
            "6. 提交问卷后立即停止。",
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
