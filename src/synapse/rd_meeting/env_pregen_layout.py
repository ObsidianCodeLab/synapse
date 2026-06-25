"""环境预生成：研发文档与 dev 控熵模板落盘至沙箱工程路径。"""

from __future__ import annotations

import logging
import re
import shutil
from pathlib import Path
from typing import Any

from synapse.rd_meeting.paths import (
    archive_node_dir,
    product_doc_root,
    sandbox_code_dir,
    sandbox_engineering_dir,
)
from synapse.rd_sop.nodes import stage_id_for_node_id, stage_name_for_id

logger = logging.getLogger(__name__)

_DEV_VERSION_SUFFIX_RE = re.compile(r"_(\d{6})$")

# 工单 archive 节点产出 → synapse_archive 相对路径（仅模板清单内文档）
_ARCHIVE_ARTIFACT_LAYOUT: tuple[tuple[str, str, str], ...] = (
    ("req_clarify", "需求澄清.md", "需求分析/req_clarify/需求澄清.md"),
    ("boundary", "边界确认说明.md", "需求分析/boundary/边界确认说明.md"),
    ("module_func", "模块功能.md", "需求分析/module_func/模块功能.md"),
    ("acceptance", "验收标准.md", "需求分析/acceptance/验收标准.md"),
    ("req_risk", "需求风险评估.md", "需求分析/req_risk/需求风险评估.md"),
    ("func_assign", "功能点分派清单.md", "需求设计/func_assign/功能点分派清单.md"),
    ("history_solution", "历史方案映射.md", "需求设计/history_solution/历史方案映射.md"),
    ("module_confirm", "模块范围确认.md", "需求设计/module_confirm/模块范围确认.md"),
    ("func_solution", "函数级方案.md", "需求设计/func_solution/函数级方案.md"),
)

# 产品文档 doc_type → (源文件名, synapse_archive 相对路径)
_PRODUCT_DOC_LAYOUT: dict[str, tuple[tuple[str, str], ...]] = {
    "产品架构": (
        ("FUNCTIONAL_ARCH.md", "产品架构/FUNCTIONAL_ARCH.md"),
        ("TECH_ARCH.md", "产品架构/TECH_ARCH.md"),
    ),
    "产品手册": (
        ("产品研发手册.md", "产品手册/产品研发手册.md"),
        ("PRODUCT_DEV.md", "产品手册/产品研发手册.md"),
    ),
}

_DEV_SPEC_DEST_NAMES: frozenset[str] = frozenset(
    {
        "C++研发规范.md",
        "Go研发规范.md",
        "JAVA研发规范.md",
        "JavaScript研发规范.md",
        "MYSQL研发规范.md",
        "PG研发规范.md",
        "Python研发规范.md",
    }
)

# 与 task_exec_code_diff.should_include_commit_file 排除项对齐
_GITIGNORE_SECTION_MARKER = "# Synapse R&D local files (env pregen, do not commit)"
_GITIGNORE_RD_LOCAL_PATTERNS: tuple[str, ...] = (
    "AGENTS.md",
    "agents.md",
    "synapse_archive/",
    ".idea/",
    "__pycache__/",
)


def _pipe_name_part(value: Any) -> str:
    """``id|name`` 取右侧展示名（与 product_context / dynamic_prompt 一致）。"""
    v = str(value or "").strip()
    if not v:
        return ""
    if "|" in v:
        tail = v.split("|", 1)[-1].strip()
        return tail or v
    return v


def resolve_dev_dir() -> Path | None:
    """解析仓库 ``dev/`` 目录（系统控熵模板与规范源）。"""
    try:
        from synapse.api.routes.workspaces import _find_repo_root

        root = _find_repo_root()
        if root is not None:
            dev = root / "dev"
            if dev.is_dir():
                return dev
    except Exception:
        pass
    pkg_guess = Path(__file__).resolve().parents[3]
    dev = pkg_guess / "dev"
    return dev if dev.is_dir() else None


def strip_dev_version_suffix(filename: str) -> str | None:
    """去掉 dev 文件名中的 ``_YYYYMM`` 版本标识；``agents.md.template*`` 映射为 ``AGENTS.md``。"""
    name = (filename or "").strip()
    if not name:
        return None
    if name.startswith("agents.md.template"):
        return "AGENTS.md"
    path = Path(name)
    if path.suffix.lower() != ".md":
        return None
    base_stem = _DEV_VERSION_SUFFIX_RE.sub("", path.stem)
    dest = f"{base_stem}{path.suffix}"
    if dest in _DEV_SPEC_DEST_NAMES:
        return dest
    return None


