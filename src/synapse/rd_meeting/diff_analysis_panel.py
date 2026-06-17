"""试飞优化评审面板：修复建议章节、试飞关键内容、自动评审提示。"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from synapse.rd_meeting.diff_analysis_exec import PLAN_FILENAME, PLAN_NODE_ID
from synapse.rd_meeting.flight_optimize_gate import evaluate_flight_optimize_need
from synapse.rd_meeting.paths import archive_node_dir, meeting_pipeline_path
from synapse.rd_meeting.room_runtime import read_meeting_pipeline_json
from synapse.rd_meeting.system_node_display import (
    _load_pipeline_context_asset,
    build_code_commit_display,
)
from synapse.rd_meeting.task_check_assets import _load_code_commit_assets
from synapse.rd_sop.nodes import stage_name_for_id

DEV_STAGE_NAME = stage_name_for_id(4)
PLAN_SECTION_HEADING = "优化研发计划"
IDENTIFIED_ISSUES_HEADING = "已识别问题清单"
PLAN_ROUNDS_CTX_KEY = "flight_optimize_plan_rounds"


def _read_text(path: Path) -> str:
    if not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def extract_markdown_section(md: str, heading: str) -> str:
    """提取 ``## heading`` 至下一同级 ``##`` 之间的正文（含子标题）。"""
    text = (md or "").strip()
    if not text:
        return ""
    pattern = re.compile(rf"^##\s*{re.escape(heading)}\s*$", re.MULTILINE | re.IGNORECASE)
    match = pattern.search(text)
    if not match:
        return ""
    start = match.end()
    rest = text[start:]
    next_h2 = re.search(r"^##\s+\S", rest, re.MULTILINE)
    body = rest[: next_h2.start()] if next_h2 else rest
    section = f"## {heading}\n{body.strip()}"
    return section.strip()


def _plan_rounds_from_context(scope_id: str) -> list[dict[str, Any]]:
    raw = _load_pipeline_context_asset(scope_id, PLAN_ROUNDS_CTX_KEY)
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(dict(item))
    return out


_PLAN_ITEM_RE = re.compile(
    r"^###\s*计划项\s*(\d+)\s*[：:]\s*(.*?)\s*$",
    re.MULTILINE,
)


def extract_plan_items(md: str) -> tuple[str, list[dict[str, Any]]]:
    """将优化研发计划拆成引导语 + 各计划项（供 TAB 展示）。"""
    text = (md or "").strip()
    if not text:
        return "", []

    section = (
        extract_markdown_section(text, PLAN_SECTION_HEADING)
        if re.search(r"^##\s*优化研发计划\s*$", text, re.MULTILINE | re.IGNORECASE)
        else text
    )
    if not section:
        return "", []

    body = re.sub(
        r"^##\s*优化研发计划\s*\n?",
        "",
        section,
        count=1,
        flags=re.MULTILINE | re.IGNORECASE,
    ).strip()
    if not body:
        return "", []

    matches = list(_PLAN_ITEM_RE.finditer(body))
    if not matches:
        return body, [
            {
                "item_no": 1,
                "title": "计划项 1",
                "subtitle": "",
                "label": "计划项 1",
                "markdown": body,
            }
        ]

    intro = body[: matches[0].start()].strip()
    items: list[dict[str, Any]] = []
    for idx, match in enumerate(matches):
        item_no = int(match.group(1))
        subtitle = str(match.group(2) or "").strip()
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        item_md = body[start:end].strip()
        label = f"计划项 {item_no}"
        items.append(
            {
                "item_no": item_no,
                "title": f"计划项 {item_no}",
                "subtitle": subtitle,
                "label": label,
                "markdown": item_md,
            }
        )
    return intro, items


def _section_with_plan_items(
    *,
    round_no: int,
    title: str,
    md: str,
    source: str,
) -> dict[str, Any]:
    intro, plan_items = extract_plan_items(md)
    section_md = extract_markdown_section(md, PLAN_SECTION_HEADING) if md else ""
    return {
        "round": round_no,
        "title": title,
        "markdown": section_md,
        "intro": intro,
        "plan_items": plan_items,
        "source": source,
    }


