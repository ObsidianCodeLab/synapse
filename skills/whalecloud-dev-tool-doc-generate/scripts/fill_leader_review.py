#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fill_leader_review.py
─────────────────────
将 leader_review.json 的结构化数据填充到「研发组长评审报告.html」模板，
生成独立可在浏览器打开的 HTML 评审报告文件。

调用方式（由 whalecloud-dev-tool-doc-generate 执行）：
    python scripts/fill_leader_review.py \
        --context   <leader_review.json 路径> \
        --template  <templates/研发组长评审报告.html 路径> \
        --output    <目标 HTML 路径>

也支持通过环境变量传参（CONTEXT_JSON_PATH / TEMPLATE_PATH / OUTPUT_PATH）。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone
from html import escape as he


# ─── 工具函数 ────────────────────────────────────────────────────────────────

def _risk_color(level: str) -> str:
    """返回风险等级对应的 CSS 类名。"""
    return {"high": "red", "medium": "amber", "low": "green"}.get(level, "primary")


def _risk_label(level: str) -> str:
    return {"high": "高风险", "medium": "中风险", "low": "低风险"}.get(level, level)


def _risk_desc(level: str) -> str:
    return {
        "high": "需重点关注，制定应对方案",
        "medium": "需关注，已有应对措施",
        "low": "风险可控",
    }.get(level, "")


def _score_color(score: float) -> str:
    if score >= 80:
        return "green"
    if score >= 60:
        return "amber"
    return "red"


def _test_icon(result: str) -> str:
    return {"passed": "✅", "failed": "❌", "skipped": "⏭️"}.get(result, "❓")


def _fmt_now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _reviewer_avatar_color(role: str) -> str:
    colors = {
        "submitter": "#6366f1",
        "team_lead": "#3b82f6",
        "product_lead": "#f59e0b",
        "internal": "#8b5cf6",
    }
    return colors.get(role, "#64748b")


def _reviewer_role_label(role: str) -> str:
    return {
        "submitter": "开发者",
        "team_lead": "团队负责人",
        "product_lead": "产品负责人",
        "internal": "系统内部人员",
    }.get(role, role)


# ─── HTML 片段生成 ───────────────────────────────────────────────────────────

def build_stage_summaries_html(stage_summaries: list[dict]) -> str:
    rows = []
    for item in stage_summaries:
        included = item.get("included", True)
        badge_cls = "done" if included else "skipped"
        badge_text = "已完成" if included else "已跳过"
        item_cls = "" if included else " skipped"
        summary_html = (
            f'<p class="tl-summary">{he(item.get("summary", ""))}</p>'
            if included and item.get("summary")
            else ""
        )
        rows.append(f"""
        <div class="tl-item{item_cls}">
          <div class="tl-dot"></div>
          <div class="tl-header">
            <span class="tl-name">{he(item.get("node_name", item.get("node_id", "")))}</span>
            <span class="tl-badge {badge_cls}">{badge_text}</span>
          </div>
          {summary_html}
        </div>""")
    return "\n".join(rows) if rows else "<p style='color:var(--muted)'>暂无产出记录</p>"


def build_diff_repos_rows_html(repos: list[dict]) -> str:
    if not repos:
        return "<tr><td colspan='5' style='color:var(--muted);text-align:center'>暂无代码变更记录</td></tr>"
    rows = []
    for repo in repos:
        repo_name = he(repo.get("repo_name") or repo.get("repo_url", ""))
        branch = he(repo.get("branch", ""))
        commits = repo.get("commit_count", 0)
        added = repo.get("lines_added", 0)
        deleted = repo.get("lines_deleted", 0)
        rows.append(f"""
        <tr>
          <td>{repo_name}</td>
          <td>{branch}</td>
          <td>{commits}</td>
          <td class="diff-add">+{added}</td>
          <td class="diff-del">-{deleted}</td>
        </tr>""")
    return "\n".join(rows)


def build_test_cases_html(test_cases: list[dict]) -> str:
    if not test_cases:
        return '<div class="test-item"><span style="color:var(--muted)">暂无测试用例记录</span></div>'
    items = []
    for tc in test_cases:
        result = tc.get("result", "skipped")
        icon = _test_icon(result)
        name = he(tc.get("name", ""))
        items.append(f"""
        <div class="test-item">
          <span class="test-icon">{icon}</span>
          <span class="test-name">{name}</span>
          <span class="test-result {result}">{result}</span>
        </div>""")
    return "\n".join(items)


