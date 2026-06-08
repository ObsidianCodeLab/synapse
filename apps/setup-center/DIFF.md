# `apps/setup-center/` 功能差异备忘

**用途**：记录本目录内**当前工作区相对已提交版本**的功能向改动摘要，便于提交前自检与上游合并时对照。  
**与仓库根 `DIFF.md` 的关系**：根目录文件是「本地化 fork ↔ 上游 openakita」的长期对照清单；本文件聚焦 **setup-center 单包** 的**待提交/当前批次**说明，提交合并后应**删改过时条目或整节**，避免与根表重复堆砌。

**不写入**：纯品牌字符串替换、仅注释/空白、未纳入构建的本地日志/心跳等（如仓库根的 `logs/`、`data/*.heartbeat`）、**仅构建产物哈希变更**的 `dist-web/`（除非同时改了入口或打包语义）。

---

## 当前未提交批次（工作区快照 · 2026-04-15）

**快照依据**：`git status --short -- apps/setup-center/`、`git diff --stat -- apps/setup-center/`。

| 路径 | 功能摘要 |
|------|----------|
| `src/App.tsx` | 引导步骤 `ob-core-agent`；`OnboardingCoreAgentPanel`；进入该步时 `doRefreshSkills`；保存 env 时合并 `agent` 键；`data/skills.json` 外部技能 allowlist；步骤点阵与 `ob-iwhalecloud` → 核心智能体 → 后续步的导航 |
| `src/views/OnboardingCoreAgentPanel.tsx` | **新增**：核心智能体引导（人格、`PERSONA_NAME`、视图开关、SkillManager 插槽、persona 文件增删改与 API） |
| `src/views/AgentSystemView.tsx` | `belowPersonaSlot`、`showScheduler` |
| `src/views/IdentityView.tsx` | 列表隐藏 `personas/user_custom.md` |
| `src/api/rdUnifiedService.ts` | GitNexus initialize/analysis；代码图谱 URL 与 host/`repo` 参数构造 |
| `src/components/product/ProductManager.tsx` | 产品列表手动/60s 自动刷新；过程线刷新走 `get_prod_info` 行匹配 |
| `src/components/product/ProductDetail.tsx` | `get_prod_process_info` 轮询；图谱 iframe；`gitNexusAnalysis`；props：`synapseApiBase`、`onProcessPayload` |
| `package.json`、`package-lock.json` | `@uiw/react-md-editor` 等依赖增量 |
| `src-tauri/tauri.conf.json` | CSP `frame-src` 含 `http:`/`https:` |
| `src/i18n/en.json`、`zh.json` | 引导与产品/GitNexus/图谱文案 |

**合并提示**：与上游冲突时优先保留 **引导核心智能体**、**GitNexus/图谱**、**persona 删除与文件名规则**（与后端 `identity` 路由一致）。分模块说明见仓库根 `docs/localization/uncommitted-batch-2026-04-15-scheme.md`。

---

## 维护约定

1. **提交前**：用根目录 skill `synapse-localized-sync` 中的「提交前：setup-center DIFF 回写」步骤，对 `apps/setup-center/` 跑 `git diff` / `git diff --cached` / 未跟踪列表，更新上表「当前未提交批次」；无待提交改动时可删除该节或改为「（无）」。  
2. **合并进 main 后**：将已上线行为吸收进仓库根 `DIFF.md` 对应小节（若属于长期与上游差异），并精简本节重复描述。