def resolve_engineering_targets(scope_id: str, wire_row: dict[str, Any]) -> list[dict[str, str]]:
    """由 catalog 仓库行解析工程路径：``sandbox/<应用模块>/<code_path>``。"""
    from synapse.rd_meeting.product_context import _normalize_product_wire

    sid = (scope_id or "").strip()
    if not sid:
        return []
    normalized = _normalize_product_wire(wire_row)
    targets: list[dict[str, str]] = []
    seen: set[str] = set()
    for repo in normalized.get("repos") or []:
        if not isinstance(repo, dict):
            continue
        module = _pipe_name_part(repo.get("repo_module")) or str(repo.get("repo_name") or "").strip()
        if not module:
            continue
        code_path = str(repo.get("code_path") or "").strip()
        key = f"{module}\0{code_path}"
        if key in seen:
            continue
        seen.add(key)
        eng = sandbox_engineering_dir(sid, module, code_path)
        repo_name = str(repo.get("repo_name") or "").strip()
        targets.append(
            {
                "module": module,
                "repo_name": repo_name,
                "code_path": code_path,
                "engineering_root": str(eng),
            }
        )
    return targets


def _resolve_git_repo_root(*paths: Path) -> Path | None:
    """从候选路径向上解析 git 仓库根（``rev-parse --show-toplevel``）。"""
    from synapse.rd_meeting.product_assets import _run_git

    for path in paths:
        if not path or not str(path).strip():
            continue
        candidate = Path(path)
        if not candidate.exists():
            continue
        ok, detail = _run_git(
            ["git", "-C", str(candidate), "rev-parse", "--show-toplevel"],
            timeout=30.0,
        )
        if ok and detail.strip():
            return Path(detail.strip())
    return None


def _gitignore_contains_pattern(lines: list[str], pattern: str) -> bool:
    target = pattern.strip().lower()
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower() == target:
            return True
    return False


def ensure_rd_local_gitignore(repo_root: Path) -> dict[str, Any]:
    """确保仓库 ``.gitignore`` 忽略研发本地文件（先检测已有规则，仅追加缺失项）。"""
    entry: dict[str, Any] = {
        "repo_root": str(repo_root),
        "path": "",
        "added": [],
        "modified": False,
        "status": "skipped",
        "error": "",
    }
    if not repo_root.is_dir():
        entry["error"] = "git 仓库根目录不存在"
        return entry

    git_dir = repo_root / ".git"
    if not git_dir.exists():
        entry["error"] = "非 git 仓库"
        return entry

    ignore_path = repo_root / ".gitignore"
    entry["path"] = str(ignore_path)
    existing = ""
    if ignore_path.is_file():
        try:
            existing = ignore_path.read_text(encoding="utf-8")
        except OSError as exc:
            entry["status"] = "failed"
            entry["error"] = str(exc)
            return entry

    lines = existing.splitlines()
    missing = [p for p in _GITIGNORE_RD_LOCAL_PATTERNS if not _gitignore_contains_pattern(lines, p)]
    if not missing:
        entry["status"] = "ok"
        return entry

    block_lines = ["", _GITIGNORE_SECTION_MARKER, *missing]
    new_content = existing
    if new_content and not new_content.endswith("\n"):
        new_content += "\n"
    new_content += "\n".join(block_lines)
    if not new_content.endswith("\n"):
        new_content += "\n"

    try:
        ignore_path.write_text(new_content, encoding="utf-8")
    except OSError as exc:
        entry["status"] = "failed"
        entry["error"] = str(exc)
        return entry

    entry["added"] = missing
    entry["modified"] = True
    entry["status"] = "ok"
    return entry


def _copy_file_to_dest(src: Path, dest: Path) -> bool:
    if not src.is_file():
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copy2(src, dest)
        return True
    except OSError as exc:
        logger.warning("env_pregen copy failed %s -> %s: %s", src, dest, exc)
        return False


def _archive_artifact_path(scope_id: str, node_id: str, filename: str) -> Path | None:
    stage_name = stage_name_for_id(stage_id_for_node_id(node_id))
    path = archive_node_dir(scope_id, stage_name, node_id) / filename
    return path if path.is_file() else None


def _product_doc_source(scope_id: str, doc_type: str, filename: str) -> Path | None:
    candidate = product_doc_root(scope_id) / doc_type / filename
    return candidate if candidate.is_file() else None


def copy_dev_templates_to_engineering(engineering_root: Path, *, dev_dir: Path | None = None) -> dict[str, Any]:
    """从系统 ``dev/`` 拷贝 AGENTS.md 模板与研发规范至工程目录。"""
    src_root = dev_dir or resolve_dev_dir()
    entry: dict[str, Any] = {
        "source_dir": str(src_root) if src_root else "",
        "files": [],
        "status": "skipped",
        "error": "",
    }
    if src_root is None or not src_root.is_dir():
        entry["error"] = "系统 dev 目录不存在"
        return entry

    archive_root = engineering_root / "synapse_archive"
    copied: list[str] = []
    for path in sorted(src_root.iterdir()):
        if not path.is_file():
            continue
        dest_name = strip_dev_version_suffix(path.name)
        if not dest_name:
            continue
        if dest_name == "AGENTS.md":
            dest = engineering_root / dest_name
        else:
            dest = archive_root / "产品规范" / dest_name
        if _copy_file_to_dest(path, dest):
            copied.append(dest_name)

    if not copied:
        entry["error"] = "dev 目录无可用模板或规范文件"
        return entry
    entry["files"] = copied
    entry["status"] = "ok"
    return entry