def build_risk_items_html(risk_items: list[dict]) -> str:
    if not risk_items:
        return '<div class="risk-item"><div class="risk-body"><p>暂无风险项</p></div></div>'
    items = []
    for risk in risk_items:
        level = risk.get("level", "low")
        badge_cls = _risk_color(level)
        badge_text = _risk_label(level)
        title = he(risk.get("title", "风险项"))
        desc = he(risk.get("description", ""))
        mitigation = risk.get("mitigation", "")
        mitigation_html = (
            f'<p class="mitigation">✅ 应对措施：{he(mitigation)}</p>'
            if mitigation else ""
        )
        items.append(f"""
        <div class="risk-item">
          <span class="risk-badge {badge_cls}">{badge_text}</span>
          <div class="risk-body">
            <h4>{title}</h4>
            <p>{desc}</p>
            {mitigation_html}
          </div>
        </div>""")
    return "\n".join(items)


def build_reviewers_html(reviewers: list[dict]) -> str:
    if not reviewers:
        return ""
    chips = []
    for rv in reviewers:
        name = rv.get("reviewer_name") or rv.get("employee_id", "")
        role = rv.get("role", "internal")
        role_label = _reviewer_role_label(role)
        color = _reviewer_avatar_color(role)
        initial = he(name[:1]) if name else "?"
        chips.append(f"""
        <div class="reviewer-chip">
          <div class="reviewer-avatar" style="background:{color}">{initial}</div>
          <div class="reviewer-info">
            <div class="name">{he(name)}</div>
            <div class="role">{he(role_label)}</div>
          </div>
        </div>""")
    return "\n".join(chips)


def _strip_if_block(html: str, key: str, value: str) -> str:
    """简单处理 {{#if KEY}} ... {{/if}} 块。"""
    import re
    if value:
        # 有值：展开块、移除标签
        html = re.sub(
            r'\{\{#if ' + re.escape(key) + r'\}\}(.*?)\{\{/if\}\}',
            r'\1', html, flags=re.DOTALL
        )
    else:
        # 无值：移除整个块
        html = re.sub(
            r'\{\{#if ' + re.escape(key) + r'\}\}.*?\{\{/if\}\}',
            '', html, flags=re.DOTALL
        )
    return html


# ─── 主填充逻辑 ──────────────────────────────────────────────────────────────

