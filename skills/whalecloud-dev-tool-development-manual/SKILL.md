---
name: whalecloud-dev-tool-development-manual
description: "产品开发手册生成技能 - 通过产品名称获取产品描述信息和功能架构文档，结合 GitNexus 源码缓存检索，生成涵盖产品概述、代码分层结构、术语一致性、代码风格、能力复用、核心模块、API接口、配置调优、目录修改风险评估共 9 个章节的产品开发手册"
label: 产品研发手册生成工具
---

# 产品用户手册生成技能

通过产品名称获取产品描述信息和功能架构文档，结合 GitNexus 源码缓存检索，生成覆盖templates/产品研发手册.md模板文件中所有章节的完整产品用户手册。

## 共享脚本（run_skill_script）

与 SynapseService / GitNexus 交互的脚本位于技能 **`whalecloud-dev-tool-base-scripts`**。业务技能**禁止**要求用户传入脚本根路径，一律通过：

```text
run_skill_script(
  skill_name="whalecloud-dev-tool-base-scripts",
  script_name="<脚本名>",
  args=[...]
)
```

详见该技能 SKILL.md。本技能目录下**不再**包含脚本副本；仅保留 `templates/` 与本 SKILL。

---

## Parameters

| Parameter | 必填 | 说明 / 示例 |
|-----------|------|----------------|
| `PROD` | 是 | 产品名称，如 `XXX营销`、`账务系统` |
| `SYNAPSE_URL` | 是 | SynapseService 统一服务地址，如 `192.168.1.100:8080` |
| `GITNEXUS_URL` | 是 | GitNexus 服务地址，如 `http://127.0.0.1:11011` |
| `OUTPUT_DIR` | 否 | 输出目录，默认 `./docs/` |
| `OUTPUT` | 否 | 输出文件名，默认 `产品研发手册.md` |
| `TMP_DIR` | 否 | 临时文件目录，默认 `{OUTPUT_DIR}/.tmp/`，其下存储 `docs/`（架构文档）和 `.gnx-cache/`（源码缓存，按仓库分目录） |
| `DEBUG` | 否 | 调试模式，默认 `false`。为 `true` 时：①每个工作流程步骤输出关键调试信息到 `{TMP_DIR}/user_manual_debug.md`；②保留临时文件（`.gnx-cache/`）以便复查。为 `false` 时生成目标文件后自动清理临时源码缓存 |

> **仓库名称**：无需手动传递。技能启动时通过 `run_skill_script(..., script_name="get_repo_info.py", ...)` 从 SynapseService 获取该产品关联的**所有代码仓库**列表。一个产品通常由多个仓库组合而成，最终用户手册整合所有仓库的源码分析结果。

---

## 核心约束（违反视为未完成本技能）

### A. 源码核验必选

- 产品可能由**多个仓库**组成，每个仓库独立缓存至 `{TMP_DIR}/.gnx-cache/{REPO_NAME}/` 目录。
- 用户手册中凡涉及**分层路径、模块边界、API 签名、配置项、关键符号**等结论，须在对应仓库缓存上通过 **`gnx-tools.js read` 或 `grep`** 至少提供一条可核对证据。
- **跨仓库结论必须分别核验**：对每个仓库独立执行 grep/read，并在输出中标注信息来源于哪个仓库。
- 无法通过源码验证的条目必须标注 **`[待代码确认]`**，不得虚构。
- 章节内容若仅有一句泛化描述而无具体代码落点，视为该章节未完成。

### B. 模板变量覆盖率

- 用户手册输出必须覆盖 `templates/产品研发手册.md` 中的所有 `{{变量名}}` 占位符。
- 若某章节在当前产品中不适用，须填写 `[不适用]` 并说明原因，不得留空。
- 循环变量（`{{#each}}...{{/each}}`）若无对应数据，须移除该循环块并在对应位置标注 `[暂无]`。

### C. 产出文件命名

- 主产出固定为 `{OUTPUT_DIR}/{OUTPUT}`，默认 `docs/产品研发手册.md`。

### D. 调试日志记录（DEBUG=true 时生效）

