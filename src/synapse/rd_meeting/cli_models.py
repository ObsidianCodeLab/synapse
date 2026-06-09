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
