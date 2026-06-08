"""
GitNexus proxy route:

- Frontend: POST /api/gitnexus/query
  Body: {"goal": "...", "limit": 10, "query": "...", "repo": "..."}

- Backend: POST /api/mcp  (JSON-RPC 2.0: tools/call → query)
  Body: {
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "query",
      "arguments": { ... same as frontend body ... }
    }
  }

The endpoint is synchronous: it waits for the backend response
and returns it directly to the frontend.
"""

from __future__ import annotations

import logging
import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from synapse.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# MCP 协议要求的 Accept 头：同时接受 JSON 和 SSE
MCP_ACCEPT_HEADER = "application/json, text/event-stream"


class GitNexusQueryRequest(BaseModel):
    goal: str
    limit: int
    query: str
    repo: str


class GitNexusCypherRequest(BaseModel):
    query: str
    repo: str


class GitNexusContextRequest(BaseModel):
    name: str
    repo: str


class GitNexusImpactRequest(BaseModel):
    target: str
    direction: str
    maxDepth: int
    repo: str


class GitNexusDetectChangesRequest(BaseModel):
    scope: str
    repo: str


class GitNexusListReposRequest(BaseModel):
    """列出仓库列表（无参数）。"""

    pass


class GitNexusLocalGitRequest(BaseModel):
    url: str
    token: str


def _build_backend_payload(body: GitNexusQueryRequest) -> dict:
    """构造发往后端 /api/mcp 的 JSON-RPC 请求体。"""
    return {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
            "name": "query",
            "arguments": body.model_dump(),
        },
    }


def _build_cypher_payload(body: GitNexusCypherRequest) -> dict:
    """构造发往后端 /api/mcp 的 JSON-RPC cypher 请求体。"""
    return {
        "jsonrpc": "2.0",
        "id": 5,
        "method": "tools/call",
        "params": {
            "name": "cypher",
            "arguments": body.model_dump(),
        },
    }


def _build_context_payload(body: GitNexusContextRequest) -> dict:
    """构造发往后端 /api/mcp 的 JSON-RPC context 请求体。"""
    return {
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": {
            "name": "context",
            "arguments": body.model_dump(),
        },
    }


def _build_impact_payload(body: GitNexusImpactRequest) -> dict:
    """构造发往后端 /api/mcp 的 JSON-RPC impact 请求体。"""
    return {
        "jsonrpc": "2.0",
        "id": 6,
        "method": "tools/call",
        "params": {
            "name": "impact",
            "arguments": body.model_dump(),
        },
    }


def _build_detect_changes_payload(body: GitNexusDetectChangesRequest) -> dict:
    """构造发往后端 /api/mcp 的 JSON-RPC detect_changes 请求体。"""
    return {
        "jsonrpc": "2.0",
        "id": 7,
        "method": "tools/call",
        "params": {
            "name": "detect_changes",
            "arguments": body.model_dump(),
        },
    }


def _build_list_repos_payload(_: GitNexusListReposRequest | None = None) -> dict:
    """构造发往后端 /api/mcp 的 JSON-RPC list_repos 请求体。"""
    return {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "list_repos",
            "arguments": {},
        },
    }


def _get_backend_url(request: Request) -> str:
    """获取后端 MCP 服务的 URL。

    行为：
    1. 优先从 Synapse 配置 settings.gitnexus_mcp_base_url 读取，例如：
       - http://127.0.0.1:18080
       - https://your-backend-host
    2. 若未设置（为空），则固定回退到 http://127.0.0.1:18900/api/mcp，
       并输出日志，方便排查配置问题。
    """
    base = (getattr(settings, "gitnexus_mcp_base_url", "") or "").strip().rstrip("/")
    if not base:
        # 使用默认 Synapse API 地址，并输出告警日志方便排查
        base = "http://127.0.0.1:18900"
        logger.warning(
            "GitNexus backend URL not configured (settings.gitnexus_mcp_base_url is empty), "
            "falling back to default %s",
            base,
        )
    return f"{base}/api/mcp"


