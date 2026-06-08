"""
语雀知识库相关路由。

- POST /api/yuque/create_repo   — 创建语雀知识库
- POST /api/yuque/delete_repo   — 删除语雀知识库
- POST /api/yuque/get_repo      — 获取知识库列表
- POST /api/yuque/search_repo   — 搜索知识库
- POST /api/yuque/search_docs   — 搜索文档
- POST /api/yuque/create_docs   — 创建文档
- POST /api/yuque/delete_docs   — 删除文档
- POST /api/yuque/update_docs   — 更新文档
- POST /api/yuque/get_docs      — 获取文档详情
- POST /api/yuque/get_repo_docs — 获取知识库的文档列表
"""

from __future__ import annotations

import logging
import uuid

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from synapse.api.schemas import error_response, success_response
from synapse.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/yuque")

_DEFAULT_PUBLIC: int = 2  # 企业内公开


class CreateRepoRequest(BaseModel):
    name: str = Field(..., description="知识库名称")
    description: str = Field(default="", description="知识库描述（可选）")


@router.post("/create_repo")
async def create_repo(req: CreateRepoRequest):
    """创建语雀知识库。token、login 等从系统配置读取。"""
    token = settings.yuque_token
    if not token:
        logger.error("创建语雀知识库失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # 调接口获取当前用户 login
            user_resp = await client.get(f"{api_base}/user", headers=headers)
            if user_resp.status_code == 401:
                logger.error("语雀 Token 验证失败：401 Unauthorized")
                return error_response(401, "语雀 Token 无效或已过期，请检查配置")
            if user_resp.status_code >= 400:
                logger.error(f"获取语雀用户信息失败：status={user_resp.status_code}, response={user_resp.text}")
                return error_response(user_resp.status_code, f"获取语雀用户信息失败：{user_resp.text}")
            login = user_resp.json()["data"]["login"]

            # 创建知识库（最多重试 5 次处理 slug 冲突）
            max_retries = 5
            repo_data = None
            slug = None
            
            for attempt in range(max_retries):
                slug = uuid.uuid4().hex[:6]
                payload: dict = {
                    "name": req.name,
                    "slug": slug,
                    "public": _DEFAULT_PUBLIC,
                }
                if req.description:
                    payload["description"] = req.description

                repo_resp = await client.post(
                    f"{api_base}/groups/{login}/repos",
                    headers=headers,
                    json=payload,
                )
                
                if repo_resp.status_code < 400:
                    repo_data = repo_resp.json()["data"]
                    break
                
                # 检查是否是 slug 冲突错误
                resp_text = repo_resp.text.lower()
                is_slug_conflict = (
                    repo_resp.status_code == 400 
                    and ("slug" in resp_text or "有重复" in resp_text or "路径名冲突" in resp_text)
                )
                
                if is_slug_conflict and attempt < max_retries - 1:
                    logger.warning(f"Slug 冲突 (尝试 {attempt + 1}/{max_retries})，重新生成: {slug}")
                    continue
                
                # 非 slug 冲突错误或已达最大重试次数
                logger.error(f"创建语雀知识库失败：status={repo_resp.status_code}, response={repo_resp.text}")
                return error_response(repo_resp.status_code, f"创建语雀知识库失败：{repo_resp.text}")
            
            if not repo_data:
                logger.error(f"创建语雀知识库失败：重试 {max_retries} 次后仍失败")
                return error_response(500, "创建知识库失败：无法生成唯一的 slug")
            
            namespace = repo_data.get("namespace", f"{login}/{slug}")
            logger.info(f"知识库创建成功：id={repo_data['id']}, name={repo_data['name']}, namespace={namespace}")
            return success_response(
                {
                    "id": repo_data["id"],
                    "name": repo_data["name"],
                    "slug": repo_data["slug"],
                    "public": repo_data["public"],
                    "url": f"{api_base.removesuffix('/api/v2')}/{namespace}",
                },
                "知识库创建成功",
            )

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"创建语雀知识库时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")


class DeleteBookRequest(BaseModel):
    book_id: int = Field(..., description="知识库 ID")


