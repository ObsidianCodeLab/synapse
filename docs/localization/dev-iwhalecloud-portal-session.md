# 研发云门户会话与 Synapse 代理层

本文说明 `src/synapse/api/routes/dev_iwhalecloud.py` 中**门户 Cookie / CSRF** 与 Synapse 本地缓存的配合方式，以及与上游「请求体携带 token」模型的差异。

## 1. 两类凭据（勿混用）

| 类别 | 存储 | 用途 |
|------|------|------|
| 用户引导登录结果 | `data/userinfo.encryption`（加密） | 研发统一服务 `:10001` 的 `owner_info` 等；内含工号、密码、研发云 API token（Authorization）、Git `access_token`、`userId` |
| 门户浏览器会话 | `data/iwhalecloud_session.json`（明文 JSON） | 转发浩鲸门户 **REST** 时使用的 `x-csrf-token` 与 `Cookie` 请求头 |

## 2. 会话获取与串行

- `_ensure_valid_creds_async()`：若 `iwhalecloud_session.json` 有效则直接返回；否则用 `userinfo.encryption` 解密出的工号/密码，经 **`asyncio.Lock` + `asyncio.to_thread`** 调用 `_fetch_token_and_cookies_sync`（Playwright 登录门户页并抓取 CSRF + Cookie），写入会话文件。
- 与 API Bearer token 无关；注释中已强调勿混用。

## 3. HTTP 失效与重试

- `_portal_response_needs_session_refresh`：对 **401/403** 视为门户会话失效，清缓存并可由调用方重试（例如 `get_project_list` 最多两轮：清会话后再拉凭证）。

## 4. 对外 API 契约（相对旧版）

- 多数原先要求 body 传 `token` / `cookies` 的模型已改为 **空体或业务字段**；门户头由服务端注入。
- 新增或强化的转发能力（示例，均以服务端 `_ensure_valid_creds_async` 为准）：
  - `get_repo_detail_by_prod_branch`：按产品分支版本 ID + `projectId` 聚合模块仓库与 Git 映射。
  - `get_module_name_list`、`get_product_branch_list`、`get_zcm_product_list`、`get_product_version_id` 等：支撑前端级联选择与版本解析。

## 5. 上游合并注意

- 会话文件路径、锁与 Playwright 路径属**功能语义**，同步上游时勿整文件覆盖；应对照根目录 `DIFF.md` 与本文件做增量合并。
- 集成测试见 `tests/integration/test_dev_iwhalecloud_api.py`（随本批次扩展）。
