# openakita_jyhk ↔ 上游 openakita 功能差异（按代码文件）

**对照源**：本机上游克隆 `d:\github\openakita` 的 `main` 与本仓库工作区。  
**定制侧**：本仓库。

**不写入本表**（见 `.cursor/skills/openakita-localized-sync/SKILL.md` 中的约定）：

- 纯品牌与仓库 URL：包名/导入、`OpenAkita`↔`Synapse`、文档或 HTTP 头里的 GitHub 路径、默认环境变量键名等。
- **仅注释 / 文档字符串 / 空白 / 换行**导致的文本不同（归一化品牌后若 Python **AST 与上游一致**，视为无功能差异）。
- 构建产物与依赖缓存：`node_modules`、`target`、`dist`、`dist-web`、`gen/`、锁文件中的纯版本漂移（除非伴随脚本或入口行为变更，另议）。

**Python 后端判定摘要**：对 `src/openakita/`（上游）与 `src/synapse/`（本仓库）做路径对齐；文本先做 `openakita`→`synapse`、`OpenAkita`→`Synapse`、`OPENAKITA_`→`SYNAPSE_` 归一化；再在「仍有差异」的文件上用 **AST** 排除仅注释类噪声。下列为**仍应视为功能向**的条目。

**桌面端判定摘要**：对 `apps/setup-center/` 两侧同源路径做相同品牌归一化后仍有文本差异的，视为「同名文件功能向改动」；**仅本仓库存在**的路径按目录/包归纳（不逐文件罗列 `claude-code-init/` 内上千文件）。

---

## 一、`src/synapse/`（上游对应 `src/openakita/`）

### 1.1 仅本仓库存在的文件（新增能力）

| 文件 | 功能摘要 |
|------|----------|
| `src/synapse/api/routes/yuque.py` | 语雀知识库 HTTP API |
| `src/synapse/api/routes/gitnexus.py` | GitNexus → MCP 代理 |
| `src/synapse/api/routes/dev_iwhalecloud.py` | 研发云集成：登录（Playwright、`/portal/logged` 截获 `userId`）、需求列表扩展、产品公共服务（devservice）IP 探测与读写；**门户 REST** 使用 `data/iwhalecloud_session.json` 缓存 `x-csrf-token`+Cookie，`_ensure_valid_creds_async` 串行刷新，401/403 时清会话并重试；多数路由 **不再** 要求 body 传 token/cookies；含 `get_repo_detail_by_prod_branch`、`get_module_name_list`、`get_product_branch_list`、`get_zcm_product_list`、`get_product_version_id` 等转发与聚合 |

> **说明**：`src/synapse/api/routes/long_text_48B08E72-EEC8-425F-989D-7D13CE3790CA.txt` 为误置于 `api/routes/` 的无关内容，**不属于功能清单**；建议从版本库删除并加入 `.gitignore` 规则防再次提交。

### 1.2 同名文件中的功能差异（归一化品牌 + AST 后仍成立）

| 文件 | 功能摘要 |
|------|----------|
| `src/synapse/api/server.py` | 挂载 `yuque` / `gitnexus` / `dev_iwhalecloud`；`/api` 访问日志中间件及新增 `/api/logs/service` 白名单拦截；OpenAPI 分组补充 |
| `src/synapse/api/schemas.py` | `success_response` / `error_response` 统一结构 |
| `src/synapse/api/auth.py` | base64url 与 HS256 JWT 编解码辅助（`encode_jwt` 主路径仍可能存在） |
| `src/synapse/llm/registries/providers.json` | 增加公司内部 WhaleCloud / `iwhalecloud` 提供商配置 |
| `src/synapse/skills/registry.py` | `_MARKETPLACE_HOSTS` 允许的技能市场主机/路径集合与上游不同（影响允许下载来源） |
| `src/synapse/api/routes/identity.py` | `DELETE /identity/file`：仅允许删除 `personas/*.md` 自定义文件，内置 slug 集合不可删，删后尝试 `identity.reload()`；`import_persona_file` 使用 `_sanitize_persona_upload_filename`（Unicode 合法名、禁止路径与非法字符） |