- 调试日志文件固定为 `{TMP_DIR}/user_manual_debug.md`。
- Ph0 初始化时清空旧日志并写入表头（时间戳、参数列表），后续每个步骤追加记录。
- 每条日志须包含：`[时间戳]` `[Phase/步骤编号]` 操作摘要、关键输入参数、关键输出/结果。
- 命令执行类步骤：记录完整命令与退出码。
- 数据提取类步骤：记录提取到的关键数据摘要（如仓库列表、技术栈映射、模块数量等）。
- 异常/失败类步骤：记录错误详情与处理策略。

---

## Workflow

```
Phase 0 — 参数校验与环境准备
  0a. 校验必填参数：对照 Parameters 章节，必填字段缺失则中止并列出缺失参数。
  0b. 自动获取产品关联的所有仓库：
        → run_skill_script(skill_name="whalecloud-dev-tool-base-scripts", script_name="get_repo_info.py", args=["--server-url", "{SYNAPSE_URL}", "--prod", "{PROD}"])
      解析输出「产品：XXX 一共有N个仓库：REPO1,REPO2」，提取所有仓库名列表，记为 GNX_REPO_LIST。
      若输出包含「未找到仓库信息」则**中止**并提示：该产品未关联代码仓库，请检查 PROD 参数。
  0c. 创建输出目录和临时目录（若不存在）：
        → mkdir -p {OUTPUT_DIR} {TMP_DIR} {TMP_DIR}/docs
        → 为每个仓库创建独立缓存目录：mkdir -p {TMP_DIR}/.gnx-cache/{REPO_NAME}
  0d. 调试日志初始化（仅 DEBUG=true 时执行）：
        → 创建/清空 {TMP_DIR}/user_manual_debug.md
        → 写入日志表头：时间戳、PROD、SYNAPSE_URL、GITNEXUS_URL、输出路径等关键参数
        → 格式示例：
          ```
          # 用户手册生成调试日志
          - 生成时间：2026-05-13 10:30:00
          - 产品名称：XXX营销
          - Synapse 地址：192.168.1.100:8080
          - GitNexus 地址：http://127.0.0.1:11011
          - 输出路径：docs/产品研发手册.md
          ---
          ```

Phase 1 — 获取产品资料（从 SynapseService）
  1a. 获取产品描述信息：
        → run_skill_script(skill_name="whalecloud-dev-tool-base-scripts", script_name="get_doc.py", args=["--doc_type=产品手册", "--server_url", "{SYNAPSE_URL}", "--prod", "{PROD}", "--output", "{TMP_DIR}/docs"])
  1b. 获取功能架构文档：
        → run_skill_script(..., script_name="get_doc.py", args=["--doc_type=产品架构", "--server_url", "{SYNAPSE_URL}", "--prod", "{PROD}", "--doc_name=FUNCTIONAL_ARCH.md", "--output", "{TMP_DIR}/docs"])
  1c. 获取技术架构文档：
        → run_skill_script(..., script_name="get_doc.py", args=["--doc_type=产品架构", "--server_url", "{SYNAPSE_URL}", "--prod", "{PROD}", "--doc_name=TECH_ARCH.md", "--output", "{TMP_DIR}/docs"])
  1d. 校验关键文档：确认 {TMP_DIR}/docs/ 下存在 FUNCTIONAL_ARCH 和 TECH_ARCH 相关文件；任一缺失则中止并提示文档下载失败。
  1e. 阅读并提取产品概述信息：
        - 产品简介、核心能力、适用场景、技术栈（用于 §1）
  1f. 调试输出（仅 DEBUG=true）：追加记录 → 下载的文档列表、文档大小、校验结果，以及提取到的产品概述摘要。

Phase 2 — 获取源码资料（从 GitNexus，按仓库遍历）
  **对 GNX_REPO_LIST 中的每个仓库依次执行以下步骤：**

  2a. 下载源码到本地缓存：
        → run_skill_script(skill_name="whalecloud-dev-tool-base-scripts", script_name="gnx-tools.js", args=["materialize", "--url", "{GITNEXUS_URL}", "--repo", "{REPO_NAME}", "--cache", "{TMP_DIR}/.gnx-cache/{REPO_NAME}", "--concurrency", "8"])
  2b. 获取项目概览：
        → run_skill_script(..., script_name="gnx-tools.js", args=["overview", "--url", "{GITNEXUS_URL}", "--repo", "{REPO_NAME}", "--out", "{TMP_DIR}/.gnx-cache/{REPO_NAME}/overview.json"])
  2c. 检测工程类型：
        → run_skill_script(..., script_name="detect-project-kind.js", args=["--cache", "{TMP_DIR}/.gnx-cache/{REPO_NAME}", "--overview", "{TMP_DIR}/.gnx-cache/{REPO_NAME}/overview.json"])
      将每个仓库的工程类型检测结果汇总，形成「仓库 → 技术栈」映射表（用于 §1 技术栈和 §4 代码风格）。
  2d. 分析源码结构：
        从各仓库的 overview.json 提取 Community（模块群）和 Process（关键流程），形成跨仓库的模块全景图。
  2e. 任一仓库 materialize 失败：记录该仓库为「未能获取」，后续章节涉及该仓库的内容标注 `[待补充-{REPO_NAME}仓库未获取]`，继续处理其余仓库。
        **仅当所有仓库均 materialize 失败时才中止。**
  2f. 调试输出（仅 DEBUG=true）：追加记录 → 每个仓库的 materialize 状态、overview 生成状态、工程类型检测结果汇总表（仓库→技术栈）。

Phase 3 — 逐章节分析填充（跨仓库聚合）
  针对模板 templates/产品研发手册.md 中的 9 个章节，按以下策略逐章提取信息。
  **核心原则：架构文档缩小搜索范围，代码确认结论。所有 grep/read/cypher 操作均需对 GNX_REPO_LIST 中每个已缓存的仓库分别执行，然后聚合结果。**

  §1 产品概述：
    - 从 FUNCTIONAL_ARCH §1/§2 提取产品简介、核心能力、适用场景 → 直接填入模板
    - 从 TECH_ARCH §3「技术栈」提取语言分布和框架依赖
    - 代码确认：read package.json / CMakeLists.txt 核验 TECH_ARCH 列出的版本号
    - 从 Phase 2c 的工程类型检测结果交叉验证技术栈
    - 若某仓库未获取成功，技术栈中标注 `[待补充]`

  §2 代码分层结构：
    - 从 TECH_ARCH §4「系统分层架构」提取各层描述（职责、目录路径、关键模块）
    - 代码确认：对 TECH_ARCH 给出的各层目录路径逐个 grep 确认目录存在
    - 对每个逻辑层，提取跨仓库的：目录路径（标注所属仓库）、职责、依赖方向、关键模块
    - 跨仓库的层间依赖关系需特别标注
    - **以 Mermaid 图表格式输出**：
      · §2.1 总体分层（LAYER_OVERVIEW）：flowchart TB，使用 subgraph 按仓库/层分组展示各层模块节点，标注层间依赖方向（上层→中层→底层）
      · §2.2 层间依赖关系（LAYER_DEPENDENCY_GRAPH）：flowchart LR，展示跨仓库的模块级依赖关系图，用实线箭头标注直接依赖，虚线标注间接依赖
      · §2.4 层间调用交互（LAYER_INTERACTION_RULES）：sequenceDiagram，展示一次典型请求在各层之间的调用时序和跨仓库通信

  §3 术语一致性规范：
    - 从 TECH_ARCH §4 模块名称和 FUNCTIONAL_ARCH §3 角色标注中提取术语清单
    - 代码确认：对提取出的每个术语逐一执行 gnx-tools.js grep 精准匹配，确认代码落点
    - 整理术语表：术语 | 含义 | 代码落点（仓库:路径）
    - 跨仓库的命名一致性需特别说明：同一概念在不同仓库中的命名是否统一

  §4 代码风格统一：
    - 从 TECH_ARCH §2.2「目录与边界」了解目录布局，确定各仓库的语言类型
    - 代码确认：从 TECH_ARCH §2.2 给出的各目录中各挑一个代表性文件 read 分析风格
    - 若多个仓库使用不同语言栈（如 C++ + Java），分仓库说明各自的风格规范
    - 确定命名风格（驼峰/下划线、大小写约定等），标注仓库差异
    - 分析目录布局规律
    - 提取注释、错误处理、日志风格模式

  §5 能力复用说明（工具箱思维）：
    - **【步骤1：定位基础设施目录】以 TECH_ARCH 为地图**：
        · 从 TECH_ARCH「2.2 目录与边界」目录树中筛选基础设施类目录
        · 识别信号：目录名含 utils、common、base、helper、infra 等通用词，或在 TECH_ARCH §4 分层中处于公共底层
        · 记录基础设施目录清单：仓库:目录路径（如 仓库A:src/utils/、仓库B:common/）
    - **【步骤2：枚举发现基础设施】** 枚举所有常见基础设施类别，对步骤1的每个目录执行 ls 列出文件，
        通过文件名判断哪些文件对应哪些类别，需要覆盖的类别：
        · 字符串处理（String/Str/string/format/trim/split/join/replace）
        · 日期时间处理（Date/Time/DateTime/timestamp/calendar/chrono）
        · 文件 I/O 处理（File/IO/readFile/writeFile/stream/path）
        · 操作系统封装（OS/Platform/System/env/process/filesystem）
        · 编解码（Base64/Hex/encode/decode/MD5/SHA/CRC/Hash/crypto）
        · 网络通信（Http/HttpClient/Socket/RPC/request/transport）
        · 并发与线程（Thread/Mutex/Lock/concurrent/atomic/Semaphore/pool）
        · 日志（Log/Logger/logging）
        · 序列化（Codec/json/xml/protobuf/msgpack/marshal/serialize）
        · 缓存（Cache/lru/LFU/buffer/pool）
        · 校验与断言（Validator/Assert/check/verify/validate）
        · 命令行参数解析（Args/Options/getopt/flag/cli）
        · 数学与数值计算（Math/Random/decimal/bigint/statistics）
        · 国际化与本地化（i18n/locale/charset/encoding/UTF/unicode）
        仅当文件名与某类别存在明显语义关联时，才标记该目录下有该基础设施
    - **【步骤3：确认并列举使用场景】** 对文件名匹配到的每个基础设施：
        · gnx-tools.js read 确认类名和公开 API
        · grep 搜索该基础设施关键 API 在项目中的所有调用位置，逐一 read 调用方上下文
        · **至少列举 3 种使用场景**，场景格式：`[调用方功能模块名] 场景描述`
        · 若实际调用点不足 3 个，如实列出并标注 `[仅发现 N 处调用]`
    - 整理为：能力名称 | 代码路径（仓库:路径） | 使用场景 | 关键 API
    - 若同一能力在多个仓库中均有实现，说明各仓库中的角色差异

  §6 核心模块解读：
    - 从 FUNCTIONAL_ARCH §3「核心功能详解」各模块的「代码影响范围」表格中提取模块清单，
      表格已包含每个模块的文件路径和角色
    - 代码确认：直接 gnx-tools.js read 表格中标注的入口文件，提取类/接口、职责、关键方法
    - 从 TECH_ARCH §6.1「核心依赖关系」获取模块间依赖描述
    - 代码确认：对 TECH_ARCH §6.1 列出的关键依赖边，用 cypher 验证依赖方数量是否匹配：
      → run_skill_script(..., script_name="gnx-tools.js", args=["cypher", "--url", "{GITNEXUS_URL}", "--repo", "{REPO_NAME}", "--cypher", "<查询>"])
    - 标注每个模块的所属仓库

  §7 API 接口规范：
    - 从 FUNCTIONAL_ARCH §3 各功能的「关键入口」和 TECH_ARCH §4 接口层描述中提取 API 文件清单
    - 代码确认：直接 gnx-tools.js read 文档列出的 API 文件，提取：路径、方法、请求参数、响应格式、错误码
    - 区分对外接口（面向用户/第三方）和内部接口（仓库间通信）
    - 标注每个接口所属仓库

  §8 配置文件与参数调优：
    - 从 TECH_ARCH §2.2「目录与边界」中定位 config/conf 等配置相关目录
    - 从架构文档中提取配置项和调优建议
    - **从代码角度搜集配置证据**（不直接查找配置文件）：
        · 对配置相关目录执行 ls 列出所有文件，通过文件名和 read 入口文件识别实际的配置加载方式（而非预设关键词）
        · 使用 gnx-tools.js read 阅读配置加载代码，提取应用运行时实际读取的配置项名称、默认值、类型
        · 追踪配置项的消费点：grep 搜索配置项名称在代码中的使用位置，确认配置项的实际作用范围
    - 整理为：配置项名称 | 默认值 | 类型 | 作用说明 | 加载位置（仓库:路径） | 消费位置（仓库:路径）
    - 标注每个配置项所属仓库
    - 从架构文档补充参数调优建议

  §9 目录修改风险评估：
    - 从 TECH_ARCH §6「模块依赖与变更风险」提取已有的风险评估结论（高/中/低风险目录及原因）
    - 从 TECH_ARCH §4「系统分层架构」提取分层依赖方向，处于底层的公共层改动影响大
    - 从 FUNCTIONAL_ARCH「代码影响范围」表格统计各目录被功能模块引用的频次
    - 代码确认：对 TECH_ARCH §6 标注的高风险目录，用 cypher 验证依赖方数量：
      → run_skill_script(..., script_name="gnx-tools.js", args=["cypher", "--url", "{GITNEXUS_URL}", "--repo", "{REPO_NAME}", "--cypher", "<查询>"])
    - 风险评估规则：
      · 🔴 高风险：TECH_ARCH §6 标注的高风险、或处于底层公共层（接口定义、数据模型、核心协议）
      · 🟡 中风险：TECH_ARCH §6 标注的中风险、或处于中间服务层
      · 🟢 低风险：TECH_ARCH §6 标注的低风险、或处于上层业务/UI 层
    - 整理为：目录 | 所属仓库 | 风险等级 | 影响范围（列出依赖方） | 说明
    - 输出高风险目录修改指南（修改前需要哪些评审、回归测试范围）和低风险目录说明（可较自由修改的目录清单）

  调试输出（仅 DEBUG=true）：追加记录 → 每个章节的分析完成状态（填充/待补充/不适用）、源码核验命中数、跨仓库覆盖情况。

Phase 4 — 生成用户手册
  4a. 读取模板 templates/产品研发手册.md，获取所有占位符列表。
  4b. 将 Phase 3 分析结果按模板结构逐章节填入，跨仓库信息需标注所属仓库。
  4c. 对于无法从文档/源码中获取的信息，标注 `[待补充]`。
  4d. 对于不适用于当前产品的章节，标注 `[不适用]` 并说明原因。
  4e. 对于某个仓库未成功获取导致的缺失信息，标注 `[待补充-{REPO_NAME}仓库未获取]`。
  4f. 将填充完成的文档写入 {OUTPUT_DIR}/{OUTPUT}。
  4g. 清理临时文件：
        - 若 DEBUG=true：保留 {TMP_DIR}/.gnx-cache/ 目录，输出提示「调试模式：临时源码缓存已保留于 {TMP_DIR}/.gnx-cache/」。
        - 若 DEBUG=false：删除 {TMP_DIR}/.gnx-cache/ 目录（保留 {TMP_DIR}/docs/ 以备复查）。
  4h. 调试输出（仅 DEBUG=true）：追加记录 → 最终输出文件路径、文件大小、各章节填充率统计、未解决标记汇总。
        输出提示「调试日志已保存至 {TMP_DIR}/user_manual_debug.md」。
```

