"""沙箱构建：git 落盘至 ``work/<scope>/sandbox/``（不做 UTF-8 转换，与开门 ``code/`` 分离）。"""

from __future__ import annotations

import logging
import os
import shutil
import stat
import time
from pathlib import Path
from typing import Any

from synapse.rd_meeting.paths import sandbox_code_dir, sandbox_root, scope_dir
from synapse.rd_meeting.product_assets import (
    _branch_from_wire,
    _git_remote_url,
    _now_iso,
    _run_git,
)
from synapse.rd_meeting.product_context import (
    _normalize_product_wire,
    match_prod_row_by_prod,
)

logger = logging.getLogger(__name__)

_FORCE_REMOVE_RETRIES = 3


def _chmod_writable(path: Path) -> None:
    try:
        os.chmod(path, stat.S_IWRITE | stat.S_IREAD | stat.S_IEXEC)
    except OSError:
        pass


def _force_remove_path(path: Path) -> bool:
    """尽量删干净（含 Windows 只读文件、残留 ``.git`` 空目录）。"""
    if not path.exists():
        return True
    last_exc: OSError | None = None

    def _onerror(func, p, _exc_info):
        _chmod_writable(Path(p))
        try:
            func(p)
        except OSError as exc:
            nonlocal last_exc
            last_exc = exc

    for attempt in range(_FORCE_REMOVE_RETRIES):
        last_exc = None
        try:
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path, onerror=_onerror)
            else:
                _chmod_writable(path)
                path.unlink(missing_ok=True)
        except OSError as exc:
            last_exc = exc
        if not path.exists():
            return True
        if attempt + 1 < _FORCE_REMOVE_RETRIES:
            time.sleep(0.2 * (attempt + 1))
    if last_exc is not None:
        logger.warning("sandbox: failed to remove %s: %s", path, last_exc)
    return not path.exists()


def _is_git_work_tree(path: Path) -> bool:
    git_dir = path / ".git"
    if not git_dir.exists():
        return False
    ok, _ = _run_git(["git", "-C", str(path), "rev-parse", "--git-dir"], timeout=30.0)
    return ok


def _prepare_sandbox_repo_dest(dest: Path) -> None:
    """沙箱单仓落盘前：删掉残留目录（含半成品 ``.git``），保证后续走全新 clone。"""
    if not dest.exists():
        return
    if _is_git_work_tree(dest):
        _force_remove_path(dest)
        return
    _force_remove_path(dest)


def clear_sandbox_workspace(scope_id: str) -> bool:
    """删除 ``work/<scope>/sandbox/``（沙箱构建重跑前清空旧 clone / 工程落盘）。"""
    sid = (scope_id or "").strip()
    if not sid:
        return False
    root = sandbox_root(sid)
    if not root.exists():
        return True
    ok = _force_remove_path(root)
    if ok:
        logger.info("sandbox: removed workspace %s", root)
    return ok


def _checkout_feature_branch(dest: Path, feature_branch: str) -> tuple[bool, str]:
    """在已落盘的基础分支上 fetch 并 checkout 特性分支。

    ``--depth 1 origin <branch>`` 仅更新 ``FETCH_HEAD``，不会创建 ``origin/<branch>`` 或本地分支；
    须用 ``origin <branch>:<branch>`` 拉取到本地 ref，或回退 ``checkout -B <branch> FETCH_HEAD``。
    """
    branch = (feature_branch or "").strip()
    if not branch:
        return True, ""
    ok, detail = _run_git(
        ["git", "-C", str(dest), "fetch", "--depth", "1", "origin", f"{branch}:{branch}"],
        timeout=300.0,
    )
    if not ok:
        ok, detail = _run_git(
            ["git", "-C", str(dest), "fetch", "--depth", "1", "origin", branch],
            timeout=300.0,
        )
        if not ok:
            return False, detail
        ok, detail = _run_git(
            ["git", "-C", str(dest), "checkout", "-B", branch, "FETCH_HEAD"],
            timeout=120.0,
        )
        return ok, detail
    return _run_git(["git", "-C", str(dest), "checkout", branch], timeout=120.0)


def _repo_feature_branch_map(
    scope_id: str,
    wire_row: dict[str, Any] | None,
) -> dict[str, str]:
    """按应用模块将 auto_split 子单的 feature_id 映射到 catalog 仓库名。"""
    from synapse.rd_meeting.product_context import _normalize_product_wire, _repo_name_from_url
    from synapse.rd_meeting.system_node_display import (
        _auto_split_context_for_bindings,
        _modules_match,
        collect_task_rows,
    )

    task_rows = collect_task_rows(_auto_split_context_for_bindings(scope_id))
    catalog_repos: list[dict[str, Any]] = []
    if wire_row:
        normalized = _normalize_product_wire(wire_row)
        catalog_repos = [r for r in (normalized.get("repos") or []) if isinstance(r, dict)]

    mapping: dict[str, str] = {}
    for task in task_rows:
        if str(task.get("create_status") or "") != "ok":
            continue
        feature_id = str(task.get("feature_id") or "").strip()
        if not feature_id:
            continue
        mod = str(task.get("product_module_name") or "")
        for repo in catalog_repos:
            repo_module = str(repo.get("repo_module") or "")
            if mod and not _modules_match(mod, repo_module):
                continue
            repo_name = str(repo.get("repo_name") or "").strip()
            if not repo_name:
                repo_name = _repo_name_from_url(str(repo.get("repo_url") or ""))
            if repo_name:
                mapping[repo_name] = feature_id
    return mapping