def copy_work_order_docs_to_engineering(scope_id: str, engineering_root: Path) -> dict[str, Any]:
    """从工单 archive / doc 拷贝模板清单内上游产出至 ``synapse_archive/``。"""
    sid = (scope_id or "").strip()
    archive_root = engineering_root / "synapse_archive"
    copied: list[str] = []
    missing: list[str] = []

    for node_id, filename, rel in _ARCHIVE_ARTIFACT_LAYOUT:
        src = _archive_artifact_path(sid, node_id, filename)
        if src is None:
            missing.append(rel)
            continue
        dest = archive_root / rel
        if _copy_file_to_dest(src, dest):
            copied.append(rel)

    for doc_type, mappings in _PRODUCT_DOC_LAYOUT.items():
        by_dest: dict[str, list[str]] = {}
        for src_name, rel in mappings:
            by_dest.setdefault(rel, []).append(src_name)
        for rel, src_names in by_dest.items():
            if (archive_root / rel).is_file():
                continue
            for src_name in src_names:
                src = _product_doc_source(sid, doc_type, src_name)
                if src is None:
                    continue
                dest = archive_root / rel
                if _copy_file_to_dest(src, dest):
                    copied.append(rel)
                    break

    status = "ok" if copied else "skipped"
    if copied and missing:
        status = "partial"
    if not copied:
        status = "failed" if missing else "skipped"

    return {
        "files": copied,
        "missing": missing,
        "status": status,
        "error": "" if copied else "未找到可拷贝的工单归档文档",
    }


def bootstrap_engineering_layout(
    scope_id: str,
    wire_row: dict[str, Any],
    *,
    dev_dir: Path | None = None,
) -> dict[str, Any]:
    """将 dev 模板与工单归档文档落盘至各仓库工程路径。"""
    sid = (scope_id or "").strip()
    targets = resolve_engineering_targets(sid, wire_row)
    result: dict[str, Any] = {
        "targets": targets,
        "layouts": [],
        "status": "skipped",
        "errors": [],
    }
    if not targets:
        result["errors"].append("catalog 无关联仓库，无法解析工程路径")
        result["status"] = "failed"
        return result

    dev_src = dev_dir or resolve_dev_dir()
    any_ok = False
    seen_git_roots: set[str] = set()
    for target in targets:
        eng = Path(str(target.get("engineering_root") or ""))
        if not str(eng):
            continue
        eng.mkdir(parents=True, exist_ok=True)
        dev_row = copy_dev_templates_to_engineering(eng, dev_dir=dev_src)
        archive_row = copy_work_order_docs_to_engineering(sid, eng)
        gitignore_row: dict[str, Any] = {
            "status": "skipped",
            "error": "未找到 git 仓库",
            "path": "",
            "added": [],
            "modified": False,
        }
        repo_name = str(target.get("repo_name") or "").strip()
        git_candidates: list[Path] = [eng]
        if repo_name:
            git_candidates.append(sandbox_code_dir(sid, repo_name))
        git_root = _resolve_git_repo_root(*git_candidates)
        if git_root is not None:
            git_key = str(git_root.resolve())
            if git_key in seen_git_roots:
                gitignore_row = {
                    "status": "ok",
                    "error": "",
                    "path": str(git_root / ".gitignore"),
                    "added": [],
                    "modified": False,
                    "repo_root": git_key,
                    "deduped": True,
                }
            else:
                seen_git_roots.add(git_key)
                gitignore_row = ensure_rd_local_gitignore(git_root)
        row_status = "failed"
        if dev_row.get("status") == "ok" or archive_row.get("status") in ("ok", "partial"):
            row_status = "ok" if dev_row.get("status") == "ok" and archive_row.get("status") == "ok" else "partial"
            any_ok = True
        elif dev_row.get("status") == "skipped" and archive_row.get("status") == "skipped":
            row_status = "skipped"
        if gitignore_row.get("status") == "failed":
            result["errors"].append(
                f"{target.get('module')}: .gitignore — {gitignore_row.get('error')}"
            )
            if row_status == "ok":
                row_status = "partial"
        result["layouts"].append(
            {
                "module": target.get("module"),
                "code_path": target.get("code_path"),
                "engineering_root": str(eng),
                "dev_templates": dev_row,
                "work_order_docs": archive_row,
                "gitignore": gitignore_row,
                "status": row_status,
            }
        )
        if dev_row.get("status") == "failed":
            result["errors"].append(f"{target.get('module')}: dev 模板 — {dev_row.get('error')}")
        if archive_row.get("status") == "failed":
            result["errors"].append(f"{target.get('module')}: 工单文档 — {archive_row.get('error')}")

    if any_ok:
        result["status"] = "partial" if result["errors"] else "ok"
    else:
        result["status"] = "failed"
    return result