@router.post("/delete_repo")
async def delete_repo(req: DeleteBookRequest):
    """删除语雀知识库。token 从系统配置读取，使用 book_id 定位知识库。"""
    token = settings.yuque_token
    if not token:
        logger.error("删除语雀知识库失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.delete(
                f"{api_base}/repos/{req.book_id}",
                headers=headers,
            )
            if resp.status_code == 401:
                logger.error("语雀 Token 验证失败：401 Unauthorized")
                return error_response(401, "语雀 Token 无效或已过期，请检查配置")
            if resp.status_code == 404:
                logger.error(f"删除语雀知识库失败：知识库不存在 book_id={req.book_id}")
                return error_response(404, f"知识库不存在：{req.book_id}")
            if resp.status_code >= 400:
                logger.error(f"删除语雀知识库失败：status={resp.status_code}, response={resp.text}")
                return error_response(resp.status_code, f"删除语雀知识库失败：{resp.text}")

            logger.info(f"知识库删除成功：book_id={req.book_id}")
            return success_response({"book_id": req.book_id}, "知识库删除成功")

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"删除语雀知识库时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")


class GetReposRequest(BaseModel):
    page: int | None = Field(default=None, ge=1, description="页码，从 1 开始（可选）")
    page_size: int | None = Field(default=None, ge=1, le=100, description="每页数量，最大 100（可选）")
    type: str = Field(default="Book", description="知识库类型：Book / Design / Sheet 等，默认 Book")


@router.post("/get_repo")
async def get_repo(req: GetReposRequest):
    """获取当前用户的语雀知识库列表。token 从系统配置读取。"""
    token = settings.yuque_token
    if not token:
        logger.error("获取语雀知识库列表失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # 获取当前用户 login
            user_resp = await client.get(f"{api_base}/user", headers=headers)
            if user_resp.status_code == 401:
                logger.error("语雀 Token 验证失败：401 Unauthorized")
                return error_response(401, "语雀 Token 无效或已过期，请检查配置")
            if user_resp.status_code >= 400:
                logger.error(f"获取语雀用户信息失败：status={user_resp.status_code}, response={user_resp.text}")
                return error_response(user_resp.status_code, f"获取语雀用户信息失败：{user_resp.text}")
            login = user_resp.json()["data"]["login"]

            # 构造查询参数，page/page_size 不传时不附加
            params: dict = {"type": req.type}
            if req.page is not None and req.page_size is not None:
                params["offset"] = (req.page - 1) * req.page_size
                params["limit"] = req.page_size
            elif req.page_size is not None:
                params["offset"] = 0
                params["limit"] = req.page_size

            # 获取知识库列表
            repos_resp = await client.get(
                f"{api_base}/users/{login}/repos",
                headers=headers,
                params=params,
            )
            if repos_resp.status_code >= 400:
                logger.error(f"获取语雀知识库列表失败：status={repos_resp.status_code}, response={repos_resp.text}")
                return error_response(repos_resp.status_code, f"获取知识库列表失败：{repos_resp.text}")

            raw_list = repos_resp.json().get("data", [])
            base_url = api_base.removesuffix("/api/v2")
            repos = [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "slug": r["slug"],
                    "namespace": r.get("namespace", ""),
                    "description": r.get("description", ""),
                    "public": r.get("public", 0),
                    "url": f"{base_url}/{r['namespace']}" if r.get("namespace") else "",
                    "updated_at": r.get("updated_at", ""),
                }
                for r in raw_list
            ]
            logger.info(f"获取知识库列表成功：login={login}, total={len(repos)}, page={req.page}")
            return success_response(
                {"total": len(repos), "page": req.page, "page_size": req.page_size, "list": repos},
                "获取知识库列表成功",
            )

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"获取语雀知识库列表时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")


class CreateDocsRequest(BaseModel):
    book_id: int = Field(..., description="知识库 ID")
    title: str = Field(..., description="文档标题")
    body: str = Field(default="", description="文档内容（Markdown 或 HTML）")
    format: str = Field(default="markdown", description="文档格式：markdown / lake / html")
    slug: str = Field(default="", description="文档路径（可选，不传则自动生成）")
    public: int = Field(default=1, description="是否公开：0=私密 1=公开 2=企业内公开")


