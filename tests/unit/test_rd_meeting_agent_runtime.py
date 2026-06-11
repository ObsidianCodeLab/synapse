"""研发会议室 agent_runtime：工具裁剪与技能预注入。"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from synapse.agents.profile import AgentProfile, SkillsMode
from synapse.rd_meeting.agent_runtime import (
    MEETING_COMMON_TOOL_NAMES,
    MEETING_HOST_ONLY_TOOL_NAMES,
    MEETING_TODO_TOOL_NAMES,
    apply_meeting_agent_runtime,
    apply_meeting_slim_tools,
    format_meeting_skill_guidance_section,
    meeting_tool_names_for_role,
    restore_meeting_slim_tools,
    skill_ids_from_profile,
)


def test_meeting_tool_names_exclude_list_skills():
    host = meeting_tool_names_for_role("host")
    worker = meeting_tool_names_for_role("worker")
    assert MEETING_TODO_TOOL_NAMES <= host
    assert MEETING_TODO_TOOL_NAMES <= worker
    assert "create_plan_file" not in host
    assert "exit_plan_mode" not in worker
    assert "list_skills" not in host
    assert "list_skills" not in worker
    assert "delegate_to_agent" in host
    assert "delegate_to_agent" not in worker
    assert "deliver_artifacts" not in worker
    assert "deliver_artifacts" not in host
    assert "submit_meeting_work_plan" in host
    assert MEETING_COMMON_TOOL_NAMES <= host
    assert MEETING_HOST_ONLY_TOOL_NAMES <= host
    assert MEETING_COMMON_TOOL_NAMES <= worker


def test_apply_meeting_slim_tools_filters_and_restores():
    agent = MagicMock()
    agent._tools = [
        {"name": "run_shell"},
        {"name": "create_todo"},
        {"name": "update_todo_step"},
        {"name": "list_skills"},
        {"name": "delegate_to_agent"},
        {"name": "browser_navigate"},
    ]
    agent._meeting_orig_tools = None
    agent.tool_catalog = MagicMock()
    agent.prompt_assembler = None

    apply_meeting_slim_tools(agent, "host")
    names = {t["name"] for t in agent._tools}
    assert "list_skills" not in names
    assert "browser_navigate" not in names
    assert "run_shell" in names
    assert "create_todo" in names
    assert "update_todo_step" in names
    assert "delegate_to_agent" in names
    assert len(agent._meeting_orig_tools) == 6

    restore_meeting_slim_tools(agent)
    assert len(agent._tools) == 6
    assert agent._meeting_orig_tools is None


def test_skill_ids_from_profile_inclusive():
    p = AgentProfile(
        id="w1",
        name="w",
        skills=["whalecloud-dev-tool-doc-generate"],
        skills_mode=SkillsMode.INCLUSIVE,
    )
    ids = skill_ids_from_profile(p)
    assert "whalecloud-dev-tool-doc-generate" in ids


def test_apply_meeting_agent_runtime_keeps_prompt_without_duplicate_skill_section():
    from synapse.skills.registry import SkillEntry

    agent = MagicMock()
    entry = SkillEntry(
        skill_id="foo-skill",
        name="Foo",
        description="Short summary for meeting.",
        when_to_use="When doing foo tasks.",
    )
    agent.skill_registry.get.return_value = entry
    agent.skill_loader = None
    agent._tools = [{"name": "run_shell"}, {"name": "list_skills"}]
    agent._meeting_orig_tools = None
    agent.tool_catalog = MagicMock()
    agent.prompt_assembler = None

    profile = AgentProfile(
        id="w1",
        name="w",
        skills=["foo-skill"],
        skills_mode=SkillsMode.INCLUSIVE,
    )

    out = apply_meeting_agent_runtime(
        agent,
        role="worker",
        profile=profile,
        base_system_prompt="BASE-PROMPT",
    )
    assert out == "BASE-PROMPT"
    assert "## 已挂载技能（摘要）" not in out
    assert "list_skills" not in {t["name"] for t in agent._tools}


def test_append_enriched_skill_lines_brief_summary_only():
    from unittest.mock import MagicMock

    from synapse.rd_meeting.agent_runtime import append_enriched_skill_lines
    from synapse.skills.registry import SkillEntry

    entry = SkillEntry(
        skill_id="foo-skill",
        name="Foo",
        description="Short summary for meeting.",
    )
    agent = MagicMock()
    agent.skill_registry.get.return_value = entry
    agent.skill_loader = None
    lines: list[str] = []
    append_enriched_skill_lines(
        lines,
        ["foo-skill"],
        format_title=lambda sid: sid,
        agent=agent,
    )
    assert len(lines) == 1
    assert "Short summary for meeting." in lines[0]
    assert "脚本" not in lines[0]
    assert "instruction-only" not in lines[0]


def test_rd_meeting_policy_bypass_allows_run_shell_in_meeting_session():
    from synapse.core.policy_v2.adapter import evaluate_via_v2
    from synapse.core.policy_v2.context import PolicyContext, set_current_context, reset_current_context
    from synapse.core.policy_v2.enums import ConfirmationMode, DecisionAction, SessionRole
    from synapse.rd_meeting.policy_bypass import try_rd_meeting_allow_via_session, try_rd_meeting_policy_allow

    decision = try_rd_meeting_allow_via_session(
        "run_shell",
        session_id="rd_meeting:room-abc:host",
    )
    assert decision is not None
    assert decision.action.name == "ALLOW"

    meta_only = try_rd_meeting_policy_allow(
        "run_skill_script",
        session_id="policy_v2_adapter_fallback",
        metadata={"rd_meeting": True},
    )
    assert meta_only is not None
    assert meta_only.action.name == "ALLOW"

    ctx = PolicyContext(
        session_id="rd_meeting:room-abc:host",
        workspace_roots=(),
        channel="desktop",
        is_owner=True,
        session_role=SessionRole.AGENT,
        confirmation_mode=ConfirmationMode.DEFAULT,
        is_unattended=False,
        metadata={"rd_meeting": True},
    )
    token = set_current_context(ctx)
    try:
        via_adapter = evaluate_via_v2("run_shell", {"command": "python scripts/foo.py"})
        assert via_adapter.action == DecisionAction.ALLOW
        via_skill = evaluate_via_v2(
            "run_skill_script",
            {"skill_name": "whalecloud-dev-tool-doc-generate", "script_name": "fill_clarify.py"},
        )
        assert via_skill.action == DecisionAction.ALLOW
        assert via_skill.reason == "研发会议室白名单工具自动放行"
    finally:
        reset_current_context(token)

    normal = try_rd_meeting_allow_via_session("run_shell", session_id="cli-session-1")
    assert normal is None

