"""Cursor Agent CLI（agent）检测 — 任务执行前置条件。"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def cursor_agent_install_candidates() -> list[Path]:
    """常见 Cursor Agent CLI 安装位置（与官方 install 脚本布局一致）。"""
    candidates: list[Path] = []
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA", "").strip()
        if local:
            base = Path(local) / "cursor-agent"
            for name in ("agent.exe", "agent.cmd", "cursor-agent.exe", "cursor-agent.cmd"):
                candidates.append(base / name)
            versions = base / "versions"
            if versions.is_dir():
                for child in sorted(versions.iterdir(), reverse=True):
                    if not child.is_dir():
                        continue
                    for name in ("agent.exe", "agent.cmd", "cursor-agent.exe", "cursor-agent.cmd"):
                        candidates.append(child / name)
    else:
        home = Path.home()
        candidates.extend(
            [
                home / ".local" / "bin" / "agent",
                home / ".cursor" / "bin" / "agent",
            ]
        )
    return candidates


def resolve_agent_executable(agent_path: str = "agent") -> str:
    """解析 agent 可执行文件完整路径。"""
    for key in ("SYNAPSE_CURSOR_AGENT_PATH", "CURSOR_AGENT_PATH"):
        env_val = (os.environ.get(key) or "").strip()
        if not env_val:
            continue
        env_candidate = Path(env_val)
        if env_candidate.is_file():
            return str(env_candidate.resolve())
        env_resolved = shutil.which(env_val)
        if env_resolved:
            return str(Path(env_resolved).resolve())

    raw = (agent_path or "agent").strip()
    candidate = Path(raw)
    if candidate.is_file():
        return str(candidate.resolve())
    resolved = shutil.which(raw)
    if resolved:
        return str(Path(resolved).resolve())

    for guess in cursor_agent_install_candidates():
        if guess.is_file():
            return str(guess.resolve())

    return raw


def format_agent_not_found_error(resolved: str) -> str:
    lines = [
        "未找到 Cursor Agent CLI（agent）。",
        "任务执行依赖无头 agent 命令，与 Cursor 编辑器自带的 cursor 命令不同。",
        f"当前解析结果：{resolved}",
        "",
        "请先安装 Cursor Agent CLI 并登录：",
    ]
    if sys.platform == "win32":
        lines.append("  PowerShell: irm 'https://cursor.com/install?win32=true' | iex")
    else:
        lines.append("  curl https://cursor.com/install -fsS | bash")
    lines.extend(
        [
            "安装后在新终端验证：agent --version",
            "",
            "或通过环境变量指定可执行文件完整路径：",
            "  CURSOR_AGENT_PATH=C:\\Users\\you\\AppData\\Local\\cursor-agent\\agent.exe",
        ]
    )
    return "\n".join(lines)


def validate_agent_executable(resolved: str) -> str | None:
    if Path(resolved).is_file():
        return None
    return format_agent_not_found_error(resolved)


_VERSION_DIR_RE = re.compile(r"^\d{4}\.\d{1,2}\.\d{1,2}-[a-f0-9]+$")


def _version_dir_sort_key(name: str) -> tuple[int, ...]:
    date_part = name.split("-", 1)[0]
    parts = date_part.split(".")
    if len(parts) != 3:
        return (0, 0, 0)
    try:
        return tuple(int(part) for part in parts)
    except ValueError:
        return (0, 0, 0)


def format_argv_as_shell(argv: list[str]) -> str:
    """将 argv 格式化为可在终端粘贴的单行命令（含引号转义）。"""
    parts: list[str] = []
    for arg in argv:
        text = str(arg)
        if not text:
            parts.append('""')
            continue
        if any(c in text for c in ' \t"&|<>^%\n\r'):
            escaped = text.replace("\\", "\\\\").replace('"', '\\"')
            parts.append(f'"{escaped}"')
        else:
            parts.append(text)
    return " ".join(parts)


def resolve_agent_launch_argv(agent_path: str = "agent") -> list[str]:
    """解析 agent 启动 argv；Windows 上优先 node.exe + index.js，避免 .cmd 丢参。"""
    resolved = resolve_agent_executable(agent_path)
    path = Path(resolved)
    if path.suffix.lower() not in {".cmd", ".exe", ".bat"}:
        return [resolved]

    script_dir = path.parent
    root_node = script_dir / "node.exe"
    root_index = script_dir / "index.js"
    if root_node.is_file() and root_index.is_file():
        return [str(root_node.resolve()), str(root_index.resolve())]

    versions = script_dir / "versions"
    if versions.is_dir():
        version_dirs = sorted(
            (
                child
                for child in versions.iterdir()
                if child.is_dir() and _VERSION_DIR_RE.match(child.name)
            ),
            key=lambda child: _version_dir_sort_key(child.name),
            reverse=True,
        )
        for version_dir in version_dirs:
            node = version_dir / "node.exe"
            index = version_dir / "index.js"
            if node.is_file() and index.is_file():
                return [str(node.resolve()), str(index.resolve())]

    return [resolved]


WORKSPACE_TRUST_ERROR_MARKERS = (
    "Workspace Trust Required",
    "Do you trust the contents of this directory?",
)


def is_workspace_trust_error(stderr: str) -> bool:
    text = (stderr or "").strip()
    if not text:
        return False
    return any(marker in text for marker in WORKSPACE_TRUST_ERROR_MARKERS)


def format_workspace_trust_error_hint(workspace: str | None = None) -> str:
    ws = (workspace or "").strip() or "(workspace)"
    return (
        "Cursor Agent 要求信任工作区，但 --trust 未生效。\n"
        f"工作区：{ws}\n"
        "常见原因：agent 刚安装尚未完成首次登录，或 Windows 下经 agent.cmd 传参丢失。\n"
        "请在本机终端执行一次：\n"
        f'  agent -p "ok" --trust --force --workspace "{ws}" --output-format text\n'
        "若仍失败，请重新 agent login 后重试任务执行。"
    )


def _query_agent_version(resolved: str) -> str | None:
    if not Path(resolved).is_file():
        return None
    try:
        proc = subprocess.run(
            [resolved, "--version"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    text = f"{proc.stdout or ''}{proc.stderr or ''}".strip()
    if not text:
        return None
    return text.splitlines()[0].strip()


def _query_agent_auth(resolved: str) -> tuple[bool, str]:
    if os.environ.get("CURSOR_API_KEY", "").strip():
        return True, "已配置 CURSOR_API_KEY"
    if not Path(resolved).is_file():
        return False, ""
    for subcmd in ("status", "whoami"):
        try:
            proc = subprocess.run(
                [resolved, subcmd],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=20,
            )
        except (OSError, subprocess.TimeoutExpired):
            continue
        text = f"{proc.stdout or ''}{proc.stderr or ''}".strip()
        lower = text.lower()
        if proc.returncode != 0:
            continue
        if "not logged" in lower or "not authenticated" in lower or "login required" in lower:
            continue
        if text:
            return True, text.splitlines()[0].strip()
        return True, "已登录"
    return False, "未登录 Cursor 账号"


def check_cursor_agent_cli(agent_path: str = "agent") -> dict[str, Any]:
    """返回 agent 是否可用、是否已登录及安装提示。"""
    resolved = resolve_agent_executable(agent_path)
    err = validate_agent_executable(resolved)
    logged_in = False
    auth_message = ""
    if err is None:
        logged_in, auth_message = _query_agent_auth(resolved)
    return {
        "installed": err is None,
        "logged_in": logged_in,
        "ready": err is None and logged_in,
        "path": resolved,
        "version": _query_agent_version(resolved) if err is None else None,
        "auth_message": auth_message,
        "error": (err.splitlines()[0] if err else (auth_message if not logged_in and err is None else "")),
        "install_hint": err or (auth_message if not logged_in else ""),
        "platform": sys.platform,
    }