---

## 使用脚本说明

| 脚本 | 用途 | 详细文档 |
|------|------|----------|
| `get_repo_info.py` | 获取产品关联的代码仓库列表 | [../whalecloud-dev-tool-base-scripts/references/get_repo_info_readme.md](../whalecloud-dev-tool-base-scripts/references/get_repo_info_readme.md) |
| `get_doc.py` | 从 SynapseService 下载产品文档 | [../whalecloud-dev-tool-base-scripts/references/get_doc_readme.md](../whalecloud-dev-tool-base-scripts/references/get_doc_readme.md) |
| `gnx-tools.js` | 与 GitNexus 交互（下载/检索/查询） | [../whalecloud-dev-tool-base-scripts/references/README-GNX-TOOLS.md](../whalecloud-dev-tool-base-scripts/references/README-GNX-TOOLS.md) |
| `detect-project-kind.js` | 检测项目工程类型 | [../whalecloud-dev-tool-base-scripts/references/README-GNX-TOOLS.md](../whalecloud-dev-tool-base-scripts/references/README-GNX-TOOLS.md) |

以上脚本均通过 `run_skill_script(skill_name="whalecloud-dev-tool-base-scripts", ...)` 执行。

---

## 输出文件

- 用户手册：`{OUTPUT_DIR}/{OUTPUT}`，格式参考 `templates/产品研发手册.md`
- 调试日志（仅 DEBUG=true）：`{TMP_DIR}/user_manual_debug.md`
- 临时目录：`{TMP_DIR}/docs/`（架构文档）、`{TMP_DIR}/.gnx-cache/{REPO_NAME}/`（各仓库源码缓存，Phase 4 结束后根据 DEBUG 决定是否清理）

