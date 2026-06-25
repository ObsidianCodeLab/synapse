"""任务执行评审：基于 git diff 采集沙箱未提交变更（过滤测试/归档/AGENTS.md）。"""

from __future__ import annotations

import base64
import difflib
import logging
import re
import subprocess
from pathlib import Path, PurePosixPath
from typing import Any

from synapse.rd_meeting.product_assets import _run_git
from synapse.rd_meeting.task_exec import load_task_exec_payload

logger = logging.getLogger(__name__)

MAX_DIFF_FILE_BYTES = 512_000
_SKIP_BASENAMES = frozenset({"agents.md"})
_TEST_DIR_NAMES = frozenset({"test", "tests", "__tests__", "spec", "testing", "e2e", "fixtures"})
_TEST_FILE_RE = re.compile(
    r"("
    r"^test_.+\.py$|"
    r"^.+_test\.(py|go|java|js|ts|tsx|jsx)$|"
    r"^.+\.(test|spec)\.(ts|tsx|js|jsx|py)$|"
    r"^.+Test\.java$"
    r")",
    re.IGNORECASE,
)


_GIT_OCTAL_ESCAPE_RE = re.compile(r"\\([0-7]{3})")


def _unescape_git_quoted_body(body: str) -> str:
    """解码 git status/diff 引号路径中的 C 风格转义（含 \\ddd 八进制 UTF-8 字节）。"""
    raw = str(body or "")
    if not raw:
        return ""
    out = bytearray()
    i = 0
    while i < len(raw):
        ch = raw[i]
        if ch != "\\" or i + 1 >= len(raw):
            out.extend(ch.encode("utf-8"))
            i += 1
            continue
        nxt = raw[i + 1]
        if nxt in "01234567" and i + 3 < len(raw) and raw[i + 2] in "01234567" and raw[i + 3] in "01234567":
            out.append(int(raw[i + 1 : i + 4], 8))
            i += 4
            continue
        escape_map = {"n": ord("\n"), "t": ord("\t"), "b": ord("\b"), "r": ord("\r"), "\\": ord("\\"), '"': ord('"')}
        if nxt in escape_map:
            out.append(escape_map[nxt])
            i += 2
            continue
        out.extend(ch.encode("utf-8"))
        i += 1
    try:
        return out.decode("utf-8")
    except UnicodeDecodeError:
        return raw


def decode_git_quoted_path(path: str) -> str:
    """解析 git porcelain 中带引号或八进制转义的路径（须在替换反斜杠之前调用）。"""
    raw = str(path or "").strip()
    if not raw:
        return ""
    if raw.startswith('"') and raw.endswith('"') and len(raw) >= 2:
        return _unescape_git_quoted_body(raw[1:-1])
    if "\\" in raw and _GIT_OCTAL_ESCAPE_RE.search(raw):
        return _unescape_git_quoted_body(raw)
    return raw


def normalize_repo_rel_path(path: str) -> str:
    decoded = decode_git_quoted_path(path)
    norm = PurePosixPath(decoded.replace("\\", "/")).as_posix()
    while norm.startswith("./"):
        norm = norm[2:]
    return norm


def is_test_file(rel_path: str) -> bool:
    norm = normalize_repo_rel_path(rel_path)
    if not norm:
        return False
    parts = [p.lower() for p in norm.split("/")]
    if any(p in _TEST_DIR_NAMES for p in parts):
        return True
    name = parts[-1]
    return bool(_TEST_FILE_RE.match(name))


def is_synapse_archive_or_agents_md(rel_path: str) -> bool:
    norm = normalize_repo_rel_path(rel_path)
    if not norm:
        return False
    parts = [p.lower() for p in norm.split("/")]
    if "synapse_archive" in parts:
        return True
    return parts[-1].lower() in _SKIP_BASENAMES


def should_include_commit_file(rel_path: str) -> bool:
    """代码提交环节：排除 synapse_archive 与 AGENTS.md。"""
    norm = normalize_repo_rel_path(rel_path)
    if not norm:
        return False
    return not is_synapse_archive_or_agents_md(norm)


def should_include_diff_file(rel_path: str) -> bool:
    norm = normalize_repo_rel_path(rel_path)
    if not norm:
        return False
    if is_synapse_archive_or_agents_md(norm):
        return False
    if is_test_file(norm):
        return False
    return True