def list_optimize_plan_sections(scope_id: str) -> list[dict[str, Any]]:
    """各轮试飞优化方案的「优化研发计划」章节。"""
    sid = (scope_id or "").strip()
    sections: list[dict[str, Any]] = []

    for item in _plan_rounds_from_context(sid):
        rnd = int(item.get("round") or 0)
        md = str(item.get("markdown") or item.get("plan_md") or "").strip()
        section = extract_markdown_section(md, PLAN_SECTION_HEADING) if md else ""
        if section or extract_plan_items(md)[1]:
            sections.append(
                _section_with_plan_items(
                    round_no=rnd,
                    title=f"第 {rnd} 轮修复建议" if rnd > 1 else "修复建议",
                    md=md,
                    source=str(item.get("source") or ""),
                )
            )

    current_path = archive_node_dir(sid, DEV_STAGE_NAME, PLAN_NODE_ID) / PLAN_FILENAME
    current_md = _read_text(current_path)
    current_round = max((s["round"] for s in sections), default=0) + 1
    if current_md:
        already = any(str(s.get("source") or "") == str(current_path) for s in sections)
        if not already:
            section = extract_markdown_section(current_md, PLAN_SECTION_HEADING)
            if section or extract_plan_items(current_md)[1]:
                sections.append(
                    _section_with_plan_items(
                        round_no=current_round,
                        title="修复建议" if current_round <= 1 else f"第 {current_round} 轮修复建议",
                        md=current_md,
                        source=str(current_path),
                    )
                )

    sections.sort(key=lambda x: int(x.get("round") or 0))
    return sections


def _latest_plan_markdown(scope_id: str) -> str:
    """当前试飞优化方案全文（优先磁盘最新，其次 context 归档）。"""
    sid = (scope_id or "").strip()
    path = archive_node_dir(sid, DEV_STAGE_NAME, PLAN_NODE_ID) / PLAN_FILENAME
    md = _read_text(path)
    if md.strip():
        return md
    rounds = _plan_rounds_from_context(sid)
    if rounds:
        return str(rounds[-1].get("markdown") or rounds[-1].get("plan_md") or "")
    return ""


def resolve_identified_issues_markdown(scope_id: str) -> str | None:
    """试飞优化方案中的「已识别问题清单」章节。"""
    md = _latest_plan_markdown(scope_id)
    if not md.strip():
        return None
    section = extract_markdown_section(md, IDENTIFIED_ISSUES_HEADING)
    text = (section or "").strip()
    return text or None


def _initial_code_commit_display(scope_id: str) -> dict[str, Any] | None:
    assets = _load_code_commit_assets(scope_id)
    if not assets:
        return None
    display = build_code_commit_display(assets)
    return display if isinstance(display, dict) else None


def resolve_flight_key_content(
    scope_id: str,
    payload: dict[str, Any] | None,
) -> dict[str, Any]:
    """试飞优化关键内容：优先 diff_analysis 提交后试飞，否则代码提交节点首次试飞。"""
    sid = (scope_id or "").strip()
    data = payload if isinstance(payload, dict) else {}
    commit_phase = str(data.get("commit_phase") or "").strip()
    code_commit = data.get("code_commit") if isinstance(data.get("code_commit"), dict) else None

    display: dict[str, Any] | None = None
    source = "exception_check"
    round_no = 1

    if code_commit and commit_phase in ("running", "done"):
        nested = code_commit.get("display")
        if isinstance(nested, dict):
            display = nested
        else:
            display = build_code_commit_display(code_commit)
        source = "diff_analysis_commit"
        rounds = _plan_rounds_from_context(sid)
        round_no = max((int(r.get("round") or 0) for r in rounds), default=0) + 1
        if commit_phase == "done":
            round_no = max(round_no, int(data.get("optimization_round") or 1))
    else:
        display = _initial_code_commit_display(sid)

    if not display:
        archive_text = _read_text(
            archive_node_dir(sid, DEV_STAGE_NAME, "exception_check") / "试飞结果.md"
        )
        return {
            "round": round_no,
            "source": source,
            "display": None,
            "markdown": archive_text.strip() or None,
            "has_issues": evaluate_flight_optimize_need(sid) == "needed",
        }

    flight = display.get("flight") if isinstance(display.get("flight"), dict) else {}
    status = str(flight.get("status") or display.get("status") or "").strip().lower()
    has_issues = status in ("failed", "timeout", "partial") or evaluate_flight_optimize_need(sid) == "needed"

    from synapse.rd_meeting.code_commit_assets import format_flight_result_report

    assets_for_md = code_commit if code_commit else _load_code_commit_assets(sid)
    markdown = ""
    if isinstance(assets_for_md, dict) and assets_for_md:
        markdown = format_flight_result_report(assets_for_md, node_name="试飞结果").strip()

    return {
        "round": round_no,
        "source": source,
        "display": display,
        "markdown": markdown or None,
        "has_issues": has_issues,
    }