---

## 二、`apps/setup-center/`

### 2.1 仅本仓库存在（功能向归纳）

| 路径 | 功能摘要 |
|------|----------|
| `apps/setup-center/src/api/rdUnifiedService.ts` | 研发统一服务 API 封装；`fetchSynapseJson` 导出；`prod_branch` 与过程线类型；`fetchProjectList` / ZCM 与模块、产品分支、`fetchRepoDetailByProdBranch`；**Tauri** 下 `whalecloudHeart`（定时 `get_project_list` 保活） |
| `apps/setup-center/src/components/product/` | 产品管理视图组件群（连接研发统一服务，管理项目、仓库、自动分析状态等）；含 **`SearchableVirtualSelect`**（搜索+虚拟列表）、`ProductModal`/`RepoUpdateDialog` 级联与 **产品分支**/`prod_branch` 管线、`displayIdPipeName` 等复合字段工具 |
| `apps/setup-center/src/views/workbench/ProductManagerView.tsx` | 工作台产品管理视图入口 |
| `apps/setup-center/src/components/rd-process/` | 研发流程 / 工单 UI |
| `apps/setup-center/src/components/team-manage/` | 团队总览 |
| `apps/setup-center/src/components/rd-center/` | 研发中心视图 |
| `apps/setup-center/src/components/WindowsTitleBar.tsx` | Windows 标题栏 |
| `apps/setup-center/src/components/ToastContainer.tsx` | 全局 Toast |
| `apps/setup-center/src-tauri/src/rd_terminal/` | 嵌入式终端（Rust） |
| `apps/setup-center/src-tauri/resources/claude-code-init/` | Claude Code 初始化资源（整目录，按包对待） |
| `apps/setup-center/src-tauri/resources/claude-code-releases/` | 内置 `claude.exe` 等发布物 |
| `apps/setup-center/src-tauri/resources/synapse-term/` | 终端代理、psmux、lazygit、脚本与配置 |
| `apps/setup-center/src-tauri/video/` | 打包用说明视频 |
| `apps/setup-center/public/devtoken.mp4`、`public/iwhalecloud-favicon.ico` | 研发云引导素材 |
| `apps/setup-center/src/assets/logo_b.png` | 品牌资源增量 |
| `apps/setup-center/src-tauri/icons/` 下多数字体与 `synapse/`、`icon_b`、`logo_b` 等 | 应用图标资源（与上游二进制不一致部分） |
| `apps/setup-center/android/app/src/main/java/com/synapse/mobile/MainActivity.java` | 移动端包名与入口（与上游 `com.openakita.mobile` 为包路径级差异，同步时按品牌化流程处理） |

### 2.2 同名文件：归一化品牌后仍有差异（本机双目录比对）

下列路径相对于 `openakita/apps/setup-center` 同源文件，在 **字符串级品牌归一化后** 仍有内容不同，视为需重点合并的功能/配置向文件：

| 文件 |
|------|
| `apps/setup-center/package.json` |
| `apps/setup-center/package-lock.json` |
| `apps/setup-center/public/manifest.json` |
| `apps/setup-center/src/App.tsx` |
| `apps/setup-center/src/main.tsx` |
| `apps/setup-center/src/constants.ts` |
| `apps/setup-center/src/icons.tsx` |
| `apps/setup-center/src/styles.css` |
| `apps/setup-center/src/hooks/useVersionCheck.ts` |
| `apps/setup-center/src/i18n/en.json` |
| `apps/setup-center/src/i18n/zh.json` |
| `apps/setup-center/src/platform/detect.ts` |
| `apps/setup-center/src/platform/index.ts` |
| `apps/setup-center/src/components/Sidebar.tsx` |
| `apps/setup-center/src/components/CliManager.tsx` |
| `apps/setup-center/src-tauri/Cargo.toml` |
| `apps/setup-center/src-tauri/Cargo.lock` |
| `apps/setup-center/src-tauri/build.rs` |
| `apps/setup-center/src-tauri/tauri.conf.json` |
| `apps/setup-center/src-tauri/capabilities/default.json` |
| `apps/setup-center/src-tauri/src/main.rs` |
| `apps/setup-center/src-tauri/windows/installer.nsi` |
| `apps/setup-center/src-tauri/windows/hooks.nsh` |