def materialize_repo_to_sandbox(
    scope_id: str,
    repo: dict[str, Any],
    *,
    feature_branch: str = "",
) -> dict[str, Any]:
    """Clone / pull 至 ``work/<scope>/sandbox/<repo_name>/``，不调用 UTF-8 转换。"""
    repo_name = str(repo.get("repo_name") or "").strip()
    remote = _git_remote_url(str(repo.get("repo_url") or ""))
    branch = _branch_from_wire(str(repo.get("repo_branch") or ""))
    dest = sandbox_code_dir(scope_id, repo_name)
    entry: dict[str, Any] = {
        "repo_name": repo_name,
        "repo_url": str(repo.get("repo_url") or ""),
        "repo_branch": str(repo.get("repo_branch") or ""),
        "feature_branch": (feature_branch or "").strip(),
        "local_path": str(dest),
        "status": "skipped",
        "error": "",
    }
    if not repo_name:
        entry["status"] = "failed"
        entry["error"] = "缺少 repo_name / repo_url"
        return entry
    if not remote:
        entry["status"] = "failed"
        entry["error"] = "无法解析 git 远程地址"
        return entry

    _prepare_sandbox_repo_dest(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        entry["status"] = "failed"
        entry["error"] = f"无法清空沙箱仓库目录: {dest}"
        return entry

    cmd = ["git", "clone", "--depth", "1"]
    if branch:
        cmd.extend(["-b", branch])
    cmd.extend([remote, str(dest)])
    ok, detail = _run_git(cmd, timeout=600.0)
    if ok and feature_branch:
        ok, detail = _checkout_feature_branch(dest, feature_branch)
    entry["status"] = "ok" if ok else "failed"
    entry["error"] = "" if ok else detail
    return entry


def bootstrap_sandbox_assets(
    scope_id: str,
    prod: str,
    *,
    wire_row: dict[str, Any] | None = None,
    catalog_rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """拉取产品关联仓库至沙箱目录，返回摘要。"""
    sid = (scope_id or "").strip()
    prod_key = (prod or "").strip()
    clear_sandbox_workspace(sid)
    scope_dir(sid).mkdir(parents=True, exist_ok=True)
    root = sandbox_root(sid)
    root.mkdir(parents=True, exist_ok=True)

    result: dict[str, Any] = {
        "prod": prod_key,
        "sandbox_root": str(root),
        "repos": [],
        "status": "ok",
        "errors": [],
        "materialized_at": _now_iso(),
    }

    if not sid or not prod_key:
        result["status"] = "failed"
        result["errors"].append("scope_id 或 prod 为空")
        return result

    hit = wire_row
    if hit is None and catalog_rows:
        hit = match_prod_row_by_prod(catalog_rows, prod_key)
    if hit is None:
        result["status"] = "failed"
        result["errors"].append(f"产品「{prod_key}」不在 catalog 中，无法拉取沙箱代码")
        return result

    normalized = _normalize_product_wire(hit)
    repo_entries = [r for r in (normalized.get("repos") or []) if isinstance(r, dict)]
    feature_by_repo = _repo_feature_branch_map(sid, hit)

    for repo in repo_entries:
        repo_name = str(repo.get("repo_name") or "").strip()
        row = materialize_repo_to_sandbox(
            sid,
            repo,
            feature_branch=feature_by_repo.get(repo_name, ""),
        )
        result["repos"].append(row)
        if row.get("status") == "failed":
            result["errors"].append(f"沙箱代码 {row.get('repo_name')}: {row.get('error')}")

    if result["errors"]:
        has_ok = any(r.get("status") == "ok" for r in result["repos"])
        result["status"] = "partial" if has_ok else "failed"
    return result


def format_sandbox_build_report(assets: dict[str, Any], *, node_name: str) -> str:
    """生成 ``沙箱构建说明.md`` 正文（满足归档校验）。"""
    lines = [
        f"# {node_name} — 沙箱代码落盘",
        "",
        "本节点由系统脚本执行（git clone / pull），未调用大模型与人工确认。",
        "",
        f"- **沙箱根目录**：`{assets.get('sandbox_root') or ''}`",
        f"- **产品**：{assets.get('prod') or '—'}",
        f"- **落盘时间**：{assets.get('materialized_at') or '—'}",
        f"- **总体状态**：{assets.get('status') or '—'}",
        "",
        "## 仓库清单",
        "",
    ]
    repos = assets.get("repos") if isinstance(assets.get("repos"), list) else []
    if not repos:
        lines.append("（无关联仓库）")
    else:
        for row in repos:
            if not isinstance(row, dict):
                continue
            lines.append(
                f"- **{row.get('repo_name') or '—'}**：`{row.get('local_path') or '—'}` "
                f"— {row.get('status') or '—'}"
                + (
                    f" 特性分支={row.get('feature_branch')}"
                    if row.get("feature_branch")
                    else ""
                )
                + (f"（{row.get('error')}）" if row.get("error") else "")
            )
    lines.extend(
        [
            "",
            "## 结论",
            "",
            "沙箱构建已完成：代码已落盘至工单沙箱目录，可进入下一 SOP 节点。",
            "",
        ]
    )
    return "\n".join(lines)
