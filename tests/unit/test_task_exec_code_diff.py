"""任务执行代码差异采集。"""

from __future__ import annotations

import base64
import subprocess
from pathlib import Path

import pytest

from synapse.rd_meeting.task_exec_code_diff import (
    collect_repo_code_diff_files,
    collect_repo_commit_stage_paths,
    collect_task_exec_code_diffs,
    decode_text_bytes,
    is_test_file,
    should_include_commit_file,
    should_include_diff_file,
)


def test_should_include_commit_file_filters() -> None:
    assert should_include_commit_file("src/main/java/Foo.java") is True
    assert should_include_commit_file("synapse_archive/需求设计/x.md") is False
    assert should_include_commit_file("AGENTS.md") is False
    assert should_include_commit_file("agents.md") is False
    assert should_include_commit_file("tests/unit/test_foo.py") is True


def test_should_include_diff_file_filters() -> None:
    assert should_include_diff_file("src/main/java/Foo.java") is True
    assert should_include_diff_file("synapse_archive/需求设计/x.md") is False
    assert should_include_diff_file("AGENTS.md") is False
    assert should_include_diff_file("agents.md") is False
    assert should_include_diff_file("tests/unit/test_foo.py") is False
    assert should_include_diff_file("src/test_foo.py") is False


def test_is_test_file_patterns() -> None:
    assert is_test_file("src/test_order_service.py") is True
    assert is_test_file("src/order_service_test.go") is True
    assert is_test_file("web/app.spec.ts") is True
    assert is_test_file("src/main/Foo.java") is False


def _git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", "-C", str(cwd), *args], check=True, capture_output=True)


def test_decode_text_bytes_gbk() -> None:
    # "中文注释" encoded as GBK
    raw = b"class Main { // \xd6\xd0\xce\xc4\xd7\xa2\xca\xcd\n}\n"
    text = decode_text_bytes(raw, encoding="gbk")
    assert "\u4e2d\u6587\u6ce8\u91ca" in text


def test_collect_repo_code_diff_files_gbk(tmp_path: Path) -> None:
    repo = tmp_path / "repo-gbk"
    repo.mkdir()
    _git(repo, "init")
    _git(repo, "config", "user.email", "t@example.com")
    _git(repo, "config", "user.name", "test")

    (repo / "src").mkdir()
    old_bytes = b"class Main { // \xbe\xc9\xb0\xe6\n}\n"  # 旧版
    (repo / "src" / "Main.java").write_bytes(old_bytes)
    _git(repo, "add", "src/Main.java")
    _git(repo, "commit", "-m", "init")

    new_bytes = b"class Main { // \xd0\xc2\xb0\xe6\xd6\xd0\xce\xc4\n}\n"  # 新版中文
    (repo / "src" / "Main.java").write_bytes(new_bytes)

    rows = collect_repo_code_diff_files(str(repo))
    main = next(r for r in rows if r["path"] == "src/Main.java")
    orig = base64.b64decode(main["original_b64"]).decode("gbk")
    mod = base64.b64decode(main["modified_b64"]).decode("gbk")
    assert "\u65e7\u7248" in orig
    assert "\u65b0\u7248\u4e2d\u6587" in mod
    assert orig != mod


def test_collect_repo_code_diff_files_reads_index_when_worktree_reverted(tmp_path: Path) -> None:
    repo = tmp_path / "repo-index"
    repo.mkdir()
    _git(repo, "init")
    _git(repo, "config", "user.email", "t@example.com")
    _git(repo, "config", "user.name", "test")

    (repo / "src").mkdir()
    (repo / "src" / "Main.java").write_text("class Main {}\n", encoding="utf-8")
    _git(repo, "add", "src/Main.java")
    _git(repo, "commit", "-m", "init")

    (repo / "src" / "Main.java").write_text("class Main { void run() {} }\n", encoding="utf-8")
    _git(repo, "add", "src/Main.java")
    _git(repo, "restore", "--worktree", "src/Main.java")

    rows = collect_repo_code_diff_files(str(repo))
    main = next(r for r in rows if r["path"] == "src/Main.java")
    assert main["has_modified"] is True
    assert "void run" in base64.b64decode(main["modified_b64"]).decode("utf-8")
    assert "class Main {}" in base64.b64decode(main["original_b64"]).decode("utf-8")