@router.post("/create_docs")
async def create_docs(req: CreateDocsRequest):
    """在指定知识库中创建文档。token 从系统配置读取。"""
    token = settings.yuque_token
    if not token:
        logger.error("创建语雀文档失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # 第一步：创建文档
            payload: dict = {
                "title": req.title,
                "body": req.body,
                "format": req.format,
                "public": req.public,
            }
            if req.slug:
                payload["slug"] = req.slug

            resp = await client.post(
                f"{api_base}/repos/{req.book_id}/docs",
                headers=headers,
                json=payload,
            )
            if resp.status_code == 401:
                logger.error("语雀 Token 验证失败：401 Unauthorized")
                return error_response(401, "语雀 Token 无效或已过期，请检查配置")
            if resp.status_code == 404:
                logger.error(f"创建语雀文档失败：知识库不存在 book_id={req.book_id}")
                return error_response(404, f"知识库不存在：{req.book_id}")
            if resp.status_code >= 400:
                logger.error(f"创建语雀文档失败：status={resp.status_code}, response={resp.text}")
                return error_response(resp.status_code, f"创建文档失败：{resp.text}")

            doc_data = resp.json()["data"]
            doc_id = doc_data["id"]
            doc_slug = doc_data["slug"]
            doc_title = doc_data["title"]
            logger.info(f"文档创建成功：id={doc_id}, title={doc_title}, book_id={req.book_id}")

            # 第二步：更新目录，将新文档追加到目录末尾
            toc_update_resp = await client.put(
                f"{api_base}/repos/{req.book_id}/toc",
                headers=headers,
                json={
                    "action": "appendNode",
                    "action_mode": "child",
                    "type": "DOC",
                    "doc_ids": [doc_id],
                },
            )
            if toc_update_resp.status_code >= 400:
                logger.warning(f"目录更新失败（文档已创建）：status={toc_update_resp.status_code}, response={toc_update_resp.text}")
            else:
                logger.info(f"目录更新成功：book_id={req.book_id}, doc_id={doc_id}")

            # 第三步：获取文档详情以拿到 namespace
            base_url = api_base.removesuffix("/api/v2")
            doc_url = ""
            detail_resp = await client.get(f"{api_base}/repos/docs/{doc_id}", headers=headers)
            if detail_resp.status_code == 200:
                detail_data = detail_resp.json().get("data", {})
                namespace = detail_data.get("book", {}).get("namespace", "")
                if namespace:
                    doc_url = f"{base_url}/{namespace}/{doc_slug}"
            else:
                logger.warning(f"获取文档详情失败，无法生成 url：status={detail_resp.status_code}")

            return success_response(
                {
                    "id": doc_id,
                    "slug": doc_slug,
                    "title": doc_title,
                    "book_id": doc_data.get("book_id", req.book_id),
                    "url": doc_url,
                    "created_at": doc_data.get("created_at", ""),
                },
                "文档创建成功",
            )

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"创建语雀文档时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")


class DeleteDocsRequest(BaseModel):
    book_id: int = Field(..., description="知识库 ID")
    doc_id: int = Field(..., description="文档 ID")


@router.post("/delete_docs")
async def delete_docs(req: DeleteDocsRequest):
    """删除指定知识库中的文档。token 从系统配置读取。"""
    token = settings.yuque_token
    if not token:
        logger.error("删除语雀文档失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.delete(
                f"{api_base}/repos/{req.book_id}/docs/{req.doc_id}",
                headers=headers,
            )
            if resp.status_code == 401:
                logger.error("语雀 Token 验证失败：401 Unauthorized")
                return error_response(401, "语雀 Token 无效或已过期，请检查配置")
            if resp.status_code == 404:
                logger.error(f"删除语雀文档失败：文档不存在 book_id={req.book_id}, doc_id={req.doc_id}")
                return error_response(404, f"文档不存在：book_id={req.book_id}, doc_id={req.doc_id}")
            if resp.status_code >= 400:
                logger.error(f"删除语雀文档失败：status={resp.status_code}, response={resp.text}")
                return error_response(resp.status_code, f"删除文档失败：{resp.text}")

            logger.info(f"文档删除成功：book_id={req.book_id}, doc_id={req.doc_id}")
            return success_response({"book_id": req.book_id, "doc_id": req.doc_id}, "文档删除成功")

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"删除语雀文档时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")


class UpdateDocsRequest(BaseModel):
    book_id: int = Field(..., description="知识库 ID")
    doc_id: int = Field(..., description="文档 ID")
    title: str = Field(default="", description="文档标题（可选）")
    body: str = Field(default="", description="文档内容（可选）")
    format: str = Field(default="", description="文档格式：markdown / lake / html（可选）")
    slug: str = Field(default="", description="文档路径（可选）")
    public: int | None = Field(default=None, description="是否公开：0=私密 1=公开 2=企业内公开（可选）")


