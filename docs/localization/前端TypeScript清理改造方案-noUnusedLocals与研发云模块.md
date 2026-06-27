# 前端 TypeScript 清理改造方案（noUnusedLocals + 研发云模块）

## 文档说明

| 项目 | 内容 |
|------|------|
| **本地仓库** | `D:\github\openakita_jyhk` |
| **作用范围** | `apps/setup-center/`（Tauri 桌面 React 前端） |
| **实施状态** | **待实施**（v1.27.20 合入后单独跟进） |
| **前置依赖** | v1.27.19→1.27.20 同步 PR 合入 `main` 后再开分支 |
| **关联文档** | `开源版本1.27.19-1.27.20向本地定制版本同步优化改造方案.md` §2.12、§9（P2 暂缓项） |
| **上游参考** | openakita `c651ec57`（App.tsx dead import 清理 + `noUnusedLocals`） |

**性质**：纯**代码卫生 / 类型检查**改造，**不改变业务行为**（除非修到真实 bug）。当前 `vite build` / `npm run tauri dev` 可正常使用；缺口主要在 `tsc -b` 与 CI 若将来加 typecheck gate。

**硬性原则**：

- 与 v1.27.20 同步一样：**禁止整文件覆盖**；按模块小 PR、可独立回滚。
- **不碰** Python 后端、Tauri Rust、SynapseService（除非 platform 类型需补声明）。
- 研发云/工作台逻辑以 `DIFF.md` 与现有行为为准，清理时只删 dead code、补类型，不改 API 契约。

---

## 0. 背景：为什么在 v1.27.20 里暂缓？

v1.27.20 上游 P2 包含两项：

1. 删除 `App.tsx` 中零引用的 `renderIntegrations()` 等死代码  
2. `tsconfig.json` 启用 `"noUnusedLocals": true`

本地 fork 在合入时**只做了 (1)**，**(2) 暂缓**，原因：

| 现象 | 说明 |
|------|------|
| 启用 `noUnusedLocals` 后 | `tsc -b` 约 **224** 个错误，其中 **186** 个为 `TS6133`（未使用局部变量/import） |
| 未启用时 | `tsc -b` 约 **34** 个错误，多为研发云/平台类型债（见 §2） |
| `vite build` | **两种配置下均可通过**（Vite 默认不做完整 tsc） |

因此拆成**两个可独立实施的子项**，放在 v1.27.20 功能交付之后处理。

---

## 1. 子项 A：`noUnusedLocals` 全库清理

### 1.1 是什么

`tsconfig.json` → `compilerOptions.noUnusedLocals: true`

- 未使用的 **import**、**局部变量**、**函数内声明** 变为编译错误（`TS6133`）
- 目的：防止 refactor 后遗留 dead import，与上游桌面壳质量基线对齐

### 1.2 当前规模（2026-06-27 实测，`main` + v1.27.20 工作区）

| 指标 | 数量 |
|------|------|
| 启用 `noUnusedLocals` 后总错误 | **224** |
| 其中 `TS6133` | **186** |
| 热点文件（TS6133 Top 5） | `App.tsx`(44)、`LeaderReviewView.tsx`(19)、`MeetingRoomBoard.tsx`(16)、`OrgEditorView.tsx`(11)、`OrderManagement.tsx`(8) |

其余分散在：`IMView.tsx`、`ProductDetail.tsx`、`AgentManagerView.tsx`、`Topbar.tsx`、chat 周边等。

### 1.3 处理方式（按文件）

| 情况 | 处理 |
|------|------|
| 未使用的 import | **删除** |
| 预留但未用的 state/ref | 删除；若确为 TODO，加 `// TODO` 并在 PR 说明 |
| 解构后未用的字段 | 改为 `_field` 或缩小解构 |
| 类型-only import | 改为 `import type { ... }`（若仍报 unused 则删） |
| 确实需要副作用的 import | 极少见；用 `void import(...)` 或 eslint 单行 disable（最后手段） |

**不要**：为消 TS6133 而改业务逻辑、删仍在用的定制功能。

### 1.4 推荐 PR 拆分

| PR | 范围 | 预估 |
|----|------|------|
| **PR-A1** | `App.tsx` + `Topbar.tsx` + hooks（`useVersionCheck` 等） | 0.5–1 天 |
| **PR-A2** | `views/OrgEditorView.tsx`、`Agent*View.tsx`、`IMView.tsx` | 0.5 天 |
| **PR-A3** | `components/rd-manage/**`、`views/rd-manage/**` | 1–1.5 天 |
| **PR-A4** | `components/rd-view/**`、`components/product/**`、其余 | 0.5–1 天 |
| **PR-A5** | `tsconfig.json` 正式启用 `noUnusedLocals: true` + CI 可选加 `tsc -b` | 0.5h |