def fill(context: dict, template_text: str) -> str:
    summary = context.get("summary") or {}
    diff_stats = context.get("diff_stats") or {}
    entropy = context.get("entropy_stats") or {}
    test_cases = context.get("test_cases") or []
    risk_items = context.get("risk_items") or []
    reviewers = context.get("reviewers") or []
    stage_summaries = context.get("stage_summaries") or []

    # 测试统计
    test_total = len(test_cases)
    test_passed = sum(1 for t in test_cases if t.get("result") == "passed")
    test_rate = round(test_passed / test_total * 100) if test_total else 0

    # 代码统计
    total_added = diff_stats.get("total_lines_added", 0)
    total_deleted = diff_stats.get("total_lines_deleted", 0)
    total_changed = total_added + total_deleted

    # 综合评分
    overall_score = summary.get("overall_quality_score", 0)
    risk_level = summary.get("overall_risk_level", "low")

    generated_at = context.get("generated_at") or _fmt_now()

    # HTML 片段
    stage_html = build_stage_summaries_html(stage_summaries)
    diff_rows_html = build_diff_repos_rows_html(diff_stats.get("repos") or [])
    test_html = build_test_cases_html(test_cases)
    risk_html = build_risk_items_html(risk_items)
    reviewers_html = build_reviewers_html(reviewers)

    diff_summary = diff_stats.get("diff_summary", "")

    # 占位符替换表
    replacements: dict[str, str] = {
        "DEMAND_NO":               he(context.get("demand_no", "")),
        "REQUIREMENT_NAME":        he(context.get("requirement_name", "")),
        "ASSIGNEE_NAME":           he(context.get("assignee_name", "")),
        "GENERATED_AT":            he(generated_at),
        "OVERALL_QUALITY_SCORE":   str(overall_score),
        "SCORE_COLOR":             _score_color(overall_score),
        "RISK_LEVEL_LABEL":        he(_risk_label(risk_level)),
        "RISK_LEVEL_DESC":         he(_risk_desc(risk_level)),
        "RISK_COLOR":              _risk_color(risk_level),
        "TEST_PASS_RATE":          str(test_rate),
        "TEST_PASS_COUNT":         str(test_passed),
        "TEST_TOTAL_COUNT":        str(test_total),
        "RISK_TOTAL_COUNT":        str(len(risk_items)),
        "TOTAL_LINES_CHANGED":     str(total_changed),
        "TOTAL_LINES_ADDED":       str(total_added),
        "TOTAL_LINES_DELETED":     str(total_deleted),
        "SUMMARY_CONCLUSION":      he(summary.get("conclusion", "")),
        "STAGE_SUMMARIES_HTML":    stage_html,
        "DIFF_REPOS_ROWS_HTML":    diff_rows_html,
        "DIFF_SUMMARY":            he(diff_summary),
        "TEST_CASES_HTML":         test_html,
        "RISK_ITEMS_HTML":         risk_html,
        "ENTROPY_AVG_COMPLEXITY":  str(entropy.get("avg_complexity", 0)),
        "ENTROPY_MAX_COMPLEXITY":  str(entropy.get("max_complexity", 0)),
        "ENTROPY_DUPLICATE_LINES": str(entropy.get("duplicate_lines", 0)),
        "ENTROPY_NEW_WARNINGS":    str(entropy.get("new_warnings", 0)),
        "ENTROPY_CONCLUSION":      he(entropy.get("entropy_conclusion", "")),
        "REVIEWERS_HTML":          reviewers_html,
    }

    html = template_text
    # 处理 {{#if}} 块
    for key in ("DIFF_SUMMARY", "ENTROPY_CONCLUSION"):
        html = _strip_if_block(html, key, replacements[key])

    # 替换 {{KEY}} 占位符
    for key, val in replacements.items():
        html = html.replace("{{" + key + "}}", val)

    return html


# ─── CLI 入口 ─────────────────────────────────────────────────────────────────

def _resolve_args() -> tuple[Path, Path, Path]:
    """优先命令行参数，fallback 环境变量。"""
    parser = argparse.ArgumentParser(description="fill_leader_review: HTML 报告填充")
    parser.add_argument("--context",  help="leader_review.json 路径")
    parser.add_argument("--template", help="模板 HTML 路径")
    parser.add_argument("--output",   help="输出 HTML 路径")
    args = parser.parse_args()

    context_path  = Path(args.context  or os.environ.get("CONTEXT_JSON_PATH", ""))
    template_path = Path(args.template or os.environ.get("TEMPLATE_PATH", ""))
    output_path   = Path(args.output   or os.environ.get("OUTPUT_PATH", ""))

    missing = [n for n, p in [("--context", context_path), ("--template", template_path), ("--output", output_path)] if not str(p)]
    if missing:
        print(f"[fill_leader_review] 缺少必填参数：{', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    return context_path, template_path, output_path


def main() -> None:
    context_path, template_path, output_path = _resolve_args()

    # 读取 JSON
    if not context_path.is_file():
        print(f"[fill_leader_review] context 文件不存在：{context_path}", file=sys.stderr)
        sys.exit(1)
    with open(context_path, encoding="utf-8") as f:
        context = json.load(f)

    # 读取模板
    if not template_path.is_file():
        print(f"[fill_leader_review] 模板文件不存在：{template_path}", file=sys.stderr)
        sys.exit(1)
    with open(template_path, encoding="utf-8") as f:
        template_text = f.read()

    # 填充
    html = fill(context, template_text)

    # 写出
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    size_kb = output_path.stat().st_size / 1024
    print(f"[fill_leader_review] 生成成功：{output_path}（{size_kb:.1f} KB）")

    if size_kb < 5:
        print("[fill_leader_review] 警告：文件大小 < 5KB，可能内容不完整", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