@router.post("/update_docs")
async def update_docs(req: UpdateDocsRequest):
    """更新指定知识库中的文档。token 从系统配置读取，只更新传入的字段。"""
    token = settings.yuque_token
    if not token:
        logger.error("更新语雀文档失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # 只更新传入的字段
            payload: dict = {}
            if req.title:
                payload["title"] = req.title
            if req.body:
                payload["body"] = req.body
            if req.format:
                payload["format"] = req.format
            if req.slug:
                payload["slug"] = req.slug
            if req.public is not None:
                payload["public"] = req.public

            if not payload:
                logger.error("更新语雀文档失败：未提供任何更新字段")
                return error_response(400, "至少需要提供一个更新字段（title/body/format/slug/public）")

            resp = await client.put(
                f"{api_base}/repos/{req.book_id}/docs/{req.doc_id}",
                headers=headers,
                json=payload,
            )
            if resp.status_code == 401:
                logger.error("语雀 Token 验证失败：401 Unauthorized")
                return error_response(401, "语雀 Token 无效或已过期，请检查配置")
            if resp.status_code == 404:
                logger.error(f"更新语雀文档失败：文档不存在 book_id={req.book_id}, doc_id={req.doc_id}")
                return error_response(404, f"文档不存在：book_id={req.book_id}, doc_id={req.doc_id}")
            if resp.status_code >= 400:
                logger.error(f"更新语雀文档失败：status={resp.status_code}, response={resp.text}")
                return error_response(resp.status_code, f"更新文档失败：{resp.text}")

            doc_data = resp.json()["data"]
            base_url = api_base.removesuffix("/api/v2")
            logger.info(f"文档更新成功：id={doc_data['id']}, title={doc_data['title']}, book_id={req.book_id}")
            return success_response(
                {
                    "id": doc_data["id"],
                    "slug": doc_data["slug"],
                    "title": doc_data["title"],
                    "book_id": doc_data.get("book_id", req.book_id),
                    "url": f"{base_url}/{doc_data.get('book', {}).get('namespace', '')}/{doc_data['slug']}",
                    "updated_at": doc_data.get("updated_at", ""),
                },
                "文档更新成功",
            )

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"更新语雀文档时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")


class GetDocsRequest(BaseModel):
    doc_id: int = Field(..., description="文档 ID")
    raw: int = Field(default=0, description="是否返回原始内容：0=HTML 1=Markdown/Lake 原文")


@router.post("/get_docs")
async def get_docs(req: GetDocsRequest):
    """获取文档详情。token 从系统配置读取。"""
    token = settings.yuque_token
    if not token:
        logger.error("获取语雀文档失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{api_base}/repos/docs/{req.doc_id}",
                headers=headers,
                params={"raw": req.raw},
            )
            if resp.status_code == 401:
                logger.error("语雀 Token 验证失败：401 Unauthorized")
                return error_response(401, "语雀 Token 无效或已过期，请检查配置")
            if resp.status_code == 404:
                logger.error(f"获取语雀文档失败：文档不存在 doc_id={req.doc_id}")
                return error_response(404, f"文档不存在：{req.doc_id}")
            if resp.status_code >= 400:
                logger.error(f"获取语雀文档失败：status={resp.status_code}, response={resp.text}")
                return error_response(resp.status_code, f"获取文档失败：{resp.text}")

            doc_data = resp.json()["data"]
            base_url = api_base.removesuffix("/api/v2")
            logger.info(f"获取文档成功：id={doc_data['id']}, title={doc_data['title']}")
            return success_response(
                {
                    "id": doc_data["id"],
                    "slug": doc_data["slug"],
                    "title": doc_data["title"],
                    "book_id": doc_data.get("book_id"),
                    "format": doc_data.get("format", ""),
                    "body": doc_data.get("body", ""),
                    "body_html": doc_data.get("body_html", ""),
                    "public": doc_data.get("public", 0),
                    "url": f"{base_url}/{doc_data.get('book', {}).get('namespace', '')}/{doc_data['slug']}",
                    "created_at": doc_data.get("created_at", ""),
                    "updated_at": doc_data.get("updated_at", ""),
                },
                "获取文档成功",
            )

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"获取语雀文档时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")


class GetRepoDocsRequest(BaseModel):
    book_id: int = Field(..., description="知识库 ID")


