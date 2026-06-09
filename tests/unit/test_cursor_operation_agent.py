"""cursor-operation：agent 可执行路径解析与缺失时的错误提示。"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_SCRIPT = _REPO_ROOT / "skills" / "whalecloud-dev-tool-development" / "scripts" / "cursor-operation.py"


def _load_cursor_operation():
    spec = importlib.util.spec_from_file_location("cursor_operation_test", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


co = _load_cursor_operation()


def test_resolve_agent_executable_prefers_explicit_file(tmp_path):
    agent = tmp_path / "agent.exe"
    agent.write_text("", encoding="utf-8")
    resolved = co.resolve_agent_executable(str(agent))
    assert resolved == str(agent.resolve())


def test_resolve_agent_executable_uses_env_override(tmp_path, monkeypatch):
    agent = tmp_path / "custom-agent.exe"
    agent.write_text("", encoding="utf-8")
    monkeypatch.setenv("CURSOR_AGENT_PATH", str(agent))
    resolved = co.resolve_agent_executable("agent")
    assert resolved == str(agent.resolve())


def test_validate_agent_executable_reports_install_hint():
    err = co.validate_agent_executable("agent")
    assert err is not None
    assert "未找到 Cursor Agent CLI" in err
    assert "agent --version" in err


def test_validate_agent_executable_ok_for_existing_file(tmp_path):
    agent = tmp_path / "agent.cmd"
    agent.write_text("@echo off", encoding="utf-8")
    assert co.validate_agent_executable(str(agent)) is None
