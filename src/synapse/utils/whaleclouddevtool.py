"""研发工具技能判定工具函数（与前端 whalecloudDevToolSkill.ts 保持一致）。"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

_WHALECLOUD_DEV_TOOL_PREFIX = "whalecloud_dev_tool_"
_WHALECLOUD_DEV_TOOL_DIR_PREFIX = "whalecloud-dev-tool-"
_RD_TOOL_CATEGORY_ZH = "研发工具"

# 与仓库 skills/whalecloud-dev-tool-base-scripts 目录名一致；产品知识 / 研发工具链强制依赖，不可卸载、不可从 allowlist 移除
WHALECLOUD_BASE_SCRIPTS_SKILL_ID = "whalecloud-dev-tool-base-scripts"


def is_whalecloud_base_scripts_skill_id(skill_id: str) -> bool:
    """是否为研发工具共享脚本技能（强制启用、不可卸载）。"""
    s = (skill_id or "").strip().lower().replace("_", "-")
    return s == WHALECLOUD_BASE_SCRIPTS_SKILL_ID


def is_whalecloud_dev_tool_skill_id(skill_id: str) -> bool:
    """判断一个技能 id 是否属于研发工具类别。

    与前端 isWhalecloudDevToolSkill 逻辑对齐：
    - tool_name 以 whalecloud_dev_tool_ 开头
    - 或 skill_id 以 whalecloud-dev-tool- 开头
    """
    s = (skill_id or "").strip()
    return s.startswith(_WHALECLOUD_DEV_TOOL_PREFIX) or s.startswith(_WHALECLOUD_DEV_TOOL_DIR_PREFIX)


def is_whalecloud_dev_tool_entry(
    skill_id: str,
    *,
    tool_name: str | None = None,
    category: str | None = None,
) -> bool:
    """判断技能条目是否属于研发工具（含 tool_name / category 兜底）。"""
    if is_whalecloud_dev_tool_skill_id(skill_id):
        return True
    tn = (tool_name or "").strip()
    if tn.startswith(_WHALECLOUD_DEV_TOOL_PREFIX):
        return True
    return (category or "").strip() == _RD_TOOL_CATEGORY_ZH


def discover_whalecloud_dev_tool_skill_ids(
    project_root: Path | None = None,
    *,
    extra_skill_roots: Iterable[Path] | None = None,
) -> set[str]:
    """扫描磁盘上已安装的 whalecloud-dev-tool-* 技能目录名。"""
    roots: list[Path] = []
    if project_root is not None:
        roots.append(project_root / "skills")
    if extra_skill_roots:
        roots.extend(extra_skill_roots)
    try:
        from synapse.skills.loader import _resolve_user_workspace_skills

        roots.append(_resolve_user_workspace_skills())
    except Exception:
        pass

    ids: set[str] = set()
    seen_roots: set[Path] = set()
    for root in roots:
        try:
            resolved = root.resolve()
        except OSError:
            continue
        if resolved in seen_roots:
            continue
        seen_roots.add(resolved)
        if not resolved.is_dir():
            continue
        for child in resolved.iterdir():
            if not child.is_dir():
                continue
            if not is_whalecloud_dev_tool_skill_id(child.name):
                continue
            if (child / "SKILL.md").is_file():
                ids.add(child.name)
    return ids


def ensure_whalecloud_dev_tools_in_allowlist(
    allowlist: set[str] | None,
    *,
    project_root: Path | None = None,
    known_skill_ids: Iterable[str] | None = None,
) -> set[str] | None:
    """将研发工具技能并入有效 allowlist（``None`` 表示未限制，原样返回）。"""
    if allowlist is None:
        return None

    dev_ids = discover_whalecloud_dev_tool_skill_ids(project_root)
    if known_skill_ids:
        dev_ids |= {
            sid.strip()
            for sid in known_skill_ids
            if sid and is_whalecloud_dev_tool_skill_id(sid)
        }
    if not dev_ids:
        return allowlist
    return set(allowlist) | dev_ids
