"""Cursor Agent CLI（agent）检测 — 任务执行前置条件。"""

from __future__ import annotations

import os
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
