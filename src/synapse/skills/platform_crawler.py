"""技能平台爬虫 — 经研发云 SSO 鉴权，供内部技能市场 API 使用。"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

import httpx
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)

SKILL_PLATFORM_BASE = "http://10.45.46.166:8019"
SKILL_HUB_API = f"{SKILL_PLATFORM_BASE}/skill-hub/api"
LOGIN_TIMEOUT_MS = 300_000
TOKEN_TTL_SECONDS = 7200
WHALEHUB_NPM_PKG = "git+https://git-nj.iwhalecloud.com/0027031292/skill-hub-cli.git"

_HOT_COLUMN_META: tuple[tuple[str, str, str], ...] = (
    ("downloads", "rank_downloads", "下载热榜"),
    ("stars", "rank_stars", "星标热榜"),
    ("recent", "rank_recent", "最近更新"),
)


def _project_root() -> Path:
    from synapse.config import settings

    return Path(settings.project_root).resolve()


def token_cache_path() -> Path:
    return _project_root() / "data" / "skill_platform_token.json"


def skills_install_dir() -> Path:
    """技能安装目录：项目根下的 ``skills/``。"""
    return _project_root() / "skills"


def _load_userinfo_plain() -> dict | None:
    from foundation.helper.CryptHelper import CryptHelper

    path = _project_root() / "data" / "userinfo.encryption"
    if not path.is_file():
        return None
    enc = path.read_text(encoding="utf-8").strip()
    if not enc:
        return None
    plain = CryptHelper().decrypt(enc, False)
    if plain is None:
        raise ValueError("解密 userinfo.encryption 失败")
    try:
        return json.loads(plain)
    except json.JSONDecodeError as exc:
        raise ValueError("userinfo.encryption 解密后不是合法 JSON") from exc


def _save_token(token: str) -> None:
    path = token_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"token": token, "saved_at": time.time()}),
        encoding="utf-8",
    )


def _load_token() -> str | None:
    path = token_cache_path()
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if time.time() - data.get("saved_at", 0) > TOKEN_TTL_SECONDS:
            path.unlink(missing_ok=True)
            return None
        token = data.get("token")
        return str(token) if token else None
    except (json.JSONDecodeError, KeyError, TypeError):
        return None


def _api_get(token: str, path: str, params: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(f"{SKILL_HUB_API}{path}", params=params, headers=headers)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"API 请求失败: GET {path} — {type(exc).__name__}: {exc}") from exc


def _api_post(token: str, path: str, body: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(f"{SKILL_HUB_API}{path}", json=body, headers=headers)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"API 请求失败: POST {path} — {type(exc).__name__}: {exc}") from exc


def login(username: str | None = None, password: str | None = None) -> str:
    """登录技能平台，返回 sso_token。"""
    cached = _load_token()
    if cached:
        logger.info("使用缓存的 sso_token")
        return cached

    if not username or not password:
        userinfo = _load_userinfo_plain()
        if not userinfo:
            raise ValueError(
                "未找到本地凭据 (data/userinfo.encryption)，请传入 username/password 或完成研发云引导登录"
            )
        username = (userinfo.get("employee_id") or userinfo.get("username") or "").strip()
        password = userinfo.get("password") or ""
        if not username or not password:
            raise ValueError("userinfo.encryption 中缺少工号或密码")

    logger.info("正在通过 Playwright SSO 登录技能平台...")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(LOGIN_TIMEOUT_MS)
        page.set_default_navigation_timeout(LOGIN_TIMEOUT_MS)
        try:
            page.goto(SKILL_PLATFORM_BASE, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=60000)

            if SKILL_PLATFORM_BASE not in page.url:
                page.fill("#edt_username", username)
                page.fill("#edt_pwd", password)
                page.click(".loginBtn")
                try:
                    page.wait_for_url(f"{SKILL_PLATFORM_BASE}/**", timeout=60000)
                except PlaywrightTimeoutError as exc:
                    raise RuntimeError(f"SSO 登录超时，当前 URL: {page.url}") from exc
                page.wait_for_load_state("networkidle", timeout=60000)
                page.wait_for_timeout(3000)

            sso_token = page.evaluate("() => localStorage.getItem('sso_token')")
            if not sso_token:
                raise RuntimeError("未能从 localStorage 获取 sso_token")

            logger.info("技能平台登录成功")
            _save_token(str(sso_token))
            return str(sso_token)
        finally:
            context.close()
            browser.close()


def _format_skill(
    skill: dict,
    skill_type: str,
    rank_type: str | None = None,
    rank: int | None = None,
) -> dict:
    desc_zh = skill.get("descriptionZh")
    desc = desc_zh if desc_zh and desc_zh != "None" else (skill.get("description") or "")
    return {
        "id": skill.get("id"),
        "name": skill.get("displayName") or "",
        "slug": skill.get("slug") or "",
        "description": desc,
        "tags": ",".join(
            t.get("tagName", "")
            for tg in (skill.get("tagGroups") or [])
            for t in (tg.get("tags") or [])
            if t.get("tagName")
        ),
        "downloads": skill.get("downloads", 0),
        "stars": skill.get("stars", 0),
        "skill_type": skill_type,
        "rank_downloads": rank if rank_type == "downloads" else None,
        "rank_stars": rank if rank_type == "stars" else None,
        "rank_recent": rank if rank_type == "recent" else None,
        "record_date": str(date.today()),
        "fetched_At": skill.get("fetchedAt") or skill.get("uploadedAt") or "",
    }


def _extract_hot_columns(data: dict, skill_type: str) -> list[dict]:
    columns = data.get("data", {}).get("columns") or []
    result: list[dict] = []
    for column in columns:
        code = column.get("code", "")
        items = column.get("items") or []
        for index, item in enumerate(items, start=1):
            result.append(_format_skill(item, skill_type, rank_type=code, rank=index))
    return result


def group_hot_columns(flat_skills: list[dict]) -> list[dict]:
    """将扁平热榜列表转为前端 HotColumn[] 结构。"""
    grouped: list[dict] = []
    for code, rank_field, title in _HOT_COLUMN_META:
        items = [skill for skill in flat_skills if skill.get(rank_field) is not None]
        items.sort(key=lambda skill: skill[rank_field])
        grouped.append({"code": code, "title": title, "items": items})
    return grouped


def fetch_official_hot(token: str) -> list[dict]:
    data = _api_get(token, "/crawler-skills/hot-columns", params={"limit": 8})
    if not data.get("success"):
        raise RuntimeError(f"官方热榜失败: {json.dumps(data, ensure_ascii=False)}")
    return _extract_hot_columns(data, "official")


def fetch_self_hot(token: str) -> list[dict]:
    data = _api_get(token, "/upload-skills/hot-columns", params={"limit": 8})
    if not data.get("success"):
        raise RuntimeError(f"自营热榜失败: {json.dumps(data, ensure_ascii=False)}")
    return _extract_hot_columns(data, "self_operated")


def fetch_official_all(token: str) -> list[dict]:
    all_skills: list[dict] = []
    page = 1
    while True:
        data = _api_get(
            token,
            "/crawler-skills/page",
            params={
                "pageNum": page,
                "pageSize": 12,
                "keyword": "",
                "sort": "hot",
                "onlyTagged": "false",
            },
        )
        if not data.get("success"):
            raise RuntimeError(f"官方技能 page={page} 失败: {json.dumps(data, ensure_ascii=False)}")

        page_data = data.get("data") or {}
        skills = page_data.get("list") or []
        if not skills:
            break

        all_skills.extend(_format_skill(skill, "official") for skill in skills)
        total = page_data.get("total", 0)
        total_pages = (total + 11) // 12
        logger.info("官方技能: page %d/%d (%d 条)", page, total_pages, len(skills))
        if page >= total_pages:
            break
        page += 1
    return all_skills


def fetch_self_all(token: str) -> list[dict]:
    all_skills: list[dict] = []
    page_num = 1
    page_size = 20
    while True:
        data = _api_post(
            token,
            "/upload-skills/query",
            body={"pageNum": page_num, "pageSize": page_size},
        )
        skills = data.get("list") or []
        if not skills:
            break

        all_skills.extend(_format_skill(skill, "self_operated") for skill in skills)
        total = data.get("total", 0)
        logger.info("自营技能: page %d (%d 条), 累计 %d/%d", page_num, len(skills), len(all_skills), total)
        if len(all_skills) >= total:
            break
        page_num += 1
    return all_skills


def crawl(skill_type: str = "all", token: str | None = None) -> dict:
    """爬取技能平台数据，返回结构化 dict。"""
    if not token:
        token = login()

    want_official = skill_type in ("official", "all")
    want_self = skill_type in ("self_operated", "all")
    result: dict = {}

    if want_official:
        logger.info("开始爬取官方技能热榜...")
        official_hot = fetch_official_hot(token)
        logger.info("官方热榜: %d 条", len(official_hot))
        logger.info("开始爬取官方技能全量...")
        official_all = fetch_official_all(token)
        logger.info("官方全量: %d 条", len(official_all))
        result["official"] = {"hot": official_hot, "all": official_all}
    else:
        result["official"] = {"hot": [], "all": []}

    if want_self:
        logger.info("开始爬取自营技能热榜...")
        self_hot = fetch_self_hot(token)
        logger.info("自营热榜: %d 条", len(self_hot))
        logger.info("开始爬取自营技能全量...")
        self_all = fetch_self_all(token)
        logger.info("自营全量: %d 条", len(self_all))
        result["self_operated"] = {"hot": self_hot, "all": self_all}
    else:
        result["self_operated"] = {"hot": [], "all": []}

    return result


def _ensure_whalehub_cli() -> None:
    if shutil.which("whalehub"):
        return
    logger.info("whalehub 未安装，正在 npm install -g %s", WHALEHUB_NPM_PKG)
    try:
        subprocess.run(
            ["npm.cmd", "install", "-g", WHALEHUB_NPM_PKG],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except subprocess.CalledProcessError as exc:
        err_msg = (exc.stderr or exc.stdout or "").strip()
        raise RuntimeError(f"whalehub CLI 安装失败: {err_msg}") from exc

    if shutil.which("whalehub"):
        return

    try:
        npm_bin = subprocess.run(
            ["npm.cmd", "bin", "-g"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        ).stdout.strip()
        if npm_bin:
            whalehub_exe = Path(npm_bin) / ("whalehub.cmd" if sys.platform == "win32" else "whalehub")
            if whalehub_exe.is_file():
                os.environ["PATH"] = npm_bin + os.pathsep + os.environ.get("PATH", "")
                return
    except Exception:
        pass
    raise RuntimeError("whalehub CLI 安装后仍不可用，请检查 npm 全局路径")


def install_skill(slug: str) -> dict:
    """通过 whalehub CLI 安装技能到 ``skills/`` 目录。"""
    slug = (slug or "").strip()
    if not slug:
        raise ValueError("slug 不能为空")

    project_root = _project_root()
    install_dir = skills_install_dir()
    target_dir = install_dir / slug
    if target_dir.is_dir():
        raise RuntimeError(f"技能 {slug} 已安装于 {target_dir}")

    _ensure_whalehub_cli()
    install_dir.mkdir(parents=True, exist_ok=True)

    whalehub_path = shutil.which("whalehub")
    if not whalehub_path:
        raise RuntimeError("whalehub CLI 不可用，请手动安装")

    # whalehub install 固定写入 ./skills/<slug>，cwd 必须是项目根而非 skills/ 本身
    logger.info("正在安装技能: whalehub install %s (cwd=%s)", slug, project_root)
    result = subprocess.run(
        [whalehub_path, "install", slug],
        cwd=str(project_root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0:
        err_msg = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"whalehub install 失败: {err_msg}")

    if not target_dir.is_dir():
        raise RuntimeError(f"whalehub install 完成但未找到目录: {target_dir}")

    logger.info("技能安装成功: %s → %s", slug, target_dir)
    return {"status": "ok", "slug": slug, "install_dir": str(target_dir)}