**顺序**：先 A1→A4 清完 TS6133，**最后** A5 打开 flag（或 A5 与 A4 同 PR，以 `tsc -b` 零 error 为准）。

### 1.5 验收

```powershell
Set-Location D:\github\openakita_jyhk\apps\setup-center
# tsconfig 已含 noUnusedLocals: true
npx tsc -b
npm run build
npm run lint   # 允许既有 react-hooks warnings，但不得新增 error 级问题
```

---

## 2. 子项 B：研发云 / 工作台模块 TS 类型债清理

### 2.1 是什么

在**未启用** `noUnusedLocals` 时，`tsc -b` 仍有的 **~34** 个错误（2026-06-27 实测）。多为：

- 类型定义落后于后端/前端实际字段  
- 平台桥接 API 未在 `platform/index.ts` 声明  
- 全局 Window 扩展未声明  
- strict null 下缺少收窄  
- 第三方（Recharts）props 与自定义 tick 类型不兼容  

**与子项 A 的关系**：B 应**优先或并行**做——否则 A5 打开 flag 后，B 的 34 个非 TS6133 错误仍会阻塞 `tsc -b`。

### 2.2 错误清单（按类别）

#### B1. 平台 / 全局类型（3 处，跨模块）

| 文件 | 错误 | 建议修复 |
|------|------|----------|
| `src/hooks/useBackendReady.ts` | `Window.__SYNAPSE_BACKEND_READY` 不存在 | 在 `src/vite-env.d.ts` 或 `global.d.ts` 扩展 `interface Window` |
| `src/lib/plugin-bridge-host.ts` | `copyFileToDownloads` 不在 platform | 在 `platform/index.ts`（及 Tauri/Web 实现）补导出，或改为已有 API |
| `src/rd-sop/nodePresentation.ts` | `CliToolId` 未 export | 在 `cliModelConfig.ts` `export type CliToolId` |

#### B2. 研发云引导 / App 表单（2 处）

| 文件 | 错误 | 建议修复 |
|------|------|----------|
| `src/App.tsx:598,4504` | `setObIwcPosition` 等：`string` 不能赋给字面量 union | state 改为 `string` 或 `ObIwcPosition` 联合类型，与 Select `onValueChange` 一致 |

#### B3. 研发会议室 / _leader review（~24 处）

| 文件 | 错误码 | 问题摘要 |
|------|--------|----------|
| `MeetingRoomBoard.tsx` | TS2339×4 | `MeetingRoomLivePayload` 缺 `func_solution_blocked` 等 4 字段 → **补类型**或改访问路径 |
| `MeetingRoomBoard.tsx` | TS18047×2 | `room` 可能 null → 加 guard 或 `room!`（优先 guard） |
| `FuncSolutionReviewPanel.tsx` | TS18048×5 | `consistency` 可能 undefined → 可选链或 early return |
| `FuncSolutionReviewPreview.tsx` | TS18048×4 | 同上 |
| `ImpactAssessmentPanel.tsx` | TS2322 | 联合类型与 `Record<string,string>[]` 不兼容 → 收窄分支或改 props 类型 |
| `EnvPregenDocDrawer.tsx` | TS2345 | `string \| undefined` → 默认值或 assert |
| `MeetingRoomConfigDrawer.tsx` | TS2322 | Switch 组件不接受 `disabled` → 扩组件 props 或换 UI |
| `CollabHumanReviewConclusionCard.tsx` | TS2367×3 | 状态枚举与 `"skipped"` 无交集 → 扩 `MeetingNodeVisualState` 或删死分支 |
| `LeaderReviewSopPanel.tsx` | TS2353/TS2345 | Modal `content` 样式字段、TableRow 工厂返回类型不一致 |
| `TaskExecCliLogViewer.tsx` | TS2322 | `RefObject<HTMLDivElement \| null>` 与 LegacyRef |

#### B4. 研发云数据看板 Recharts（2 处）

| 文件 | 错误 | 建议修复 |
|------|------|----------|
| `CostAnalysisCard.tsx` | tick props `x: string \| number` | 自定义 tick 内 `Number(x)` 或放宽 `PersonAxisTickProps` |
| `PersonWorkloadCard.tsx` | 同上 | 同上 |

#### B5. 技能页（v1.27.20 合入后需确认，2 处）

