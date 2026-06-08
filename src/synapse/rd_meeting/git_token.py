"""Git 仓库 Token 校验：HTTPS URL 注入凭证后执行 git ls-remote。"""

from __future__ import annotations

from urllib.parse import quote, urlparse, urlunparse

from synapse.rd_meeting.product_assets import _branch_from_wire, _git_remote_url, _run_git
from synapse.utils.credential_redact import redact_credentials

_LS_REMOTE_TIMEOUT = 30.0


def _git_username_from_wire(repo_url: str) -> str:
    """``user@@https://...`` 取左侧为 Git HTTP 用户名，否则 oauth2。"""
    ru = (repo_url or "").strip()
    if "@@" in ru:
        left = ru.split("@@", 1)[0].strip()
        if left and not left.startswith("http") and not left.startswith("git@"):
            return left
    return "oauth2"


def inject_https_token(repo_url: str, token: str) -> str:
    """将 token 注入 HTTPS 远程 URL（用于 ls-remote / clone）。"""
    remote = _git_remote_url(repo_url)
    tok = (token or "").strip()
    if not remote or not tok:
        return remote
    if remote.startswith("git@"):
        return remote
    if not remote.startswith("http://") and not remote.startswith("https://"):
        return remote
    parsed = urlparse(remote)
    user = quote(_git_username_from_wire(repo_url), safe="")
    pw = quote(tok, safe="")
    host = parsed.hostname or ""
    netloc = f"{user}:{pw}@{host}"
    if parsed.port:
        netloc += f":{parsed.port}"
    return urlunparse(
        (parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment),
    )


def validate_repo_token(repo_url: str, repo_branch: str, token: str) -> dict[str, object]:
    """校验 Token 是否可访问远程仓库（及可选分支）。

    Returns:
        ``{"valid": True}`` 或 ``{"valid": False, "error": "..."}``
    """
    remote = _git_remote_url(repo_url)
    tok = (token or "").strip()
    if not remote:
        return {"valid": False, "error": "缺少仓库地址"}
    if not tok:
        return {"valid": False, "error": "缺少仓库 Token"}
    if remote.startswith("git@"):
        return {"valid": False, "error": "SSH 地址暂不支持 Token 校验，请使用 HTTPS 仓库地址"}

    auth_url = inject_https_token(repo_url, tok)
    branch = _branch_from_wire(repo_branch)
    args = ["git", "ls-remote", auth_url]
    if branch:
        args.append(branch)

    ok, detail = _run_git(args, timeout=_LS_REMOTE_TIMEOUT)
    if ok:
        return {"valid": True}

    err = redact_credentials((detail or "git ls-remote 失败")[:500])
    return {"valid": False, "error": err}
