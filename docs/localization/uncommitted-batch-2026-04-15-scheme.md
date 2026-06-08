# 未提交批次功能方案（2026-04-15）

**范围**：`synapse_jyhk` 工作区相对已提交版本的未暂存改动（`git status` / `git diff`）。  
**用途**：按功能模块归纳行为与依赖，供评审、提交说明与上游同步时对照；详细长期差异仍以仓库根 [`DIFF.md`](../../DIFF.md) 为准。

---

## 1. 首次引导：核心智能体（Onboarding）

**目标**：在「研发云」验证通过后，增加 **`ob-core-agent`** 步骤，集中完成与主配置页「灵魂与意志」对齐的智能体设定，再进入 Dev tools / 产品公共服务等后续步骤。

| 项 | 说明 |
|----|------|
| 入口与路由 | `App.tsx`：`OnboardingStep` 与步骤点阵插入 `ob-core-agent`；`ob-iwhalecloud` 完成后进入该步，再分支到 `ob-claude-code`（Tauri）或 `ob-devservices`（Web）。 |
| UI 实现 | 新视图 [`OnboardingCoreAgentPanel.tsx`](../../apps/setup-center/src/views/OnboardingCoreAgentPanel.tsx)：人格选择/自定义、与 `AgentSystemView` 能力对齐；嵌入 `SkillManager`（技能区由 `App` 传入，可被 `disabledViews` 关闭）。 |
| 就绪与下一步 | `obCoreAgentReady` / `obCoreAgentNextBusy`：完成面板内任务项后才可「下一步」；离开时 `saveEnvKeys(getAutoSaveKeysForStep("agent"))`。 |
| 环境键 | `agent` 步骤自动保存键含 `PERSONA_NAME`、`AGENT_NAME`、记忆/嵌入/调度等（见 `App.tsx` 中 `getAutoSaveKeysForStep("agent")`）。 |
| 引导收尾 | `ob-cli` 等流程中保存环境变量时合并 **IM + agent** 两类键；若已加载 `skillsDetail`，将外部技能勾选写入工作区 `data/skills.json`（`external_allowlist`）。 |
| 预加载 | 进入 `ob-core-agent` 时触发 `doRefreshSkills()`，与配置页技能列表一致。 |

**关联改动**：`AgentSystemView` 增加 `belowPersonaSlot`、`showScheduler`（引导内可藏「计划任务」）；`IdentityView` 从源文件列表排除 `personas/user_custom.md`，避免与运行时叠加重复展示。

---

## 2. 后端：身份 / Persona API

**文件**：[`src/synapse/api/routes/identity.py`](../../src/synapse/api/routes/identity.py)

| 项 | 说明 |
|----|------|
| 删除 | `DELETE /api/identity/file?name=personas/xxx.md`：仅允许删除自定义 persona；内置 slug 集合 `_PROTECTED_PERSONA_SLUGS` 不可删；删后尝试 `identity.reload()`。 |
| 导入 | `import_persona_file` 使用 `_sanitize_persona_upload_filename`：支持 Unicode 文件名，禁止路径片段与 Windows 保留字符。 |

**说明**：[`presets.py`](../../src/synapse/agents/presets.py) / [`profile.py`](../../src/synapse/agents/profile.py) 中默认预设「小鲸」、图标与多语言文案属 **产品展示/品牌化**，同步上游时按品牌化流程处理，不单独记成功能语义分叉（与根 `DIFF.md` 约定一致）。

---

## 3. 产品工作台：研发统一服务 + GitNexus + 代码图谱

**API 层**：[`rdUnifiedService.ts`](../../apps/setup-center/src/api/rdUnifiedService.ts)

- 路径常量：`gitnexus_initialize`、`gitnexus_analysis`。
- `gitNexusInitialize` / `gitNexusAnalysis`：仅 Tauri，经 `devservice.ip` 调统一服务异步任务。
- 代码关系图谱：`CODE_GRAPH_VIEWER_PORT`（11001）、`CODE_GRAPH_SERVER_PORT`（11011）；`unifiedServiceHostAuthority`、`codeGraphProjectNameFromRepoUrl`、`buildCodeGraphEmbedUrl` 生成嵌入 URL。

**产品列表**：[`ProductManager.tsx`](../../apps/setup-center/src/components/product/ProductManager.tsx)

- 手动刷新列表、可选 **60s** 自动刷新；`mergeProcessIntoProduct` 与列表刷新逻辑整理为 `useCallback`。
- 「刷新过程线」由 `get_prod_process_info` 改为 **`get_prod_info` 中单条产品匹配** 更新行数据（与后端列表契约对齐）。

**产品详情**：[`ProductDetail.tsx`](../../apps/setup-center/src/components/product/ProductDetail.tsx)

- 新增 `synapseApiBase`、`onProcessPayload`；详情打开时对 **`get_prod_process_info` 轮询**（15s），合并过程线到父级。
- **代码图谱** Tab：`iframe` 使用 `buildCodeGraphEmbedUrl`；依赖 `getDevserviceHost`。
- 仓库过程线「重新分析」：`gitNexusAnalysis`，loading 与 Tauri 门禁。

---

## 4. 桌面壳与依赖

| 项 | 说明 |
|----|------|
| [`package.json`](../../apps/setup-center/package.json) | 新增 `@uiw/react-md-editor` 等（与 Markdown 编辑能力相关）；依赖顺序调整。 |
| [`package-lock.json`](../../apps/setup-center/package-lock.json) | 锁文件随上述变更更新。 |
| [`tauri.conf.json`](../../apps/setup-center/src-tauri/tauri.conf.json) | CSP `frame-src` 放宽为 `http:` `https:` 及 `*.alibaba.com`，以允许代码图谱等 `http` 嵌入页。 |

---

## 5. 国际化

[`en.json`](../../apps/setup-center/src/i18n/en.json)、[`zh.json`](../../apps/setup-center/src/i18n/zh.json)：引导「核心智能体」、产品工作台 GitNexus/图谱/刷新等文案键增量。

---

## 6. 上游合并提示（摘要）

1. **引导**：冲突时保留 `ob-core-agent` 步骤顺序、`skills.json` 写入与 `agent` 环境键保存逻辑。  
2. **identity**：保留 `DELETE` 与文件名消毒；与桌面 `OnboardingCoreAgentPanel` / `IdentityView` 过滤规则一致。  
3. **产品工作台**：保留 GitNexus 与图谱 URL 构造；合并时注意 `get_prod_info` vs `get_prod_process_info` 的分工。  
4. **品牌化**：`presets` 默认展示名等随 Synapse 规则替换，不必记入根 `DIFF.md` 功能表。

---

*本文件随批次合并或作废后可删除或归档，避免与根 `DIFF.md` 长期重复。*
