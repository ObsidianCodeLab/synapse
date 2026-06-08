# 产品公共服务与产品管理方案设计

**相关拆分文档**（实现细节与未提交增量说明，避免单文件过长）：

- [研发云门户会话与 Synapse 代理层](./localization/dev-iwhalecloud-portal-session.md)：`data/iwhalecloud_session.json`、`_ensure_valid_creds_async`、401/403 刷新与对外 API 契约。
- [桌面端产品工作台与引导门禁](./localization/setup-center-product-rd-workbench.md)：引导后校验、`whalecloudHeart`、CLI 门禁、`SearchableVirtualSelect` 与产品分支/仓库级联。

## 1. 概述
在 Synapse (本地化 fork) 中，为了集成研发统一服务以及各维度的图谱能力，引入了「产品公共服务」的配置引导与工作台中的「产品管理」功能。本方案实现了在桌面引导期完成服务连通性探测及配置持久化，并在工作台中提供对业务产品、仓库和各类分析流的图形化管理。

## 2. 核心功能

### 2.1 引导期：产品公共服务配置 (ob-devservices)
- **连通性探测**：用户输入服务主机 IP，客户端对以下端口发起 TCP 连通性探测：
  - `10001`：研发统一服务（用户、产品、多终端统一管理）
  - `11001` / `11011`：产品代码图谱（UI 与 MCP 服务）
  - `12001` / `12011`：产品工单图谱（UI 与 MCP 服务）
  - `13001` / `13011`：产品知识图谱（UI 与 MCP 服务）
- **持久化存储**：全部端口探测通过后，IP 地址被写入 `~/.synapse/devservice.ip` 文件中。后续所有依赖公共服务的 API 均从此文件获取地址。
- **跨平台支持**：Tauri 桌面版通过 Rust 命令 (`probe_devservice_ports`, `write_devservice_ip`) 执行；Web 端通过后端 FastAPI 路由 (`/api/dev/devservice-probe`, `/api/dev/devservice-ip`) 代理执行。

### 2.2 工作台：产品管理视图 (ProductManager)
- **入口与组件**：位于工作台侧边栏，核心视图为 `ProductManagerView`，依赖 `apps/setup-center/src/components/product/` 目录下的相关业务组件。
- **数据交互**：调用研发统一服务 API (`rdUnifiedService.ts`) 获取产品列表 (`get_prod_info`)，并支持产品创建、编辑和删除。在新增产品时，支持关联对应代码仓库及其分支。
- **关联分析**：
  - **产品详情 (ProductDetail)**：提供产品层面的代码视图、工单视图、知识视图入口。
  - **自动分析与更新**：通过产品卡片和仓库弹窗，可以触发对应维度的分析流程，并在后台异步生成依赖解析图谱与工单关系图。
- **权限与身份**：依赖于「研发云集成 (iWhaleCloud)」流程自动截获的 `userId` 以及加密存储的 `userinfo.encryption`，对上游研发统一服务进行身份鉴权。
- **门户 REST 转发**：浩鲸门户接口所需的 `x-csrf-token` 与 `Cookie` 由 Synapse 后端从 `data/iwhalecloud_session.json` 维护（缺失时用 Playwright 按本地工号/密码拉取），前端 **不再** 在请求体中传递 token/cookies；桌面端可对 `get_project_list` 做定时保活（见拆分文档）。

## 3. 代码影响面 (本地差异差异项)
- **Rust 后端 (`src-tauri/src/main.rs`)**：新增 IP 读写及端口探测 Tauri Command。优化 `claude_code_apply_user_init` 部署策略（防覆盖）。
- **Python 后端 (`src/synapse/api/routes/dev_iwhalecloud.py`)**：提供探测 API 及获取 `userinfo` 解析后的内部接口；Playwright 登录拦截器补全自动获取 `userId` 逻辑。
- **前端 (`apps/setup-center/src/`)**：`App.tsx` 扩展引导步骤流，注入 `ob-devservices`；新增 `rdUnifiedService.ts` API 层及完整的 `product/` UI 组件树。

## 4. 与上游合并策略
本方案属于典型的**本地个性化功能改造差异**。后续与上游 (synapse) 同步合并时，应遵循 `DIFF.md` 中的规范：
- 本地独占组件 (`components/product/`) 及路由、API 封装等原样保留。
- 引导流与 Rust 命令处的注入采用增量形式（即在 `ob-claude-code` 之后补充 `ob-devservices`），使用手工合并，不可被上游盲目覆盖。
