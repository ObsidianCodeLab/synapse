# -*- coding: utf-8 -*-
"""试飞优化方案.md 模板填充脚本（结构化 CONTEXT_JSON → Markdown）。

doc-generate 在 OUTPUT=试飞优化方案.md 时**必须**调用本脚本；禁止手填模板。
"""
from __future__ import annotations

import datetime
import json
import re
import sys
from pathlib import Path
from typing import Any

_LIST_KEYS = (
    "flight_summary",
    "identified_issues",
    "plan_items",
    "regression_risks",
    "change_summary",
)


def _g(ctx: dict[str, Any], key: str, default: str = "[待补充]") -> str:
    val = ctx.get(key, default)
    if val is None or val == "":
        return default
    return str(val)


def _escape_md_cell(val: Any) -> str:
    if val is None:
        return ""
    return str(val).replace("|", "\\|")


def _fill_row(template: str, item: dict[str, Any] | Any) -> str:
    row = template
    if isinstance(item, dict):
        for k, v in item.items():
            row = row.replace("{{" + k + "}}", _escape_md_cell(v))
    else:
        row = row.replace("{{.}}", _escape_md_cell(item))
    return row


def _empty_table_body(inner: str, *, fallback: str = "（无）") -> str:
    line = inner.strip().split("\n", 1)[0].strip()
    if not line.startswith("|"):
        return fallback
    col_count = max(1, line.count("|") - 1)
    cells = [fallback if i == 0 else "" for i in range(col_count)]
    return "| " + " | ".join(cells) + " |"


def _repl_each(
    result: str,
    list_name: str,
    items: list[Any],
    *,
    empty: str = "（无）",
) -> str:
    pattern = rf"\{{\{{#each {list_name}\}}\}}(.*?)\{{\{{/each\}}\}}"

    def _handler(match: re.Match[str]) -> str:
        inner = match.group(1)
        if not items:
            return _empty_table_body(inner, fallback=empty)
        rows = []
        for idx, item in enumerate(items, 1):
            line = inner.replace("{{@index}}", str(idx))
            rows.append(_fill_row(line, item))
        return "\n".join(rows)

    return re.sub(pattern, _handler, result, flags=re.DOTALL)


def validate_context(ctx: dict[str, Any]) -> list[str]:
    """校验 CONTEXT_JSON 契约；返回问题列表（空=通过）。"""
    issues: list[str] = []
    if not isinstance(ctx, dict):
        return ["CONTEXT_JSON 根节点须为 JSON 对象"]

    for key in ("WORK_ORDER_DIR", "OVERALL_FLIGHT_STATUS"):
        if not str(ctx.get(key) or "").strip():
            issues.append(f"缺少必填字段: {key}")

    for key in _LIST_KEYS:
        val = ctx.get(key)
        if val is not None and not isinstance(val, list):
            issues.append(f"{key} 须为数组")

    conclusion = ctx.get("conclusion")
    if conclusion is not None and not isinstance(conclusion, dict):
        issues.append("conclusion 须为对象")

    flight_summary = ctx.get("flight_summary") or []
    if isinstance(flight_summary, list) and not flight_summary:
        issues.append("flight_summary 不得为空（至少一条子单摘要）")

    identified = ctx.get("identified_issues") or []
    plan_items = ctx.get("plan_items") or []
    needs_change = True
    if isinstance(conclusion, dict):
        raw = conclusion.get("needs_code_change")
        if raw is False or str(raw).strip().lower() in ("否", "false", "no", "0"):
            needs_change = False

    if needs_change and isinstance(identified, list) and identified and not plan_items:
        issues.append("存在已识别问题时 plan_items 不得为空")

    if isinstance(identified, list):
        for idx, item in enumerate(identified):
            if not isinstance(item, dict):
                issues.append(f"identified_issues[{idx}] 须为对象")
                continue
            for field in ("sub_task", "check_item", "failure_summary", "root_cause"):
                if not str(item.get(field) or "").strip():
                    issues.append(f"identified_issues[{idx}] 缺少 {field}")

    if isinstance(plan_items, list):
        for idx, item in enumerate(plan_items):
            if not isinstance(item, dict):
                issues.append(f"plan_items[{idx}] 须为对象")
                continue
            for field in ("title", "problem_ref", "change_scope", "change_description"):
                if not str(item.get(field) or "").strip():
                    issues.append(f"plan_items[{idx}] 缺少 {field}")

    return issues


