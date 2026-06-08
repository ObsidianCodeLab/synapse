---
name: whalecloud-dev-tool-manual-modify
description: "产品开发手册文档修改技能（源码优先 + 历史文档参考 + GitNexus 辅助）。以用户需求为驱动，以实际代码为依据，以历史手册为参照，精准修改产品开发手册（PRODUCT_DEV.md）。Examples: 按 9 章结构补充章节、修订术语与 API 描述、更新风险评估、同步架构引用。"
label: 产品开发手册文档修改工具
---

# 产品开发手册修改（源码优先 · 历史文档参考 · 用户需求驱动）

修改目标文件（`targets[0]`）的内容，只改用户要求修改的部分，**绝不臆造**，**绝不删除**未被要求修改的章节。

典型落盘文件名：**`PRODUCT_DEV.md`**（与内置生成任务约定一致；若上下文指定其他文件名则以前者为准）。文档结构应对齐技能 **`whalecloud-dev-tool-development-manual`** 中 `templates/产品研发手册.md` 的章节框架（产品概述、代码分层、术语、代码风格、能力复用、核心模块、API、配置调优、目录变更风险等九个方面），但**以当前工作副本实际标题为准**，不得为「对齐模板」而重排用户未要求改动的结构。

> **三项核心原则（贯穿全程，不得违反）**
> 1. **以实际代码为基础不臆断**：凡涉及分层路径、模块边界、API、配置项、依赖与风险等结论，须有源码或可核对证据；缓存未命中时须补充读取，不得凭空描述。
> 2. **以历史文档为参考不造谣**：必须先读原始手册全文，保留未被要求修改的章节与措辞；不得凭借「记忆」替换已有准确描述。
> 3. **以用户需求为根本不发散**：修改范围严格限定在用户指定的修改要求内，不得主动扩展修改其他章节。

---

## Parameters（从上下文自动解析）

| 参数 | 来源 | 说明 |
|------|------|------|
| `TARGET_FILE` | `targets[0]` | 待修改的手册文件名（如 `PRODUCT_DEV.md`） |
| `PROPOSED_PATH` | user 消息注入 | proposed/ 工作副本的完整路径（agent 只写此路径） |
| `PROD_NAME` | user 消息注入 | 产品标识 |
| `DOC_TYPE` | user 消息注入 | 文档类型（产品手册场景下为「产品手册」） |
| `PRODUCT_DESC` | user 消息注入 | 产品描述（可为空） |
| `CODE_PATH` | user 消息注入 | 代码路径（可为空；用于定位源码与仓库名） |
| `CORE_FEATURES` | user 消息注入 | 主要功能（可为空） |
| `USER_REQUEST` | user 消息 `## 用户修改要求` 段 | 用户本次的修改要求 |
| `GNX_CACHE_DIR` | `synapse_home/tmp/gitnexus/<repo>/` | GitNexus 本地缓存路径（见 Phase 1） |

---

## 与「产品开发手册生成」技能的关系

- **分析深度**：复杂多仓库、九段全覆盖的从头生成，见 **`whalecloud-dev-tool-development-manual`** 的完整 Workflow 与 Phase 2–4。
- **本技能**：在**已有 PRODUCT_DEV.md（或同结构手册）**上做**增量修改**；跨仓库、grep/read、cypher、`gnx-tools.js` 等核验策略与该技能一致，但**仅执行与修改点相关的最小证据收集**。

---

## Workflow

```
Phase 0 — 解析用户修改意图（必选，首先执行）
  0a. 读取 user 消息，提取 USER_REQUEST、TARGET_FILE、PROPOSED_PATH 及注入上下文。
  0b. 将修改要求拆解为修改点列表（涉及章节、是否需要源码、状态）。
  0c. 判断修改类型：纯措辞调整 / 与代码或架构事实相关的增补或纠错 / 表格与列表更新；后两类必须走源码核验。

Phase 1 — 历史文档读取（必选）
  1a. read_file 读取 PROPOSED_PATH 全文，记录章节结构与「禁止改动的章节」。
  1b. 标注与 USER_REQUEST 相关的二级/三级标题范围。

Phase 2 — 源码查阅（按修改点决定）
  与 whalecloud-dev-tool-arch-modify 相同：优先 list_directory 检查 `<源码缓存根目录>/files/`；必要时 run_shell 执行 gnx-tools.js materialize（参数来自 user 消息注入，Windows 勿用 &&）。

Phase 3 — 文档修改
  3a. 逐条处理修改点；新增事实须附「仓库:路径」级依据或标注「[待源码确认]」。
  3b. 保持 Markdown 标题层级与列表/表格风格与原稿一致；勿删除用户未要求删除的章节。
  3c. 若涉及「产品研发手册」模板中的循环块或占位符式段落，沿用原稿已有结构，勿擅自引入未在原文档出现的全新一级结构，除非用户明确要求。

Phase 4 — 完整性校验
  对照 Phase 1，确认未改动章节未被误改；新增段落有依据或显式待确认标记。

Phase 5 — 写回
  write_file 将**完整**修改后的文档写回 PROPOSED_PATH（同文件名）。
```

---

## 工具白名单

与 **`whalecloud-dev-tool-arch-modify`** 一致：`read_file`、`write_file`、`list_directory`、`run_shell`（**仅**用于 `gnx-tools.js materialize`）。

---

## Checklist（摘要）

- [ ] 已读 proposed 全文并列出修改点列表  
- [ ] 源码路径、缓存命中/materalize 情况已记录  
- [ ] 每处事实性修改有路径级依据或 `[待源码确认]`  
- [ ] 完整文档已写回 proposed，文件名与 `targets[0]` 一致  

---

## Error Handling

与 **`whalecloud-dev-tool-arch-modify`** 相同：读盘失败则中止；GitNexus 不可达时对需核验项标注待确认后继续；禁止向权威根目录直写，仅 proposed/。