@router.post("/get_repo_docs")
async def get_repo_docs(req: GetRepoDocsRequest):
    """获取指定知识库的文档列表。token 从系统配置读取。"""
    token = settings.yuque_token
    if not token:
        logger.error("获取知识库文档列表失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{api_base}/repos/{req.book_id}/docs",
                headers=headers,
            )
            if resp.status_code == 401:
                logger.error("语雀 Token 验证失败：401 Unauthorized")
                return error_response(401, "语雀 Token 无效或已过期，请检查配置")
            if resp.status_code == 404:
                logger.error(f"获取知识库文档列表失败：知识库不存在 book_id={req.book_id}")
                return error_response(404, f"知识库不存在：{req.book_id}")
            if resp.status_code >= 400:
                logger.error(f"获取知识库文档列表失败：status={resp.status_code}, response={resp.text}")
                return error_response(resp.status_code, f"获取文档列表失败：{resp.text}")

            raw_list = resp.json().get("data", [])
            base_url = api_base.removesuffix("/api/v2")
            docs = [
                {
                    "id": d["id"],
                    "slug": d["slug"],
                    "title": d["title"],
                    "book_id": d.get("book_id", req.book_id),
                    # "format": d.get("format", ""),
                    "public": d.get("public", 0),
                    # "url": f"{base_url}/{d.get('book', {}).get('namespace', '')}/{d['slug']}" if d.get("book") else "",
                    "created_at": d.get("created_at", ""),
                    "updated_at": d.get("updated_at", ""),
                }
                for d in raw_list
            ]
            logger.info(f"获取文档列表成功：book_id={req.book_id}, total={len(docs)}")
            return success_response(
                {"total": len(docs), "book_id": req.book_id, "list": docs},
                "获取文档列表成功",
            )

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"获取知识库文档列表时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")


class SearchRepoRequest(BaseModel):
    q: str = Field(..., description="搜索关键词")
    page: int | None = Field(default=None, ge=1, description="页码，从 1 开始（可选）")
    page_size: int | None = Field(default=None, ge=1, le=100, description="每页数量，最大 100（可选）")


@router.post("/search_repo")
async def search_repo(req: SearchRepoRequest):
    """搜索语雀知识库。对应语雀接口：GET /api/v2/search?q=:q&type=repo"""
    token = settings.yuque_token
    if not token:
        logger.error("搜索语雀知识库失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            params: dict = {"q": req.q, "type": "repo"}
            if req.page is not None and req.page_size is not None:
                params["offset"] = (req.page - 1) * req.page_size
                params["limit"] = req.page_size
            elif req.page_size is not None:
                params["offset"] = 0
                params["limit"] = req.page_size

            resp = await client.get(
                f"{api_base}/search",
                headers=headers,
                params=params,
            )
            if resp.status_code == 401:
                logger.error("语雀 Token 验证失败：401 Unauthorized")
                return error_response(401, "语雀 Token 无效或已过期，请检查配置")
            if resp.status_code >= 400:
                logger.error(f"搜索语雀知识库失败：status={resp.status_code}, response={resp.text}")
                return error_response(resp.status_code, f"搜索知识库失败：{resp.text}")

            raw_list = resp.json().get("data", [])
            base_url = api_base.removesuffix("/api/v2")
            repos = [
                {
                    "id": r.get("target", {}).get("id"),
                    "name": r.get("target", {}).get("name", ""),
                    "slug": r.get("target", {}).get("slug", ""),
                    "namespace": r.get("target", {}).get("namespace", ""),
                    "description": r.get("target", {}).get("description", ""),
                    "public": r.get("target", {}).get("public", 0),
                    "url": f"{base_url}/{r['target']['namespace']}" if r.get("target", {}).get("namespace") else "",
                    "updated_at": r.get("target", {}).get("updated_at", ""),
                }
                for r in raw_list
            ]
            logger.info(f"搜索知识库成功：q={req.q}, total={len(repos)}")
            return success_response(
                {"total": len(repos), "q": req.q, "list": repos},
                "搜索知识库成功",
            )

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"搜索语雀知识库时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")


class SearchDocsRequest(BaseModel):
    q: str = Field(..., description="搜索关键词")
    book_id: int | None = Field(default=None, description="限定在指定知识库中搜索（可选）")
    page: int | None = Field(default=None, ge=1, description="页码，从 1 开始（可选）")
    page_size: int | None = Field(default=None, ge=1, le=100, description="每页数量，最大 100（可选）")