def _render_plan_items(plan_items: list[dict[str, Any]]) -> str:
    if not plan_items:
        return "（试飞已全部通过或无需代码优化）"

    sections: list[str] = []
    for idx, item in enumerate(plan_items, 1):
        title = _escape_md_cell(item.get("title", f"计划项 {idx}"))
        problem_ref = _escape_md_cell(item.get("problem_ref", ""))
        change_scope = _escape_md_cell(item.get("change_scope", ""))
        change_desc = str(item.get("change_description") or "").strip()
        standard = _escape_md_cell(item.get("standard_alignment", ""))
        before_code = str(item.get("before_code_snippet") or "").strip()
        after_code = str(item.get("after_code_structure") or "").strip()
        verification = item.get("verification_steps") or []

        lines = [
            f"### 计划项 {idx}：{title}",
            "",
            f"- **对应问题**：{problem_ref}",
            f"- **改动范围**：{change_scope}",
            "- **改动说明**：",
        ]
        if change_desc:
            for line in change_desc.splitlines():
                stripped = line.strip()
                if stripped:
                    lines.append(f"  {stripped}" if stripped[0].isdigit() else f"  1. {stripped}")
        else:
            lines.append("  （无）")

        if before_code:
            lines.extend(["", "- **重构前代码片段**：", "```cpp", before_code, "```"])

        if after_code:
            lines.extend(["", "- **重构后代码结构**：", "```cpp", after_code, "```"])

        lines.extend(["", f"- **规范对齐**：{standard}", "- **验证方式**："])
        if isinstance(verification, list) and verification:
            for vidx, step in enumerate(verification, 1):
                lines.append(f"  {vidx}. {step}")
        else:
            lines.append("  （无）")

        lines.append("")
        sections.append("\n".join(lines))

    return "\n\n".join(sections)


def _format_affected_sub_tasks(conclusion: dict[str, Any]) -> str:
    tasks = conclusion.get("affected_sub_tasks") or []
    if not tasks:
        return "（无）"
    if isinstance(tasks, list):
        return "、".join(str(t).strip() for t in tasks if str(t).strip())
    return str(tasks)


def _format_needs_code_change(conclusion: dict[str, Any]) -> str:
    raw = conclusion.get("needs_code_change")
    if raw is True or str(raw).strip().lower() in ("是", "true", "yes", "1"):
        return "是"
    if raw is False or str(raw).strip().lower() in ("否", "false", "no", "0"):
        return "否"
    return str(raw or "[待补充]")


def fill(template_path: str | Path, ctx_path: str | Path, out_path: str | Path) -> None:
    template_path = Path(template_path)
    ctx_path = Path(ctx_path)
    out_path = Path(out_path)

    with template_path.open(encoding="utf-8") as f:
        tmpl = f.read()
    with ctx_path.open(encoding="utf-8") as f:
        ctx = json.load(f)

    issues = validate_context(ctx)
    if issues:
        msg = "CONTEXT_JSON 契约校验失败:\n" + "\n".join(f"  - {x}" for x in issues)
        raise ValueError(msg)

    ts = ctx.get("TIMESTAMP") or datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    conclusion = ctx.get("conclusion") if isinstance(ctx.get("conclusion"), dict) else {}

    result = tmpl
    result = result.replace("{{TIMESTAMP}}", str(ts))
    result = result.replace("{{WORK_ORDER_DIR}}", _g(ctx, "WORK_ORDER_DIR"))
    result = result.replace("{{FLIGHT_RESULT_SOURCE}}", _g(ctx, "FLIGHT_RESULT_SOURCE"))
    result = result.replace("{{OVERALL_FLIGHT_STATUS}}", _g(ctx, "OVERALL_FLIGHT_STATUS"))
    result = result.replace("{{NEEDS_CODE_CHANGE}}", _format_needs_code_change(conclusion))
    result = result.replace(
        "{{AFFECTED_SUB_TASKS}}",
        _format_affected_sub_tasks(conclusion),
    )
    result = result.replace(
        "{{CONCLUSION_SUMMARY}}",
        _g(conclusion, "summary", _g(ctx, "CONCLUSION_SUMMARY")),
    )

    plan_items = ctx.get("plan_items") or []
    if not isinstance(plan_items, list):
        plan_items = []
    result = result.replace("{{PLAN_ITEMS_SECTION}}", _render_plan_items(plan_items))

    downstream = conclusion.get("downstream_suggestions") or ctx.get("downstream_suggestions") or []
    if not isinstance(downstream, list):
        downstream = [str(downstream)]

    for list_name in _LIST_KEYS:
        items = ctx.get(list_name) or []
        if not isinstance(items, list):
            items = []
        result = _repl_each(result, list_name, items)

    result = _repl_each(result, "downstream_suggestions", downstream, empty="  （无）")
    # 压缩表格行间多余空行
    result = re.sub(r"\n{3,}", "\n\n", result)

    if "{{" in result:
        leftover = re.findall(r"\{\{[^}]+\}\}", result)
        if leftover:
            raise ValueError(f"模板存在未解析占位符: {', '.join(sorted(set(leftover)))}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(result)
    print(f"[OK] Written: {out_path}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--validate-only":
        with open(sys.argv[2], encoding="utf-8") as f:
            ctx = json.load(f)
        issues = validate_context(ctx)
        if issues:
            print("CONTEXT_JSON 契约校验失败:")
            for x in issues:
                print(f"  - {x}")
            sys.exit(1)
        print("[OK] CONTEXT_JSON 契约校验通过")
        sys.exit(0)

    if len(sys.argv) < 4:
        print(
            "Usage: fill_flight_optimize_plan.py <template.md> <context.json> <output.md>\n"
            "       fill_flight_optimize_plan.py --validate-only <context.json>"
        )
        sys.exit(2)

    fill(sys.argv[1], sys.argv[2], sys.argv[3])
