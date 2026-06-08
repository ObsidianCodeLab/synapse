"""研发会议室 Agent 运行时：任务级工具白名单 + Profile 技能元数据内嵌能力档案。"""

from __future__ import annotations

import logging
from typing import Any, Literal

from synapse.agents.profile import AgentProfile, SkillsMode

logger = logging.getLogger(__name__)

MeetingRole = Literal["host", "worker"]

# Todo 四件套（Agent 模式任务跟踪；Plan 模式工具 create_plan_file / exit_plan_mode 不暴露）
MEETING_TODO_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "create_todo",
        "update_todo_step",
        "get_todo_status",
        "complete_todo",
    }
)

# 任务级工具白名单（与 dev_iwhalecloud_knowledge 的 _slim_tools 同思路；不含 list_skills）
MEETING_COMMON_TOOL_NAMES: frozenset[str] = frozenset(
    {
        *MEETING_TODO_TOOL_NAMES,
        "run_shell",
        "read_file",
        "write_file",
        "list_directory",
        "get_skill_info",
        "run_skill_script",
        "get_skill_reference",
        "web_search",
    }
)

MEETING_HOST_ONLY_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "delegate_to_agent",
        "delegate_parallel",
        "send_agent_message",
        "submit_meeting_work_plan",
        "submit_hitl_questionnaire",
    }
)

MEETING_WORKER_EXTRA_TOOL_NAMES: frozenset[str] = frozenset(
    {
        "deliver_artifacts",
    }
)


def meeting_tool_names_for_role(role: MeetingRole) -> frozenset[str]:
    names = set(MEETING_COMMON_TOOL_NAMES)
    if role == "host":
        names |= MEETING_HOST_ONLY_TOOL_NAMES
    else:
        names |= MEETING_WORKER_EXTRA_TOOL_NAMES
    return frozenset(names)


def skill_ids_from_profile(profile: AgentProfile | None) -> list[str]:
    """从 Profile 解析本会话应预注入的 skill_id 列表。"""
    if profile is None:
        return []
    raw = [str(s).strip() for s in (profile.skills or []) if str(s).strip()]
    if not raw:
        return []
    if profile.skills_mode == SkillsMode.EXCLUSIVE:
        # 会议室预注入只支持「明确列出要用的技能」
        return []
    return _ensure_whalecloud_base_scripts(raw)


def _ensure_whalecloud_base_scripts(skill_ids: list[str]) -> list[str]:
    """含 whalecloud 研发技能时自动挂载共享脚本技能（与产品知识生成一致）。"""
    try:
        from synapse.utils.whaleclouddevtool import (
            WHALECLOUD_BASE_SCRIPTS_SKILL_ID,
            is_whalecloud_dev_tool_skill_id,
        )
    except Exception:
        return list(skill_ids)
    out = list(skill_ids)
    if any(is_whalecloud_dev_tool_skill_id(s) for s in out):
        base = WHALECLOUD_BASE_SCRIPTS_SKILL_ID
        if base not in out:
            out.append(base)
    return out


def _resolve_skill_entry_or_parsed(skill_id: str, agent: Any | None) -> tuple[Any | None, Any | None]:
    """从 Agent 注册表 / 全局注册表 / loader / 磁盘解析技能元数据（不含 SKILL 正文）。"""
    key = (skill_id or "").strip()
    if not key:
        return None, None

    registry = getattr(agent, "skill_registry", None) if agent is not None else None
    if registry is not None:
        entry = registry.get(key)
        if entry is not None:
            return entry, None

    try:
        from synapse.skills.registry import get_skill

        entry = get_skill(key)
        if entry is not None:
            return entry, None
    except Exception:
        pass

    loader = getattr(agent, "skill_loader", None) if agent is not None else None
    if loader is not None:
        parsed = loader.get_skill(key)
        if parsed is not None:
            return None, parsed

    try:
        from synapse.rd_meeting.room_skill import _find_external_skill_file
        from synapse.skills.parser import skill_parser

        path = _find_external_skill_file(key)
        if path is not None:
            return None, skill_parser.parse_file(path)
    except Exception as exc:
        logger.debug("resolve skill metadata from disk failed for %s: %s", key, exc)

    return None, None


def _skill_description_from_entry(entry: Any) -> str:
    desc = (
        entry.get_display_description()
        if hasattr(entry, "get_display_description")
        else entry.description
    )
    return str(desc or "").strip()


def _skill_description_from_parsed(parsed: Any) -> str:
    meta = getattr(parsed, "metadata", None)
    if meta is None:
        return ""
    return str(getattr(meta, "description", "") or "").strip()


def skill_brief_summary(skill_id: str, *, agent: Any | None = None) -> str:
    """单技能 L1 摘要（仅 description，不含脚本 / instruction-only）。"""
    entry, parsed = _resolve_skill_entry_or_parsed(skill_id, agent)
    if entry is not None:
        return _skill_description_from_entry(entry)
    if parsed is not None:
        return _skill_description_from_parsed(parsed)
    return ""


def _compact_detail_sublines_from_entry(entry: Any) -> list[str]:
    desc = _skill_description_from_entry(entry)
    if desc:
        return [f"摘要：{desc}"]
    return ["（无摘要，请 get_skill_info 加载）"]


def _compact_detail_sublines_from_parsed(skill_id: str, parsed: Any) -> list[str]:
    desc = _skill_description_from_parsed(parsed)
    if desc:
        return [f"摘要：{desc}"]
    return ["（无摘要，请 get_skill_info 加载）"]