def _parse_status_paths(status_out: str) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for raw in status_out.splitlines():
        line = raw.rstrip("\r")
        if not line:
            continue
        if len(line) >= 3 and line[2] == " ":
            code = line[:2]
            path = line[3:].strip()
        elif len(line) >= 2 and line[1] == " ":
            code = f"{line[0]} "
            path = line[2:].strip()
        else:
            continue
        if " -> " in path:
            path = path.split(" -> ", 1)[1].strip()
        norm = normalize_repo_rel_path(path)
        if not norm:
            continue
        if code.strip() == "??" or code == "??":
            rows.append(("added", norm))
        elif "D" in code:
            rows.append(("deleted", norm))
        else:
            rows.append(("modified", norm))
    return rows


def _count_line_changes(original_bytes: bytes, modified_bytes: bytes) -> tuple[int, int]:
    """按行 diff 统计增删行数（未跟踪/新增文件 numstat 常为 0）。"""
    orig_lines = decode_text_bytes(original_bytes).splitlines()
    mod_lines = decode_text_bytes(modified_bytes).splitlines()
    if not orig_lines and mod_lines:
        return len(mod_lines), 0
    if orig_lines and not mod_lines:
        return 0, len(orig_lines)
    if orig_lines == mod_lines:
        return 0, 0

    additions = deletions = 0
    matcher = difflib.SequenceMatcher(None, orig_lines, mod_lines)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "insert":
            additions += j2 - j1
        elif tag == "delete":
            deletions += i2 - i1
        elif tag == "replace":
            deletions += i2 - i1
            additions += j2 - j1
    return additions, deletions


def _resolve_file_line_stats(
    *,
    status: str,
    rel_path: str,
    original_bytes: bytes,
    modified_bytes: bytes,
    numstat: dict[str, dict[str, int]],
) -> tuple[int, int]:
    if status == "added":
        return _count_line_changes(b"", modified_bytes)
    if status == "deleted":
        return _count_line_changes(original_bytes, b"")

    stat = numstat.get(rel_path)
    if stat:
        add_n = int(stat.get("additions") or 0)
        del_n = int(stat.get("deletions") or 0)
        if add_n or del_n:
            return add_n, del_n
    return _count_line_changes(original_bytes, modified_bytes)


def _parse_numstat(numstat_out: str) -> dict[str, dict[str, int]]:
    stats: dict[str, dict[str, int]] = {}
    for line in numstat_out.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        rel = normalize_repo_rel_path(parts[2])
        if not rel:
            continue
        add_raw, del_raw = parts[0], parts[1]
        stats[rel] = {
            "additions": int(add_raw) if add_raw.isdigit() else 0,
            "deletions": int(del_raw) if del_raw.isdigit() else 0,
        }
    return stats


def decode_text_bytes(data: bytes, *, encoding: str = "utf-8") -> str:
    """按指定编码解码文本（默认 UTF-8，供 API 兼容字段）。"""
    if not data:
        return ""
    try:
        return data.decode(encoding)
    except (UnicodeDecodeError, LookupError):
        return data.decode("utf-8", errors="replace")


def _bytes_to_b64(data: bytes) -> str:
    if not data:
        return ""
    return base64.b64encode(data).decode("ascii")


def _repo_file_path(repo_root: Path, rel_path: str) -> Path:
    norm = normalize_repo_rel_path(rel_path)
    if not norm:
        return repo_root
    return repo_root.joinpath(*norm.split("/"))


def _resolve_git_repo_root(repo_path: Path) -> Path | None:
    """sandbox_path 可能是仓库内子目录（如 .../Zmdb），统一解析到 git 根目录。"""
    if not repo_path.is_dir():
        return None
    ok, top = _run_git(["git", "-C", str(repo_path), "rev-parse", "--show-toplevel"], timeout=30.0)
    if not ok or not top.strip():
        return None
    resolved = Path(top.strip())
    return resolved if resolved.is_dir() else None


_GIT_BASE_REF_CANDIDATES = ("origin/master", "origin/main", "master", "main")


def _resolve_git_base_ref(repo_root: Path) -> str | None:
    """解析可用于 diff / rev-list 的基线分支 ref。"""
    for ref in _GIT_BASE_REF_CANDIDATES:
        ok, _ = _run_git(["git", "-C", str(repo_root), "rev-parse", "--verify", ref], timeout=15.0)
        if ok:
            return ref
    return None


def _aggregate_filtered_numstat(numstat: dict[str, dict[str, int]]) -> tuple[int, int]:
    """汇总 numstat 增删行数（排除 synapse_archive / AGENTS.md）。"""
    added = 0
    deleted = 0
    for rel_path, stat in numstat.items():
        if not should_include_commit_file(rel_path):
            continue
        added += int(stat.get("additions") or 0)
        deleted += int(stat.get("deletions") or 0)
    return added, deleted