@router.post("/search_docs")
async def search_docs(req: SearchDocsRequest):
    """搜索语雀文档。
    - 未传 book_id：调用 GET /api/v2/search?q=:q&type=doc 全局搜索
    - 传了 book_id：拉取 GET /api/v2/repos/:book_id/docs 全量列表后本地关键词过滤
    """
    token = settings.yuque_token
    if not token:
        logger.error("搜索语雀文档失败：未配置 yuque_token")
        return error_response(400, "未配置语雀 Token，请在系统设置中填写 yuque_token")

    api_base = settings.yuque_api_base
    base_url = api_base.removesuffix("/api/v2")
    headers = {
        "X-Auth-Token": token,
        "Content-Type": "application/json",
        "User-Agent": "Synapse",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # ── 按知识库搜索：拉取全量文档后本地过滤 ──────────────────────────
            if req.book_id is not None:
                resp = await client.get(
                    f"{api_base}/repos/{req.book_id}/docs",
                    headers=headers,
                )
                if resp.status_code == 401:
                    logger.error("语雀 Token 验证失败：401 Unauthorized")
                    return error_response(401, "语雀 Token 无效或已过期，请检查配置")
                if resp.status_code == 404:
                    logger.error(f"搜索语雀文档失败：知识库不存在 book_id={req.book_id}")
                    return error_response(404, f"知识库不存在：{req.book_id}")
                if resp.status_code >= 400:
                    logger.error(f"搜索语雀文档失败：status={resp.status_code}, response={resp.text}")
                    return error_response(resp.status_code, f"搜索文档失败：{resp.text}")

                keyword = req.q.lower()
                raw_list = resp.json().get("data", [])
                matched = [
                    d for d in raw_list
                    if keyword in d.get("title", "").lower()
                    or keyword in d.get("description", "").lower()
                ]

                # 分页（本地截取）
                if req.page is not None and req.page_size is not None:
                    offset = (req.page - 1) * req.page_size
                    matched = matched[offset: offset + req.page_size]
                elif req.page_size is not None:
                    matched = matched[: req.page_size]

                docs = [
                    {
                        "id": d.get("id"),
                        "slug": d.get("slug", ""),
                        "title": d.get("title", ""),
                        "book_id": d.get("book_id", req.book_id),
                        "description": d.get("description", ""),
                        "url": f"{base_url}/{d.get('book', {}).get('namespace', '')}/{d['slug']}" if d.get("book") else "",
                        "updated_at": d.get("updated_at", ""),
                    }
                    for d in matched
                ]

            # ── 全局搜索：调用语雀搜索接口 ────────────────────────────────────
            else:
                params: dict = {"q": req.q, "type": "doc"}
                if req.page is not None and req.page_size is not None:
                    params["offset"] = (req.page - 1) * req.page_size
                    params["limit"] = req.page_size
                elif req.page_size is not None:
                    params["offset"] = 0
                    params["limit"] = req.page_size

                resp = await client.get(
                    f"{api_base}/search",
                    headers=headers,
                    params=params,
                )
                if resp.status_code == 401:
                    logger.error("语雀 Token 验证失败：401 Unauthorized")
                    return error_response(401, "语雀 Token 无效或已过期，请检查配置")
                if resp.status_code >= 400:
                    logger.error(f"搜索语雀文档失败：status={resp.status_code}, response={resp.text}")
                    return error_response(resp.status_code, f"搜索文档失败：{resp.text}")

                raw_list = resp.json().get("data", [])
                docs = [
                    {
                        "id": d.get("target", {}).get("id"),
                        "slug": d.get("target", {}).get("slug", ""),
                        "title": d.get("target", {}).get("title", ""),
                        "book_id": d.get("target", {}).get("book_id"),
                        "description": d.get("target", {}).get("description", ""),
                        "url": f"{base_url}/{d['target']['namespace']}" if d.get("target", {}).get("namespace") else "",
                        "updated_at": d.get("target", {}).get("updated_at", ""),
                    }
                    for d in raw_list
                ]

            logger.info(f"搜索文档成功：q={req.q}, book_id={req.book_id}, total={len(docs)}")
            return success_response(
                {"total": len(docs), "q": req.q, "list": docs},
                "搜索文档成功",
            )

    except httpx.TimeoutException as exc:
        logger.error(f"请求语雀 API 超时：{exc}")
        return error_response(504, "请求语雀 API 超时，请稍后重试")
    except httpx.ConnectError as exc:
        logger.error(f"无法连接语雀服务器：{exc}")
        return error_response(502, f"无法连接语雀服务器：{exc}")
    except Exception as exc:
        logger.error(f"搜索语雀文档时发生未知错误：{exc}", exc_info=True)
        return error_response(500, f"服务器内部错误：{exc}")