def build_optimize_comment_hint(scope_id: str, payload: dict[str, Any] | None) -> str:
    """试飞仍有问题时，预填评审意见（优化方案关键摘要）。"""
    sections = list_optimize_plan_sections(scope_id)
    if not sections:
        flight = resolve_flight_key_content(scope_id, payload)
        md = str(flight.get("markdown") or "").strip()
        if md:
            lines = [ln for ln in md.splitlines() if ln.strip()][:40]
            return "\n".join(lines)
        return ""

    latest = sections[-1]
    body = str(latest.get("markdown") or "").strip()
    if not body:
        return ""

    problem_section = extract_markdown_section(
        _read_text(archive_node_dir(scope_id, DEV_STAGE_NAME, PLAN_NODE_ID) / PLAN_FILENAME),
        "已识别问题清单",
    )
    parts: list[str] = []
    if problem_section:
        parts.append(problem_section)
    parts.append(body)
    text = "\n\n".join(parts).strip()
    return text[:8000]


def archive_plan_round_before_regen(scope_id: str, *, round_no: int) -> None:
    """新一轮方案生成前，将当前方案归档到 pipeline context。"""
    sid = (scope_id or "").strip()
    raw = read_meeting_pipeline_json(sid)
    if not isinstance(raw, dict):
        raw = {}
    ctx = raw.get("context") if isinstance(raw.get("context"), dict) else {}

    plan_path = archive_node_dir(sid, DEV_STAGE_NAME, PLAN_NODE_ID) / PLAN_FILENAME
    plan_md = _read_text(plan_path)
    if not plan_md.strip():
        return

    rounds = _plan_rounds_from_context(sid)
    if any(int(r.get("round") or 0) == round_no for r in rounds):
        return
    rounds.append(
        {
            "round": round_no,
            "markdown": plan_md,
            "plan_md": plan_md,
            "source": str(plan_path),
            "archived_at": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
        }
    )
    ctx[PLAN_ROUNDS_CTX_KEY] = rounds
    raw["context"] = ctx
    from synapse.rd_meeting.room_runtime import save_meeting_pipeline

    save_meeting_pipeline(sid, raw)


def sync_commit_flight_to_exception_check(scope_id: str, commit_result: dict[str, Any]) -> None:
    """将 diff_analysis 提交后的试飞结果写回 exception_check 归档，供方案技能读取。"""
    from synapse.rd_meeting.code_commit_assets import write_flight_result_archive

    if not isinstance(commit_result, dict):
        return
    write_flight_result_archive(scope_id, DEV_STAGE_NAME, commit_result)
    raw = read_meeting_pipeline_json(scope_id)
    if isinstance(raw, dict):
        ctx = raw.get("context") if isinstance(raw.get("context"), dict) else {}
        ctx["code_commit_assets"] = commit_result
        raw["context"] = ctx
        from synapse.rd_meeting.room_runtime import save_meeting_pipeline

        save_meeting_pipeline(scope_id, raw)
