"""任务执行：完整 agent 命令生成与协作流展示。"""

from __future__ import annotations

from synapse.rd_meeting.chat_display import expand_history_event_to_chat
from synapse.rd_meeting.cursor_agent_cli import format_argv_as_shell
from synapse.rd_meeting.task_exec import build_cursor_round_commands


def test_format_argv_as_shell_quotes_spaces():
    cmd = format_argv_as_shell(["agent", "-p", "--workspace", "D:/work/foo bar"])
    assert '"D:/work/foo bar"' in cmd
    assert cmd.startswith("agent -p --workspace")


def test_build_cursor_round_commands_includes_prompt():
    cmds = build_cursor_round_commands(
        code_path="D:/sandbox/ZmdbCore",
        target="【任务执行 · 开发轮】\n工单：T-001",
        func_doc="D:/sandbox/ZmdbCore/synapse_archive/需求设计/func_solution/函数级方案.md",
        accept_doc="D:/sandbox/ZmdbCore/synapse_archive/需求分析/acceptance/验收标准.md",
        continue_session=False,
        model="composer-2.5",
        log_path="D:/logs/develop.log",
    )
    agent_cmd = cmds.get("agent_command") or ""
    assert "agent" in agent_cmd or "node.exe" in agent_cmd
    assert "--workspace" in agent_cmd
    assert "函数级方案" in agent_cmd or "函数级方案.md" in agent_cmd
    assert cmds.get("python_command")
    assert "cursor-operation.py" in cmds.get("python_command", "")


def test_expand_task_exec_develop_started_to_structured_card():
    ev = {
        "event": "task_exec_develop_started",
        "ts": "2026-06-10T12:00:00",
        "message": "工单 T-001 · 开发轮（1/2）",
        "display": {
            "phase": "develop",
            "task_no": "T-001",
            "agent_command": 'agent -p --workspace "D:/sandbox" "prompt text"',
            "python_command": "python cursor-operation.py",
        },
    }
    rows = expand_history_event_to_chat(ev, 0)
    kinds = [r.get("displayKind") for r in rows]
    assert "system_task_exec" in kinds
    card = next(r for r in rows if r.get("displayKind") == "system_task_exec")
    assert card.get("payload", {}).get("agent_command")
