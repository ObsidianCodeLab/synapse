"""Synapse 用户数据根目录解析（与 Tauri ``synapse_root_dir()`` 对齐）。

解析优先级：
1. 环境变量 ``SYNAPSE_ROOT``
2. ``~/.synapse/root_config.json`` 中的 ``custom_root``
3. 默认 ``~/.synapse``
"""

from __future__ import annotations

import json
import os
from pathlib import Path

_ROOT_CONFIG_NAME = "root_config.json"


def default_synapse_home() -> Path:
    """默认用户数据根目录（未读自定义配置）。"""
    return Path.home() / ".synapse"


def root_config_path() -> Path:
    """固定位置的 root_config.json（指针文件，不随 custom_root 迁移）。"""
    return default_synapse_home() / _ROOT_CONFIG_NAME


def _custom_root_usable(path: Path) -> bool:
    """与 Tauri 一致：目录存在，或其父目录可访问时视为可用。"""
    if path.exists():
        return path.is_dir()
    parent = path.parent
    return parent.exists()


def read_custom_root_from_config() -> Path | None:
    """读取 ``root_config.json`` 中的 ``custom_root``；无效或缺失时返回 ``None``。"""
    config_path = root_config_path()
    if not config_path.is_file():
        return None
    try:
        payload = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    raw = payload.get("custom_root")
    if not isinstance(raw, str):
        return None
    cleaned = raw.strip()
    if not cleaned:
        return None
    candidate = Path(cleaned).expanduser()
    if not candidate.is_absolute():
        return None
    if not _custom_root_usable(candidate):
        return None
    return candidate


def resolve_synapse_home() -> Path:
    """解析 Synapse 用户数据根目录。"""
    env_root = os.environ.get("SYNAPSE_ROOT", "").strip()
    if env_root:
        return Path(env_root).expanduser()
    custom = read_custom_root_from_config()
    if custom is not None:
        return custom
    return default_synapse_home()