def collect_repo_branch_stats(
    repo_path: str,
    *,
    feature_branch: str = "",
    base_ref: str = "",
) -> dict[str, int | None]:
    """统计仓库相对基线分支的新增/删除行数与 commit 数（归档 rd_view 用）。

    优先 ``merge-base(base_ref, HEAD)..HEAD``；无基线分支时回退未提交 diff（相对 HEAD）。
    """
    declared = Path(str(repo_path or "").strip())
    if not declared.is_dir():
        return {"lines_added": None, "lines_deleted": None, "commit_count": None}

    repo_root = _resolve_git_repo_root(declared) or declared
    ok, _ = _run_git(["git", "-C", str(repo_root), "rev-parse", "--is-inside-work-tree"], timeout=30.0)
    if not ok:
        return {"lines_added": None, "lines_deleted": None, "commit_count": None}

    tip_ref = "HEAD"
    branch = (feature_branch or "").strip()
    if branch:
        ok_branch, _ = _run_git(
            ["git", "-C", str(repo_root), "rev-parse", "--verify", branch],
            timeout=15.0,
        )
        if ok_branch:
            tip_ref = branch

    base = (base_ref or "").strip() or _resolve_git_base_ref(repo_root) or ""
    commit_count: int | None = None
    if base:
        ok_mb, merge_base = _run_git(
            ["git", "-C", str(repo_root), "merge-base", tip_ref, base],
            timeout=30.0,
        )
        if ok_mb and merge_base.strip():
            mb = merge_base.strip()
            ok_count, count_out = _run_git(
                ["git", "-C", str(repo_root), "rev-list", "--count", f"{mb}..{tip_ref}"],
                timeout=60.0,
            )
            commit_count = int(count_out.strip()) if ok_count and count_out.strip().isdigit() else None

            ok_ns, numstat_out = _run_git(
                ["git", "-C", str(repo_root), "diff", f"{mb}..{tip_ref}", "--numstat"],
                timeout=120.0,
            )
            if ok_ns:
                added, deleted = _aggregate_filtered_numstat(_parse_numstat(numstat_out))
                return {
                    "lines_added": added,
                    "lines_deleted": deleted,
                    "commit_count": commit_count,
                }

    # 无基线分支：回退未提交变更统计
    files = collect_repo_code_diff_files(str(declared))
    if not files:
        return {"lines_added": 0, "lines_deleted": 0, "commit_count": commit_count if base else 0}

    added = sum(int(f.get("additions") or 0) for f in files)
    deleted = sum(int(f.get("deletions") or 0) for f in files)
    return {
        "lines_added": added,
        "lines_deleted": deleted,
        "commit_count": 1 if (added or deleted) else 0,
    }


def _read_git_object_bytes(repo_root: Path, spec: str) -> bytes:
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_root), "show", spec],
            capture_output=True,
            timeout=60.0,
        )
    except subprocess.TimeoutExpired:
        return b""
    except (FileNotFoundError, OSError) as exc:
        logger.debug("git show failed %s: %s", spec, exc)
        return b""
    if proc.returncode != 0:
        return b""
    data = proc.stdout
    if len(data) > MAX_DIFF_FILE_BYTES:
        return b""
    if b"\x00" in data[:4096]:
        return b""
    return data


def _read_git_head_bytes(repo_root: Path, rel_path: str) -> bytes:
    norm = normalize_repo_rel_path(rel_path)
    if not norm:
        return b""
    return _read_git_object_bytes(repo_root, f"HEAD:{norm}")


def _read_git_index_bytes(repo_root: Path, rel_path: str) -> bytes:
    norm = normalize_repo_rel_path(rel_path)
    if not norm:
        return b""
    return _read_git_object_bytes(repo_root, f":{norm}")


def _resolve_worktree_path(repo_root: Path, rel_path: str) -> Path | None:
    path = _repo_file_path(repo_root, rel_path)
    if path.is_file():
        return path
    ok, listed = _run_git(["git", "-C", str(repo_root), "ls-files", "--", rel_path], timeout=30.0)
    if ok and listed.strip():
        for line in listed.splitlines():
            candidate = normalize_repo_rel_path(line.strip())
            if not candidate:
                continue
            resolved = _repo_file_path(repo_root, candidate)
            if resolved.is_file():
                return resolved
    return None