def skill_detail_sublines(skill_id: str, *, agent: Any | None = None) -> list[str]:
    """（遗留）单技能摘要子行；新代码请用 skill_brief_summary + append_profile_skill_lines。"""
    summary = skill_brief_summary(skill_id, agent=agent)
    if summary:
        return [f"摘要：{summary}"]
    return ["（无摘要，请 get_skill_info 加载）"]


def append_enriched_skill_lines(
    lines: list[str],
    skill_ids: list[str],
    *,
    limit: int = 0,
    indent: str = "  ",
    agent: Any | None = None,
    format_title: Any | None = None,
) -> None:
    """将技能 id + 名称 + 摘要追加为单行列表项（供能力档案 / 能力卡片复用）。"""
    count = 0
    seen: set[str] = set()
    for sid in skill_ids:
        key = (sid or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        title = format_title(key) if format_title else key
        summary = skill_brief_summary(key, agent=agent)
        if summary:
            lines.append(f"{indent}- {title}：{summary}")
        else:
            lines.append(f"{indent}- {title}")
        count += 1
        if limit and count >= limit:
            break


def _format_summary_block(*, skill_id: str, lines: list[str]) -> str:
    return f"### {skill_id}\n\n" + "\n".join(lines)


def _summary_lines_from_entry(entry: Any) -> list[str]:
    lines: list[str] = []
    for sub in _compact_detail_sublines_from_entry(entry):
        if "：" in sub:
            key, value = sub.split("：", 1)
            lines.append(f"- **{key}**: {value}")
        else:
            lines.append(f"- **类型**: {sub}")
    return lines


def _summary_lines_from_parsed(skill_id: str, parsed: Any) -> list[str]:
    lines: list[str] = []
    for sub in _compact_detail_sublines_from_parsed(skill_id, parsed):
        if "：" in sub:
            key, value = sub.split("：", 1)
            lines.append(f"- **{key}**: {value}")
        else:
            lines.append(f"- **类型**: {sub}")
    return lines


def collect_skill_summary_blocks(agent: Any, skill_ids: list[str]) -> list[str]:
    """（遗留）按 ### skill_id 块格式化摘要；新代码请用 append_enriched_skill_lines。"""
    if not skill_ids:
        return []
    blocks: list[str] = []
    seen: set[str] = set()

    for sid in skill_ids:
        key = (sid or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        entry, parsed = _resolve_skill_entry_or_parsed(key, agent)
        if entry is not None:
            blocks.append(_format_summary_block(skill_id=key, lines=_summary_lines_from_entry(entry)))
        elif parsed is not None:
            blocks.append(
                _format_summary_block(skill_id=key, lines=_summary_lines_from_parsed(key, parsed))
            )
        else:
            blocks.append(
                _format_summary_block(
                    skill_id=key,
                    lines=["- **摘要**: （注册表中未找到该技能）"],
                )
            )
    return blocks


def format_meeting_skill_guidance_section(skill_summaries: list[str]) -> str:
    """（遗留）独立「已挂载技能（摘要）」段；技能元数据已内嵌能力档案，不再追加。"""
    if not skill_summaries:
        return ""
    return (
        "\n\n---\n## 已挂载技能（摘要）\n\n"
        "以下为 Profile 挂载技能的元数据摘要；**执行前**须对将要使用的 skill_id 调用 "
        "`get_skill_info(skill_id)` 加载完整 SKILL.md，再按指引调用 `run_skill_script` 或 shell / 读写工具。\n\n"
        + "\n\n---\n\n".join(skill_summaries)
    )


def apply_meeting_slim_tools(agent: Any, role: MeetingRole) -> None:
    """任务级裁剪工具列表；首次裁剪前保存 _meeting_orig_tools 供会议结束后恢复。"""
    allowed = meeting_tool_names_for_role(role)
    orig_tools = getattr(agent, "_tools", None)
    if orig_tools is None:
        return
    if getattr(agent, "_meeting_orig_tools", None) is None:
        agent._meeting_orig_tools = list(orig_tools)  # type: ignore[attr-defined]
    base = agent._meeting_orig_tools  # type: ignore[attr-defined]
    slim = [t for t in base if (t.get("name") or "") in allowed]
    agent._tools = slim  # type: ignore[attr-defined]
    try:
        from synapse.tools.catalog import ToolCatalog

        agent.tool_catalog = ToolCatalog(slim)
        pa = getattr(agent, "prompt_assembler", None)
        if pa is not None:
            pa._tool_catalog = agent.tool_catalog
    except Exception as exc:
        logger.debug("apply_meeting_slim_tools catalog sync failed: %s", exc)
    logger.info(
        "Meeting slim tools applied: role=%s allowed=%d remaining=%d",
        role,
        len(allowed),
        len(slim),
    )


def restore_meeting_slim_tools(agent: Any) -> None:
    """恢复会议前工具列表（池化 Agent 离开会议室时调用）。"""
    orig = getattr(agent, "_meeting_orig_tools", None)
    if orig is None:
        return
    agent._tools = list(orig)  # type: ignore[attr-defined]
    agent._meeting_orig_tools = None  # type: ignore[attr-defined]
    try:
        from synapse.tools.catalog import ToolCatalog

        agent.tool_catalog = ToolCatalog(agent._tools)
        pa = getattr(agent, "prompt_assembler", None)
        if pa is not None:
            pa._tool_catalog = agent.tool_catalog
    except Exception as exc:
        logger.debug("restore_meeting_slim_tools catalog sync failed: %s", exc)


def apply_meeting_agent_runtime(
    agent: Any,
    *,
    role: MeetingRole,
    profile: AgentProfile | None,
    base_system_prompt: str,
) -> str:
    """裁剪会议室工具列表；技能元数据已在能力档案段内嵌，不再追加独立摘要段。"""
    apply_meeting_slim_tools(agent, role)
    return (base_system_prompt or "").rstrip()
