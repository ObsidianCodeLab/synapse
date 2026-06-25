"""任务执行节点：重处理轮次与每轮建议（持久化于 meeting_pipeline.context）。"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Literal

from synapse.rd_meeting.pipeline import MeetingPipeline
from synapse.rd_meeting.paths import agent_sop_node_dir
from synapse.rd_meeting.task_exec import NODE_ID, load_task_exec_payload

logger = logging.getLogger(__name__)

ROUNDS_CTX_KEY = "task_exec_rounds"


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _pipeline_context(scope_id: str) -> tuple[MeetingPipeline | None, dict[str, Any]]:
    sid = (scope_id or "").strip()
    if not sid or not MeetingPipeline.exists(sid):
        return None, {}
    pipe = MeetingPipeline.load(sid)
    ctx = pipe._data.get("context")
    if not isinstance(ctx, dict):
        ctx = {}
    return pipe, ctx


def _rounds_from_ctx(ctx: dict[str, Any]) -> list[dict[str, Any]]:
    raw = ctx.get(ROUNDS_CTX_KEY)
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(dict(item))
    return out


def _save_rounds(pipe: MeetingPipeline, rounds: list[dict[str, Any]]) -> None:
    ctx = pipe._data.get("context")
    if not isinstance(ctx, dict):
        ctx = {}
    ctx[ROUNDS_CTX_KEY] = rounds
    pipe._data["context"] = ctx
    pipe.save()


def _summary_from_result(result: dict[str, Any]) -> dict[str, Any]:
    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    return {
        "total": int(summary.get("total") or 0),
        "ok": int(summary.get("ok") or 0),
        "failed": int(summary.get("failed") or 0),
        "total_tokens": int(summary.get("total_tokens") or 0),
        "total_duration_sec": int(summary.get("total_duration_sec") or 0),
    }


def _synthetic_round_from_payload(payload: dict[str, Any], *, round_num: int = 1) -> dict[str, Any]:
    status = str(payload.get("status") or "unknown").strip().lower()
    return {
        "round": round_num,
        "kind": "initial",
        "reason": "",
        "requested_at": payload.get("started_at") or _now_iso(),
        "started_at": payload.get("started_at"),
        "finished_at": payload.get("finished_at"),
        "status": status,
        "summary": _summary_from_result(payload),
    }


def _round_from_cli_result(
    result: dict[str, Any],
    *,
    round_num: int,
    kind: str,
    reason: str = "",
    requested_at: str | None = None,
) -> dict[str, Any]:
    return {
        "round": round_num,
        "kind": kind,
        "reason": reason,
        "requested_at": requested_at or result.get("started_at") or _now_iso(),
        "started_at": result.get("started_at"),
        "finished_at": result.get("finished_at"),
        "status": str(result.get("status") or "unknown").strip().lower(),
        "summary": _summary_from_result(result),
    }


def _placeholder_superseded_round(*, round_num: int = 1) -> dict[str, Any]:
    return {
        "round": round_num,
        "kind": "initial",
        "reason": "",
        "requested_at": None,
        "started_at": None,
        "finished_at": None,
        "status": "superseded",
        "summary": {},
        "note": "首轮执行详情未保留（重处理时已清理过程数据）",
    }


def _backfill_rounds_from_history(scope_id: str) -> list[dict[str, Any]]:
    """从 task_exec 节点 room_history 重建轮次（兼容功能上线前的重处理）。"""
    sid = (scope_id or "").strip()
    path = agent_sop_node_dir(sid, NODE_ID) / "room_history.jsonl"
    if not path.is_file():
        return []
    events: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        text = line.strip()
        if not text:
            continue
        try:
            raw = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(raw, dict):
            events.append(raw)

    rounds: list[dict[str, Any]] = []
    for ev in events:
        event_name = str(ev.get("event") or "").strip()
        node_id = str(ev.get("node_id") or "").strip()
        if node_id and node_id != NODE_ID:
            continue
        ts = str(ev.get("ts") or "").strip() or None

        if event_name == "reprocess_prep":
            reason = str(ev.get("reprocess_reason") or "").strip()
            if not rounds:
                rounds.append(_placeholder_superseded_round())
            elif str(rounds[-1].get("status") or "").lower() in ("running", "pending", ""):
                _finalize_open_round(rounds)
            rounds.append(
                {
                    "round": len(rounds) + 1,
                    "kind": "reprocess",
                    "reason": reason,
                    "requested_at": ts or _now_iso(),
                    "started_at": None,
                    "finished_at": None,
                    "status": "pending",
                    "summary": {},
                }
            )
            continue

        if event_name != "task_exec_cli_finished":
            continue

        result = ev.get("result") if isinstance(ev.get("result"), dict) else {}
        if not result:
            continue

        if rounds and str(rounds[-1].get("status") or "").lower() in ("pending", "running", ""):
            last = rounds[-1]
            last.update(
                _round_from_cli_result(
                    result,
                    round_num=int(last.get("round") or len(rounds)),
                    kind=str(last.get("kind") or "reprocess"),
                    reason=str(last.get("reason") or ""),
                    requested_at=str(last.get("requested_at") or ts or ""),
                )
            )
            continue

        kind = "reprocess" if rounds else "initial"
        rounds.append(
            _round_from_cli_result(
                result,
                round_num=len(rounds) + 1,
                kind=kind,
                requested_at=ts,
            )
        )
    return rounds


def _ensure_rounds_persisted(scope_id: str, rounds: list[dict[str, Any]]) -> None:
    if not rounds:
        return
    pipe, ctx = _pipeline_context(scope_id)
    if pipe is None or _rounds_from_ctx(ctx):
        return
    _save_rounds(pipe, rounds)


def load_task_exec_rounds(scope_id: str) -> list[dict[str, Any]]:
    """读取任务执行轮次；无记录时从历史或 task_exec_result 回填。"""
    _, ctx = _pipeline_context(scope_id)
    rounds = _rounds_from_ctx(ctx)
    if rounds:
        return rounds

    rounds = _backfill_rounds_from_history(scope_id)
    if rounds:
        _ensure_rounds_persisted(scope_id, rounds)
        return rounds

    payload = load_task_exec_payload(scope_id)
    if isinstance(payload, dict):
        rounds = [_synthetic_round_from_payload(payload)]
        _ensure_rounds_persisted(scope_id, rounds)
        return rounds
    return []


def current_task_exec_round(scope_id: str) -> int:
    rounds = load_task_exec_rounds(scope_id)
    if not rounds:
        return 0
    return int(rounds[-1].get("round") or len(rounds))


def _finalize_open_round(rounds: list[dict[str, Any]], *, status: str = "superseded") -> None:
    if not rounds:
        return
    last = rounds[-1]
    st = str(last.get("status") or "").strip().lower()
    if st in ("running", "pending", ""):
        last["status"] = status
        if not last.get("finished_at"):
            last["finished_at"] = _now_iso()


def on_task_exec_reprocess_prep(pipe: MeetingPipeline, *, reason: str) -> dict[str, Any]:
    """重处理准备：追加新一轮并记录用户建议。"""
    sid = pipe.scope_id
    ctx = pipe._data.get("context")
    if not isinstance(ctx, dict):
        ctx = {}
    rounds = _rounds_from_ctx(ctx)
    if not rounds:
        # CLI 回调独立 load/save，外层 pipe 内存 context 可能滞后于磁盘
        _, disk_ctx = _pipeline_context(sid)
        rounds = _rounds_from_ctx(disk_ctx)
    if not rounds:
        payload = load_task_exec_payload(sid)
        if isinstance(payload, dict):
            prev = _synthetic_round_from_payload(payload, round_num=1)
            prev["status"] = str(payload.get("status") or prev.get("status") or "ok")
            rounds.append(prev)
    _finalize_open_round(rounds)
    text = (reason or "").strip()
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
    _save_rounds(pipe, rounds)
    logger.info(
        "task_exec_rounds: reprocess prep scope=%s round=%s reason_len=%d",
        sid,
        round_no,
        len(text),
    )
    return entry


def on_task_exec_round_retry(scope_id: str) -> dict[str, Any] | None:
    """当前轮次重试：不新增轮次，重置最后一轮为 running。"""
    pipe, ctx = _pipeline_context(scope_id)
    if pipe is None:
        return None
    rounds = _rounds_from_ctx(ctx)
    if not rounds:
        return None
    last = rounds[-1]
    last["status"] = "running"
    last["started_at"] = _now_iso()
    last["finished_at"] = None
    last["summary"] = {}
    _save_rounds(pipe, rounds)
    logger.info(
        "task_exec_rounds: retry current round scope=%s round=%s",
        scope_id,
        last.get("round"),
    )
    return last


def on_task_exec_cli_starting(scope_id: str, *, reason: str = "") -> dict[str, Any] | None:
    """CLI 启动：首轮初始化，或将 pending 轮次标为 running。"""
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
        _save_rounds(pipe, rounds)
        return entry

    last = rounds[-1]
    st = str(last.get("status") or "").strip().lower()
    if st == "pending":
        last["status"] = "running"
        last["started_at"] = last.get("started_at") or _now_iso()
        if text and not str(last.get("reason") or "").strip():
            last["reason"] = text
        _save_rounds(pipe, rounds)
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
        _save_rounds(pipe, rounds)
        return entry

    if st == "running":
        return last

    last["status"] = "running"
    last["started_at"] = last.get("started_at") or _now_iso()
    _save_rounds(pipe, rounds)
    return last


def on_task_exec_cli_finished(scope_id: str, result: dict[str, Any]) -> dict[str, Any] | None:
    """CLI 结束：回写当前轮次状态与汇总。"""
    pipe, ctx = _pipeline_context(scope_id)
    if pipe is None:
        return None
    rounds = _rounds_from_ctx(ctx)
    if not rounds:
        entry = _synthetic_round_from_payload(result)
        entry["status"] = str(result.get("status") or entry.get("status") or "unknown")
        rounds.append(entry)
        _save_rounds(pipe, rounds)
        return entry

    last = rounds[-1]
    last["status"] = str(result.get("status") or "unknown").strip().lower()
    last["finished_at"] = result.get("finished_at") or _now_iso()
    last["started_at"] = last.get("started_at") or result.get("started_at")
    last["summary"] = _summary_from_result(result)
    _save_rounds(pipe, rounds)
    return last


def uses_task_exec_node(node_id: str) -> bool:
    return (node_id or "").strip() == NODE_ID


def format_task_exec_reprocess_prompt_block(
    scope_id: str,
    *,
    current_reason: str = "",
    mode: Literal["develop", "verify"] = "develop",
) -> str:
    """汇总多轮重处理历史要求 + 本轮最高优先级要求，供 CLI 开发/检测 prompt 注入。"""
    sid = (scope_id or "").strip()
    current = (current_reason or "").strip()
    rounds = load_task_exec_rounds(sid) if sid else []

    if not rounds and not current:
        return ""

    current_round_no = int(rounds[-1].get("round") or len(rounds)) if rounds else 1
    is_reprocess_round = bool(
        current
        or len(rounds) > 1
        or (rounds and str(rounds[-1].get("kind") or "") == "reprocess")
    )
    if not is_reprocess_round:
        return ""

    if not current and rounds:
        last = rounds[-1]
        last_status = str(last.get("status") or "").strip().lower()
        if last_status in ("pending", "running", ""):
            current = str(last.get("reason") or "").strip()

    history_lines: list[str] = []
    if len(rounds) > 1:
        for item in rounds[:-1]:
            reason = str(item.get("reason") or "").strip()
            if not reason:
                continue
            round_no = int(item.get("round") or 0)
            kind = str(item.get("kind") or "initial")
            label = "首轮" if kind == "initial" else "重处理"
            history_lines.append(f"- 第{round_no}轮（{label}）：{reason}")

    if not history_lines and not current:
        return ""

    lines: list[str] = []
    if history_lines:
        lines.extend(
            [
                "【任务执行 · 历史轮次用户要求（须一并遵循）】",
                *history_lines,
                "以上各轮要求均须满足；若与本轮最高优先级要求冲突，以本轮要求为准。",
                "",
            ]
        )

    if current:
        priority_tail = (
            "本条优先级高于函数级方案、验收标准及一切历史结论；冲突时以用户重处理要求为准。"
            if mode == "develop"
            else "完成检测时须以用户重处理要求为准；若与函数级方案冲突，以用户重处理要求优先。"
        )
        round_suffix = f"（第{current_round_no}轮）" if len(rounds) > 1 else ""
        lines.extend(
            [
                "【用户重处理要求 · 最高优先级】",
                f"用户重处理要求{round_suffix}：{current}",
                priority_tail,
            ]
        )

    return "\n".join(lines).strip()
