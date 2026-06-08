import os

import pytest
import httpx


@pytest.fixture
async def client():
    """
    真实 E2E 客户端：
    - 直接连到已在外部启动的 Synapse HTTP 服务
    - 默认地址: http://127.0.0.1:18900
    - 可通过环境变量 TEST_API_BASE_URL 覆盖
    """
    base_url = os.environ.get("TEST_API_BASE_URL", "http://127.0.0.1:18900").rstrip("/")
    async with httpx.AsyncClient(base_url=base_url, timeout=60) as c:
        yield c


class TestGitNexusEndpoint:
    async def test_gitnexus_forwards_request_to_mcp(self, client):
        """
        真实链路测试：
        - 假定 Synapse 服务已在 base_url 上启动
        - 假定 settings.gitnexus_mcp_base_url 已正确指向 MCP 后端
        - 打印请求和响应，便于调试
        """

        # 前端示例请求体（与你给的示例保持一致）
        body = {
            "goal": "查询Datachange的核心模块",
            "limit": 10,
            "query": "Datachange 核心 function",
            "repo": "ZMDB",
        }

        full_url = f"{client.base_url}/api/gitnexus/query"
        print(f"\n[GitNexus] 将要请求的完整 URL: {full_url}")
        print("[GitNexus] 请求 /api/gitnexus/query 的 body:")
        print(body)

        resp = await client.post("/api/gitnexus/query", json=body)

        # 打印响应详情
        print(f"\n[GitNexus] 响应状态码: {resp.status_code}")
        content_type = resp.headers.get("content-type", "")
        print(f"[GitNexus] 响应 Content-Type: {content_type}")

        try:
            data = resp.json()
            print("[GitNexus] 响应 JSON:")
            print(data)
        except Exception:
            text = resp.text
            print("[GitNexus] 响应非 JSON 文本内容:")
            print(text)
            # 既然要求严格 200，这里也失败，让你看到具体返回内容
            assert False, f"GitNexus 响应非 JSON，状态码={resp.status_code}, 内容={text!r}"

        # 严格要求 HTTP 状态码为 200
        assert resp.status_code == 200

    async def test_gitnexus_cypher_forwards_request_to_mcp(self, client):
        """
        真实链路测试（Cypher）：
        - 调用 /api/gitnexus/cypher
        - 验证能成功转发到 MCP cypher 工具
        """

        body = {
            "query": "MATCH (f:File) WHERE f.filePath CONTAINS 'WebMonitor' RETURN f.name LIMIT 50",
            "repo": "zmdb",
        }

        full_url = f"{client.base_url}/api/gitnexus/cypher"
        print(f"\n[GitNexus] 将要请求的完整 URL: {full_url}")
        print("[GitNexus] 请求 /api/gitnexus/cypher 的 body:")
        print(body)

        resp = await client.post("/api/gitnexus/cypher", json=body)

        print(f"\n[GitNexus] Cypher 响应状态码: {resp.status_code}")
        content_type = resp.headers.get("content-type", "")
        print(f"[GitNexus] Cypher 响应 Content-Type: {content_type}")

        try:
            data = resp.json()
            print("[GitNexus] Cypher 响应 JSON:")
            print(data)
        except Exception:
            text = resp.text
            print("[GitNexus] Cypher 响应非 JSON 文本内容:")
            print(text)
            assert False, f"GitNexus Cypher 响应非 JSON，状态码={resp.status_code}, 内容={text!r}"

        assert resp.status_code == 200

    async def test_gitnexus_context_forwards_request_to_mcp(self, client):
        """
        真实链路测试（Context）：
        - 调用 /api/gitnexus/context
        - 验证能成功转发到 MCP context 工具
        """

        body = {
            "name": "mdbWebMonitor.cpp",
            "repo": "zmdb",
        }

        full_url = f"{client.base_url}/api/gitnexus/context"
        print(f"\n[GitNexus] 将要请求的完整 URL: {full_url}")
        print("[GitNexus] 请求 /api/gitnexus/context 的 body:")
        print(body)

        resp = await client.post("/api/gitnexus/context", json=body)

        print(f"\n[GitNexus] Context 响应状态码: {resp.status_code}")
        content_type = resp.headers.get("content-type", "")
        print(f"[GitNexus] Context 响应 Content-Type: {content_type}")

        try:
            data = resp.json()
            print("[GitNexus] Context 响应 JSON:")
            print(data)
        except Exception:
            text = resp.text
            print("[GitNexus] Context 响应非 JSON 文本内容:")
            print(text)
            assert False, f"GitNexus Context 响应非 JSON，状态码={resp.status_code}, 内容={text!r}"

        assert resp.status_code == 200

    async def test_gitnexus_impact_forwards_request_to_mcp(self, client):
        """
        真实链路测试（Impact）：
        - 调用 /api/gitnexus/impact
        - 验证能成功转发到 MCP impact 工具
        """

        body = {
            "target": "TZmdbDSN",
            "direction": "downstream",
            "maxDepth": 1,
            "repo": "zmdb",
        }

        full_url = f"{client.base_url}/api/gitnexus/impact"
        print(f"\n[GitNexus] 将要请求的完整 URL: {full_url}")
        print("[GitNexus] 请求 /api/gitnexus/impact 的 body:")
        print(body)

        resp = await client.post("/api/gitnexus/impact", json=body)

        print(f"\n[GitNexus] Impact 响应状态码: {resp.status_code}")
        content_type = resp.headers.get("content-type", "")
        print(f"[GitNexus] Impact 响应 Content-Type: {content_type}")

        try:
            data = resp.json()
            print("[GitNexus] Impact 响应 JSON:")
            print(data)
        except Exception:
            text = resp.text
            print("[GitNexus] Impact 响应非 JSON 文本内容:")
            print(text)
            assert False, f"GitNexus Impact 响应非 JSON，状态码={resp.status_code}, 内容={text!r}"

        assert resp.status_code == 200

    async def test_gitnexus_detect_changes_forwards_request_to_mcp(self, client):
        """
        真实链路测试（DetectChanges）：
        - 调用 /api/gitnexus/detect_changes
        - 验证能成功转发到 MCP detect_changes 工具
        """

        body = {
            "scope": "unstaged",
            "repo": "zmdb",
        }

        full_url = f"{client.base_url}/api/gitnexus/detect_changes"
        print(f"\n[GitNexus] 将要请求的完整 URL: {full_url}")
        print("[GitNexus] 请求 /api/gitnexus/detect_changes 的 body:")
        print(body)

        resp = await client.post("/api/gitnexus/detect_changes", json=body)

        print(f"\n[GitNexus] DetectChanges 响应状态码: {resp.status_code}")
        content_type = resp.headers.get("content-type", "")
        print(f"[GitNexus] DetectChanges 响应 Content-Type: {content_type}")

        try:
            data = resp.json()
            print("[GitNexus] DetectChanges 响应 JSON:")
            print(data)
        except Exception:
            text = resp.text
            print("[GitNexus] DetectChanges 响应非 JSON 文本内容:")
            print(text)
            assert False, f"GitNexus DetectChanges 响应非 JSON，状态码={resp.status_code}, 内容={text!r}"

        assert resp.status_code == 200

    async def test_gitnexus_list_repos_forwards_request_to_mcp(self, client):
        """
        真实链路测试（ListRepos）：
        - 调用 /api/gitnexus/list_repos
        - 验证能成功转发到 MCP list_repos 工具
        """

        body = {}

        full_url = f"{client.base_url}/api/gitnexus/list_repos"
        print(f"\n[GitNexus] 将要请求的完整 URL: {full_url}")
        print("[GitNexus] 请求 /api/gitnexus/list_repos 的 body:")
        print(body)

        resp = await client.post("/api/gitnexus/list_repos", json=body)

        print(f"\n[GitNexus] ListRepos 响应状态码: {resp.status_code}")
        content_type = resp.headers.get("content-type", "")
        print(f"[GitNexus] ListRepos 响应 Content-Type: {content_type}")

        try:
            data = resp.json()
            print("[GitNexus] ListRepos 响应 JSON:")
            print(data)
        except Exception:
            text = resp.text
            print("[GitNexus] ListRepos 响应非 JSON 文本内容:")
            print(text)
            assert False, f"GitNexus ListRepos 响应非 JSON，状态码={resp.status_code}, 内容={text!r}"

        assert resp.status_code == 200

    async def test_gitnexus_localgit_forwards_request_to_backend(self, client):
        """
        真实链路测试（LocalGit）：
        - 调用 /api/gitnexus/localgit
        - 验证能成功转发到后端 /api/repos/clone-analyze
        """

        body = {
            "url": "https://git-nj.iwhalecloud.com/xmjfbss/ZMDB.git",
            "token": "42743476cf17e7971f0870532a673ec1c1a52520",
        }

        full_url = f"{client.base_url}/api/gitnexus/localgit"
        print(f"\n[GitNexus] 将要请求的完整 URL: {full_url}")
        print("[GitNexus] 请求 /api/gitnexus/localgit 的 body:")
        print(body)

        # 使用 httpx 的流式接口，逐块打印，直观观察 SSE 行为
        async with client.stream("POST", "/api/gitnexus/localgit", json=body) as resp:
            print(f"\n[GitNexus] LocalGit 响应状态码: {resp.status_code}")
            content_type = resp.headers.get("content-type", "")
            print(f"[GitNexus] LocalGit 响应 Content-Type: {content_type}")

            print("[GitNexus] LocalGit 流式响应开始：")
            async for chunk in resp.aiter_text():
                if not chunk:
                    continue
                # 逐块原样打印，确保完整输出
                print(chunk, end="")

            print("\n[GitNexus] LocalGit 流式响应结束。")

            assert resp.status_code == 200
            assert "text/event-stream" in (content_type or "")


