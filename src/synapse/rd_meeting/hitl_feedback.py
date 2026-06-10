"""人机问卷反馈：结构化解析、自由输入判定、Host 续跑提示。"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Literal

from synapse.rd_meeting.hitl_form import (
    HUMAN_CLOSURE_DETAIL_ID,
    HUMAN_CLOSURE_QUESTION_ID,
    HUMAN_SUPPLEMENT_QUESTION_ID,
)

HitlFeedbackMode = Literal["options_only", "with_free_text"]

_HITL_FORM_PREFIX = "[人工确认表单]"

_PROMPT_OPTIONS_ONLY = """
## 系统提示：用户已完成问卷（仅选项反馈，无额外自由输入）

用户已通过会中问卷做出选择，**未**在题目自定义输入框或末题进一步处理栏填写额外说明。

**本次要求**：
1. **逐条阅读**「本轮人工确认反馈（结构化）」与「需求澄清续跑工序」：以用户选项为约束，结合工单、产品、代码仓库等**真实上下文**更新产出物。
2. 不得无视或弱化用户选项；选项即用户决策，写入产出物时必须体现。
3. **必须**用 `clarify_fill_ctx.json`（或系统生成的 CONTEXT_JSON）调用 `whalecloud-dev-tool-doc-generate` 重生成 `需求澄清.md`，保留已确认项。
4. 用户已在末题选择「否，本节点已无待决问题」；完成产出物更新后停止，系统将进入节点确认总结（NodeReview）。
5. 除非 Phase R 调研后出现新的未决点，无需再次提交 interactive 问卷。
""".strip()

_PROMPT_WITH_FREE_TEXT = """
## 系统提示：用户已完成问卷（含自由输入，须调研后推进）

用户在题目自定义输入框和/或末题「进一步处理要求」中提供了**自由文本**。

**本次要求**：
1. **先归纳**「本轮人工确认反馈（结构化）」——每题选项与自由输入，形成约束摘要（不得省略细节）。
2. **用户自由文本 = 调研任务**，不是让你原样做成「请确认您是否指…」类问卷题。
3. **强制工序**：读 `hitl_context.json` → 用 `clarify_fill_ctx.json` 作 CONTEXT_JSON → doc-generate 重生成 `需求澄清.md` → 委派 `whalecloud-requirement-expert` **Phase R** 调研待决项 → 仅对调研后的新 unclear 出题。
4. 禁止用泛泛复述代替对用户输入的针对性回应；禁止跳过调研直接交问卷。
""".strip()

_PROMPT_FURTHER_PROCESSING = """
## 续跑提示（用户选择仍需进一步处理）

用户已在末题选择「是」并说明待处理要求。该说明是**系统继续分析/调研的输入**，不是确认题素材。

**禁止**：
- 把 `human_closure_detail` 或用户补充原文改写成「您是否同意/是否指…」类题目；
- 在未完成 doc-generate 重生成与 Phase R 委派前提交 interactive 问卷；
- 在未获用户末题选「否」前进入节点确认总结。

**必须**：
1. 按上方「需求澄清续跑工序」逐步执行；
2. 已确认题 id 不得再次出现在 `questions[]`；
3. 调研完成后再 `submit_hitl_questionnaire(kind=interactive)`，题目须基于代码/文档证据。
""".strip()

_PROMPT_FOLLOWUP_INTERACTIVE_ROUND = """
## 系统提示：第 {round_n} 轮会中问卷（调研后续澄清）

第 2+ 轮：**不是**让用户确认自己写过的补充说明，而是对 Phase R 调研后的**新未决点**澄清。