---

## Error Handling

| 情况 | 处理 |
|------|------|
| 缺少必填参数（PROD/SYNAPSE_URL/GITNEXUS_URL） | **中止**，列出缺失参数 |
| get_repo_info.py 返回「未找到仓库信息」 | **中止**，提示该产品未关联代码仓库 |
| SYNAPSE_URL 不可达或 get_doc.py 下载失败 | 若架构文档缺失则**中止**，手册类文档缺失可继续但标注 `[待补充]` |
| GITNEXUS_URL 不可达或全部仓库 materialize 均失败 | **中止**，不得输出无源码核验的用户手册 |
| 部分仓库 materialize 失败 | 记录失败仓库名，后续涉及该仓库的内容标注 `[待补充-{REPO_NAME}仓库未获取]`，继续处理其他仓库 |
| 缓存中无某文件路径 | 标 `[待代码确认]`，不得虚构内容 |
| 某章节在当前产品不适用 | 标注 `[不适用]` 并简要说明原因 |
| 某信息无法从文档/源码获取 | 标注 `[待补充]` |
| OUTPUT_DIR 不可写 | 中止并说明 |

---

## Checklist

**准备阶段**
- [ ] PROD、SYNAPSE_URL、GITNEXUS_URL 已确认
- [ ] get_repo_info.py 已执行，GNX_REPO_LIST 已获取
- [ ] OUTPUT_DIR、TMP_DIR 目录已创建
- [ ] 每个仓库的缓存目录 `{TMP_DIR}/.gnx-cache/{REPO_NAME}/` 已创建
- [ ] 调试日志（若 DEBUG=true）已初始化：`{TMP_DIR}/user_manual_debug.md` 已创建含表头

