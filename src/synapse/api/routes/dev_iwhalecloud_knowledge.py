"""产品知识：架构文档生成、任务状态、AI 润色（挂到 dev_iwhalecloud.router）。"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import shutil
import time
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from synapse.agents.profile import AgentProfile, SkillsMode, get_profile_store
from synapse.api.routes.dev_iwhalecloud_prompt import (
    build_knowledge_gen_system_prompt,
    build_knowledge_generation_user_prompt,
    build_refine_product_context,
    build_refine_user_message,
    format_rd_skill_guidance_section,
    refine_skill_id_for_doc_type,
    refine_system_prompt_for_doc_type,
)
from synapse.api.schemas import error_response, success_response
from synapse.config import settings
from synapse.skills.load_scope import get_or_create_with_skill_ids, normalize_skill_dir_id
from synapse.utils.whaleclouddevtool import (
    WHALECLOUD_BASE_SCRIPTS_SKILL_ID,
    is_whalecloud_dev_tool_skill_id,
)

logger = logging.getLogger(__name__)


def _with_base_scripts_skill_ids(ids: list[str]) -> list[str]:
    """产品知识生成 / refine 依赖共享脚本技能；INCLUSIVE 模式下须显式挂载才能解析脚本路径。"""
    out = list(ids)
    if WHALECLOUD_BASE_SCRIPTS_SKILL_ID not in out:
        out.append(WHALECLOUD_BASE_SCRIPTS_SKILL_ID)
    return out


def _rd_skill_exists(skill_id: str) -> bool:
    sid = normalize_skill_dir_id(skill_id)
    if not sid:
        return False
    return (settings.project_root / "skills" / sid / "SKILL.md").is_file()


def _resolve_rd_skills(raw_ids: list[str]) -> list[str]:
    """规范化 rd_skill_ids（目录名），校验磁盘存在，并挂载 base-scripts。"""
    result: list[str] = []
    seen: set[str] = set()
    for raw in raw_ids:
        s = normalize_skill_dir_id(raw)
        if not s or s in seen:
            continue
        if not is_whalecloud_dev_tool_skill_id(s):
            continue
        if not _rd_skill_exists(s):
            logger.warning("rd skill not on disk, skip: %s", s)
            continue
        seen.add(s)
        result.append(s)
    return _with_base_scripts_skill_ids(result)


def _repo_name_from_git_url(url: str | None) -> str | None:
    """从 Git HTTPS URL 取仓库名（最后一段去掉 .git），失败则返回 None。"""
    if not url or not isinstance(url, str):
        return None
    part = url.rstrip("/").split("/")[-1]
    if part.endswith(".git"):
        part = part[:-4]
    return part or None


class ProductKnowledgeRepoRow(BaseModel):
    """与研发统一服务 get_prod_info.repo_info / get_repo_info 单项结构对齐。"""

    repo_url: str = Field(default="", description="Git 仓库 URL")
    repo_branch: str = Field(default="", description="仓库分支 repositoryId|destBranchName")
    prod_branch: str = Field(default="", description="产品分支 branchVersionId|branchName")
    repo_module: str = Field(default="", description="应用模块 productModuleId|moduleChName")
    code_path: str = Field(default="", description="仓库代码路径")
    repo_func: str = Field(default="", description="仓库职责/用途")
    repo_master: str = Field(default="N", description="主仓库 Y/N")


def _repo_names_from_repo_info(rows: list[ProductKnowledgeRepoRow]) -> list[str]:
    """从 repo_info 解析去重后的 GitNexus 仓库名列表（顺序与请求体一致）。"""
    names: list[str] = []
    seen: set[str] = set()
    for row in rows:
        name = _repo_name_from_git_url(row.repo_url)
        if name and name not in seen:
            seen.add(name)
            names.append(name)
    return names


def _resolve_main_repo_from_info(
    rows: list[ProductKnowledgeRepoRow],
    *,
    fallback_name: str,
    fallback_url: str | None,
) -> tuple[str, ProductKnowledgeRepoRow | None]:
    """返回 (主仓库 GitNexus 名, 主仓库行)；无 repo_info 时回退到请求体单仓字段。"""
    if rows:
        main_rows = [r for r in rows if (r.repo_master or "").strip().upper() == "Y"]
        main_row = main_rows[0] if main_rows else rows[0]
        name = _repo_name_from_git_url(main_row.repo_url)
        if name:
            return name, main_row
    name = _repo_name_from_git_url(fallback_url) or fallback_name
    return name, None


def _format_repo_info_for_prompt(rows: list[ProductKnowledgeRepoRow]) -> str:
    if not rows:
        return ""
    lines: list[str] = []
    for i, row in enumerate(rows, 1):
        name = _repo_name_from_git_url(row.repo_url) or "(未解析)"
        master = "主仓库" if (row.repo_master or "").strip().upper() == "Y" else "从仓库"
        lines.append(
            f"{i}. **{name}**（{master}） url=`{row.repo_url}` code_path=`{row.code_path}` "
            f"职责=`{row.repo_func}` branch=`{row.repo_branch}`"
        )
    return "\n".join(lines)


class ProductKnowledgeGenerateRequest(BaseModel):
    task_id: str = Field(
        ...,
        description="前端生成并经 docs_initialize 同步的任务 ID，与统一服务 doc_process_info 一致",
        min_length=1,
        max_length=128,
    )
    repo_name: str = Field(
        ..., description="仓库名称（优先使用 repo_url 解析；前端传不到时作为兜底）"
    )
    repo_url: str | None = Field(None, description="仓库 Git URL，用于从路径解析真实仓库名")
    gitnexus_url: str = Field(..., description="GitNexus 服务地址")
    product_desc: str = Field(..., description="产品描述")
    code_path: str = Field(..., description="代码路径")
    core_features: str = Field(..., description="主要功能")
    rd_skill_ids: list[str] = Field(
        default_factory=list,
        description="研发工具技能 id 列表（由前端必选默认；不传或空则不挂载技能）",
    )
    preferred_endpoint: str | None = Field(
        None,
        description="首选 LLM 端点 name（与 llm_endpoints.json 中一致）；空则走全局路由",
        max_length=200,
    )
    prod_name: str = Field(
        ...,
        description="产品标识，与统一服务 docs_initialize 的 prod 一致；落盘根为 synapse_home/tmp/docs/<prod_name>/<doc_type>/",
        min_length=1,
        max_length=512,
    )
    doc_type: str = Field(
        ...,
        description="文档类型：与统一服务一致；内置任务区分「产品架构」（FUNCTIONAL/TECH）与「产品手册」（PRODUCT_DEV.md）等",
        min_length=1,
        max_length=256,
    )
    repo_info: list[ProductKnowledgeRepoRow] = Field(
        default_factory=list,
        description="产品关联的全部仓库（与统一服务 repo_info 一致）；技能须按 GNX_REPO_LIST 全量 materialize",
    )


class ProductKnowledgeRefineRequest(BaseModel):
    prod_name: str = Field(
        ..., description="产品标识，与 docs_initialize prod 一致", min_length=1, max_length=512
    )
    doc_type: str = Field(..., description="文档类型，与生成任务一致", min_length=1, max_length=256)
    targets: list[str] = Field(..., description="稳定文件名数组，必须恰好 1 个元素")
    user_prompt: str = Field(..., description="用户修改要求（不含产品信息块）")
    preferred_endpoint: str | None = Field(None, description="首选 LLM 端点 name", max_length=200)
    rd_skill_ids: list[str] = Field(
        default_factory=list,
        description="研发工具技能 id 列表（由前端必选默认；不传或空则不挂载技能）",
    )
    product_desc: str = Field(default="", description="产品描述（服务端注入 user 消息）")
    code_path: str = Field(default="", description="代码路径（服务端注入 user 消息）")
    core_features: str = Field(default="", description="主要功能（服务端注入 user 消息）")
    gitnexus_url: str = Field(
        default="", description="GitNexus 服务地址（源码缓存不存在时用于拉取）"
    )


class ProductKnowledgeRefineSessionBody(BaseModel):
    """按 prod + doc_type + target 定位 refine_sessions/<target>/ 下的会话。"""

    prod_name: str = Field(..., min_length=1, max_length=512)
    doc_type: str = Field(..., min_length=1, max_length=256)
    target: str = Field(
        ..., min_length=1, max_length=512, description="与本地草稿 doc_name 一致的文件名"
    )


class ProductKnowledgeLocalDraftQuery(BaseModel):
    prod_name: str = Field(
        ...,
        description="与 docs_initialize 的 prod 一致",
        min_length=1,
        max_length=512,
    )
    doc_type: str = Field(
        ...,
        description="与 docs_initialize 的 doc_type 一致",
        min_length=1,
        max_length=256,
    )


class LocalDraftDocRow(BaseModel):
    doc_name: str = Field(..., min_length=1, max_length=512)
    content: str = Field(default="")


class ProductKnowledgeLocalDraftWriteRequest(BaseModel):
    prod_name: str = Field(..., min_length=1, max_length=512)
    doc_type: str = Field(..., min_length=1, max_length=256)
    doc_content: list[LocalDraftDocRow] = Field(
        ...,
        description="与 get_doc / docs_submit 的 doc_content 项结构一致",
    )


_knowledge_tasks: dict[str, dict[str, Any]] = {}

_ATOMIC_WRITE_SUFFIX = ".synapse_part"

# 与 _run_knowledge_generation_task 内 asyncio.wait_for(..., 3600) 对齐，余量 100s 后仍为
# pending/running 的视为僵死，在 product_knowledge/status 查询时收束为 error 并落盘。
_KNOWLEDGE_GEN_STALE_MAX_SECS = 3600 + 100

# refine 在途任务超时（秒）：超过后 status 查询视为超时并清理目录
_REFINE_SESSION_TIMEOUT_SECS = 3600


# ---------------------------------------------------------------------------
# Refine session.status 落盘工具（目录：refine_sessions/<target>/）
# ---------------------------------------------------------------------------


def _refine_session_status_path(session_root: Path) -> Path:
    return session_root / "session.status"


def _refine_target_session_root(docs_root: Path, target_safe: str) -> Path:
    return docs_root / "refine_sessions" / target_safe


def _write_refine_session_status(session_root: Path, payload: dict[str, Any]) -> None:
    """原子写入 session.status；失败仅记录日志不抛出。"""
    path = _refine_session_status_path(session_root)
    tmp = path.with_suffix(".synapse_part")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    except Exception as e:
        logger.warning("write refine session.status failed: %s", e)


def _read_refine_session_status(session_root: Path) -> dict[str, Any] | None:
    """读取 session.status；不存在或解析失败返回 None。"""
    path = _refine_session_status_path(session_root)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _rmtree_refine_session_root(session_root: Path) -> None:
    try:
        if session_root.exists():
            shutil.rmtree(session_root, ignore_errors=True)
    except Exception as e:
        logger.warning("rmtree refine session %s failed: %s", session_root, e)


def _cleanup_legacy_pkg_refine_dirs(docs_root: Path) -> None:
    """移除旧版 refine_sessions/pkg_refine_* 目录，避免与按 target 分目录的布局冲突。"""
    sessions_dir = docs_root / "refine_sessions"
    if not sessions_dir.is_dir():
        return
    try:
        entries = list(sessions_dir.iterdir())
    except OSError:
        return
    for entry in entries:
        if not entry.is_dir():
            continue
        if entry.name.startswith("pkg_refine_"):
            _rmtree_refine_session_root(entry)


def _knowledge_docs_root(doc_type: str, prod_name: str) -> Path:
    """大模型产出（FUNCTIONAL_ARCH.md、TECH_ARCH.md、*.excalidraw 等）目录。"""
    return settings.synapse_home / "tmp" / "docs" / prod_name / doc_type


def _safe_docs_file_basename(name: str) -> str | None:
    """拒绝路径穿越与隐藏/临时文件名的落盘文件名。"""
    s = (name or "").strip()
    if not s or s in (".", ".."):
        return None
    if "/" in s or "\\" in s:
        return None
    if ".." in s:
        return None
    if s.startswith("."):
        return None
    return s


def _local_draft_dir_list_doc_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    out: list[Path] = []
    try:
        for p in sorted(root.iterdir()):
            if not p.is_file():
                continue
            if p.name.startswith("__"):
                continue
            if p.name.startswith("."):
                continue
            if p.name.endswith(_ATOMIC_WRITE_SUFFIX):
                continue
            out.append(p)
    except OSError as e:
        logger.warning("list draft dir %s: %s", root, e)
    return out


def local_draft_has_any_file(doc_type: str, prod_name: str) -> bool:
    root = _knowledge_docs_root(doc_type, prod_name)
    return len(_local_draft_dir_list_doc_files(root)) > 0


def read_local_draft_doc_rows(doc_type: str, prod_name: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    root = _knowledge_docs_root(doc_type, prod_name)
    for p in _local_draft_dir_list_doc_files(root):
        safe = _safe_docs_file_basename(p.name)
        if not safe or safe != p.name:
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except OSError:
            text = ""
        rows.append({"doc_name": p.name, "content": text})
    return rows


def write_local_draft_doc_rows_atomic(
    doc_type: str, prod_name: str, rows: list[tuple[str, str]]
) -> None:
    """全量写入该 doc_type 下文档：单文件 .synapse_part + replace；并删除目录内未出现在 payload 中的普通文件。"""
    root = _knowledge_docs_root(doc_type, prod_name)
    root.mkdir(parents=True, exist_ok=True)
    wanted: set[str] = set()
    normalized: list[tuple[str, str]] = []
    for raw_name, content in rows:
        name = _safe_docs_file_basename(raw_name)
        if not name:
            raise ValueError(f"invalid_doc_name:{raw_name!r}")
        wanted.add(name)
        normalized.append((name, content))
    for name, content in normalized:
        dest = root / name
        part = dest.with_name(dest.name + _ATOMIC_WRITE_SUFFIX)
        part.write_bytes(content.encode("utf-8"))
        part.replace(dest)
    for p in root.iterdir():
        if not p.is_file():
            continue
        if p.name.endswith(_ATOMIC_WRITE_SUFFIX):
            p.unlink(missing_ok=True)
            continue
        if p.name.startswith(".") or p.name.startswith("__"):
            continue
        if p.name not in wanted:
            try:
                p.unlink()
            except OSError as e:
                logger.warning("remove orphan draft %s: %s", p, e)


def clear_local_draft_doc_dir(doc_type: str, prod_name: str) -> int:
    """提交成功后清空 synapse_home/tmp/docs/<prod>/<doc_type>/ 下普通文件（含遗留 .synapse_part）。"""
    root = _knowledge_docs_root(doc_type, prod_name)
    if not root.is_dir():
        return 0
    n = 0
    for p in list(root.iterdir()):
        if p.is_file():
            try:
                p.unlink()
                n += 1
            except OSError as e:
                logger.warning("clear draft file %s: %s", p, e)
    return n


def _gitnexus_local_data_path(repo_name: str) -> Path:
    """GitNexus 拉取/缓存数据根目录（与架构产出目录分离）。"""
    return settings.synapse_home / "tmp" / "gitnexus" / repo_name


def _task_status_dir() -> Path:
    d = settings.synapse_home / "tmp" / "task"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _task_status_path(task_id: str) -> Path | None:
    """与 _knowledge_tasks 同步的持久化文件：tmp/task/<task_id>.status（JSON）。task_id 仅保留安全字符。"""
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "", (task_id or "").strip())
    if not safe or len(safe) > 200:
        return None
    return _task_status_dir() / f"{safe}.status"


def _persist_task(task_id: str) -> None:
    """将当前内存中的任务快照写入磁盘；completed 不写 data 正文，保留 doc_type 等元数据供从 tmp 目录回读 MD。"""
    snap = _knowledge_tasks.get(task_id)
    if not snap:
        return
    path = _task_status_path(task_id)
    if path is None:
        return
    out: dict[str, Any] = {k: v for k, v in snap.items() if k != "data"}
    if snap.get("status") == "completed":
        out["repo_name"] = snap.get("repo_name")
        out["doc_type"] = snap.get("doc_type")
        out["prod_name"] = snap.get("prod_name")
    try:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    except OSError as e:
        logger.warning("Persist task %s failed: %s", task_id, e)


def _load_task_from_disk(task_id: str) -> dict[str, Any] | None:
    path = _task_status_path(task_id)
    if path is None or not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _read_arch_from_doc_root(doc_type: str, prod_name: str) -> dict[str, Any]:
    """completed 时从 synapse_home/tmp/docs/<prod_name>/<doc_type>/ 读取架构 MD（与生成任务 cwd 一致）。"""
    output_dir = _knowledge_docs_root(doc_type, prod_name)
    functional_arch = ""
    tech_arch = ""
    func_path = output_dir / "FUNCTIONAL_ARCH.md"
    if func_path.is_file():
        try:
            functional_arch = func_path.read_text(encoding="utf-8")
        except OSError:
            pass
    tech_path = output_dir / "TECH_ARCH.md"
    if tech_path.is_file():
        try:
            tech_arch = tech_path.read_text(encoding="utf-8")
        except OSError:
            pass
    sys_arch_layers_excalidraw = ""
    sal_path = output_dir / "sys-arch-layers.excalidraw"
    if sal_path.is_file():
        try:
            sys_arch_layers_excalidraw = sal_path.read_text(encoding="utf-8")
        except OSError:
            pass
    tech_stack_excalidraw = ""
    ts_ex_path = output_dir / "tech-stack.excalidraw"
    if ts_ex_path.is_file():
        try:
            tech_stack_excalidraw = ts_ex_path.read_text(encoding="utf-8")
        except OSError:
            pass
    product_dev = ""
    pd_path = output_dir / "PRODUCT_DEV.md"
    if pd_path.is_file():
        try:
            product_dev = pd_path.read_text(encoding="utf-8")
        except OSError:
            pass
    return {
        "functional_arch": functional_arch,
        "tech_arch": tech_arch,
        "sys_arch_layers_excalidraw": sys_arch_layers_excalidraw,
        "tech_stack_excalidraw": tech_stack_excalidraw,
        "product_dev": product_dev,
        "output": "",
    }


def _assemble_task_for_response(task_id: str) -> dict[str, Any] | None:
    """合并内存/磁盘元数据；completed 始终从 tmp/docs/<prod_name>/<doc_type>/ 读取 MD 作为 data（非 completed 不把 MD 当完成态）。"""
    meta = _knowledge_tasks.get(task_id)
    if meta is None:
        meta = _load_task_from_disk(task_id)
        if meta is not None:
            _knowledge_tasks[task_id] = meta
    if not meta:
        return None
    st = meta.get("status")
    if st in ("pending", "running"):
        created = meta.get("created_at")
        if isinstance(created, (int, float)) and (
            time.time() - float(created) > _KNOWLEDGE_GEN_STALE_MAX_SECS
        ):
            err = (
                f"Task stale: pending/running exceeded {_KNOWLEDGE_GEN_STALE_MAX_SECS}s (3600+100)"
            )
            new_meta: dict[str, Any] = {"status": "error", "error": err}
            for k in ("created_at", "repo_name", "prod_name", "doc_type"):
                if k in meta:
                    new_meta[k] = meta[k]
            _knowledge_tasks[task_id] = new_meta
            _persist_task(task_id)
            meta = new_meta
            st = "error"
    if st == "completed":
        raw_dt = meta.get("doc_type")
        raw_pn = meta.get("prod_name")
        if isinstance(raw_dt, str) and isinstance(raw_pn, str):
            data = _read_arch_from_doc_root(raw_dt, raw_pn)
        else:
            data = {
                "functional_arch": "",
                "tech_arch": "",
                "sys_arch_layers_excalidraw": "",
                "tech_stack_excalidraw": "",
                "product_dev": "",
                "output": "",
            }
        mem_data = meta.get("data") if isinstance(meta.get("data"), dict) else {}
        out_data = {
            **data,
            "output": str(mem_data.get("output", "") or data.get("output", "")),
        }
        merged = {**{k: v for k, v in meta.items() if k != "data"}, "data": out_data}
        _knowledge_tasks[task_id] = merged
        return merged
    return meta


async def _run_knowledge_generation_task(
    task_id: str, req: ProductKnowledgeGenerateRequest, app_state: Any
) -> None:
    pool = getattr(app_state, "agent_pool", None)
    if not pool:
        _knowledge_tasks[task_id] = {"status": "error", "error": "Agent pool not initialized"}
        _persist_task(task_id)
        return
    prof_id: str = ""
    try:
        ep = (req.preferred_endpoint or "").strip() or None
        base_profile = get_profile_store().get("default") or AgentProfile(id="default", name="小鲸")

        prof_id = f"__pkg_gen_{task_id}"
        session_id = f"pkg_gen_{task_id}"
        rd_skills = _resolve_rd_skills(req.rd_skill_ids)

        final_profile = replace(
            base_profile,
            id=prof_id,
            skills=rd_skills,
            skills_mode=SkillsMode.INCLUSIVE,
            ephemeral=True,
            preferred_endpoint=ep,
        )
        agent = await get_or_create_with_skill_ids(
            pool,
            session_id,
            final_profile,
            rd_skills,
        )

        repo_name, main_row = _resolve_main_repo_from_info(
            req.repo_info,
            fallback_name=req.repo_name,
            fallback_url=req.repo_url,
        )
        gnx_repo_list = _repo_names_from_repo_info(req.repo_info)
        if not gnx_repo_list and repo_name:
            gnx_repo_list = [repo_name]
        doc_type = req.doc_type
        prod_name = req.prod_name
        code_path = (main_row.code_path if main_row else "") or req.code_path
        repo_info_detail = _format_repo_info_for_prompt(req.repo_info)

        # GitNexus 本地数据与架构产出分离：前者 tmp/gitnexus/<repo>，后者 tmp/docs/<prod>/<doc_type>
        local_data_path = _gitnexus_local_data_path(repo_name)
        for rn in gnx_repo_list:
            _gitnexus_local_data_path(rn).mkdir(parents=True, exist_ok=True)
        output_dir = _knowledge_docs_root(doc_type, prod_name)
        output_dir.mkdir(parents=True, exist_ok=True)

        # 将已挂载的技能 body 读出（含真实路径），注入到 system prompt
        skill_bodies: list[str] = []
        loader = getattr(agent, "skill_loader", None)
        if loader:
            for sid in rd_skills:
                skill = loader.get_skill(sid)
                if skill and skill.body:
                    skill_path_line = f"**技能路径**: {skill.skill_dir}\n\n"
                    skill_bodies.append(f"### 研发技能：{sid}\n\n{skill_path_line}{skill.body}")

        # 技能全量内容注入到 system prompt，让大模型在执行前完整获取技能指引
        minimal_system_prompt = build_knowledge_gen_system_prompt(skill_bodies, doc_type=doc_type)
        prompt = build_knowledge_generation_user_prompt(
            gitnexus_url=req.gitnexus_url,
            repo_name=repo_name,
            gnx_repo_list=gnx_repo_list,
            repo_info_detail=repo_info_detail,
            local_data_path=local_data_path,
            output_dir=output_dir,
            prod_name=prod_name,
            doc_type=doc_type,
            request_repo_name=req.repo_name,
            product_desc=req.product_desc,
            code_path=code_path,
            core_features=req.core_features,
        )

        agent.default_cwd = str(output_dir)
        if getattr(agent, "shell_tool", None):
            agent.shell_tool.default_cwd = str(output_dir)  # type: ignore[union-attr]
        agent._current_session_id = session_id

        # 架构文档生成专用工具集：只保留 SKILL 实际需要的执行工具，大幅节省 token
        # SKILL 里用到：run_shell（执行 node 脚本）、文件读写、目录列举
        _ARCH_GEN_TOOL_NAMES = frozenset(
            {
                "run_shell",
                "read_file",
                "write_file",
                "list_directory",
            }
        )
        _orig_tools = getattr(agent, "_tools", None)
        _slim_tools = (
            [t for t in _orig_tools if t.get("name") in _ARCH_GEN_TOOL_NAMES]
            if _orig_tools is not None
            else None
        )

        # 用极简提示词覆盖 system prompt，并锁定阻止动态重建
        # _org_context=True 会使 _build_system_prompt_compiled* 直接返回 _context.system
        _orig_org_context = getattr(agent, "_org_context", None)
        _orig_system = getattr(getattr(agent, "_context", None), "system", None)
        try:
            agent._org_context = True  # type: ignore[attr-defined]
            if hasattr(agent, "_context") and agent._context is not None:
                agent._context.system = minimal_system_prompt
            if _slim_tools is not None:
                agent._tools = _slim_tools  # type: ignore[attr-defined]

            _knowledge_tasks[task_id]["status"] = "running"
            _persist_task(task_id)
            result = await asyncio.wait_for(
                agent.execute_task_from_message(
                    prompt, usage_scene=f"knowledge_generation_task_{prod_name}_{doc_type}"
                ),
                timeout=3600.0,
            )
        finally:
            # 恢复原始状态，避免影响后续复用（ephemeral agent 通常会被销毁，但以防万一）
            agent._org_context = _orig_org_context  # type: ignore[attr-defined]
            if (
                hasattr(agent, "_context")
                and agent._context is not None
                and _orig_system is not None
            ):
                agent._context.system = _orig_system
            if _orig_tools is not None:
                agent._tools = _orig_tools  # type: ignore[attr-defined]

        if result.success:
            functional_arch = ""
            tech_arch = ""
            sys_arch_layers_excalidraw = ""
            tech_stack_excalidraw = ""
            func_path = output_dir / "FUNCTIONAL_ARCH.md"
            if func_path.is_file():
                functional_arch = func_path.read_text(encoding="utf-8")
            tech_path = output_dir / "TECH_ARCH.md"
            if tech_path.is_file():
                tech_arch = tech_path.read_text(encoding="utf-8")
            sal_path = output_dir / "sys-arch-layers.excalidraw"
            if sal_path.is_file():
                try:
                    sys_arch_layers_excalidraw = sal_path.read_text(encoding="utf-8")
                except OSError:
                    pass
            ts_ex_path = output_dir / "tech-stack.excalidraw"
            if ts_ex_path.is_file():
                try:
                    tech_stack_excalidraw = ts_ex_path.read_text(encoding="utf-8")
                except OSError:
                    pass
            product_dev = ""
            pd_path = output_dir / "PRODUCT_DEV.md"
            if pd_path.is_file():
                try:
                    product_dev = pd_path.read_text(encoding="utf-8")
                except OSError:
                    pass
            _knowledge_tasks[task_id] = {
                "status": "completed",
                "repo_name": repo_name,
                "prod_name": prod_name,
                "doc_type": doc_type,
                "data": {
                    "functional_arch": functional_arch,
                    "tech_arch": tech_arch,
                    "sys_arch_layers_excalidraw": sys_arch_layers_excalidraw,
                    "tech_stack_excalidraw": tech_stack_excalidraw,
                    "product_dev": product_dev,
                    "output": str(result.data) if result.data else "",
                },
            }
            _persist_task(task_id)
        else:
            _knowledge_tasks[task_id] = {
                "status": "error",
                "error": result.error or "Unknown error",
            }
            _persist_task(task_id)
    except TimeoutError:
        _knowledge_tasks[task_id] = {"status": "error", "error": "Task timeout"}
        _persist_task(task_id)
    except Exception as e:
        logger.exception("Knowledge generation task failed")
        _knowledge_tasks[task_id] = {"status": "error", "error": str(e)}
        _persist_task(task_id)
    finally:
        try:
            if prof_id:
                pool.invalidate_profile(prof_id)
        except Exception:
            pass


def register_product_knowledge_routes(router: APIRouter) -> None:
    """在 dev_iwhalecloud 的 `router` 上注册产品知识相关路由。"""

    @router.post("/api/dev/iwhalecloud/product_knowledge/generate")
    async def product_knowledge_generate(
        _request: Request, body: ProductKnowledgeGenerateRequest
    ) -> Any:
        task_id = body.task_id.strip()

        # 幂等校验：同一 task_id 未到终态时拒绝重复提交（含进程重启后从磁盘恢复的状态）
        existing = _knowledge_tasks.get(task_id) or _load_task_from_disk(task_id)
        if existing and existing.get("status") not in ("completed", "error"):
            if task_id not in _knowledge_tasks:
                _knowledge_tasks[task_id] = existing
            return success_response({"task_id": task_id}, "任务已在执行中")

        repo_resolved, _ = _resolve_main_repo_from_info(
            body.repo_info,
            fallback_name=body.repo_name,
            fallback_url=body.repo_url,
        )
        gnx_repo_list = _repo_names_from_repo_info(body.repo_info)
        if not gnx_repo_list and repo_resolved:
            gnx_repo_list = [repo_resolved]
        _knowledge_tasks[task_id] = {
            "status": "pending",
            "created_at": time.time(),
            "repo_name": repo_resolved,
            "gnx_repo_list": gnx_repo_list,
            "prod_name": body.prod_name,
            "doc_type": body.doc_type,
        }
        _persist_task(task_id)
        ep = (body.preferred_endpoint or "").strip() or None
        logger.info(
            "Product knowledge generation task %s, gnx_repo_list=%s, rd_skill_ids=%s, preferred_endpoint=%s",
            task_id,
            gnx_repo_list,
            body.rd_skill_ids,
            ep or "(auto)",
        )
        asyncio.create_task(_run_knowledge_generation_task(task_id, body, _request.app.state))
        return success_response({"task_id": task_id}, "文档生成任务已启动")

    @router.get("/api/dev/iwhalecloud/product_knowledge/status/{task_id}")
    def product_knowledge_status(task_id: str) -> Any:
        task = _assemble_task_for_response(task_id.strip())
        if not task:
            return error_response(404, "任务不存在")
        return success_response(task)

    @router.post("/api/dev/iwhalecloud/product_knowledge/local_draft/exists")
    def product_knowledge_local_draft_exists(body: ProductKnowledgeLocalDraftQuery) -> Any:
        exists = local_draft_has_any_file(body.doc_type, body.prod_name)
        return success_response({"exists": exists})

    @router.post("/api/dev/iwhalecloud/product_knowledge/local_draft/read")
    def product_knowledge_local_draft_read(body: ProductKnowledgeLocalDraftQuery) -> Any:
        rows = read_local_draft_doc_rows(body.doc_type, body.prod_name)
        return success_response({"doc_content": rows})

    @router.post("/api/dev/iwhalecloud/product_knowledge/local_draft/write")
    def product_knowledge_local_draft_write(body: ProductKnowledgeLocalDraftWriteRequest) -> Any:
        if not body.doc_content:
            return error_response(400, "doc_content_empty")
        pairs: list[tuple[str, str]] = []
        for r in body.doc_content:
            dn = r.doc_name.strip()
            if not dn:
                return error_response(400, "empty_doc_name")
            pairs.append((dn, r.content))
        try:
            write_local_draft_doc_rows_atomic(body.doc_type, body.prod_name, pairs)
        except ValueError as e:
            return error_response(400, str(e))
        except OSError as e:
            logger.exception("local draft write failed")
            return error_response(500, str(e))
        return success_response({"written": len(pairs)}, "本地草稿已保存")

    @router.post("/api/dev/iwhalecloud/product_knowledge/local_draft/clear")
    def product_knowledge_local_draft_clear(body: ProductKnowledgeLocalDraftQuery) -> Any:
        n = clear_local_draft_doc_dir(body.doc_type, body.prod_name)
        return success_response({"removed": n}, "本地草稿目录已清理")

    @router.post("/api/dev/iwhalecloud/product_knowledge/refine")
    async def product_knowledge_refine(
        request: Request, body: ProductKnowledgeRefineRequest
    ) -> Any:
        """
        异步提交 refine：落盘目录为 refine_sessions/<target>/ ，同 target 全局仅一个在途任务。
        返回 data.target；通过 refine/session/status 传入 prod_name、doc_type、target 轮询。
        """
        if len(body.targets) != 1:
            return error_response(400, "invalid_targets")
        target_name = body.targets[0].strip()
        safe_name = _safe_docs_file_basename(target_name)
        if not safe_name:
            return error_response(400, "invalid_targets")

        docs_root = _knowledge_docs_root(body.doc_type, body.prod_name)
        auth_file = docs_root / safe_name

        if not auth_file.is_file():
            return error_response(404, "target_not_found")

        pool = getattr(request.app.state, "agent_pool", None)
        if not pool:
            return error_response(503, "Agent pool not initialized")

        _cleanup_legacy_pkg_refine_dirs(docs_root)

        session_root = _refine_target_session_root(docs_root, safe_name)
        existing = _read_refine_session_status(session_root)
        if existing:
            st = str(existing.get("status", ""))
            started_at = float(existing.get("started_at", 0.0))
            elapsed = time.time() - started_at
            up = str(existing.get("user_prompt", ""))
            if st in ("pending", "running"):
                if elapsed < _REFINE_SESSION_TIMEOUT_SECS:
                    return {
                        "errorcode": 409,
                        "message": "refine_session_pending",
                        "data": {
                            "target": safe_name,
                            "user_prompt": up[:500],
                            "elapsed_minutes": round(elapsed / 60, 1),
                        },
                    }
                _rmtree_refine_session_root(session_root)
                logger.info(
                    "refine target %s timed out after %.1f min, cleaned before resubmit",
                    safe_name,
                    elapsed / 60,
                )
            elif st == "completed":
                return {
                    "errorcode": 409,
                    "message": "refine_session_pending_review",
                    "data": {
                        "target": safe_name,
                        "user_prompt": up[:500],
                    },
                }
            elif st == "error":
                _rmtree_refine_session_root(session_root)

        try:
            auth_content = auth_file.read_text(encoding="utf-8")
        except OSError as e:
            return error_response(500, f"read_authoritative_failed:{e}")

        _rmtree_refine_session_root(session_root)
        original_dir = session_root / "original"
        proposed_dir = session_root / "proposed"
        try:
            original_dir.mkdir(parents=True, exist_ok=True)
            proposed_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            return error_response(500, f"mkdir_failed:{e}")

        original_copy = original_dir / safe_name
        proposed_copy = proposed_dir / safe_name
        original_copy.write_text(auth_content, encoding="utf-8")
        proposed_copy.write_text(auth_content, encoding="utf-8")

        run_id = uuid.uuid4().hex
        prof_id = f"__pkg_refine_{run_id}"
        started_ts = time.time()

        _write_refine_session_status(
            session_root,
            {
                "status": "pending",
                "run_id": run_id,
                "prod_name": body.prod_name,
                "doc_type": body.doc_type,
                "target": safe_name,
                "user_prompt": body.user_prompt,
                "started_at": started_ts,
            },
        )

        async def _run_refine_task() -> None:
            _write_refine_session_status(
                session_root,
                {
                    "status": "running",
                    "run_id": run_id,
                    "prod_name": body.prod_name,
                    "doc_type": body.doc_type,
                    "target": safe_name,
                    "user_prompt": body.user_prompt,
                    "started_at": started_ts,
                },
            )
            try:
                ep = (body.preferred_endpoint or "").strip() or None
                base_profile = get_profile_store().get("default") or AgentProfile(
                    id="default", name="小鲸"
                )
                rd_skills = _resolve_rd_skills(body.rd_skill_ids)
                refine_skills = list(rd_skills)

                final_profile = replace(
                    base_profile,
                    id=prof_id,
                    skills=refine_skills,
                    skills_mode=SkillsMode.INCLUSIVE,
                    ephemeral=True,
                    preferred_endpoint=ep,
                )
                agent = await get_or_create_with_skill_ids(
                    pool,
                    run_id,
                    final_profile,
                    refine_skills,
                )

                skill_bodies: list[str] = []
                loader = getattr(agent, "skill_loader", None)
                if loader:
                    _skill_order = list(refine_skills)
                    for sid in _skill_order:
                        skill = loader.get_skill(sid)
                        if skill and skill.body:
                            skill_path_line = f"**技能路径**: {skill.skill_dir}\n\n"
                            skill_bodies.append(
                                f"### 研发技能：{sid}\n\n{skill_path_line}{skill.body}"
                            )

                refine_system = refine_system_prompt_for_doc_type(
                    body.doc_type
                ) + format_rd_skill_guidance_section(skill_bodies)

                # refine 允许 run_shell，用于源码缓存缺失时调用 gnx-tools.js materialize 拉取
                _REFINE_TOOL_NAMES = frozenset(
                    {"read_file", "write_file", "list_directory", "run_shell"}
                )
                _orig_tools = getattr(agent, "_tools", None)
                _slim_tools = (
                    [t for t in _orig_tools if t.get("name") in _REFINE_TOOL_NAMES]
                    if _orig_tools is not None
                    else None
                )

                _code_path = (body.code_path or "").strip()
                _repo_name_hint = ""
                if _code_path:
                    _repo_name_hint = _repo_name_from_git_url(_code_path) or Path(_code_path).name
                _gnx_cache_dir = (
                    str(_gitnexus_local_data_path(_repo_name_hint)) if _repo_name_hint else ""
                )

                # 获取 arch-create 技能的脚本目录路径，供 LLM 调用 gnx-tools.js
                _gnx_tools_script = ""
                if loader:
                    _arch_skill = loader.get_skill(WHALECLOUD_BASE_SCRIPTS_SKILL_ID)
                    if _arch_skill and _arch_skill.skill_dir:
                        _gnx_tools_script = str(
                            Path(_arch_skill.skill_dir) / "scripts" / "gnx-tools.js"
                        )

                product_ctx = build_refine_product_context(
                    product_desc=body.product_desc,
                    code_path=body.code_path,
                    core_features=body.core_features,
                    prod_name=body.prod_name,
                    doc_type=body.doc_type,
                    gitnexus_url=body.gitnexus_url,
                    gnx_cache_dir=_gnx_cache_dir,
                    gnx_tools_script=_gnx_tools_script,
                )

                user_message = build_refine_user_message(
                    product_ctx=product_ctx,
                    gnx_tools_script=_gnx_tools_script,
                    gitnexus_url=body.gitnexus_url,
                    repo_name_hint=_repo_name_hint,
                    gnx_cache_dir=_gnx_cache_dir,
                    user_prompt=body.user_prompt,
                    proposed_copy=proposed_copy,
                    refine_skill_id=refine_skill_id_for_doc_type(body.doc_type),
                )

                agent.default_cwd = str(docs_root)
                if getattr(agent, "shell_tool", None):
                    agent.shell_tool.default_cwd = str(docs_root)  # type: ignore[union-attr]
                agent._current_session_id = run_id

                _orig_org_context = getattr(agent, "_org_context", None)
                _orig_system = getattr(getattr(agent, "_context", None), "system", None)
                try:
                    agent._org_context = True  # type: ignore[attr-defined]
                    if hasattr(agent, "_context") and agent._context is not None:
                        agent._context.system = refine_system
                    if _slim_tools is not None:
                        agent._tools = _slim_tools  # type: ignore[attr-defined]

                    result = await asyncio.wait_for(
                        agent.execute_task_from_message(
                            user_message,
                            usage_scene=f"knowledge_refine_task_{body.prod_name}_{body.doc_type}_{safe_name}",
                        ),
                        timeout=3600.0,
                    )
                finally:
                    agent._org_context = _orig_org_context  # type: ignore[attr-defined]
                    if (
                        hasattr(agent, "_context")
                        and agent._context is not None
                        and _orig_system is not None
                    ):
                        agent._context.system = _orig_system
                    if _orig_tools is not None:
                        agent._tools = _orig_tools  # type: ignore[attr-defined]

                if not result.success:
                    _write_refine_session_status(
                        session_root,
                        {
                            "status": "error",
                            "run_id": run_id,
                            "prod_name": body.prod_name,
                            "doc_type": body.doc_type,
                            "target": safe_name,
                            "user_prompt": body.user_prompt,
                            "started_at": started_ts,
                            "error": result.error or "文档优化失败",
                        },
                    )
                    return

                # --- 读取 proposed 产物 ---
                proposed_text = ""
                if proposed_copy.is_file():
                    try:
                        proposed_text = proposed_copy.read_text(encoding="utf-8")
                    except OSError:
                        pass

                if not proposed_text.strip():
                    output = str(result.data) if result.data else ""
                    md_match = re.search(r"```markdown\s*(.*?)\s*```", output, re.DOTALL)
                    if md_match:
                        proposed_text = md_match.group(1)
                        try:
                            proposed_copy.write_text(proposed_text, encoding="utf-8")
                        except OSError:
                            pass

                if not proposed_text.strip():
                    _write_refine_session_status(
                        session_root,
                        {
                            "status": "error",
                            "run_id": run_id,
                            "prod_name": body.prod_name,
                            "doc_type": body.doc_type,
                            "target": safe_name,
                            "user_prompt": body.user_prompt,
                            "started_at": started_ts,
                            "error": "empty_proposed",
                        },
                    )
                    return

                _write_refine_session_status(
                    session_root,
                    {
                        "status": "completed",
                        "run_id": run_id,
                        "prod_name": body.prod_name,
                        "doc_type": body.doc_type,
                        "target": safe_name,
                        "user_prompt": body.user_prompt,
                        "started_at": started_ts,
                        "original": auth_content,
                        "proposed": proposed_text,
                    },
                )

            except TimeoutError:
                _write_refine_session_status(
                    session_root,
                    {
                        "status": "error",
                        "run_id": run_id,
                        "prod_name": body.prod_name,
                        "doc_type": body.doc_type,
                        "target": safe_name,
                        "user_prompt": body.user_prompt,
                        "started_at": started_ts,
                        "error": "agent_timeout",
                    },
                )
            except Exception as e:
                logger.exception("Knowledge refine background task failed")
                _write_refine_session_status(
                    session_root,
                    {
                        "status": "error",
                        "run_id": run_id,
                        "prod_name": body.prod_name,
                        "doc_type": body.doc_type,
                        "target": safe_name,
                        "user_prompt": body.user_prompt,
                        "started_at": started_ts,
                        "error": str(e),
                    },
                )
            finally:
                try:
                    pool.invalidate_profile(prof_id)
                except Exception:
                    pass

        asyncio.create_task(_run_refine_task())

        return success_response(
            {"target": safe_name},
            "文档优化任务已提交，请按 target 轮询 session/status 获取结果",
        )

    @router.post("/api/dev/iwhalecloud/product_knowledge/refine/session/status")
    def product_knowledge_refine_session_status(body: ProductKnowledgeRefineSessionBody) -> Any:
        """
        按 prod_name + doc_type + target 读取 refine_sessions/<target>/session.status。
        返回 status: none | pending | running | completed | error | timeout。
        pending/running 超过 1 小时：清理目录并返回 timeout；error：清理目录后返回 error。
        completed 不清理，供前端展示对比直至 close。
        """
        safe = _safe_docs_file_basename(body.target.strip())
        if not safe:
            return error_response(400, "invalid_target")
        docs_root = _knowledge_docs_root(body.doc_type, body.prod_name)
        session_root = _refine_target_session_root(docs_root, safe)
        raw = _read_refine_session_status(session_root)
        if not raw:
            return success_response({"status": "none", "target": safe})

        st = str(raw.get("status", "unknown"))
        started_at = float(raw.get("started_at", 0.0))
        elapsed = time.time() - started_at
        user_prompt = str(raw.get("user_prompt", ""))

        if st in ("pending", "running"):
            if elapsed >= _REFINE_SESSION_TIMEOUT_SECS:
                _rmtree_refine_session_root(session_root)
                return success_response(
                    {
                        "status": "timeout",
                        "target": safe,
                        "user_prompt": user_prompt,
                        "elapsed_minutes": round(elapsed / 60, 1),
                    },
                )
            return success_response(
                {
                    "status": st,
                    "target": safe,
                    "targets": [safe],
                    "user_prompt": user_prompt,
                    "started_at": started_at,
                    "run_id": raw.get("run_id", ""),
                },
            )

        if st == "completed":
            return success_response(
                {
                    "status": "completed",
                    "target": safe,
                    "targets": [safe],
                    "user_prompt": user_prompt,
                    "started_at": started_at,
                    "original": raw.get("original", ""),
                    "proposed": raw.get("proposed", ""),
                },
            )

        if st == "error":
            err = str(raw.get("error", "unknown_error"))
            _rmtree_refine_session_root(session_root)
            return success_response(
                {
                    "status": "error",
                    "target": safe,
                    "user_prompt": user_prompt,
                    "error": err,
                },
            )

        return success_response({"status": "none", "target": safe})

    @router.post("/api/dev/iwhalecloud/product_knowledge/refine/session/close")
    def product_knowledge_refine_session_close(body: ProductKnowledgeRefineSessionBody) -> Any:
        """接受/拒绝后删除 refine_sessions/<target>/。"""
        safe = _safe_docs_file_basename(body.target.strip())
        if not safe:
            return error_response(400, "invalid_target")
        docs_root = _knowledge_docs_root(body.doc_type, body.prod_name)
        session_root = _refine_target_session_root(docs_root, safe)
        removed = False
        if session_root.exists():
            try:
                shutil.rmtree(session_root, ignore_errors=True)
                removed = True
            except Exception as e:
                logger.warning("refine session close failed: %s", e)
        return success_response({"removed": removed}, "会话已关闭")