**硬约束（工具会校验，不达标将拒绝提交）**：
1. **summary**：写本轮文档更新要点 + 仅**新**待确认决策点简表；已确认项只列在「已收敛」区，不得再次入题。
2. **每题须有新证据**：`context` 须引用代码路径/文档章节/调研结论，不得只有用户原文复述。
3. **禁止回声题**：题面不得与用户 `OPEN_RESEARCH_ITEMS` 高度相似且为确认口吻（系统会拒绝）。
4. **禁止复核**：`questions[].id` 不得出现在 `confirmed_by_id` 中。
5. 调用 ``submit_hitl_questionnaire`` 后立即停止。
""".strip()


def prompt_for_followup_interactive_round(round_n: int) -> str:
    """第 2 轮及以后会中问卷：调研后续澄清约束。"""
    n = max(2, int(round_n or 2))
    return _PROMPT_FOLLOWUP_INTERACTIVE_ROUND.format(round_n=n)


def prompt_after_hitl_feedback(
    mode: HitlFeedbackMode,
    *,
    followup_round: int = 0,
    values: dict[str, Any] | None = None,
    schema: dict[str, Any] | None = None,
) -> str:
    wants_further = user_wants_further_processing(values or {}, schema)
    if wants_further:
        base = f"{_PROMPT_WITH_FREE_TEXT}\n\n{_PROMPT_FURTHER_PROCESSING}"
    else:
        base = _PROMPT_WITH_FREE_TEXT if mode == "with_free_text" else _PROMPT_OPTIONS_ONLY

    if followup_round >= 2:
        return f"{base}\n\n{prompt_for_followup_interactive_round(followup_round)}"
    if followup_round >= 1 and (mode == "with_free_text" or wants_further):
        return (
            f"{base}\n\n"
            "## 续跑提示\n"
            "本轮须先重生成 `需求澄清.md` 并完成 Phase R 调研，再交问卷；"
            "详见上方「需求澄清续跑工序」。"
        )
    return base


def _is_affirmative_key(key: str) -> bool:
    k = (key or "").strip().lower()
    if k in ("true", "yes", "y", "1"):
        return True
    return key.strip() == "是"


def _normalize_option_key(raw: Any, idx: int = 0) -> str:
    if isinstance(raw, bool):
        return "true" if raw else "false"
    text = str(raw or "").strip()
    if not text:
        return f"opt_{idx}"
    low = text.lower()
    if low in ("true", "yes", "y", "1") or text == "是":
        return "true"
    if low in ("false", "no", "n", "0") or text == "否":
        return "false"
    return text


def _question_option_index(question: dict[str, Any]) -> dict[str, str]:
    """option key → display label."""
    mapping: dict[str, str] = {}
    for idx, opt in enumerate(question.get("options") or []):
        if not isinstance(opt, dict):
            continue
        label = str(opt.get("label") or opt.get("value") or opt.get("id") or "").strip()
        for candidate in (opt.get("value"), opt.get("id"), opt.get("label")):
            if candidate is None:
                continue
            key = _normalize_option_key(candidate, idx)
            mapping[key] = label or key
    return mapping


def _question_by_id(schema: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    if not isinstance(schema, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for q in schema.get("questions") or []:
        if isinstance(q, dict):
            qid = str(q.get("id") or "").strip()
            if qid:
                out[qid] = q
    return out


def split_question_answer(
    question: dict[str, Any] | None,
    raw: Any,
) -> tuple[list[str], str]:
    """拆分解答题答案 → (选项 keys, 用户自由输入)。"""
    q = question or {}
    qid = str(q.get("id") or "").strip()
    qtype = str(q.get("type") or "").strip().lower()

    if qtype in ("text", "textarea") or qid in (
        HUMAN_SUPPLEMENT_QUESTION_ID,
        HUMAN_CLOSURE_DETAIL_ID,
    ):
        text = str(raw or "").strip() if raw is not None else ""
        return [], text

    opt_index = _question_option_index(q)
    known = set(opt_index)
    selected: list[str] = []
    custom = ""

    items: list[Any]
    if isinstance(raw, list):
        items = raw
    elif raw is None or str(raw).strip() == "":
        items = []
    else:
        items = [raw]

    for item in items:
        s = str(item).strip()
        if not s:
            continue
        if s.startswith("OTHER:"):
            custom = s[6:].strip() or custom
            continue
        key = _normalize_option_key(s)
        if key in known:
            selected.append(key)
        elif s in known:
            selected.append(s)
        else:
            custom = custom if custom else s

    return selected, custom


def _format_option_labels(question: dict[str, Any], option_keys: list[str]) -> str:
    if not option_keys:
        return "（无）"
    opt_index = _question_option_index(question)
    labels = [opt_index.get(k, k) for k in option_keys]
    return "；".join(labels)


def user_wants_further_processing(
    values: dict[str, Any],
    schema: dict[str, Any] | None = None,
) -> bool:
    """末题选「是」或填写进一步处理说明 → 须继续会中问卷，不进 NodeReview。"""
    if HUMAN_CLOSURE_QUESTION_ID in values:
        qmap = _question_by_id(schema)
        q = qmap.get(
            HUMAN_CLOSURE_QUESTION_ID,
            {"id": HUMAN_CLOSURE_QUESTION_ID, "type": "boolean"},
        )
        selected, _ = split_question_answer(q, values.get(HUMAN_CLOSURE_QUESTION_ID))
        if selected:
            return _is_affirmative_key(selected[0])
        raw = values.get(HUMAN_CLOSURE_QUESTION_ID)
        if isinstance(raw, bool):
            return raw
        if raw is not None and str(raw).strip():
            return _is_affirmative_key(_normalize_option_key(raw))
        return False
    detail = str(values.get(HUMAN_CLOSURE_DETAIL_ID) or "").strip()
    if detail:
        return True
    supplement = str(values.get(HUMAN_SUPPLEMENT_QUESTION_ID) or "").strip()
    return bool(supplement)


def user_selected_no_further_processing(
    values: dict[str, Any],
    schema: dict[str, Any] | None = None,
) -> bool:
    """末题选「否」→ 唯一允许进入 NodeReview 的会中收口条件。"""
    if HUMAN_CLOSURE_QUESTION_ID in values:
        return not user_wants_further_processing(values, schema)
    if HUMAN_SUPPLEMENT_QUESTION_ID in values:
        return not str(values.get(HUMAN_SUPPLEMENT_QUESTION_ID) or "").strip()
    return False


def classify_hitl_feedback_mode(
    values: dict[str, Any],
    schema: dict[str, Any] | None,
    *,
    comment: str = "",
) -> HitlFeedbackMode:
    """区分「仅选项」与「含自由输入（题目输入框 / 收口说明 / 文本题）」。"""
    if user_wants_further_processing(values, schema):
        return "with_free_text"
    if user_has_free_text_input(values, schema, comment=comment):
        return "with_free_text"
    return "options_only"


def user_has_free_text_input(
    values: dict[str, Any],
    schema: dict[str, Any] | None = None,
    *,
    comment: str = "",
) -> bool:
    """是否含用户自由输入（非纯选项反馈）。"""
    if (comment or "").strip():
        return True
    if str(values.get(HUMAN_CLOSURE_DETAIL_ID) or "").strip():
        return True

    qmap = _question_by_id(schema)
    seen: set[str] = set()

    for qid, q in qmap.items():
        if qid in values:
            seen.add(qid)
        raw = values.get(qid)
        _, custom = split_question_answer(q, raw)
        if custom:
            return True

    for qid, raw in values.items():
        if qid in seen:
            continue
        q = qmap.get(qid, {})
        _, custom = split_question_answer(q, raw)
        if custom:
            return True

    return False


def format_hitl_feedback_structured(
    values: dict[str, Any],
    schema: dict[str, Any] | None,
    *,
    comment: str = "",
) -> str:
    """格式化问卷反馈：题目标题、用户选项、用户输入。"""
    mode = classify_hitl_feedback_mode(values, schema, comment=comment)
    mode_label = "含自由输入" if mode == "with_free_text" else "仅选项"
    lines = [
        _HITL_FORM_PREFIX,
        "",
        "## 用户问卷反馈（结构化）",
        "",
        f"**反馈模式**：{mode_label}",
        "",
    ]

    qmap = _question_by_id(schema)
    ordered_ids: list[str] = []
    for q in (schema or {}).get("questions") or []:
        if isinstance(q, dict):
            qid = str(q.get("id") or "").strip()
            if qid and qid not in (
                HUMAN_SUPPLEMENT_QUESTION_ID,
                HUMAN_CLOSURE_DETAIL_ID,
            ):
                ordered_ids.append(qid)
    for qid in values:
        if qid not in ordered_ids and qid not in (
            HUMAN_SUPPLEMENT_QUESTION_ID,
            HUMAN_CLOSURE_DETAIL_ID,
        ):
            ordered_ids.append(qid)

    for qid in ordered_ids:
        raw = values.get(qid)
        if raw is None or str(raw).strip() == "":
            continue
        q = qmap.get(qid, {"id": qid, "title": qid})
        title = str(q.get("title") or qid).strip()
        opts, custom = split_question_answer(q, raw)
        lines.append(f"### {title}")
        lines.append(f"- **用户选项**：{_format_option_labels(q, opts)}")
        lines.append(f"- **用户输入**：{custom if custom else '（无）'}")
        lines.append("")

    detail_text = str(values.get(HUMAN_CLOSURE_DETAIL_ID) or "").strip()
    if detail_text:
        lines.append("### 进一步处理要求（系统须调研，不得原样做成确认题）")
        lines.append("- **用户选项**：（无）")
        lines.append(f"- **用户输入**：{detail_text}")
        lines.append("")

    supplement_q = qmap.get(HUMAN_SUPPLEMENT_QUESTION_ID, {})
    supplement_title = str(supplement_q.get("title") or "请问您还有什么需要补充的吗？").strip()
    supplement_raw = values.get(HUMAN_SUPPLEMENT_QUESTION_ID)
    supplement_text = ""
    if supplement_raw is not None:
        _, supplement_text = split_question_answer(
            supplement_q or {"id": HUMAN_SUPPLEMENT_QUESTION_ID, "type": "textarea"},
            supplement_raw,
        )
    if supplement_text:
        lines.append(f"### {supplement_title}")
        lines.append("- **用户选项**：（无）")
        lines.append(f"- **用户输入**：{supplement_text}")
        lines.append("")

    if (comment or "").strip():
        lines.append("### 表单补充说明")
        lines.append("- **用户选项**：（无）")
        lines.append(f"- **用户输入**：{comment.strip()}")
        lines.append("")

    return "\n".join(lines).strip()


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def build_hitl_round_record(
    values: dict[str, Any],
    schema: dict[str, Any] | None,
    *,
    comment: str = "",
    intervention_kind: str = "interactive",
    feedback_mode: HitlFeedbackMode | str = "options_only",
) -> dict[str, Any]:
    """构建单轮问卷结构化记录（与 ``hitl_context.json`` rounds[] 项同构）。"""
    mode = feedback_mode if isinstance(feedback_mode, str) else feedback_mode
    qmap = _question_by_id(schema)
    ordered_ids: list[str] = []
    for q in (schema or {}).get("questions") or []:
        if isinstance(q, dict):
            qid = str(q.get("id") or "").strip()
            if qid and qid not in (
                HUMAN_SUPPLEMENT_QUESTION_ID,
                HUMAN_CLOSURE_DETAIL_ID,
            ):
                ordered_ids.append(qid)
    for qid in values:
        if qid not in ordered_ids and qid not in (
            HUMAN_SUPPLEMENT_QUESTION_ID,
            HUMAN_CLOSURE_DETAIL_ID,
        ):
            ordered_ids.append(qid)

    questions: list[dict[str, Any]] = []
    for qid in ordered_ids:
        raw = values.get(qid)
        if raw is None or str(raw).strip() == "":
            continue
        q = qmap.get(qid, {"id": qid, "title": qid})
        title = str(q.get("title") or qid).strip()
        opts, custom = split_question_answer(q, raw)
        opt_index = _question_option_index(q)
        questions.append(
            {
                "id": qid,
                "title": title,
                "selected_options": opts,
                "option_labels": [opt_index.get(k, k) for k in opts],
                "user_input": custom,
            }
        )

    detail_text = str(values.get(HUMAN_CLOSURE_DETAIL_ID) or "").strip()
    if detail_text:
        questions.append(
            {
                "id": HUMAN_CLOSURE_DETAIL_ID,
                "title": "进一步处理要求",
                "selected_options": [],
                "option_labels": [],
                "user_input": detail_text,
            }
        )

    supplement_q = qmap.get(HUMAN_SUPPLEMENT_QUESTION_ID, {})
    supplement_raw = values.get(HUMAN_SUPPLEMENT_QUESTION_ID)
    supplement_text = ""
    if supplement_raw is not None:
        _, supplement_text = split_question_answer(
            supplement_q or {"id": HUMAN_SUPPLEMENT_QUESTION_ID, "type": "textarea"},
            supplement_raw,
        )
    if supplement_text:
        supplement_title = str(supplement_q.get("title") or "请问您还有什么需要补充的吗？").strip()
        questions.append(
            {
                "id": HUMAN_SUPPLEMENT_QUESTION_ID,
                "title": supplement_title,
                "selected_options": [],
                "option_labels": [],
                "user_input": supplement_text,
            }
        )

    kind = (intervention_kind or "interactive").strip().lower() or "interactive"
    return {
        "intervention_kind": kind,
        "submitted_at": _now_iso(),
        "feedback_mode": str(mode),
        "comment": (comment or "").strip(),
        "questions": questions,
    }


def format_hitl_current_round_prompt(round_record: dict[str, Any]) -> str:
    """格式化为注入 host prompt 的「仅本轮」结构化反馈块。"""
    payload = {"current_round": round_record}
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    return (
        "## 本轮人工确认反馈（结构化）\n\n"
        "以下为**本轮**问卷提交结果；全节点历史见节点归档 ``hitl_context.json``（生成会议产出前须 read_file）。\n\n"
        f"```json\n{body}\n```\n"
    )