def test_collect_repo_code_diff_files(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init")
    _git(repo, "config", "user.email", "t@example.com")
    _git(repo, "config", "user.name", "test")

    (repo / "src").mkdir()
    (repo / "src" / "Main.java").write_text("class Main {}\n", encoding="utf-8")
    (repo / "AGENTS.md").write_text("# ignore\n", encoding="utf-8")
    (repo / "tests").mkdir()
    (repo / "tests" / "test_main.py").write_text("def test_x(): pass\n", encoding="utf-8")
    _git(repo, "add", "src/Main.java", "AGENTS.md", "tests/test_main.py")
    _git(repo, "commit", "-m", "init")

    (repo / "src" / "Main.java").write_text("class Main { void run() {} }\n", encoding="utf-8")
    (repo / "src" / "New.java").write_text("class New {}\n", encoding="utf-8")

    rows = collect_repo_code_diff_files(str(repo))
    paths = {r["path"] for r in rows}
    assert "src/Main.java" in paths
    assert "src/New.java" in paths
    assert "AGENTS.md" not in paths
    assert "tests/test_main.py" not in paths

    main = next(r for r in rows if r["path"] == "src/Main.java")
    assert main["original_b64"]
    assert main["modified_b64"]
    assert "void run" in main["modified"]
    assert "class Main {}" in main["original"]
    assert base64.b64decode(main["modified_b64"]).decode("utf-8").startswith("class Main { void run")


def test_collect_task_exec_code_diffs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    scope_id = "te-diff-scope"
    repo = tmp_path / "sandbox"
    repo.mkdir()
    _git(repo, "init")
    _git(repo, "config", "user.email", "t@example.com")
    _git(repo, "config", "user.name", "test")
    (repo / "App.py").write_text("v1\n", encoding="utf-8")
    _git(repo, "add", "App.py")
    _git(repo, "commit", "-m", "init")
    (repo / "App.py").write_text("v2\n", encoding="utf-8")

    archive = tmp_path / "work" / scope_id / "archive" / "开发中" / "task_exec"
    archive.mkdir(parents=True)
    payload = {
        "status": "partial",
        "tasks": [
            {
                "task_no": "T-1",
                "status": "ok",
                "sandbox_path": str(repo),
            }
        ],
    }
    import json

    (archive / "task_exec_result.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    monkeypatch.setattr(
        "synapse.rd_meeting.task_exec.archive_node_dir",
        lambda sid, stage, nid: archive,
    )
    monkeypatch.setattr("synapse.rd_meeting.task_exec.stage_name_for_id", lambda _s: "开发中")

    out = collect_task_exec_code_diffs(scope_id)
    assert out["summary"]["file_count"] == 1
    assert out["files"][0]["path"] == "App.py"
    assert out["files"][0]["original"].startswith("v1")
    assert out["files"][0]["modified"].startswith("v2")


def test_collect_repo_code_diff_files_from_repo_subdirectory(tmp_path: Path) -> None:
    """sandbox_path 指向 git 仓库内子目录时，仍应能采集未提交 diff。"""
    repo = tmp_path / "ZMDB"
    sub = repo / "BackServiceCpp" / "src" / "cpp" / "Zmdb"
    sub.mkdir(parents=True)
    _git(repo, "init")
    _git(repo, "config", "user.email", "t@example.com")
    _git(repo, "config", "user.name", "test")

    rel = "BackServiceCpp/src/cpp/Zmdb/App.py"
    target = sub / "App.py"
    target.write_text("v1\n", encoding="utf-8")
    _git(repo, "add", rel)
    _git(repo, "commit", "-m", "init")
    target.write_text("v2\n", encoding="utf-8")

    rows = collect_repo_code_diff_files(str(sub))
    assert len(rows) == 1
    assert rows[0]["path"] == rel
    assert rows[0]["modified"].startswith("v2")


def test_collect_repo_commit_stage_paths(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    _git(repo, "init")
    _git(repo, "config", "user.email", "t@example.com")
    _git(repo, "config", "user.name", "test")

    (repo / "src").mkdir()
    (repo / "src" / "Main.java").write_text("class Main {}\n", encoding="utf-8")
    _git(repo, "add", "src/Main.java")
    _git(repo, "commit", "-m", "init")

    (repo / "src" / "Main.java").write_text("class Main { void run() {} }\n", encoding="utf-8")
    (repo / "AGENTS.md").write_text("# local\n", encoding="utf-8")
    (repo / "synapse_archive").mkdir()
    (repo / "synapse_archive" / "doc.md").write_text("archive\n", encoding="utf-8")

    ok, _detail, paths = collect_repo_commit_stage_paths(str(repo))
    assert ok is True
    assert paths == ["src/Main.java"]