def _get_backend_base_url(request: Request) -> str:
    """获取后端 GitNexus 基础 URL（无具体路径，仅 host+port）。

    逻辑与 _get_backend_url 一致，只是不拼接 /api/mcp，便于复用到
    其它非 MCP JSON-RPC 风格的转发接口（如 /api/repos/clone-analyze）。
    """
    mcp_url = _get_backend_url(request)
    # mcp_url 形如 {base}/api/mcp
    if mcp_url.endswith("/api/mcp"):
        return mcp_url[: -len("/api/mcp")]
    return mcp_url.rstrip("/")


async def _init_mcp_session(client: httpx.AsyncClient, backend_url: str) -> str:
    """为每次 GitNexus 请求初始化一个 MCP 会话，并返回 mcp-session-id。

    步骤：
    1. 调用 initialize，固定请求体；
    2. 从响应头中读取 mcp-session-id；
    3. 使用该 session id 调用 notifications/initialized，期望 202。
    """
    # 1) initialize
    init_payload = {
        "jsonrpc": "2.0",
        "id": 0,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "postman", "version": "1.0.0"},
        },
    }
    logger.info("GitNexus MCP initialize: url=%s", backend_url)
    init_resp = await client.post(
        backend_url,
        json=init_payload,
        headers={"Accept": MCP_ACCEPT_HEADER},
    )
    if init_resp.status_code >= 400:
        # 直接把 MCP 的错误透传出去，便于调试
        try:
            data = init_resp.json()
        except Exception:
            data = {"raw": init_resp.text}
        logger.error(
            "GitNexus MCP initialize failed: status=%s, body=%s",
            init_resp.status_code,
            data,
        )
        raise HTTPException(
            status_code=502,
            detail={
                "stage": "initialize",
                "status": init_resp.status_code,
                "error": data,
            },
        )

    session_id = init_resp.headers.get("mcp-session-id")
    if not session_id:
        logger.error("GitNexus MCP initialize missing mcp-session-id header")
        raise HTTPException(
            status_code=502,
            detail={"stage": "initialize", "error": "missing mcp-session-id header"},
        )

    # 3) notifications/initialized
    notify_payload = {
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
    }
    logger.info("GitNexus MCP notifications/initialized: url=%s, session=%s", backend_url, session_id)
    notify_resp = await client.post(
        backend_url,
        json=notify_payload,
        headers={
            "Accept": MCP_ACCEPT_HEADER,
            "mcp-session-id": session_id,
        },
    )
    if notify_resp.status_code != 202:
        try:
            data = notify_resp.json()
        except Exception:
            data = {"raw": notify_resp.text}
        logger.error(
            "GitNexus MCP notifications/initialized failed: status=%s, body=%s",
            notify_resp.status_code,
            data,
        )
        raise HTTPException(
            status_code=502,
            detail={
                "stage": "notifications/initialized",
                "status": notify_resp.status_code,
                "error": data,
            },
        )

    return session_id


async def _delete_mcp_session(client: httpx.AsyncClient, backend_url: str, session_id: str) -> None:
    """删除指定的 MCP 会话（最佳努力，不影响主流程）。"""
    delete_url = backend_url.rstrip("/") + f"/sessions/{session_id}"
    try:
        logger.info("GitNexus MCP delete session: url=%s", delete_url)
        resp = await client.delete(
            delete_url,
            headers={
                "Accept": MCP_ACCEPT_HEADER,
                "mcp-session-id": session_id,
            },
        )
        if resp.status_code >= 400:
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}
            logger.warning(
                "GitNexus MCP delete session failed: status=%s, body=%s",
                resp.status_code,
                data,
            )
    except Exception as e:  # pragma: no cover - 网络/环境相关
        logger.warning("GitNexus MCP delete session error: %s", e, exc_info=True)