def _read_worktree_bytes(repo_root: Path, rel_path: str) -> bytes:
    path = _resolve_worktree_path(repo_root, rel_path)
    if path is None:
        return b""
    try:
        data = path.read_bytes()
    except OSError as exc:
        logger.debug("read worktree file failed %s: %s", path, exc)
        return b""
    if len(data) > MAX_DIFF_FILE_BYTES:
        return b""
    if b"\x00" in data[:4096]:
        return b""
    return data


def _read_modified_bytes(repo_root: Path, rel_path: str, status: str) -> bytes:
    """变更后：工作区未提交内容，必要时回退暂存区。"""
    if status == "deleted":
        return b""
    worktree = _read_worktree_bytes(repo_root, rel_path)
    index = _read_git_index_bytes(repo_root, rel_path)
    head = _read_git_head_bytes(repo_root, rel_path)
    if worktree and worktree != head:
        return worktree
    if index and index != head:
        return index
    if worktree:
        return worktree
    return index


def _collect_uncommitted_path_statuses(repo_root: Path) -> list[tuple[str, str]]:
    """未提交变更：git diff HEAD + status + 未跟踪文件。"""
    merged: dict[str, str] = {}
    root = str(repo_root)

    ok, diff_names = _run_git(["git", "-C", root, "diff", "HEAD", "--name-only"], timeout=60.0)
    if ok:
        for line in diff_names.splitlines():
            rel = normalize_repo_rel_path(line.strip())
            if rel and should_include_diff_file(rel):
                merged.setdefault(rel, "modified")

    ok, status_out = _run_git(["git", "-C", root, "status", "--porcelain"], timeout=60.0)
    if ok:
        for status, rel in _parse_status_paths(status_out):
            if should_include_diff_file(rel):
                merged[rel] = status

    ok, untracked = _run_git(
        ["git", "-C", root, "ls-files", "--others", "--exclude-standard"],
        timeout=60.0,
    )
    if ok:
        for line in untracked.splitlines():
            rel = normalize_repo_rel_path(line.strip())
            if rel and should_include_diff_file(rel):
                merged[rel] = "added"

    return sorted(merged.items(), key=lambda item: item[0])


def collect_repo_code_diff_files(repo_path: str) -> list[dict[str, Any]]:
    """单仓库未提交 diff（相对 HEAD），返回 Monaco 可用的 original/modified。"""
    declared = Path(str(repo_path or "").strip())
    if not declared.is_dir():
        return []

    root = _resolve_git_repo_root(declared) or declared

    ok, _ = _run_git(["git", "-C", str(root), "rev-parse", "--is-inside-work-tree"], timeout=30.0)
    if not ok:
        return []

    ok, numstat_out = _run_git(["git", "-C", str(root), "diff", "HEAD", "--numstat"], timeout=60.0)
    numstat = _parse_numstat(numstat_out if ok else "")

    rows: list[dict[str, Any]] = []
    for rel_path, status in _collect_uncommitted_path_statuses(root):
        original_bytes = _read_git_head_bytes(root, rel_path)
        modified_bytes = _read_modified_bytes(root, rel_path, status)
        if status != "deleted" and not modified_bytes and not original_bytes:
            continue
        if status == "added" and not modified_bytes:
            continue
        if status != "added" and status != "deleted" and original_bytes == modified_bytes:
            continue

        additions, deletions = _resolve_file_line_stats(
            status=status,
            rel_path=rel_path,
            original_bytes=original_bytes,
            modified_bytes=modified_bytes,
            numstat=numstat,
        )
        rows.append(
            {
                "path": rel_path,
                "status": status,
                "original_b64": _bytes_to_b64(original_bytes),
                "modified_b64": _bytes_to_b64(modified_bytes),
                "original": decode_text_bytes(original_bytes),
                "modified": decode_text_bytes(modified_bytes),
                "has_modified": bool(modified_bytes),
                "additions": additions,
                "deletions": deletions,
                "language": infer_diff_language(rel_path),
            }
        )
    rows.sort(key=lambda x: str(x.get("path") or ""))
    return rows


def collect_repo_commit_stage_paths(repo_path: str) -> tuple[bool, str, list[str]]:
    """列出代码提交应暂存的路径（排除 synapse_archive / AGENTS.md）。"""
    root = str(repo_path or "").strip()
    if not root:
        return False, "缺少仓库路径", []

    ok, status_out = _run_git(["git", "-C", root, "status", "--porcelain"], timeout=120.0)
    if not ok:
        return False, status_out or "git status 失败", []

    paths = [
        rel_path
        for _status, rel_path in _parse_status_paths(status_out)
        if should_include_commit_file(rel_path)
    ]
    return True, "", paths


