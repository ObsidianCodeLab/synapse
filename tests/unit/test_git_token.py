"""Unit tests for git repo token URL injection and validation helpers."""

from __future__ import annotations

import shutil

import pytest

from synapse.rd_meeting.git_token import inject_https_token, validate_repo_token


class TestInjectHttpsToken:
    def test_injects_oauth2_user(self) -> None:
        url = "https://git.example.com/group/repo.git"
        out = inject_https_token(url, "secret-token")
        assert out == "https://oauth2:secret-token@git.example.com/group/repo.git"

    def test_username_from_double_at_wire(self) -> None:
        url = "myuser@@https://git.example.com/group/repo.git"
        out = inject_https_token(url, "tok")
        assert out.startswith("https://myuser:tok@git.example.com/")

    def test_empty_token_returns_remote(self) -> None:
        url = "https://git.example.com/r.git"
        assert inject_https_token(url, "") == url

    def test_git_ssh_unchanged(self) -> None:
        url = "git@git.example.com:group/repo.git"
        assert inject_https_token(url, "tok") == url


class TestValidateRepoToken:
    def test_missing_url(self) -> None:
        assert validate_repo_token("", "main", "t") == {
            "valid": False,
            "error": "缺少仓库地址",
        }

    def test_missing_token(self) -> None:
        assert validate_repo_token("https://git.example.com/r.git", "main", "") == {
            "valid": False,
            "error": "缺少仓库 Token",
        }

    def test_ssh_rejected(self) -> None:
        r = validate_repo_token("git@host:org/repo.git", "main", "tok")
        assert r["valid"] is False
        assert "SSH" in str(r.get("error"))

    @pytest.mark.skipif(not shutil.which("git"), reason="git not installed")
    def test_invalid_host_fails_ls_remote(self) -> None:
        r = validate_repo_token(
            "https://invalid.example.invalid/norepo.git",
            "main",
            "bad-token",
        )
        assert r["valid"] is False
        assert r.get("error")
