# {{PROJECT_NAME}} — 技术架构说明

> **文档版本**：1.0 · **生成时间**：{{GENERATED_DATE}} · **技能**：whalecloud-dev-tool-arch-create · **证据来源**：源码阅读（入口 + 构建清单 + 代表性模块）+ 结构化代码索引（辅助）
>
> 本文档为**技术架构补充文档**，聚焦技术栈、系统分层与运行态。产品定位、业务能力与功能说明见主文档 [FUNCTIONAL_ARCH.md](FUNCTIONAL_ARCH.md)。

---

## 目录

1. [技术概览](#1-技术概览)
2. [仓库与工程事实](#2-仓库与工程事实)
3. [技术栈](#3-技术栈)
4. [系统分层架构](#4-系统分层架构)
5. [运行形态与执行流](#5-运行形态与执行流)
6. [模块依赖与变更风险](#6-模块依赖与变更风险)
7. [源码佐证与关键路径](#7-源码佐证与关键路径)
8. [附录](#8-附录)

---

## 1. 技术概览

> 本节仅做技术角度的一句话定性，不重复产品定位描述——详见 [FUNCTIONAL_ARCH.md §1～2](FUNCTIONAL_ARCH.md)。

{{TECH_OVERVIEW}}

<!-- 1～3 句：核心语言/运行时、主要技术选型特点、关键技术约束（如编译宏、平台限制）。
     示例：「基于 C++11 的多进程服务，使用 Informix 数据库，通过共享内存和 Socket 进行进程间通信；
     支持条件编译控制加密功能（#ifdef __NOENCRYPTPWD__）。」-->

---

## 2. 仓库与工程事实

### 2.1 README / 清单摘要

{{README_PACKAGE_SUMMARY}}

<!-- 基于对 README、Makefile/CMakeLists 等的实际阅读；说明构建环境要求、编译命令、运行命令 -->

### 2.2 目录与边界（来自源码树）

{{REPO_LAYOUT_NOTES}}

<!-- 顶层目录职责一句话；指出「核心业务」「适配外部系统」「测试与工具」各自落在哪些路径 -->

### 2.3 构建系统

{{BUILD_SYSTEM}}

<!-- 构建目标列表（每个 target 对应一个可执行产物）、链接库（-l 标志）、编译宏（-D 标志）、
     编译顺序（来自 makeall/CMakeLists 顶层结构） -->

### 2.4 多仓库组成与跨仓关联（产品多仓时必填）

{{MULTI_REPO_OVERVIEW}}

<!-- 当产品对应多个 Git 仓库时填写；单仓产品写「不适用：本产品单仓库交付」并一句说明即可。
     建议内容：
     - 仓库清单：`仓库名` → 主要职责一句话（与 `get_repo_info` / `GNX_REPO_LIST` 一致）
     - **跨仓关联证据**：配置中的 URL/服务名、proto/OpenAPI 依赖、gRPC/HTTP 客户端、消息 topic、共享 DB 名等（须 `仓库名:路径`）
     - **一致性观察**：错误码分段、API 前缀、包命名在多仓间是否对齐；明显不一致处标「[待产品/架构确认]」
     勿重复 FUNCTIONAL_ARCH 中的业务故事，只保留工程与集成事实。-->

---

## 3. 技术栈

### 3.1 语言分布

{{TECH_STACK_TABLE}}

### 3.2 关键框架与依赖

{{FRAMEWORKS_TABLE}}

<!-- 表格：依赖名 | 版本/标志 | 用途 | 引入位置（Makefile 行或 CMakeLists）
| 依赖 | 版本/标志 | 用途 | 引入位置 |
|------|---------|------|---------|
| ... | ... | ... | ... |
-->

### 3.3 技术栈依赖图

<!--
  图示模式（由 whalecloud-dev-tool-arch-create Phase 0 判定，见 SKILL.md「图示模式」）：

  · Excalidraw 模式：仅当本任务已挂载技能 whalecloud-dev-tool-excalidraw 时——按该技能规范写出 tech-stack.excalidraw，
    此处 {{DIAGRAM_TECH_STACK}} 放指向该文件的 Markdown 链接或嵌入约定；不可用纯文字描述替代图示产物。
  · Mermaid 模式：未挂载上述技能时——**不得**生成 .excalidraw；须在本节填入完整 ```mermaid … ``` 代码块
    （推荐 flowchart TB / graph LR 表达依赖方向），节点名须来自 Phase 1b 构建清单中的真实依赖名；图下一句「图示来源」+ 源码路径。
-->

{{DIAGRAM_TECH_STACK}}

---

## 4. 系统分层架构

### 4.1 分层架构概览图

<!--
  图示模式（同 §3.3，见 SKILL.md「图示模式」）：

  · Excalidraw 模式：已挂载 whalecloud-dev-tool-excalidraw 时——写出 sys-arch-layers.excalidraw，此处放链接/嵌入约定。
  · Mermaid 模式：未挂载时——**不得**生成 .excalidraw；须在本节填入完整 ```mermaid … ```（分层框 + 依赖方向），
    层名来自源码目录结构，连线依据 Phase 1b #include/import；每层关联 CORE_FEATURES；clusterCollapse 规则同 SKILL。
     图下「图示来源」+ 源码路径证据。
-->

{{DIAGRAM_SYSTEM_OVERVIEW}}

### 4.2 架构设计说明

{{ARCHITECTURE_RATIONALE}}

<!-- 说明依赖方向、同步/异步边界、与部署单元（进程、容器）的对应关系 -->

### 4.3 各层详解

<!-- 每层格式：

#### 4.3.x {{LAYER_NAME}} Layer

**职责**：{{LAYER_INTENT}}

**承载核心功能**：[功能名1]、[功能名2]（见 FUNCTIONAL_ARCH.md §3）

**包含模块**：
{{LAYER_CONTENT}}

**关键设计决策**：
{{LAYER_DECISIONS}}

**代表性头文件**：
- `path/to/Module.h`：说明该文件在本层的角色

---
-->

{{LAYER_DETAILS}}

---

## 5. 运行形态与执行流

### 5.1 常驻进程（Daemon）

{{DAEMON_PROCESSES}}

<!-- 表格：进程名 | 入口文件 | 启动命令 | 主要职责 | 涉及核心功能
| 进程名 | 入口文件 | 主要职责 | 涉及核心功能 |
|--------|---------|---------|------------|
| ... | ... | ... | ... |
-->

---

### 5.2 工具进程（Tool/CLI）

{{TOOL_PROCESSES}}

---

### 5.3 核心执行流说明

{{EXECUTION_FLOWS_DETAIL}}

<!-- 对每个核心功能项（来自 CORE_FEATURES）描述其执行路径：
     用户/调用方动作 → 入口 → 关键类/方法调用序列 → 输出

     步骤表优先于抽象描述：
     | 步骤 | 模块 | 方法/符号 | 文件 |
     |------|------|----------|------|
     标注当前步骤涉及哪个核心功能项。
-->

---

## 6. 模块依赖与变更风险

### 6.1 模块间依赖概览

{{MODULE_DEPENDENCY_TABLE}}

<!-- 来自 Phase 1b 步骤 D 的 Grep 结果：
| 模块（目录） | 直接依赖 | 被依赖方 | 说明 |
|------------|---------|---------|------|
-->

### 6.2 高扇入模块（变更需谨慎）

{{HIGH_RISK_MODULES}}

> **说明**：高被依赖模块修改前应做**调用方与数据契约**梳理；若有代码图谱工具，可辅助做影响分析，但结论须与源码核对。

### 6.3 编译期约束（#ifdef 分支）

{{COMPILE_CONSTRAINTS}}

<!-- 列出关键条件编译分支及其架构含义：
| 宏名 | 含义 | 影响范围 |
|------|------|---------|
| `_INFORMIX` | 使用 Informix 数据库 | `DbLayer/` 目录 |
-->

---

## 7. 源码佐证与关键路径

> 本节以**真实文件与符号**支撑上文结论，避免仅引用统计数字。

### 7.1 入口与启动路径

{{SOURCE_ENTRYPOINTS}}

<!-- 列出：主入口文件、bootstrap、HTTP listen、CLI main；每处 1～2 句 + 路径 -->

### 7.2 代表性实现摘录（设计意图说明）

{{SOURCE_SNIPPETS_ANALYSIS}}

<!-- 对亲自 Read 的源码片段：说明「这段代码如何体现分层/业务规则/错误处理策略」，
     勿大段无注释粘贴；重点展示与核心功能相关的实现片段 -->

---

## 8. 附录

### 8.1 工程度量（仅供参考）

以下数字仅反映索引时的快照，**不能替代**对源码与行为的设计判断。

| 指标 | 数值 |
|------|------|
| 符号规模（函数/类/方法等） | {{METRICS_SYMBOLS}} |
| 关系总数 | {{METRICS_RELATIONS}} |
| 执行流条数 | {{METRICS_PROCESSES}} |
| 功能域（聚类）数量 | {{METRICS_CLUSTERS}} |
| 常驻 / 工具进程（启发式分类） | {{METRICS_DAEMONS}} / {{METRICS_TOOLS}} |

### 8.2 架构决策记录（技术视角）

{{ADR_LIST}}

<!-- 仅记录影响技术选型、分层边界、运行形态的决策；功能决策见功能架构文档 -->

### 8.3 已知技术债务

{{TECH_DEBT}}

### 8.4 技术演进建议

{{TECH_RECOMMENDATIONS}}

### 8.5 数据采集说明（内部）

- **结构化索引服务**：`{{GITNEXUS_URL}}`（仅团队内部部署时使用）
- **索引中的仓库名**：`{{PROJECT_NAME}}`
- **原始采集文件**：`arch-data.json`（与本文档同目录时可附）
- **采集命令**：`run_skill_script(skill_name="whalecloud-dev-tool-base-scripts", script_name="fetch-arch-data.js", args=["--url", "<URL>", "--repo", "<NAME>", "--with-snippets"])`

---

*本文档为技术补充文档；产品定位与业务能力见 [FUNCTIONAL_ARCH.md](FUNCTIONAL_ARCH.md)。源码阅读为论证主体，工程度量为附录。*