| 文件 | 错误 | 建议修复 |
|------|------|----------|
| `SkillManager.tsx:2885` | `"internal"` 与 tab 类型无交集；`InternalSkills` 未定义 | 恢复本地 `InternalSkills` 区块 + tab 类型含 `"internal"`，或删除死分支（以 HEAD 定制为准） |

> **说明**：B5 可能随 v1.27.20 PR 合入时的 `SkillManager` 块级 merge 已部分修复；实施前请对 `main` 再跑一遍 `tsc -b` 刷新清单。

### 2.3 推荐 PR 拆分

| PR | 范围 | 预估 |
|----|------|------|
| **PR-B1** | 平台 + 全局类型（B1） | 2–4h |
| **PR-B2** | `App.tsx` 引导表单（B2） | 1–2h |
| **PR-B3** | `MeetingRoom*` + `FuncSolution*` + panels（B3 主体） | 1–2 天 |
| **PR-B4** | `LeaderReviewSopPanel` + Recharts cards（B3 尾 + B4） | 0.5–1 天 |
| **PR-B5** | `SkillManager` internal tab（B5） | 1–2h |

### 2.4 验收

```powershell
Set-Location D:\github\openakita_jyhk\apps\setup-center
# 此时 tsconfig 尚无 noUnusedLocals
npx tsc -b   # 目标：0 error（允许既有 warnings 若 tsc 不输出则无）
npm run build
# 手工：研发云会议室、Leader Review、产品工作台、引导页各走一遍 smoke
```

---

## 3. 总体实施顺序（建议）

```
v1.27.20 功能 PR 合入 main
        │
        ├─► 分支 chore/ts-rd-module-types（子项 B：PR-B1→B5）
        │       目标：noUnusedLocals 关闭时 tsc -b = 0
        │
        └─► 分支 chore/ts-no-unused-locals（子项 A：PR-A1→A5）
                目标：开启 noUnusedLocals 后 tsc -b = 0
```

**为何 B 在 A 之前（或至少 B1 先做）**：平台类型与 Payload 定义错误少、收益高，且不占 TS6133 数量。

**可选 CI**：在 A5 合入后于 `apps/setup-center` 增加 job：`npm run build && npx tsc -b`（不必与 eslint 全绿绑定）。

---

## 4. 不在本次范围

| 项 | 说明 |
|----|------|
| `noUnusedParameters` | 上游未启用；本次不扩 |
| ESLint `react-hooks/exhaustive-deps` 117 warnings | 历史债；不阻塞 tsc，另议 |
| Python / Rust / SynapseService | 非本方案 |
| 研发云**功能**改造 | 只修类型，不加需求 |

---

## 5. 验收总表

| # | 场景 | 期望 |
|---|------|------|
| 1 | `npx tsc -b`（`noUnusedLocals: false`） | 0 error |
| 2 | `npx tsc -b`（`noUnusedLocals: true`） | 0 error |
| 3 | `npm run build` | 通过 |
| 4 | Tauri 聊天 / 技能 / 组织 | 回归无退化 |
| 5 | 研发云：会议室、Leader Review、工单、产品工作台 | smoke 通过 |
| 6 | 引导页 whalecloud 表单 | 职位/部门 Select 正常 |

---

## 6. 参考命令

```powershell
Set-Location D:\github\openakita_jyhk\apps\setup-center

# 当前类型债（未开 noUnusedLocals）
npx tsc -b 2>&1 | Select-String "error TS"

# 预估 noUnusedLocals 规模（临时改 tsconfig 后）
# "noUnusedLocals": true
npx tsc -b 2>&1 | Select-String "error TS6133" | Measure-Object

# 按文件聚合
npx tsc -b 2>&1 | Select-String "error TS" | ForEach-Object {
  if ($_ -match '^([^(]+)\(') { $matches[1] }
} | Group-Object | Sort-Object Count -Descending

# 上游 dead code 参考（勿整文件覆盖）
git -C D:\github\openakita show c651ec57 --stat
```

---

## 7. 与 v1.27.20 方案文档的交叉引用

| v1.27.20 条目 | 本文档 |
|---------------|--------|
| §2.12 P2 `noUnusedLocals` | **§1 子项 A** |
| §9 暂缓 `noUnusedLocals` | **§0、§3** |
| §9 `tsc` 研发云历史错误 | **§2 子项 B** |
| §8 R4 删 `renderIntegrations` + flag | R4 删函数 ✅ 已完成；flag → **§1 PR-A5** |

---

*文档创建：2026-06-27；基线：`sync/upstream-v1.27.20` 工作区实测；实施状态：**待实施**。*
