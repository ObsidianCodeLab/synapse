"""试飞优化节点：重处理轮次与多轮优化建议（meeting_pipeline.context）。"""

from __future__ import annotations

import logging
from typing import Any

from synapse.rd_meeting.diff_analysis_exec import NODE_ID
from synapse.rd_meeting.task_exec_rounds import (
    _now_iso,
    _pipeline_context,
    _summary_from_result,
    _synthetic_round_from_payload,
)

logger = logging.getLogger(__name__)

DIFF_ROUNDS_CTX_KEY = "diff_analysis_rounds"


def _rounds_from_ctx(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    raw = ctx.get(DIFF_ROUNDS_CTX_KEY)
    if not isinstance(raw, list):
        return []
    return [dict(x) for x in raw if isinstance(x, dict)]


def _save_da_rounds(pipe: Any, rounds: list[dict[str, Any]]) -> None:
    ctx = pipe._data.get("context")
    if not isinstance(ctx, dict):
        ctx = {}
    ctx[DIFF_ROUNDS_CTX_KEY] = rounds
    pipe._data["context"] = ctx
    pipe.save()


def _backfill_rounds_from_diff_analysis_payload(scope_id: str) -> list[dict[str, Any]]:
    """无 context 轮次时，仅从试飞优化结果回填（绝不读取 task_exec）。"""
    from synapse.rd_meeting.diff_analysis_exec import load_diff_analysis_payload

    payload = load_diff_analysis_payload(scope_id)
    if not isinstance(payload, dict):
        return []
    if not str(payload.get("started_at") or payload.get("finished_at") or "").strip():
        return []
    entry = _synthetic_round_from_payload(payload, round_num=1)
    entry["status"] = str(payload.get("status") or entry.get("status") or "unknown")
    return [entry]


def load_diff_analysis_rounds(scope_id: str) -> list[dict[str, Any]]:
    sid = (scope_id or "").strip()
    if not sid:
        return []
    _, ctx = _pipeline_context(sid)
    rounds = _rounds_from_ctx(ctx)
    if rounds:
        return rounds
    return _backfill_rounds_from_diff_analysis_payload(sid)


def current_diff_analysis_round(scope_id: str) -> int:
    rounds = load_diff_analysis_rounds(scope_id)
    if not rounds:
        return 0
    return int(rounds[-1].get("round") or len(rounds))


def on_diff_analysis_cli_starting(scope_id: str, *, reason: str = "") -> dict[str, Any] | None:
    pipe, ctx = _pipeline_context(scope_id)
    if pipe is None:
        return None
    rounds = _rounds_from_ctx(ctx)
    text = (reason or "").strip()

    if not rounds:
        entry: dict[str, Any] = {
            "round": 1,
            "kind": "initial",
            "reason": text,
            "requested_at": _now_iso(),
            "started_at": _now_iso(),
            "finished_at": None,
            "status": "running",
            "summary": {},
        }
        rounds.append(entry)
        _save_da_rounds(pipe, rounds)
        return entry

    last = rounds[-1]
    st = str(last.get("status") or "").strip().lower()
    if st == "pending":
        last["status"] = "running"
        last["started_at"] = last.get("started_at") or _now_iso()
        if text and not str(last.get("reason") or "").strip():
            last["reason"] = text
        _save_da_rounds(pipe, rounds)
        return last

    if st in ("ok", "failed", "partial", "superseded", "completed"):
        round_no = int(last.get("round") or len(rounds)) + 1
        entry = {
            "round": round_no,
            "kind": "reprocess" if text else "initial",
            "reason": text,
            "requested_at": _now_iso(),
            "started_at": _now_iso(),
            "finished_at": None,
            "status": "running",
            "summary": {},
        }
        rounds.append(entry)
        _save_da_rounds(pipe, rounds)
        return entry

    if st == "running":
        return last

    last["status"] = "running"
    last["started_at"] = last.get("started_at") or _now_iso()
    _save_da_rounds(pipe, rounds)
    return last


def on_diff_analysis_cli_finished(scope_id: str, result: dict[str, Any]) -> dict[str, Any] | None:
    pipe, ctx = _pipeline_context(scope_id)
    if pipe is None:
        return None
    rounds = _rounds_from_ctx(ctx)
    if not rounds:
        entry = _synthetic_round_from_payload(result)
        entry["status"] = str(result.get("status") or entry.get("status") or "unknown")
        rounds.append(entry)
        _save_da_rounds(pipe, rounds)
        return entry

    last = rounds[-1]
    last["status"] = str(result.get("status") or "unknown").strip().lower()
    last["finished_at"] = result.get("finished_at") or _now_iso()
    last["started_at"] = last.get("started_at") or result.get("started_at")
    last["summary"] = _summary_from_result(result)
    _save_da_rounds(pipe, rounds)
    return last


def prepare_diff_analysis_reprocess(scope_id: str, *, reason: str) -> dict[str, Any] | None:
    """优化处理：追加 pending 轮次并写入 reason。"""
    pipe, ctx = _pipeline_context(scope_id)
    if pipe is None:
        return None
    rounds = _rounds_from_ctx(ctx)
    text = (reason or "").strip()
    if not rounds:
        rounds.append(
            {
                "round": 1,
                "kind": "initial",
                "reason": "",
                "requested_at": _now_iso(),
                "started_at": _now_iso(),
                "finished_at": _now_iso(),
                "status": "ok",
                "summary": {},
            }
        )
    round_no = len(rounds) + 1
    entry: dict[str, Any] = {
        "round": round_no,
        "kind": "reprocess",
        "reason": text,
        "requested_at": _now_iso(),
        "started_at": None,
        "finished_at": None,
        "status": "pending",
        "summary": {},
    }
    rounds.append(entry)
    _save_da_rounds(pipe, rounds)
    return entry


def format_diff_analysis_reprocess_prompt_block(
    scope_id: str,
    *,
    current_reason: str = "",
) -> str:
    sid = (scope_id or "").strip()
    current = (current_reason or "").strip()
    rounds = load_diff_analysis_rounds(sid) if sid else []
    if not rounds and not current:
        return ""

    current_round_no = int(rounds[-1].get("round") or len(rounds)) if rounds else 1
    is_reprocess = bool(
        current or len(rounds) > 1 or (rounds and str(rounds[-1].get("kind") or "") == "reprocess")
    )
    if not is_reprocess:
        return ""

    if not current and rounds:
        last = rounds[-1]
        if str(last.get("status") or "").strip().lower() in ("pending", "running", ""):
            current = str(last.get("reason") or "").strip()

    history_lines: list[str] = []
    if len(rounds) > 1:
        for item in rounds[:-1]:
            reason = str(item.get("reason") or "").strip()
            if not reason:
                continue
            round_no = int(item.get("round") or 0)
            kind = str(item.get("kind") or "initial")
            label = "首轮" if kind == "initial" else "优化处理"
            history_lines.append(f"- 第{round_no}轮（{label}）：{reason}")

    if not history_lines and not current:
        return ""

    lines: list[str] = []
    if history_lines:
        lines.extend(
            [
                "【试飞优化 · 历史轮次用户要求（须一并遵循）】",
                *history_lines,
                "以上各轮要求均须满足；若与本轮最高优先级要求冲突，以本轮要求为准。",
                "",
            ]
        )
    if current:
        round_suffix = f"（第{current_round_no}轮）" if len(rounds) > 1 else ""
        lines.extend(
            [
                "【用户优化处理要求 · 最高优先级】",
                f"用户优化处理要求{round_suffix}：{current}",
                "本条优先级高于试飞优化方案及一切历史结论；冲突时以用户优化处理要求为准。",
            ]
        )
    return "\n".join(lines)


def uses_diff_analysis_node(node_id: str) -> bool:
    return (node_id or "").strip() == NODE_ID
