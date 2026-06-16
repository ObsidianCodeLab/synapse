"""Cursor Agent CLI 检测模块。"""

from __future__ import annotations

import subprocess
from pathlib import Path

from synapse.rd_meeting.cursor_agent_cli import (
    check_cursor_agent_cli,
    resolve_agent_executable,
    validate_agent_executable,
)


def test_check_cursor_agent_cli_when_missing():
    status = check_cursor_agent_cli("/nonexistent/agent-binary")
    assert status["installed"] is False
    assert status["logged_in"] is False
    assert status["ready"] is False
    assert status["error"]
    assert "未找到 Cursor Agent CLI" in status["install_hint"]


def test_check_cursor_agent_cli_ready_when_logged_in(tmp_path, monkeypatch):
    agent = tmp_path / "agent.cmd"
    agent.write_text("@echo off", encoding="utf-8")

    def fake_run(argv, **kwargs):
        cmd = argv[1] if len(argv) > 1 else ""
        if cmd == "--version":
            return subprocess.CompletedProcess(argv, 0, stdout="agent 1.0\n", stderr="")
        if cmd in ("status", "whoami"):
            return subprocess.CompletedProcess(argv, 0, stdout="Logged in as test@example.com\n", stderr="")
        return subprocess.CompletedProcess(argv, 1, stdout="", stderr="")

    monkeypatch.setattr("synapse.rd_meeting.cursor_agent_cli.subprocess.run", fake_run)
    status = check_cursor_agent_cli(str(agent))
    assert status["installed"] is True
    assert status["logged_in"] is True
    assert status["ready"] is True


def test_resolve_agent_executable_prefers_existing_file(tmp_path):
    agent = tmp_path / "agent.exe"
    agent.write_text("", encoding="utf-8")
    assert resolve_agent_executable(str(agent)) == str(agent.resolve())


def test_validate_existing_agent(tmp_path):
    agent = tmp_path / "agent.cmd"
    agent.write_text("@echo off", encoding="utf-8")
    assert validate_agent_executable(str(agent)) is None


def test_resolve_agent_launch_argv_uses_version_node(tmp_path):
    from synapse.rd_meeting.cursor_agent_cli import resolve_agent_launch_argv

    version_dir = tmp_path / "versions" / "2026.06.04-abc123"
    version_dir.mkdir(parents=True)
    node = version_dir / "node.exe"
    index = version_dir / "index.js"
    node.write_text("", encoding="utf-8")
    index.write_text("", encoding="utf-8")
    agent = tmp_path / "agent.cmd"
    agent.write_text("@echo off", encoding="utf-8")

    argv = resolve_agent_launch_argv(str(agent))
    assert argv == [str(node.resolve()), str(index.resolve())]


def test_resolve_agent_launch_argv_uses_timestamp_version_node(tmp_path):
    from synapse.rd_meeting.cursor_agent_cli import resolve_agent_launch_argv

    version_dir = tmp_path / "versions" / "2026.06.12-19-59-36-f6aba9a"
    version_dir.mkdir(parents=True)
    node = version_dir / "node.exe"
    index = version_dir / "index.js"
    node.write_text("", encoding="utf-8")
    index.write_text("", encoding="utf-8")
    agent = tmp_path / "agent.cmd"
    agent.write_text("@echo off", encoding="utf-8")

    argv = resolve_agent_launch_argv(str(agent))
    assert argv == [str(node.resolve()), str(index.resolve())]


def test_legacy_alias_for_timestamp_dir():
    from synapse.rd_meeting.cursor_agent_cli import legacy_alias_for_timestamp_dir

    assert legacy_alias_for_timestamp_dir("2026.06.12-19-59-36-f6aba9a") == "2026.06.12-f6aba9a"
    assert legacy_alias_for_timestamp_dir("2026.06.04-abc123") is None


def test_detect_cursor_agent_version_dir_issue_finds_pending_aliases(tmp_path, monkeypatch):
    from synapse.rd_meeting.cursor_agent_cli import detect_cursor_agent_version_dir_issue

    base = tmp_path / "cursor-agent"
    version_dir = base / "versions" / "2026.06.12-19-59-36-f6aba9a"
    version_dir.mkdir(parents=True)
    (version_dir / "node.exe").write_text("", encoding="utf-8")
    (version_dir / "index.js").write_text("", encoding="utf-8")
    (base / "agent.cmd").write_text("@echo off\necho broken", encoding="utf-8")

    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setattr(
        "synapse.rd_meeting.cursor_agent_cli._query_agent_version",
        lambda _resolved: None,
    )

    issue = detect_cursor_agent_version_dir_issue(base)
    assert issue["needs_repair"] is True
    assert issue["pending"] == [
        {"timestamp_dir": "2026.06.12-19-59-36-f6aba9a", "alias": "2026.06.12-f6aba9a"}
    ]


def test_detect_cursor_agent_version_dir_issue_skips_when_version_ok(tmp_path, monkeypatch):
    from synapse.rd_meeting.cursor_agent_cli import detect_cursor_agent_version_dir_issue

    base = tmp_path / "cursor-agent"
    version_dir = base / "versions" / "2026.06.12-19-59-36-f6aba9a"
    version_dir.mkdir(parents=True)
    (version_dir / "node.exe").write_text("", encoding="utf-8")
    (version_dir / "index.js").write_text("", encoding="utf-8")
    (base / "agent.cmd").write_text("@echo off", encoding="utf-8")

    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setattr(
        "synapse.rd_meeting.cursor_agent_cli._query_agent_version",
        lambda _resolved: "agent 2026.06.12-f6aba9a",
    )

    issue = detect_cursor_agent_version_dir_issue(base)
    assert issue["needs_repair"] is False
    assert issue["reason"] == "agent_version_ok"


def test_repair_cursor_agent_version_dirs_creates_alias(tmp_path, monkeypatch):
    from synapse.rd_meeting.cursor_agent_cli import (
        detect_cursor_agent_version_dir_issue,
        repair_cursor_agent_version_dirs,
    )

    base = tmp_path / "cursor-agent"
    version_dir = base / "versions" / "2026.06.12-19-59-36-f6aba9a"
    version_dir.mkdir(parents=True)
    (version_dir / "node.exe").write_text("", encoding="utf-8")
    (version_dir / "index.js").write_text("", encoding="utf-8")
    (base / "agent.cmd").write_text("@echo off", encoding="utf-8")

    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setattr(
        "synapse.rd_meeting.cursor_agent_cli._query_agent_version",
        lambda _resolved: None,
    )
    created_dirs: list[tuple[str, str]] = []

    def fake_mklink(link, target):
        Path(link).mkdir()
        created_dirs.append((str(link), str(target)))

    monkeypatch.setattr(
        "synapse.rd_meeting.cursor_agent_cli._create_dir_junction",
        fake_mklink,
    )

    assert detect_cursor_agent_version_dir_issue(base)["needs_repair"] is True
    result = repair_cursor_agent_version_dirs(base)
    assert result["applied"] is True
    assert result["aliases"] == ["2026.06.12-f6aba9a"]
    assert created_dirs == [
        (
            str((base / "versions" / "2026.06.12-f6aba9a").resolve()),
            str(version_dir.resolve()),
        )
    ]
    assert detect_cursor_agent_version_dir_issue(base)["needs_repair"] is False


def test_is_workspace_trust_error():
    from synapse.rd_meeting.cursor_agent_cli import is_workspace_trust_error

    assert is_workspace_trust_error("⚠ Workspace Trust Required\nPass --trust")
    assert not is_workspace_trust_error("some other error")