**资料获取阶段**
- [ ] 产品描述/手册文档已获取
- [ ] FUNCTIONAL_ARCH.md 和 TECH_ARCH.md 已下载
- [ ] **每个仓库**源码缓存已完成 materialize（失败仓库已记录）
- [ ] **每个仓库** overview.json 已生成
- [ ] **每个仓库**工程类型已检测并汇总

**分析填充阶段**
- [ ] §1 产品概述：产品简介、核心能力、适用场景、技术栈 已填充
- [ ] §2 代码分层结构：各层目录路径、职责、依赖方向、关键模块已标注来源，分层 Mermaid 流程图、依赖关系图和调用时序图已生成
- [ ] §3 术语一致性规范：核心术语含代码落点
- [ ] §4 代码风格统一：命名/目录/注释/错误/日志 基于真实源码
- [ ] §5 能力复用说明：工具箱清单含名称/路径/使用场景/关键API
- [ ] §6 核心模块解读：含类/接口/方法/依赖关系
- [ ] §7 API 接口规范：对外接口含路径/方法/参数/响应
- [ ] §8 配置文件与参数调优：配置文件清单 + 关键参数
- [ ] §9 目录修改风险评估：目录/仓库/风险等级/影响范围 + 修改指南

**产出阶段**
- [ ] 用户手册已生成于 {OUTPUT_DIR}/{OUTPUT}
- [ ] 所有模板占位符已填充（含 `[不适用]` 或 `[待补充]` 标记）
- [ ] 跨仓库信息均标注来源仓库
- [ ] 关键结论均有源码证据或标注 `[待代码确认]`
- [ ] 临时源码缓存已根据 DEBUG 配置处理（false=清理 / true=保留）
- [ ] 调试日志（若 DEBUG=true）已完整记录并保存至 `{TMP_DIR}/user_manual_debug.md`