@router.post("/api/gitnexus/query")
async def gitnexus_query(body: GitNexusQueryRequest, request: Request):
    """GitNexus 查询接口：转发到后端 MCP /api/mcp。

    1. 接收前端 JSON 请求体
    2. 封装为 JSON-RPC 2.0 tools/call(query)
    3. 使用 HTTP POST 同步调用后端 /api/mcp
    4. 将后端响应（状态码 & 内容）原样转发给前端
    """
    backend_url = _get_backend_url(request)
    payload = _build_backend_payload(body)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # 每次请求都先初始化 MCP 会话并激活 session
            session_id = await _init_mcp_session(client, backend_url)

            logger.info(
                "GitNexus forwarding to MCP backend: url=%s, Accept=%s, session=%s",
                backend_url,
                MCP_ACCEPT_HEADER,
                session_id,
            )
            try:
                resp = await client.post(
                    backend_url,
                    json=payload,
                    headers={
                        "Accept": MCP_ACCEPT_HEADER,
                        "mcp-session-id": session_id,
                    },
                )
            finally:
                # 响应准备好后，尝试删除会话（不影响主流程）
                await _delete_mcp_session(client, backend_url, session_id)
    except Exception as e:  # pragma: no cover - 网络/环境相关
        logger.error("GitNexus backend request failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to reach MCP backend: {e}")

    # 尝试解析为 JSON；若失败则按纯文本透传
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type.lower():
        try:
            data = resp.json()
        except Exception:
            # 后端返回了 JSON Content-Type 但内容解析失败，降级为文本
            data = {"raw": resp.text}
    else:
        # 非 JSON，包装为统一结构
        data = {"raw": resp.text}

    return JSONResponse(status_code=resp.status_code, content=data)


@router.post("/api/gitnexus/cypher")
async def gitnexus_cypher(body: GitNexusCypherRequest, request: Request):
    """GitNexus Cypher 查询接口：转发到后端 MCP /api/mcp。

    前端：
        POST /api/gitnexus/cypher
        Body: {"query": "....", "repo": "...."}

    后端：
        POST /api/mcp
        Body: {
          "jsonrpc": "2.0",
          "id": 5,
          "method": "tools/call",
          "params": {
            "name": "cypher",
            "arguments": { "query": "...", "repo": "..." }
          }
        }

    每次请求都会：
    1. initialize → 获取 mcp-session-id
    2. notifications/initialized 激活会话
    3. 携带 mcp-session-id 调用 cypher 工具
    4. 最后尝试删除该 session
    """
    backend_url = _get_backend_url(request)
    payload = _build_cypher_payload(body)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # 每次请求都先初始化 MCP 会话并激活 session
            session_id = await _init_mcp_session(client, backend_url)

            logger.info(
                "GitNexus forwarding cypher to MCP backend: url=%s, Accept=%s, session=%s",
                backend_url,
                MCP_ACCEPT_HEADER,
                session_id,
            )
            try:
                resp = await client.post(
                    backend_url,
                    json=payload,
                    headers={
                        "Accept": MCP_ACCEPT_HEADER,
                        "mcp-session-id": session_id,
                    },
                )
            finally:
                # 响应准备好后，尝试删除会话（不影响主流程）
                await _delete_mcp_session(client, backend_url, session_id)
    except Exception as e:  # pragma: no cover - 网络/环境相关
        logger.error("GitNexus backend cypher request failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to reach MCP backend: {e}")

    # 尝试解析为 JSON；若失败则按纯文本透传
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type.lower():
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
    else:
        data = {"raw": resp.text}

    return JSONResponse(status_code=resp.status_code, content=data)


@router.post("/api/gitnexus/context")
async def gitnexus_context(body: GitNexusContextRequest, request: Request):
    """GitNexus Context 查询接口：转发到后端 MCP /api/mcp。

    前端：
        POST /api/gitnexus/context
        Body: {
          "name": "mdbWebMonitor.cpp",
          "repo": "zmdb"
        }

    后端：
        POST /api/mcp
        Body: {
          "jsonrpc": "2.0",
          "id": 4,
          "method": "tools/call",
          "params": {
            "name": "context",
            "arguments": {
              "name": "mdbWebMonitor.cpp",
              "repo": "zmdb"
            }
          }
        }

    每次请求都会：
    1. initialize → 获取 mcp-session-id
    2. notifications/initialized 激活会话
    3. 携带 mcp-session-id 调用 context 工具
    4. 最后尝试删除该 session
    """
    backend_url = _get_backend_url(request)
    payload = _build_context_payload(body)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # 每次请求都先初始化 MCP 会话并激活 session
            session_id = await _init_mcp_session(client, backend_url)

            logger.info(
                "GitNexus forwarding context to MCP backend: url=%s, Accept=%s, session=%s",
                backend_url,
                MCP_ACCEPT_HEADER,
                session_id,
            )
            try:
                resp = await client.post(
                    backend_url,
                    json=payload,
                    headers={
                        "Accept": MCP_ACCEPT_HEADER,
                        "mcp-session-id": session_id,
                    },
                )
            finally:
                # 响应准备好后，尝试删除会话（不影响主流程）
                await _delete_mcp_session(client, backend_url, session_id)
    except Exception as e:  # pragma: no cover - 网络/环境相关
        logger.error("GitNexus backend context request failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to reach MCP backend: {e}")

    # 尝试解析为 JSON；若失败则按纯文本透传
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type.lower():
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
    else:
        data = {"raw": resp.text}

    return JSONResponse(status_code=resp.status_code, content=data)


