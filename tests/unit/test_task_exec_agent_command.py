"""任务执行：完整 agent 命令生成与协作流展示。"""

from __future__ import annotations

from synapse.rd_meeting.chat_display import expand_history_event_to_chat
from synapse.rd_meeting.cursor_agent_cli import format_argv_as_shell
from synapse.rd_meeting.task_exec import build_cursor_round_commands


def test_format_argv_as_shell_quotes_spaces():
    cmd = format_argv_as_shell(["agent", "-p", "--workspace", "D:/work/foo bar"])
    assert '"D:/work/foo bar"' in cmd
    assert cmd.startswith("agent -p --workspace")


def test_build_cursor_round_commands_includes_prompt(tmp_path):
    sandbox = tmp_path / "ZmdbCore"
    archive = sandbox / "synapse_archive" / "需求设计" / "func_solution"
    archive.mkdir(parents=True)
    (sandbox / "AGENTS.md").write_text("# AGENTS\n", encoding="utf-8")
    func_doc = sandbox / "synapse_archive" / "需求设计" / "func_solution" / "函数级方案.md"
    func_doc.write_text("# 方案", encoding="utf-8")
    accept_doc = (
        sandbox / "synapse_archive" / "需求分析" / "acceptance" / "验收标准.md"
    )
    accept_doc.parent.mkdir(parents=True, exist_ok=True)
    accept_doc.write_text("# 验收", encoding="utf-8")

    cmds = build_cursor_round_commands(
        code_path=str(sandbox),
        target="【任务执行 · 开发轮】\n工单：T-001",
        func_doc=str(func_doc),
        accept_doc=str(accept_doc),
        continue_session=False,
        model="composer-2.5",
        log_path=str(tmp_path / "develop.log"),
    )
    agent_cmd = cmds.get("agent_command") or ""
    prompt = cmds.get("agent_prompt") or ""
    assert "agent" in agent_cmd or "node.exe" in agent_cmd
    assert "--workspace" in agent_cmd
    assert "函数级方案" in prompt or "函数级方案.md" in prompt
    assert "AGENTS.md" in prompt
    assert "忽略 AGENTS.md" in prompt
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
