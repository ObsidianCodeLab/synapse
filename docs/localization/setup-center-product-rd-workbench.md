# 桌面端：产品工作台与引导门禁（研发云 / 统一服务）

本文对应 `apps/setup-center/` 内与**产品管理、研发云门户、统一服务**相关的交互与实现要点。

## 1. 引导后主界面门禁（`App.tsx`）

在 **Tauri + HTTP API** 模式下，离开引导进入主界面后：

- 轮询校验 **`/api/dev/iwhalecloud/local-userinfo-exists`** 与 **`/api/dev/devservice-ip`**。
- 缺少 `userinfo.encryption` → 回到 `ob-iwhalecloud`。
- 缺少 `devservice.ip` → 回到 `ob-devservices`。

避免无凭据或无私服 IP 时进入工作台。

## 2. 门户会话保活

- `rdUnifiedService.whalecloudHeart`：在 Tauri 下定时（例如 5 分钟）`POST /api/dev/iwhalecloud/get_project_list`（空 body），触发后端使用 `iwhalecloud_session.json`，降低门户会话过期概率。
- 失败静默，不影响主流程。

## 3. CLI 门禁（`main.rs`）

- 命令 **`dev_tools_prereq_satisfied`**：在「已安装 CLI」基础上，要求 **Claude / OpenCode 已写入配置文件**（如 `~/.claude/settings.json`、`~/.config/opencode/opencode.json`），或 **Cursor CLI 在 PATH**；用于主界面 /「连接已有服务」流程的准入语义。

## 4. 产品工作台数据与 UI

### 4.1 项目空间与级联选择

- `ProductManager` 启动时 `fetchProjectList` → 填充项目空间选项（`formatProjectSpaceOption`）。
- `ProductModal`：依赖 `synapseApiBase` 与 `projectSpaces`，按 **项目空间 → ZCM 产品版本列表 → 应用模块 → …** 级联；大列表使用 **`SearchableVirtualSelect`**（可搜索 + `react-virtuoso` 虚拟列表），避免数千条 `SelectItem` 卡顿。

### 4.2 复合字段约定

- 产品版本、模块、空间等沿用 **`id|displayName`** 管道字符串；`types.ts` 提供 `displayIdPipeName` 等展示与解析辅助。
- 仓库维度增加 **`prod_branch`（branchVersionId|branchName）**，与研发统一服务 `repo_info` 对齐；`repositoriesToRdRepoInfo` 负责序列化。

### 4.3 更新仓库对话框（`RepoUpdateDialog`）

- 按产品版本拉取 **产品分支列表**（`fetchProductBranchList`）。
- 按选中产品分支拉取 **仓库明细**（`fetchRepoDetailByProdBranch`），驱动仓库分支可选项与 URL 映射。
- 与 `types` 中过滤/校验函数配合，避免非法组合。

### 4.4 产品卡片（`ProductCard`）

- 展示模块/版本徽章、描述 **Tooltip**（`tooltip` 组件支持 `showArrow={false}`）。
- 工单文案与布局微调（如「近30日改造工单」）。

## 5. 与根 `DIFF.md` 的关系

长期与上游差异见仓库根 **`DIFF.md`**；setup-center 单包待提交快照见 **`apps/setup-center/DIFF.md`**。