def infer_diff_language(rel_path: str) -> str:
    ext = Path(rel_path).suffix.lower()
    return {
        ".py": "python",
        ".java": "java",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".go": "go",
        ".rs": "rust",
        ".sql": "sql",
        ".xml": "xml",
        ".html": "html",
        ".css": "css",
        ".scss": "scss",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".md": "markdown",
        ".sh": "shell",
        ".vue": "html",
        ".cpp": "cpp",
        ".c": "c",
        ".h": "cpp",
        ".hpp": "cpp",
    }.get(ext, "plaintext")


def _encode_text_content(content: str, *, encoding: str = "utf-8") -> bytes:
    enc = str(encoding or "utf-8").lower().replace("_", "-")
    if enc in {"gbk", "gb2312", "gb18030"}:
        return content.encode("gbk", errors="replace")
    return content.encode("utf-8")


def _assert_path_within_repo(repo_root: Path, target: Path) -> None:
    try:
        target.resolve().relative_to(repo_root.resolve())
    except ValueError as exc:
        raise ValueError("invalid_file_path") from exc


def find_task_exec_code_diff_file(scope_id: str, file_id: str) -> dict[str, Any] | None:
    needle = str(file_id or "").strip()
    if not needle:
        return None
    for entry in collect_task_exec_code_diffs(scope_id).get("files") or []:
        if str(entry.get("id") or "") == needle:
            return entry
    return None


def discard_task_exec_code_diff_file(scope_id: str, file_id: str) -> dict[str, Any]:
    """放弃单个文件的未提交变更，恢复为 git HEAD 状态（或删除新增未跟踪文件）。"""
    entry = find_task_exec_code_diff_file(scope_id, file_id)
    if entry is None:
        raise ValueError("code_diff_file_not_found")

    sandbox = str(entry.get("sandbox_path") or "").strip()
    rel_path = str(entry.get("path") or "").strip()
    status = str(entry.get("status") or "").lower()
    if not sandbox or not rel_path:
        raise ValueError("code_diff_file_not_found")

    declared = Path(sandbox)
    if not declared.is_dir():
        raise ValueError("sandbox_not_found")

    repo_root = _resolve_git_repo_root(declared) or declared
    if not should_include_diff_file(rel_path):
        raise ValueError("code_diff_file_not_allowed")

    target = _repo_file_path(repo_root, rel_path)
    _assert_path_within_repo(repo_root, target)

    if status == "added":
        if target.is_file():
            try:
                target.unlink()
            except OSError as exc:
                logger.warning("discard added file unlink failed %s: %s", target, exc)
                raise ValueError("code_diff_discard_failed") from exc
        _run_git(["git", "-C", str(repo_root), "clean", "-fd", "--", rel_path], timeout=60.0)
    elif status == "deleted":
        ok, err = _run_git(
            ["git", "-C", str(repo_root), "restore", "--source=HEAD", "--worktree", "--", rel_path],
            timeout=60.0,
        )
        if not ok:
            ok2, _ = _run_git(
                ["git", "-C", str(repo_root), "checkout", "HEAD", "--", rel_path],
                timeout=60.0,
            )
            if not ok2:
                raise ValueError("code_diff_discard_failed") from None
            if err and not ok:
                logger.debug("discard deleted restore fallback: %s", err)
    else:
        ok, err = _run_git(
            [
                "git",
                "-C",
                str(repo_root),
                "restore",
                "--source=HEAD",
                "--worktree",
                "--staged",
                "--",
                rel_path,
            ],
            timeout=60.0,
        )
        if not ok:
            ok2, _ = _run_git(
                ["git", "-C", str(repo_root), "checkout", "HEAD", "--", rel_path],
                timeout=60.0,
            )
            if not ok2:
                raise ValueError("code_diff_discard_failed") from None
            if err:
                logger.debug("discard modified restore fallback: %s", err)

    task_no = str(entry.get("task_no") or "").strip()
    for fresh in collect_repo_code_diff_files(sandbox):
        if str(fresh.get("path") or "") == rel_path:
            out_id = f"{task_no}:{rel_path}" if task_no else rel_path
            return {
                **fresh,
                "id": out_id,
                "task_no": task_no,
                "sandbox_path": sandbox,
            }
    return {
        "id": file_id,
        "path": rel_path,
        "task_no": task_no,
        "sandbox_path": sandbox,
        "discarded": True,
        "status": "unchanged",
    }