> 更细粒度摘要（例如某视图是否仅文案）需对单文件 `git diff`；**不要**把纯 `openakita`→`synapse` 的字符串替换登记为功能项。

### 2.3 与上游的目录级关系（本机比对）

除 Android Java 包目录名（`com.openakita.mobile` ↔ `com.synapse.mobile`）外，**未发现**「整棵子目录仅在上游存在、本仓库完全缺失」的附加结构；此前若存在「上游独有大量视图/组件」的表述，**与当前本机两棵树不一致**，已不以表格形式维护。

### 2.4 当前工作区待提交增量（快照：2026-04-15）

以下为相对**已提交版本**仍在本工作区、且属功能语义向的改动摘要（分模块方案见 `docs/localization/uncommitted-batch-2026-04-15-scheme.md`；产品工作台长期说明见 `docs/product-manager-scheme.md` 等）。

| 路径 | 功能摘要 |
|------|----------|
| `apps/setup-center/src/App.tsx` | 引导新增 `ob-core-agent`：`OnboardingCoreAgentPanel`，预加载技能；引导收尾保存 env 合并 IM+`agent` 键；写入 `data/skills.json`（`external_allowlist`）；步骤点阵与从研发云到 Dev tools/产品公共服务的跳转链调整 |
| `apps/setup-center/src/views/OnboardingCoreAgentPanel.tsx` | **新增**：首次引导「核心智能体」——人格与 `PERSONA_NAME` 等、视图开关、内嵌技能区；与后端 `personas/*.md` 读写/删除联动 |
| `apps/setup-center/src/views/AgentSystemView.tsx` | `belowPersonaSlot`、`showScheduler`：供引导插入内容与隐藏计划任务区块 |
| `apps/setup-center/src/views/IdentityView.tsx` | 源文件列表排除 `personas/user_custom.md`，避免与运行时叠加重复 |
| `apps/setup-center/src/api/rdUnifiedService.ts` | `gitnexus_initialize` / `gitnexus_analysis`；图谱端口与 `buildCodeGraphEmbedUrl` / `codeGraphProjectNameFromRepoUrl` 等 |
| `apps/setup-center/src/components/product/ProductManager.tsx` | 列表手动/定时刷新；「刷新过程线」改为从 `get_prod_info` 行更新 |
| `apps/setup-center/src/components/product/ProductDetail.tsx` | 详情轮询 `get_prod_process_info`；代码图谱 iframe；GitNexus 重新分析；`synapseApiBase` + `onProcessPayload` |
| `apps/setup-center/package.json`、`package-lock.json` | 新增 `@uiw/react-md-editor` 等依赖 |
| `apps/setup-center/src-tauri/tauri.conf.json` | CSP `frame-src` 允许 `http:`/`https:` 以嵌入图谱页 |
| `apps/setup-center/src/i18n/en.json`、`zh.json` | 上述引导、产品与 GitNexus/图谱相关文案键 |

---

## 三、维护约定

1. **上游同步**：使用 `git fetch upstream` 与明确 **tag/commit 范围**；变更文件与本表求交后做增量合并。  
2. **更新本表**：新增/删除本地化能力时增删行；品牌与注释类差异**不**写入本表，按 SKILL 归并到品牌化流程或非审计项。  
3. **重新生成方法**：对齐本机 `openakita` 与 `openakita_jyhk` 路径，Python 侧辅以 `ast.dump(parse(...))` 过滤注释噪声；前端侧以品牌归一化后的文本 diff 为准。  
4. **方案文档**：门户会话与桌面产品工作台拆分说明见 `docs/localization/dev-iwhalecloud-portal-session.md`、`docs/localization/setup-center-product-rd-workbench.md`；未提交批次分模块方案见 `docs/localization/uncommitted-batch-2026-04-15-scheme.md`。

---

*比单次提交/合并前，建议检查本表是否需要更新。*