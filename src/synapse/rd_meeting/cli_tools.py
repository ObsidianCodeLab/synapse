"""研发会议室：任务执行 CLI 工具选项（与引导页研发工具终端对齐）。"""

from __future__ import annotations

from typing import Any

DEFAULT_CLI_TOOL = "cursor_cli"

CLI_TOOL_OPTIONS: list[dict[str, Any]] = [
    {
        "id": "cursor_cli",
        "label": "Cursor CLI",
        "description": "通过 Cursor Agent CLI（agent）headless 执行开发任务",
        "implemented": True,
    },
    {
        "id": "claude_code",
        "label": "Claude Code",
        "description": "Claude Code CLI（待接入）",
        "implemented": False,
    },
    {
        "id": "opencode",
        "label": "OpenCode",
        "description": "OpenCode CLI（待接入）",
        "implemented": False,
    },
]

_VALID_CLI_TOOLS = frozenset(o["id"] for o in CLI_TOOL_OPTIONS)


def normalize_cli_tool(value: str | None) -> str:
    raw = (value or "").strip()
    if raw in _VALID_CLI_TOOLS:
        return raw
    return DEFAULT_CLI_TOOL


def cli_tool_option(tool_id: str) -> dict[str, Any] | None:
    tid = normalize_cli_tool(tool_id)
    for opt in CLI_TOOL_OPTIONS:
        if opt["id"] == tid:
            return dict(opt)
    return None


def is_cli_tool_implemented(tool_id: str) -> bool:
    opt = cli_tool_option(tool_id)
    return bool(opt and opt.get("implemented"))