@router.post("/api/gitnexus/impact")
async def gitnexus_impact(body: GitNexusImpactRequest, request: Request):
    """GitNexus Impact 分析接口：转发到后端 MCP /api/mcp。

    前端：
        POST /api/gitnexus/impact
        Body: {
          "target": "TZmdbDSN",
          "direction": "downstream",
          "maxDepth": 1,
          "repo": "zmdb"
        }

    后端：
        POST /api/mcp
        Body: {
          "jsonrpc": "2.0",
          "id": 6,
          "method": "tools/call",
          "params": {
            "name": "impact",
            "arguments": {
              "target": "TZmdbDSN",
              "direction": "downstream",
              "maxDepth": 1,
              "repo": "zmdb"
            }
          }
        }

    每次请求都会：
    1. initialize → 获取 mcp-session-id
    2. notifications/initialized 激活会话
    3. 携带 mcp-session-id 调用 impact 工具
    4. 最后尝试删除该 session
    """
    backend_url = _get_backend_url(request)
    payload = _build_impact_payload(body)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # 每次请求都先初始化 MCP 会话并激活 session
            session_id = await _init_mcp_session(client, backend_url)

            logger.info(
                "GitNexus forwarding impact to MCP backend: url=%s, Accept=%s, session=%s",
                backend_url,
                MCP_ACCEPT_HEADER,
                session_id,
            )
            try:
                resp = await client.post(
                    backend_url,
                    json=payload,
                    headers={
                        "Accept": MCP_ACCEPT_HEADER,
                        "mcp-session-id": session_id,
                    },
                )
            finally:
                # 响应准备好后，尝试删除会话（不影响主流程）
                await _delete_mcp_session(client, backend_url, session_id)
    except Exception as e:  # pragma: no cover - 网络/环境相关
        logger.error("GitNexus backend impact request failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to reach MCP backend: {e}")

    # 尝试解析为 JSON；若失败则按纯文本透传
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type.lower():
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
    else:
        data = {"raw": resp.text}

    return JSONResponse(status_code=resp.status_code, content=data)


@router.post("/api/gitnexus/detect_changes")
async def gitnexus_detect_changes(body: GitNexusDetectChangesRequest, request: Request):
    """GitNexus DetectChanges 接口：转发到后端 MCP /api/mcp。

    前端：
        POST /api/gitnexus/detect_changes
        Body: {
          "scope": "unstaged",
          "repo": "zmdb"
        }

    后端：
        POST /api/mcp
        Body: {
          "jsonrpc": "2.0",
          "id": 7,
          "method": "tools/call",
          "params": {
            "name": "detect_changes",
            "arguments": {
              "scope": "unstaged",
              "repo": "zmdb"
            }
          }
        }

    每次请求都会：
    1. initialize → 获取 mcp-session-id
    2. notifications/initialized 激活会话
    3. 携带 mcp-session-id 调用 detect_changes 工具
    4. 最后尝试删除该 session
    """
    backend_url = _get_backend_url(request)
    payload = _build_detect_changes_payload(body)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # 每次请求都先初始化 MCP 会话并激活 session
            session_id = await _init_mcp_session(client, backend_url)

            logger.info(
                "GitNexus forwarding detect_changes to MCP backend: url=%s, Accept=%s, session=%s",
                backend_url,
                MCP_ACCEPT_HEADER,
                session_id,
            )
            try:
                resp = await client.post(
                    backend_url,
                    json=payload,
                    headers={
                        "Accept": MCP_ACCEPT_HEADER,
                        "mcp-session-id": session_id,
                    },
                )
            finally:
                # 响应准备好后，尝试删除会话（不影响主流程）
                await _delete_mcp_session(client, backend_url, session_id)
    except Exception as e:  # pragma: no cover - 网络/环境相关
        logger.error("GitNexus backend detect_changes request failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to reach MCP backend: {e}")

    # 尝试解析为 JSON；若失败则按纯文本透传
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type.lower():
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
    else:
        data = {"raw": resp.text}

    return JSONResponse(status_code=resp.status_code, content=data)


