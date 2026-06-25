"""任务执行 CLI 模型选项（按 CLI 工具区分）。"""

from __future__ import annotations

from typing import Any

from synapse.rd_meeting.cli_tools import DEFAULT_CLI_TOOL, normalize_cli_tool

DEFAULT_CURSOR_CLI_MODEL = "composer-2.5"

CURSOR_CLI_MODEL_OPTIONS: list[dict[str, Any]] = [
    {
        "id": "composer-2.5",
        "label": "Composer 2.5",
        "description": "Cursor Composer 2.5，任务执行默认模型",
        "default": True,
    },
    {
        "id": "auto",
        "label": "Auto",
        "description": "由 Cursor Agent CLI 自动选择模型（不传 --model）",
    },
    {
        "id": "custom",
        "label": "Custom",
        "description": "自定义模型 ID，原样传给 agent --model",
        "requires_input": True,
    },
]

CLI_MODEL_OPTIONS_BY_TOOL: dict[str, list[dict[str, Any]]] = {
    "cursor_cli": CURSOR_CLI_MODEL_OPTIONS,
}

_VALID_CURSOR_PRESETS = frozenset(o["id"] for o in CURSOR_CLI_MODEL_OPTIONS)

CLI_EXEC_NODE_IDS = frozenset({"task_exec", "diff_analysis"})


def normalize_cursor_cli_model(value: str | None) -> str:
    raw = (value or "").strip()
    if raw in _VALID_CURSOR_PRESETS:
        return raw
    return DEFAULT_CURSOR_CLI_MODEL


def cli_model_options_for_tool(cli_tool: str) -> list[dict[str, Any]]:
    tid = normalize_cli_tool(cli_tool)
    return [dict(o) for o in CLI_MODEL_OPTIONS_BY_TOOL.get(tid, [])]


def resolve_cursor_cli_model_arg(
    preset: str | None,
    custom: str | None = None,
) -> str:
    """解析传给 cursor-operation.py --model 的值。"""
    mode = normalize_cursor_cli_model(preset)
    if mode == "auto":
        return "auto"
    if mode == "custom":
        name = (custom or "").strip()
        return name or DEFAULT_CURSOR_CLI_MODEL
    return mode


def resolve_cli_model_arg(
    cli_tool: str,
    preset: str | None,
    custom: str | None = None,
) -> str | None:
    """按 CLI 工具解析 agent 模型参数；未接入的工具返回 None。"""
    tool = normalize_cli_tool(cli_tool)
    if tool == DEFAULT_CLI_TOOL:
        return resolve_cursor_cli_model_arg(preset, custom)
    return None


def display_cli_model_label(
    cli_tool: str,
    preset: str | None,
    custom: str | None = None,
) -> str:
    tool = normalize_cli_tool(cli_tool)
    if tool != DEFAULT_CLI_TOOL:
        return "—"
    mode = normalize_cursor_cli_model(preset)
    if mode == "custom":
        return (custom or "").strip() or DEFAULT_CURSOR_CLI_MODEL
    if mode == "auto":
        return "Auto"
    for opt in CURSOR_CLI_MODEL_OPTIONS:
        if opt["id"] == mode:
            return str(opt.get("label") or mode)
    return mode


def _cli_exec_model_label_from_config(node_id: str) -> str | None:
    """会议室 node_overrides 中的 IDE CLI 模型展示名。"""
    from synapse.rd_meeting.config_store import load_meeting_room_config

    nid = (node_id or "").strip()
    if nid not in CLI_EXEC_NODE_IDS:
        return None
    cfg = load_meeting_room_config()
    overrides = cfg.get("node_overrides") if isinstance(cfg.get("node_overrides"), dict) else {}
    ov = overrides.get(nid) if isinstance(overrides.get(nid), dict) else {}
    tool = normalize_cli_tool(str(ov.get("cli_tool") or DEFAULT_CLI_TOOL))
    preset = normalize_cursor_cli_model(str(ov.get("cli_model") or DEFAULT_CURSOR_CLI_MODEL))
    custom = str(ov.get("cli_model_custom") or "").strip()
    label = display_cli_model_label(tool, preset, custom)
    if label and label != "—":
        return label[:120]
    return None


def _cli_exec_model_label_from_result(scope_id: str, node_id: str) -> str | None:
    """CLI 执行结果 JSON 中落盘的 IDE 模型（启动时写入）。"""
    sid = (scope_id or "").strip()
    nid = (node_id or "").strip()
    if not sid or nid not in CLI_EXEC_NODE_IDS:
        return None

    data: dict[str, Any] | None = None
    if nid == "task_exec":
        from synapse.rd_meeting.task_exec import load_task_exec_payload

        data = load_task_exec_payload(sid)
    elif nid == "diff_analysis":
        from synapse.rd_meeting.diff_analysis_exec import load_diff_analysis_payload

        data = load_diff_analysis_payload(sid)

    if not isinstance(data, dict):
        return None

    label = str(data.get("cli_model_label") or "").strip()
    if label and label != "—":
        return label[:120]

    preset = str(data.get("cli_model") or "").strip()
    if not preset:
        return None
    tool = normalize_cli_tool(str(data.get("cli_tool") or DEFAULT_CLI_TOOL))
    custom = str(data.get("cli_model_custom") or "").strip()
    label = display_cli_model_label(tool, preset, custom)
    if label and label != "—":
        return label[:120]
    return None


def resolve_cli_exec_node_model_label(scope_id: str, node_id: str) -> str | None:
    """CLI 执行节点 token 统计对应模型：IDE 配置（结果 JSON 为运行期快照，否则读会议室配置）。"""
    nid = (node_id or "").strip()
    if nid not in CLI_EXEC_NODE_IDS:
        return None
    label = _cli_exec_model_label_from_result(scope_id, nid)
    if label:
        return label
    return _cli_exec_model_label_from_config(nid)
