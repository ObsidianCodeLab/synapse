"""研发会议室：节点确认总结（NODE_REVIEW）payload 装配。

设计要点（对齐方案 §2）：

四段式 payload，由 pipeline ``_step_node_review`` 在 ``human_confirm`` 节点
LLM 跑完后组装并落盘到 ``meeting_pipeline.json.context.node_review[node_id]``
同时写入 ``room_state.pending_delivery.review_payload`` 供前端拉取：

1. **metrics**：节点 token / 时长 / 各 agent 委派 / 工具 / 技能，**均从各智能体 activity.jsonl 汇总**
2. **summaries**：主持人 + 各协作智能体的工作摘要（由 LLM 在 NODE_REVIEW 阶段
   基于 ``agents/<node_id>/<pid>/activity.jsonl`` 汇总后的结构化上下文生成；
   **无 activity.jsonl 的智能体视为本节点未参与，不生成摘要**）
3. **artifacts**：本节点 ``archive/<stage>/<node>/`` 下所有文件（含 mtime / size）
4. **report_body**：兼容字段，保留 LLM 终稿，前端可不显示

LLM 摘要走 host agent 的 ``brain.messages_create_async`` 独立调用（无工具、无会话历史），
避免 ``execute_task_from_message`` 复用节点内 messages 导致模型误判「已完成」。
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from synapse.rd_meeting.paths import agent_node_dir, archive_node_dir, meeting_pipeline_path
from synapse.rd_meeting.room_runtime import (
    load_room_state,
    read_meeting_pipeline_json,
    save_room_state,
    write_json_file,
)
from synapse.rd_sop.nodes import node_display_name, stage_name_for_id

logger = logging.getLogger(__name__)

ScopeType = Literal["demand", "task"]

REVIEW_SCHEMA_VERSION = 1
_SUMMARY_PROMPT_BUDGET_CHARS = 6000  # 单 agent 摘要 prompt 上下文最大字符数
_DELEGATION_TOOL_NAMES = frozenset({"delegate_to_agent", "delegate_parallel"})
_SKILL_CATEGORIES = frozenset({"skill_load", "skill_exec", "skill", "skill_load_blocked"})
_TASK_SNIPPET_LIMIT = 120
_OUTPUT_SNIPPET_LIMIT = 80
_MAX_OUTPUT_ROWS = 3

_NODE_REVIEW_SYSTEM = (
    "你是研发会议室的节点审阅摘要助手。"
    "根据用户提供的结构化活动汇总，撰写该智能体在本 SOP 节点的工作总结摘要。"
    "只输出 1-3 段自然中文摘要正文。"
    "禁止调用任何工具；"
    "禁止输出「已收到您的提示」「无需进一步调用工具」「已在上一轮完成」等元话语；"
    "禁止 Markdown 标题、列表或代码块。"
)

_INVALID_SUMMARY_MARKERS = (
    "无需进一步调用工具",
    "无需再调用工具",
    "无需调用工具",
    "已在上一轮完成",
    "已收到您的提示",
    "已收到你的提示",
)


def _truncate_excerpt(body: str, limit: int = _SUMMARY_PROMPT_BUDGET_CHARS) -> str:
    s = str(body or "").strip()
    if len(s) <= limit:
        return s
    head = s[: limit // 2]
    tail = s[-limit // 2 :]
    return f"{head}\n\n…（节略 {len(s) - limit} 字符）…\n\n{tail}"


def _truncate_snippet(text: str, limit: int = _TASK_SNIPPET_LIMIT) -> str:
    s = str(text or "").strip()
    if len(s) <= limit:
        return s
    return s[:limit] + "…"


def _activity_log_path(scope_id: str, profile_id: str, node_id: str) -> Path:
    from synapse.rd_meeting.agent_activity import _activity_path

    return _activity_path(scope_id, node_id, profile_id)


def _activity_log_exists(scope_id: str, profile_id: str, node_id: str) -> bool:
    return _activity_log_path(scope_id, profile_id, node_id).is_file()


def _format_count_lines(counter: dict[str, int], *, empty_label: str) -> str:
    if not counter:
        return empty_label
    lines = [
        f"- `{name}`：{count} 次"
        for name, count in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    ]
    return "\n".join(lines)


def _extract_delegation_items_from_tool_row(row: dict[str, Any]) -> list[dict[str, Any]]:
    tool_name = str(row.get("tool_name") or "").strip()
    tool_input = row.get("tool_input")
    if not isinstance(tool_input, dict):
        tool_input = {}
    success = row.get("success") is not False
    items: list[dict[str, Any]] = []
    if tool_name == "delegate_to_agent":
        target = str(
            tool_input.get("to")
            or tool_input.get("agent_id")
            or tool_input.get("profile_id")
            or ""
        ).strip()
        task = str(
            tool_input.get("message") or tool_input.get("task") or tool_input.get("prompt") or ""
        ).strip()
        items.append({"target_id": target, "task": task, "success": success})
    elif tool_name == "delegate_parallel":
        tasks = tool_input.get("tasks") or tool_input.get("delegations") or []
        if isinstance(tasks, list):
            for task_row in tasks:
                if not isinstance(task_row, dict):
                    continue
                target = str(
                    task_row.get("to") or task_row.get("agent_id") or task_row.get("profile_id") or ""
                ).strip()
                task = str(task_row.get("message") or task_row.get("task") or "").strip()
                items.append({"target_id": target, "task": task, "success": success})
    return items


def _aggregate_tool_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    from synapse.rd_meeting.agent_activity import _normalize_category

    counter: dict[str, int] = {}
    for row in rows:
        if _normalize_category(row) != "tool":
            continue
        name = str(row.get("tool_name") or "").strip()
        if not name or name in _DELEGATION_TOOL_NAMES:
            continue
        counter[name] = counter.get(name, 0) + 1
    return counter


def _aggregate_skill_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    from synapse.rd_meeting.agent_activity import _normalize_category

    counter: dict[str, int] = {}
    for row in rows:
        cat = _normalize_category(row)
        if cat in _SKILL_CATEGORIES:
            name = str(row.get("skill_name") or "").strip()
            if name:
                counter[name] = counter.get(name, 0) + 1
                continue
        if cat == "tool":
            esid = str(row.get("executing_skill_id") or "").strip()
            if esid:
                counter[esid] = counter.get(esid, 0) + 1
    return counter


def _aggregate_host_delegation_section(rows: list[dict[str, Any]]) -> list[str]:
    from synapse.rd_meeting.agent_activity import _normalize_category

    lines: list[str] = []
    human_count = sum(
        1
        for row in rows
        if _normalize_category(row) == "input" and str(row.get("source") or "") == "human"
    )
    if human_count:
        lines.append(f"- 与研发人员（人类）交互：{human_count} 次")

    outbound: list[dict[str, Any]] = []
    for row in rows:
        if _normalize_category(row) != "tool":
            continue
        outbound.extend(_extract_delegation_items_from_tool_row(row))

    if outbound:
        lines.append(f"- 委派协作智能体：共 {len(outbound)} 次")
        for idx, item in enumerate(outbound, start=1):
            target_id = str(item.get("target_id") or "").strip()
            target_name = _resolve_display_name(target_id, fallback=target_id or "协作智能体")
            task = _truncate_snippet(str(item.get("task") or ""))
            status = "成功" if item.get("success") is not False else "失败"
            task_part = f"：{task}" if task else ""
            lines.append(f"  {idx}. 委派给「{target_name}」({target_id or '?'}){task_part} — {status}")

    outputs = [
        row
        for row in rows
        if _normalize_category(row) == "output"
    ]
    if outputs:
        lines.append(f"- 节点产出/反馈：{len(outputs)} 条")
        for row in outputs[:_MAX_OUTPUT_ROWS]:
            title = str(row.get("title") or row.get("display_title") or "产出").strip()
            summary = _truncate_snippet(str(row.get("summary") or ""), limit=_OUTPUT_SNIPPET_LIMIT)
            ok = row.get("success") is not False
            status = "成功" if ok else "失败"
            detail = f" — {summary}" if summary else ""
            lines.append(f"  - {title}{detail}（{status}）")
        if len(outputs) > _MAX_OUTPUT_ROWS:
            lines.append(f"  - …（另有 {len(outputs) - _MAX_OUTPUT_ROWS} 条未展开）")

    if not lines:
        return ["- （本节点 activity 中无委派或人类交互记录）"]
    return lines


def _aggregate_worker_delegation_section(rows: list[dict[str, Any]]) -> list[str]:
    from synapse.rd_meeting.agent_activity import _normalize_category

    delegations = [
        row
        for row in rows
        if _normalize_category(row) == "input" and str(row.get("input_kind") or "") == "delegation"
    ]
    feedbacks = [
        row
        for row in rows
        if _normalize_category(row) == "output"
        and str(row.get("output_kind") or "") == "delegation_feedback"
    ]

    if not delegations and not feedbacks:
        return ["- （本节点 activity 中无收到委派或协作反馈记录）"]

    lines: list[str] = []
    if delegations:
        lines.append(f"- 收到委派工作：{len(delegations)} 次")
        for idx, row in enumerate(delegations, start=1):
            title = str(row.get("title") or "收到委派请求").strip()
            summary = _truncate_snippet(str(row.get("summary") or ""))
            fb = feedbacks[idx - 1] if idx - 1 < len(feedbacks) else None
            if fb:
                fb_summary = _truncate_snippet(str(fb.get("summary") or ""))
                ok = fb.get("success") is not False
                status = "已完成" if ok else "未完成"
                fb_part = f" — 反馈：{fb_summary}（{status}）" if fb_summary else f"（{status}）"
            else:
                fb_part = " — 暂无协作反馈记录"
            task_part = f"：{summary}" if summary else ""
            lines.append(f"  {idx}. {title}{task_part}{fb_part}")
    elif feedbacks:
        lines.append(f"- 协作反馈：{len(feedbacks)} 条")
        for row in feedbacks[:8]:
            summary = _truncate_snippet(str(row.get("summary") or ""))
            ok = row.get("success") is not False
            status = "已完成" if ok else "未完成"
            lines.append(f"  - {summary or '（无摘要）'}（{status}）")
    return lines


def aggregate_activity_for_summary(
    rows: list[dict[str, Any]],
    *,
    role: str,
    node_name: str,
) -> str:
    """将 activity 行汇总为摘要 prompt 的三段结构化上下文（非原始 jsonl）。"""
    if role == "host":
        delegation_lines = _aggregate_host_delegation_section(rows)
    else:
        delegation_lines = _aggregate_worker_delegation_section(rows)

    tool_counts = _aggregate_tool_counts(rows)
    skill_counts = _aggregate_skill_counts(rows)

    parts = [
        f"## 节点环节\n{node_name}",
        "## 一、委派任务与完成情况\n" + "\n".join(delegation_lines),
        "## 二、工具使用统计\n"
        + _format_count_lines(tool_counts, empty_label="（本节点未使用工具）"),
        "## 三、技能使用统计\n"
        + _format_count_lines(skill_counts, empty_label="（本节点未使用技能）"),
    ]
    return _truncate_excerpt("\n\n".join(parts))


def build_activity_summary_context(
    scope_id: str,
    profile_id: str,
    node_id: str,
    *,
    role: str,
    node_name: str,
) -> str | None:
    """读取并汇总 activity；若文件不存在返回 ``None``（表示该智能体本节点未参与工作）。"""
    if not _activity_log_exists(scope_id, profile_id, node_id):
        return None
    from synapse.rd_meeting.agent_activity import read_activity_log

    rows = read_activity_log(scope_id, node_id, profile_id, limit=500)
    if not rows:
        return None
    return aggregate_activity_for_summary(rows, role=role, node_name=node_name)


# ─── 数据结构 ─────────────────────────────────────────────────────────


@dataclass
class AgentMetricsRow:
    profile_id: str
    display_name: str
    role: str  # host / worker
    delegations: int = 0  # host：派单次数；worker：被派单次数
    tool_calls: int = 0
    skill_calls: int = 0
    tokens: int = 0
    tools: list[dict[str, Any]] = field(default_factory=list)  # [{name, count}]
    skills: list[dict[str, Any]] = field(default_factory=list)  # [{skill, count}]


@dataclass
class NodeReviewMetrics:
    node_token_total: int = 0
    node_duration_seconds: int = 0
    delegation_total: int = 0
    tool_call_total: int = 0
    skill_call_total: int = 0
    host: AgentMetricsRow | None = None
    workers: list[AgentMetricsRow] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "node_token_total": self.node_token_total,
            "node_duration_seconds": self.node_duration_seconds,
            "delegation_total": self.delegation_total,
            "tool_call_total": self.tool_call_total,
            "skill_call_total": self.skill_call_total,
            "host": asdict(self.host) if self.host else None,
            "workers": [asdict(w) for w in self.workers],
        }


@dataclass
class ArtifactFile:
    name: str
    relative_path: str  # 相对 scope_dir，例如 ``archive/2/req_clarify/需求澄清.md``
    size: int
    mtime: str
    ext: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AgentSummary:
    profile_id: str
    display_name: str
    role: str
    summary_markdown: str
    source: str  # llm / rule / fallback
    conversation_path: str = ""  # 相对 scope_dir 的路径，便于前端深入


# ─── 时间工具 ─────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ─── 指标聚合 ─────────────────────────────────────────────────────────


def _resolve_display_name(profile_id: str, fallback: str = "") -> str:
    from synapse.rd_meeting.participants import resolve_profile_display_name

    pid = (profile_id or "").strip()
    if not pid:
        return fallback or profile_id
    name = resolve_profile_display_name(pid)
    if name != pid:
        return name
    return fallback or pid


def _counter_dict_to_tool_buckets(counter: dict[str, int]) -> list[dict[str, Any]]:
    return [
        {"name": name, "count": count}
        for name, count in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def _counter_dict_to_skill_buckets(counter: dict[str, int]) -> list[dict[str, Any]]:
    return [
        {"skill": name, "count": count}
        for name, count in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def _count_delegations_from_activity(rows: list[dict[str, Any]], *, role: str) -> int:
    from synapse.rd_meeting.agent_activity import _normalize_category

    if role == "host":
        total = 0
        for row in rows:
            if _normalize_category(row) != "tool":
                continue
            items = _extract_delegation_items_from_tool_row(row)
            if items:
                total += len(items)
        return total
    return sum(
        1
        for row in rows
        if _normalize_category(row) == "input" and str(row.get("input_kind") or "") == "delegation"
    )


def _metrics_row_from_activity(
    rows: list[dict[str, Any]],
    *,
    profile_id: str,
    role: str,
) -> AgentMetricsRow:
    from synapse.rd_meeting.agent_activity import aggregate_llm_tokens

    tool_counts = _aggregate_tool_counts(rows)
    skill_counts = _aggregate_skill_counts(rows)
    return AgentMetricsRow(
        profile_id=profile_id,
        display_name=_resolve_display_name(profile_id, fallback="小鲸" if role == "host" else profile_id),
        role=role,
        delegations=_count_delegations_from_activity(rows, role=role),
        tool_calls=sum(tool_counts.values()),
        skill_calls=sum(skill_counts.values()),
        tokens=aggregate_llm_tokens(rows),
        tools=_counter_dict_to_tool_buckets(tool_counts),
        skills=_counter_dict_to_skill_buckets(skill_counts),
    )


def aggregate_node_metrics(
    *,
    scope_id: str,
    room_id: str,
    node_id: str,
    binding: dict[str, Any],
    agent_pool: Any | None = None,
    orchestrator: Any | None = None,
    tokens_used: int = 0,
    duration_seconds: int = 0,
) -> NodeReviewMetrics:
    """从各智能体 ``activity.jsonl`` 汇总节点级指标（不再读 agent_pool / orchestrator 内存态）。"""
    from synapse.rd_meeting.agent_activity import (
        compute_activity_duration_seconds,
        list_node_agent_profiles,
        read_activity_log,
    )

    _ = (room_id, agent_pool, orchestrator, tokens_used)  # 保留签名兼容，指标不再依赖运行时池

    host_pid = str(binding.get("host_profile_id") or "default").strip() or "default"
    worker_pids = [
        str(w).strip()
        for w in (binding.get("worker_profile_ids") or [])
        if str(w).strip() and str(w).strip() != host_pid
    ]
    active_pids = list_node_agent_profiles(scope_id, node_id)

    host_rows: list[dict[str, Any]] = []
    if host_pid in active_pids:
        host_rows = read_activity_log(scope_id, node_id, host_pid, limit=5000)

    worker_order = [pid for pid in worker_pids if pid in active_pids]
    worker_order.extend(sorted(pid for pid in active_pids if pid != host_pid and pid not in worker_order))

    host_row = (
        _metrics_row_from_activity(host_rows, profile_id=host_pid, role="host") if host_rows else None
    )
    worker_rows: list[AgentMetricsRow] = []
    for pid in worker_order:
        rows = read_activity_log(scope_id, node_id, pid, limit=5000)
        if not rows:
            continue
        worker_rows.append(_metrics_row_from_activity(rows, profile_id=pid, role="worker"))

    node_duration = compute_activity_duration_seconds(host_rows) or int(duration_seconds or 0)
    node_tokens = (host_row.tokens if host_row else 0) + sum(w.tokens for w in worker_rows)

    metrics = NodeReviewMetrics(
        node_token_total=node_tokens,
        node_duration_seconds=node_duration,
        host=host_row,
        workers=worker_rows,
    )
    metrics.delegation_total = host_row.delegations if host_row else 0
    metrics.tool_call_total = (host_row.tool_calls if host_row else 0) + sum(
        w.tool_calls for w in worker_rows
    )
    metrics.skill_call_total = (host_row.skill_calls if host_row else 0) + sum(
        w.skill_calls for w in worker_rows
    )
    return metrics


# ─── 产出物 ───────────────────────────────────────────────────────────


def collect_artifact_files(scope_id: str, stage_name: str, node_id: str) -> list[ArtifactFile]:
    """扫 ``archive/<stage_name>/<node_id>/`` 下所有文件（递归一层即可，归档很少嵌套）。"""
    sid = (scope_id or "").strip()
    if not sid:
        return []
    base = archive_node_dir(sid, stage_name, node_id)
    if not base.is_dir():
        return []
    from synapse.rd_meeting.paths import scope_dir

    scope_root = scope_dir(sid).resolve()
    out: list[ArtifactFile] = []
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        try:
            rel = path.resolve().relative_to(scope_root).as_posix()
        except ValueError:
            rel = path.as_posix()
        try:
            st = path.stat()
        except OSError:
            continue
        out.append(
            ArtifactFile(
                name=path.name,
                relative_path=rel,
                size=int(st.st_size),
                mtime=datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
                ext=path.suffix.lower(),
            )
        )
    return out


# ─── 工作摘要（LLM 生成） ─────────────────────────────────────────────


def _extract_llm_text(response: Any) -> str:
    from synapse.core.response_handler import clean_llm_response

    content = getattr(response, "content", None)
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if hasattr(block, "text"):
                parts.append(str(block.text or ""))
            elif isinstance(block, dict) and block.get("text"):
                parts.append(str(block["text"]))
        raw = "\n".join(p for p in parts if p.strip())
    else:
        raw = str(content or "")
    return clean_llm_response(raw)


def _is_invalid_summary_response(text: str) -> bool:
    """识别模型误把摘要任务当成「已完成的对话续接」时的元话语回复。"""
    s = (text or "").strip()
    if len(s) < 50:
        return True
    return any(marker in s for marker in _INVALID_SUMMARY_MARKERS)


def _build_summary_prompt(
    *,
    role: str,
    profile_display_name: str,
    node_name: str,
    node_intent: str,
    activity_context: str,
) -> str:
    role_label = "主控智能体（主持人小鲸）" if role == "host" else f"协作智能体「{profile_display_name}」"
    intent_short = _truncate_snippet(node_intent, limit=400)
    if role == "host":
        example = (
            f"在[{node_name}]研发环节中，分别委派给浩鲸需求分析专家 1 次需求澄清问题整理工作、"
            f"浩鲸产品研发专家 1 次代码调研工作，与研发人员交互 1 次，"
            f"最终完成了需求澄清文档编写并提交人工确认问卷。"
        )
        role_hint = (
            "- 须涵盖：委派了哪些协作智能体、各委派几次及任务要点、与研发人员交互次数、"
            "节点最终完成情况。\n"
        )
    else:
        example = (
            f"在[{node_name}]研发环节中，收到了 1 次委派工作，主要工作内容是整理需求澄清要点并生成文档，"
            "期间使用了 `grep`、`write_file` 工具和 `whalecloud-dev-tool-requirement-clarify` 技能，"
            "完成情况为已产出需求澄清文档并通过主控验收。"
        )
        role_hint = (
            "- 须涵盖：收到几次委派、主要工作内容、使用了哪些工具与技能、完成情况。\n"
        )
    return (
        f"【独立审阅任务】这是节点 `{node_name}` 结束后的系统自动摘要任务，"
        f"与会议室此前任何对话无关。请忽略会话记忆，仅依据下方活动汇总，"
        f"重新撰写 **{role_label}** 的工作总结摘要。\n\n"
        f"## 节点目标\n{intent_short or '（未配置）'}\n\n"
        f"## 本智能体节点活动汇总（已结构化，请据此撰写，勿编造）\n"
        f"{activity_context}\n\n"
        "## 输出要求\n"
        "- 这是一段**工作总结摘要**（不是对话回放、不是原始日志、不是对用户的回复）。\n"
        f"- 视角始终是 **{role_label}**。\n"
        f"{role_hint}"
        "- 用 1-3 段自然中文，不要 Markdown 标题，不要列表，不要代码块。\n"
        "- 语气简洁客观，审阅者 30 秒内能读懂本智能体在本节点的贡献。\n"
        "- 严禁编造汇总数据中未出现的事实。\n"
        "- **禁止**回复「已收到」「无需调用工具」「上一轮已完成」等元话语。\n"
        "- 直接输出摘要正文，不要任何前后缀说明。\n\n"
        "## 输出样例（格式与风格参考，内容须替换为实际汇总数据）\n"
        f"{example}\n"
    )


async def _summarize_via_host_agent(
    *,
    scope_id: str,
    room_id: str,
    host_agent: Any,
    host_profile_id: str,
    target_profile_id: str,
    target_role: str,
    target_display: str,
    prompt: str,
) -> str:
    """隔离调用 host 的 brain 生成摘要（无工具、无节点内 messages 历史）。"""
    if host_agent is None:
        return ""
    brain = getattr(host_agent, "brain", None)
    if brain is None:
        logger.warning("node_review summary: host agent has no brain scope=%s", scope_id)
        return ""
    usage_scene = f"rd_meeting_{scope_id}_node_review"
    try:
        response = await brain.messages_create_async(
            system=_NODE_REVIEW_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            tools=[],
            max_tokens=getattr(brain, "max_tokens", 4096),
            usage_scene=usage_scene,
        )
        markdown = _extract_llm_text(response)
        logger.info(
            "[node_review summary response] scope=%s room=%s target_profile=%s target_role=%s "
            "target_display=%s chars=%d valid=%s\n--- response begin ---\n%s\n--- response end ---",
            scope_id,
            room_id,
            target_profile_id,
            target_role,
            target_display,
            len(markdown),
            not _is_invalid_summary_response(markdown),
            markdown,
        )
        if _is_invalid_summary_response(markdown):
            logger.info(
                "node_review summary rejected as meta/refusal scope=%s profile=%s role=%s",
                scope_id,
                target_profile_id,
                target_role,
            )
            return ""
        return markdown
    except Exception as exc:  # pragma: no cover - LLM 调用本身可能抛
        logger.warning("node_review summary llm failed scope=%s: %s", scope_id, exc)
        return ""


def _fallback_summary(
    *,
    role: str,
    display_name: str,
    activity_context: str,
    node_name: str,
) -> str:
    """LLM 不可用时的兜底：基于结构化 activity 汇总生成简短摘要。"""
    head = "### 主控智能体工作摘要" if role == "host" else f"### {display_name} 工作摘要"
    return (
        f"{head}\n\n"
        f"_（LLM 摘要不可用，以下为 [{node_name}] 节点活动汇总）_\n\n"
        f"{activity_context}\n"
    )


async def generate_agent_summaries(
    *,
    scope_id: str,
    room_id: str,
    node_id: str,
    node_name: str,
    node_intent: str,
    host_profile_id: str,
    worker_profile_ids: list[str],
    agent_pool: Any | None,
    use_llm: bool = True,
) -> list[AgentSummary]:
    """逐 agent 调用 host LLM 总结；失败回落到 fallback。"""
    summaries: list[AgentSummary] = []

    host_agent = None
    if agent_pool is not None and room_id and use_llm:
        try:
            from synapse.rd_meeting.agent_session import host_session_id

            host_agent = agent_pool.get_existing(host_session_id(room_id)) if hasattr(agent_pool, "get_existing") else None
        except Exception:
            host_agent = None

    def _conv_relpath(pid: str) -> str:
        path = agent_node_dir(scope_id, pid, node_id) / "conversation.jsonl"
        try:
            from synapse.rd_meeting.paths import scope_dir

            return path.resolve().relative_to(scope_dir(scope_id).resolve()).as_posix()
        except (OSError, ValueError):
            return path.as_posix()

    targets: list[tuple[str, str]] = [(host_profile_id, "host")] + [
        (pid, "worker") for pid in worker_profile_ids if pid and pid != host_profile_id
    ]
    for pid, role in targets:
        display = _resolve_display_name(pid, fallback="小鲸" if role == "host" else pid)
        activity_context = build_activity_summary_context(
            scope_id,
            pid,
            node_id,
            role=role,
            node_name=node_name,
        )
        if activity_context is None:
            logger.info(
                "[node_review summary skip] scope=%s node=%s profile=%s role=%s "
                "reason=no_activity_jsonl",
                scope_id,
                node_id,
                pid,
                role,
            )
            continue
        prompt = _build_summary_prompt(
            role=role,
            profile_display_name=display,
            node_name=node_name,
            node_intent=node_intent,
            activity_context=activity_context,
        )
        if use_llm:
            logger.info(
                "[node_review summary prompt] scope=%s node=%s profile=%s role=%s display=%s "
                "context_chars=%d prompt_chars=%d\n--- prompt begin ---\n%s\n--- prompt end ---",
                scope_id,
                node_id,
                pid,
                role,
                display,
                len(activity_context),
                len(prompt),
                prompt,
            )
        markdown = ""
        source = "fallback"
        if use_llm and host_agent is not None:
            markdown = await _summarize_via_host_agent(
                scope_id=scope_id,
                room_id=room_id,
                host_agent=host_agent,
                host_profile_id=host_profile_id,
                target_profile_id=pid,
                target_role=role,
                target_display=display,
                prompt=prompt,
            )
            if markdown:
                source = "llm"
        if not markdown:
            markdown = _fallback_summary(
                role=role,
                display_name=display,
                activity_context=activity_context,
                node_name=node_name,
            )
        summaries.append(
            AgentSummary(
                profile_id=pid,
                display_name=display,
                role=role,
                summary_markdown=markdown,
                source=source,
                conversation_path=_conv_relpath(pid),
            )
        )
    return summaries


# ─── payload 组装 + 落盘 ──────────────────────────────────────────────


def _parse_node_review_binding(
    binding: dict[str, Any],
    node_id: str,
) -> tuple[str, list[str], str, str]:
    host_pid = str(binding.get("host_profile_id") or "default").strip() or "default"
    worker_pids = [
        str(w).strip()
        for w in (binding.get("worker_profile_ids") or [])
        if str(w).strip() and str(w).strip() != host_pid
    ]
    node_name = str(binding.get("node_name") or node_display_name(node_id))
    node_intent = str(binding.get("node_intent") or binding.get("intent") or "")
    return host_pid, worker_pids, node_name, node_intent


def build_node_review_metrics_only(
    *,
    scope_type: ScopeType,
    scope_id: str,
    room_id: str,
    node_id: str,
    binding: dict[str, Any],
    report_body: str,
    tokens_used: int,
    duration_seconds: int,
    stage_id: int,
    agent_pool: Any | None,
    orchestrator: Any | None,
) -> dict[str, Any]:
    """仅装配 metrics + artifacts（无 summaries）。

    用于节点进行中/手动 ``refresh=true`` 轮询，避免重复读 activity 生成 fallback 摘要。
    """
    _host_pid, _worker_pids, node_name, node_intent = _parse_node_review_binding(binding, node_id)
    metrics = aggregate_node_metrics(
        scope_id=scope_id,
        room_id=room_id,
        node_id=node_id,
        binding=binding,
        agent_pool=agent_pool,
        orchestrator=orchestrator,
        tokens_used=tokens_used,
        duration_seconds=duration_seconds,
    )
    artifacts = collect_artifact_files(
        scope_id,
        str(binding.get("stage_name") or stage_name_for_id(stage_id)),
        node_id,
    )
    return {
        "schema_version": REVIEW_SCHEMA_VERSION,
        "scope_type": scope_type,
        "scope_id": scope_id,
        "room_id": room_id,
        "node_id": node_id,
        "node_name": node_name,
        "node_intent": node_intent,
        "stage_id": stage_id,
        "metrics": metrics.to_dict(),
        "summaries": [],
        "artifacts": [a.to_dict() for a in artifacts],
        "report_body": report_body or "",
        "generated_at": _now_iso(),
    }


def apply_preserved_summaries(
    payload: dict[str, Any],
    *sources: dict[str, Any] | None,
) -> dict[str, Any]:
    """从已有 payload 复制 summaries（refresh 时保留 LLM 摘要，不重新生成）。"""
    for src in sources:
        if not isinstance(src, dict):
            continue
        rows = src.get("summaries")
        if isinstance(rows, list) and rows:
            payload["summaries"] = rows
            return payload
    return payload


async def build_node_review_payload(
    *,
    scope_type: ScopeType,
    scope_id: str,
    room_id: str,
    node_id: str,
    binding: dict[str, Any],
    report_body: str,
    tokens_used: int,
    duration_seconds: int,
    stage_id: int,
    agent_pool: Any | None,
    orchestrator: Any | None,
    use_llm_summary: bool = True,
) -> dict[str, Any]:
    """组装完整节点确认总结 payload（含 summaries）。"""
    host_pid, worker_pids, node_name, node_intent = _parse_node_review_binding(binding, node_id)
    payload = build_node_review_metrics_only(
        scope_type=scope_type,
        scope_id=scope_id,
        room_id=room_id,
        node_id=node_id,
        binding=binding,
        report_body=report_body,
        tokens_used=tokens_used,
        duration_seconds=duration_seconds,
        stage_id=stage_id,
        agent_pool=agent_pool,
        orchestrator=orchestrator,
    )
    summaries = await generate_agent_summaries(
        scope_id=scope_id,
        room_id=room_id,
        node_id=node_id,
        node_name=node_name,
        node_intent=node_intent,
        host_profile_id=host_pid,
        worker_profile_ids=worker_pids,
        agent_pool=agent_pool,
        use_llm=use_llm_summary,
    )
    payload["summaries"] = [asdict(s) for s in summaries]
    return payload


def save_node_review(
    scope_id: str,
    node_id: str,
    payload: dict[str, Any],
    *,
    sync_pending: bool = True,
) -> None:
    """写 ``meeting_pipeline.json.context.node_review[node_id]``；可选同步 room_state.pending_delivery。"""
    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or not nid:
        return

    raw = read_meeting_pipeline_json(sid)
    if isinstance(raw, dict):
        ctx = raw.get("context") if isinstance(raw.get("context"), dict) else {}
        node_review = ctx.get("node_review") if isinstance(ctx.get("node_review"), dict) else {}
        node_review[nid] = payload
        ctx["node_review"] = node_review
        raw["context"] = ctx
        raw["updated_at"] = _now_iso()
        write_json_file(pipeline_path, raw)

    if not sync_pending:
        return

    room_state = dict(load_room_state(sid) or {})
    from synapse.rd_meeting.intervention_panel import is_clarify_gate_active

    if is_clarify_gate_active(
        str(room_state.get("intervention_kind") or ""),
        room_state.get("hitl_form_schema") if isinstance(room_state.get("hitl_form_schema"), dict) else None,
        phase=str(room_state.get("phase") or ""),
    ):
        return
    pending = room_state.get("pending_delivery") if isinstance(room_state.get("pending_delivery"), dict) else {}
    pending = dict(pending)
    pending["review_payload"] = payload
    pending.setdefault("node_id", nid)
    pending.setdefault("report_body", payload.get("report_body") or "")
    pending["await_confirm"] = True
    pending.setdefault("tokens_used", int(payload.get("metrics", {}).get("node_token_total") or 0))
    pending.setdefault("duration_seconds", int(payload.get("metrics", {}).get("node_duration_seconds") or 0))
    pending.setdefault("stage_id", int(payload.get("stage_id") or 0))
    room_state["pending_delivery"] = pending
    save_room_state(sid, room_state)


def load_node_review(scope_id: str, node_id: str) -> dict[str, Any] | None:
    """读 pipeline.context.node_review[node_id]，供 API 路由返回前端。"""
    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or not nid:
        return None
    raw = read_meeting_pipeline_json(sid)
    if not isinstance(raw, dict):
        return None
    ctx = raw.get("context") if isinstance(raw.get("context"), dict) else None
    if not isinstance(ctx, dict):
        return None
    node_review = ctx.get("node_review")
    if not isinstance(node_review, dict):
        return None
    payload = node_review.get(nid)
    return payload if isinstance(payload, dict) else None


def read_artifact_file(scope_id: str, relative_path: str) -> tuple[str, str] | None:
    """读取归档文件原文。返回 ``(content, ext)``，路径越权时返回 ``None``。

    安全约束：``relative_path`` 必须落在 ``scope_dir(scope_id)`` 之下。
    """
    sid = (scope_id or "").strip()
    rel = (relative_path or "").strip().lstrip("/").lstrip("\\")
    if not sid or not rel:
        return None
    from synapse.rd_meeting.paths import scope_dir

    base = scope_dir(sid).resolve()
    target = (base / rel).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        logger.warning("read_artifact_file rejected escape: scope=%s rel=%s", sid, rel)
        return None
    if not target.is_file():
        return None
    try:
        content = target.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    return content, target.suffix.lower()


__all__ = [
    "REVIEW_SCHEMA_VERSION",
    "AgentMetricsRow",
    "AgentSummary",
    "ArtifactFile",
    "NodeReviewMetrics",
    "aggregate_node_metrics",
    "aggregate_activity_for_summary",
    "apply_preserved_summaries",
    "build_activity_summary_context",
    "build_node_review_metrics_only",
    "build_node_review_payload",
    "collect_artifact_files",
    "generate_agent_summaries",
    "load_node_review",
    "read_artifact_file",
    "save_node_review",
]
