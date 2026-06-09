"""cursor-operation：agent 可执行路径解析与缺失时的错误提示。"""

from __future__ import annotations

import asyncio
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


def test_build_argv_puts_prompt_last(tmp_path, monkeypatch):
    version_dir = tmp_path / "versions" / "2026.06.04-abc123"
    version_dir.mkdir(parents=True)
    node = version_dir / "node.exe"
    index = version_dir / "index.js"
    node.write_text("", encoding="utf-8")
    index.write_text("", encoding="utf-8")
    agent = tmp_path / "agent.cmd"
    agent.write_text("@echo off", encoding="utf-8")

    cli = co.CursorCLI(agent_path=str(agent), workspace=str(tmp_path / "ws"))
    (tmp_path / "ws").mkdir()
    argv = cli.build_argv("do the task")

    assert argv[-1] == "do the task"
    assert argv[0] == str(node.resolve())
    assert argv[1] == str(index.resolve())
    assert "-p" in argv
    trust_idx = argv.index("--trust")
    assert trust_idx < len(argv) - 1
    assert "--approve-mcps" in argv
    assert "--yolo" not in argv
    yolo_argv = cli.build_argv("do the task", use_yolo=True)
    assert "--yolo" in yolo_argv


def test_format_agent_argv_for_log_hides_prompt():
    argv = [
        "node.exe",
        "index.js",
        "-p",
        "--output-format",
        "stream-json",
        "--trust",
        "secret prompt",
    ]
    logged = co.format_agent_argv_for_log(argv)
    assert "secret prompt" not in logged
    assert logged.endswith("<prompt>")
    assert "--trust" in logged


def test_iter_subprocess_lines_reads_long_json_line():
    async def _run():
        loop = asyncio.new_event_loop()
        reader = asyncio.StreamReader(limit=co.STREAM_JSON_LINE_LIMIT)
        reader.feed_data(b'{"type":"assistant","text":"' + b"x" * 100_000 + b'"}\n')
        reader.feed_eof()
        lines = []
        async for line in co._iter_subprocess_lines(reader):
            lines.append(line)
        return lines

    lines = asyncio.run(_run())
    assert len(lines) == 1
    assert len(lines[0]) > 100_000