def save_task_exec_code_diff_file(
    scope_id: str,
    file_id: str,
    content: str,
    *,
    encoding: str = "utf-8",
) -> dict[str, Any]:
    """将评审中编辑的变更后内容写回子单沙箱工作区。"""
    entry = find_task_exec_code_diff_file(scope_id, file_id)
    if entry is None:
        raise ValueError("code_diff_file_not_found")

    status = str(entry.get("status") or "").lower()
    if status == "deleted":
        raise ValueError("code_diff_deleted_not_editable")

    sandbox = str(entry.get("sandbox_path") or "").strip()
    rel_path = str(entry.get("path") or "").strip()
    if not sandbox or not rel_path:
        raise ValueError("code_diff_file_not_found")

    declared = Path(sandbox)
    if not declared.is_dir():
        raise ValueError("sandbox_not_found")

    repo_root = _resolve_git_repo_root(declared) or declared
    if not should_include_diff_file(rel_path):
        raise ValueError("code_diff_file_not_allowed")

    target = _repo_file_path(repo_root, rel_path)
    _assert_path_within_repo(repo_root, target)

    data = _encode_text_content(content, encoding=encoding)
    if len(data) > MAX_DIFF_FILE_BYTES:
        raise ValueError("code_diff_file_too_large")
    if b"\x00" in data[:4096]:
        raise ValueError("code_diff_binary_not_supported")

    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        target.write_bytes(data)
    except OSError as exc:
        logger.warning("save task exec code diff failed %s: %s", target, exc)
        raise ValueError("code_diff_write_failed") from exc

    task_no = str(entry.get("task_no") or "").strip()
    for fresh in collect_repo_code_diff_files(sandbox):
        if str(fresh.get("path") or "") != rel_path:
            continue
        out_id = f"{task_no}:{rel_path}" if task_no else rel_path
        return {
            **fresh,
            "id": out_id,
            "task_no": task_no,
            "sandbox_path": sandbox,
        }
    raise ValueError("code_diff_refresh_failed")


def collect_task_exec_code_diffs(scope_id: str, *, node_id: str = "") -> dict[str, Any]:
    """汇总 CLI 执行节点各子单沙箱的未提交 git diff。"""
    nid = (node_id or "").strip()
    tasks: list[Any] = []
    if nid == "diff_analysis":
        from synapse.rd_meeting.diff_analysis_exec import load_diff_analysis_payload

        payload = load_diff_analysis_payload(scope_id) or {}
        tasks = payload.get("tasks") if isinstance(payload.get("tasks"), list) else []
    elif nid == "task_exec":
        payload = load_task_exec_payload(scope_id) or {}
        tasks = payload.get("tasks") if isinstance(payload.get("tasks"), list) else []
    else:
        from synapse.rd_meeting.diff_analysis_exec import load_diff_analysis_payload

        payload = load_diff_analysis_payload(scope_id) or {}
        tasks = payload.get("tasks") if isinstance(payload.get("tasks"), list) else []
        if not tasks:
            payload = load_task_exec_payload(scope_id) or {}
            tasks = payload.get("tasks") if isinstance(payload.get("tasks"), list) else []

    files: list[dict[str, Any]] = []
    seen_repo_roots: set[str] = set()
    task_count = 0

    for task in tasks:
        if not isinstance(task, dict):
            continue
        if str(task.get("status") or "").lower() == "running":
            continue
        sandbox = str(task.get("sandbox_path") or "").strip()
        if not sandbox:
            continue
        sandbox_path = Path(sandbox)
        repo_root = _resolve_git_repo_root(sandbox_path) or sandbox_path
        repo_key = str(repo_root.resolve()).lower()
        if repo_key in seen_repo_roots:
            continue
        seen_repo_roots.add(repo_key)
        task_no = str(task.get("task_no") or "").strip()
        task_count += 1
        for entry in collect_repo_code_diff_files(sandbox):
            rel = str(entry.get("path") or "")
            file_id = f"{task_no}:{rel}" if task_no else rel
            files.append(
                {
                    **entry,
                    "id": file_id,
                    "task_no": task_no,
                    "sandbox_path": sandbox,
                }
            )

    return {
        "files": files,
        "summary": {
            "file_count": len(files),
            "task_count": task_count,
            "additions": sum(int(f.get("additions") or 0) for f in files),
            "deletions": sum(int(f.get("deletions") or 0) for f in files),
        },
    }