@router.post("/api/gitnexus/list_repos")
async def gitnexus_list_repos(body: GitNexusListReposRequest | None, request: Request):
    """GitNexus ListRepos 接口：转发到后端 MCP /api/mcp。

    前端：
        POST /api/gitnexus/list_repos
        Body: {}

    后端：
        POST /api/mcp
        Body: {
          "jsonrpc": "2.0",
          "id": 2,
          "method": "tools/call",
          "params": {
            "name": "list_repos",
            "arguments": {}
          }
        }

    每次请求都会：
    1. initialize → 获取 mcp-session-id
    2. notifications/initialized 激活会话
    3. 携带 mcp-session-id 调用 list_repos 工具
    4. 最后尝试删除该 session
    """
    backend_url = _get_backend_url(request)
    payload = _build_list_repos_payload(body)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # 每次请求都先初始化 MCP 会话并激活 session
            session_id = await _init_mcp_session(client, backend_url)

            logger.info(
                "GitNexus forwarding list_repos to MCP backend: url=%s, Accept=%s, session=%s",
                backend_url,
                MCP_ACCEPT_HEADER,
                session_id,
            )
            try:
                resp = await client.post(
                    backend_url,
                    json=payload,
                    headers={
                        "Accept": MCP_ACCEPT_HEADER,
                        "mcp-session-id": session_id,
                    },
                )
            finally:
                # 响应准备好后，尝试删除会话（不影响主流程）
                await _delete_mcp_session(client, backend_url, session_id)
    except Exception as e:  # pragma: no cover - 网络/环境相关
        logger.error("GitNexus backend list_repos request failed: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to reach MCP backend: {e}")

    # 尝试解析为 JSON；若失败则按纯文本透传
    content_type = resp.headers.get("content-type", "")
    if "application/json" in content_type.lower():
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
    else:
        data = {"raw": resp.text}

    return JSONResponse(status_code=resp.status_code, content=data)


@router.post("/api/gitnexus/localgit")
async def gitnexus_localgit(body: GitNexusLocalGitRequest, request: Request):
    """GitNexus LocalGit 接口：简单转发到 /api/repos/clone-analyze。

    前端：
        POST /api/gitnexus/localgit
        Body: {
          "url": "https://git-nj.iwhalecloud.com/xmjfbss/ZMDB.git",
          "token": "580854ad41c800ce2c0e6a1862e4e1288420f2ce"
        }

    后端：
        POST {base}/api/repos/clone-analyze
        Body: {
          "url": "...",
          "token": "..."
        }

    规则：
    - 仅修改路径：沿用 gitnexus_mcp_base_url 的 IP+端口，不做 MCP 会话初始化
    - 请求体原样转发
    - 将后端响应（状态码 & 内容）原样返回给前端
    """
    base_url = _get_backend_base_url(request)
    target_url = f"{base_url}/api/repos/clone-analyze"

    logger.info("GitNexus streaming localgit: url=%s", target_url)

    async def event_stream():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", target_url, json=body.model_dump()) as resp:
                    # 这里作为纯粹的 SSE 代理：不再包一层 "data: "，
                    # 直接把后端返回的文本块原样透传给前端。
                    async for chunk in resp.aiter_text():
                        if not chunk:
                            continue
                        yield chunk
        except Exception as e:  # pragma: no cover - 网络/环境相关
            logger.error("GitNexus backend localgit stream error: %s", e, exc_info=True)
            # 以简单文本方式把错误发给前端（仍符合 SSE 文本流容忍度）
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

