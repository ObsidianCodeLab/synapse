---
name: whalecloud-dev-tool-c-code-access
description: "研发会议室代码精读。执行前须确认 USER_REQUEST、ENTRY_MODULE，并从 system「产品工作区路径」选取 REPO_NAME / CODE_PATH（禁止臆造路径）。在工单目录读码，GitNexus 图检索辅助。"
label: 代码阅读
---

# 代码阅读（研发会议室）

围绕**用户诉求**与**入口模块**，在工单目录中的真实源码上做**准确、高效**的定向阅读。支持任意语言（C++、Java、Python、Go 等）。

> **【执行前须确认】**
>
> | 要素 | 提取来源 | 要求 |
> |------|----------|------|
> | **`USER_REQUEST`** | 用户本轮/本会话诉求、委派任务说明、需求澄清结论等上下文 | 用一句话复述诉求；说不清则**中止**并向用户确认 |
> | **`ENTRY_MODULE`** | `{PRODUCT_DOC_ROOT}/产品架构/` 下 `FUNCTIONAL_ARCH.md`、`TECH_ARCH.md`（及同目录相关文档） | **必须**能在文档中找到对应功能模块/分层/目录边界；**禁止臆造**模块名 |
> | **`REPO_NAME` + `CODE_PATH`** | system prompt **「产品工作区路径」** 段中各仓「路径参数」（与统一服务 `get_prod_info.repo_info` 对齐） | **禁止臆造**；须按本节「路径选取」规则选定**与目标代码对应**的一组；多仓时须先匹配再读码 |

`room_opened` 已将代码 clone 至工单目录、文档落至 `doc/`。GitNexus 脚本由 **`whalecloud-dev-tool-base-scripts`** 提供，通过 `run_skill_script` 跨技能调用。

## 研发会议室：工单路径（必读）

| 用途 | 路径 / 参数 |
|------|-------------|
| 工单根 | `{WORK_ORDER_DIR}` |
| 产品代码根 | `{PRODUCT_CODE_ROOT}`（默认 `{WORK_ORDER_DIR}/code`） |
| **本任务读码锚点** | **`CODE_PATH`**（system 注入，已含 `local/<repo_name>/<仓库内相对路径>`） |
| **GitNexus 仓库名** | **`REPO_NAME`**（与 `CODE_PATH` 同组，须一致） |
| 本仓 clone 根（推导） | `CODE_ROOT` = `{PRODUCT_CODE_ROOT}/{REPO_NAME}/` |
| 产品架构文档 | `{PRODUCT_DOC_ROOT}/产品架构/`（`FUNCTIONAL_ARCH.md`、`TECH_ARCH.md`） |

- **读源码**：优先以选定组的 **`CODE_PATH`** 为锚点，使用 `read_file` / `list_directory` / 工作区检索；相对路径标注为 `{REPO_NAME}:<相对 CODE_ROOT 的路径>`。
- **读架构**：只读 `{PRODUCT_DOC_ROOT}/产品架构/`，禁止重复拉取远端文档。
- **多仓库**：system 可能注入多组「代码 `{name}` 路径参数」；**每次读码前**须根据 `USER_REQUEST` / `ENTRY_MODULE` / 架构文档中的仓库列或路径前缀，**选定对应的一组** `REPO_NAME` + `CODE_PATH`，不得默认只用第一组。

### 路径选取（REPO_NAME / CODE_PATH）

1. **读取** system「产品工作区路径」中全部 `REPO_NAME` / `CODE_PATH` 对，建立候选表。
2. **对照诉求**：结合 `USER_REQUEST`、`ENTRY_MODULE` 与架构文档中的「代码影响范围 / 仓库列 / `仓库名:` 路径前缀」，判断目标代码落在哪一仓、哪一子目录。
3. **选定一组**：命中唯一候选 → 使用该组；多组均可能 → `list_directory` 各 `CODE_PATH` 与文档交叉验证后选定，仍无法区分则**中止**并向用户确认。
4. **读码范围**：架构表给出的文件/目录若在 `CODE_PATH` 之下，以 `CODE_PATH` 为根向下读；若在仓库其它位置，仍以 `CODE_ROOT` 为界，但**不得**跳出 `{PRODUCT_CODE_ROOT}` 臆造路径。
5. **GitNexus**：`gnx-tools.js` 的 `--repo` **必须**使用与当前读码相同的 **`REPO_NAME`**。

## 共享脚本（run_skill_script）

```text
run_skill_script(
  skill_name="whalecloud-dev-tool-base-scripts",
  script_name="gnx-tools.js",
  args=["<子命令>", ...]
)
```

在线图检索（`search` / `explore` / `impact` / `cypher`）及可选 `overview` 见 [references/gnx-tools.md](../whalecloud-dev-tool-base-scripts/references/gnx-tools.md)。**本地读文件不以 materialize 为前提**（工单已 clone）。

---

## 何时加载

- 需核验某功能/模块实现、调用链、配置项、接口定义
- 已能从上下文归纳 **`USER_REQUEST`**，已从**产品文档**确认 **`ENTRY_MODULE`**，且已从 system「产品工作区路径」**选定**与目标代码对应的 **`REPO_NAME` / `CODE_PATH`**
- 结论须含 `{REPO_NAME}:相对路径` 证据

**不必加载**：`[无代码触点]`；仅读文档不读码。

---

## Parameters

### 诉求与模块（从上下文 / 文档提取）

| Parameter | 必填 | 说明 |
|-----------|------|------|
| `USER_REQUEST` | 是 | **从会话上下文提取**：当前要弄清的问题、变更意图、核验点。提取后须能一句话复述；无法确定则**中止**并向用户确认。 |
| `ENTRY_MODULE` | 是 | **从产品文档提取**：须在 `{PRODUCT_DOC_ROOT}/产品架构/` 中查到对应 §3 功能名、分层名或目录边界。**禁止臆造**；无匹配则标 `[待确认-架构未覆盖该模块]` 并中止或请用户确认。 |

### 读码路径（system「产品工作区路径」注入，须选取而非臆造）

| Parameter | 必填 | 说明 |
|-----------|------|------|
| `REPO_NAME` | 是 | 与 GitNexus 一致的仓库名。从 system 各组「路径参数」的 `REPO_NAME：` 行读取；**按「路径选取」选定与目标代码对应的一组**。多仓时禁止未匹配就使用第一组。 |
| `CODE_PATH` | 是 | 该仓**实际代码入口**的落盘绝对路径（`local/<repo_name>/<仓库内 code_path>`，与前台产品管理「代码路径」一致）。**`read_file` / `list_directory` / Grep 的首选锚点**；选定 `REPO_NAME` 后必须使用**同组** `CODE_PATH`。 |

### 环境与工具

| Parameter | 必填 | 说明 |
|-----------|------|------|
| `GITNEXUS_URL` | 是 | GitNexus 服务根地址（用于 `search` / `explore` / `impact` / `cypher` / 可选 `overview`） |
| `WORK_ORDER_DIR` | 否 | 工单根；系统提示「产品工作区路径」注入，如 `work/<scope>/` |
| `PRODUCT_CODE_ROOT` | 否 | 默认 `{WORK_ORDER_DIR}/code` |
| `PRODUCT_DOC_ROOT` | 否 | 默认 `{WORK_ORDER_DIR}/doc` |

**内部推导（勿要求用户传入）**

- `CODE_ROOT` = `{PRODUCT_CODE_ROOT}/{REPO_NAME}/`（clone 根；`CODE_PATH` 通常在其下或等于其本身）
- 架构目录 = `{PRODUCT_DOC_ROOT}/产品架构/`

> **入口文件映射**：在 `ENTRY_MODULE` 与 **已选定的 `REPO_NAME` / `CODE_PATH`** 均确认后，将 `ENTRY_MODULE` 转为 `ENTRY_FILES`。路径须能在架构文档中找到依据，并落在当前 `CODE_ROOT` 或 `CODE_PATH` 可访问范围内。**禁止**在无文档依据时编造路径。

---

## 核心约束

### C0. 先确认诉求、模块与路径，后读码（违反视为技能未执行）

- 未形成明确的 `USER_REQUEST` / `ENTRY_MODULE`，或未从 system「产品工作区路径」**选定**对应的 `REPO_NAME` + `CODE_PATH` 之前，**不得** `read_file` 源码或调用 `gnx-tools`。
- `ENTRY_MODULE` 须有**文档出处**（文件名 + 章节/表格/原文摘录）；`REPO_NAME` / `CODE_PATH` 须来自 system 注入且与文档中的仓库/路径线索**一致**；无依据即视为臆造。
- 允许向用户确认诉求或路径，但**不允许**用猜测路径代替 system 注入值。

### C1. 诉求驱动，入口锚定

- 阅读须能回答 `USER_REQUEST`；无关扩圈立即停止。
- 顺序：**架构入口** → 依赖链（import / include / 调用链）→ 图检索辅助 → 必要时 `search`/`cypher`。

### C2. 证据可核对

- 结论附带 **`{REPO_NAME}:相对路径`**（及符号/行号若可读）。
- 无法验证标 **`[待代码确认]`**。

### C3. 语言适配

- 根据仓库实际语言，选用对应的依赖追踪方式：
  - **C/C++**：`#include` 链、`Makefile` / `CMakeLists.txt`、`#ifdef` 条件编译
  - **Java**：`import`、`pom.xml` / `build.gradle`、接口实现类
  - **Python**：`import`、`pyproject.toml` / `setup.py`、类继承链
  - **Go**：`import`、`go.mod`、接口实现
  - **其他语言**：以架构文档中描述的入口/依赖约定为准
- 影响结论的条件编译/特性开关须写明约束。

### C4. 本地读码 vs GitNexus

- **本地**：`read_file` / 工作区 `Grep` 以 **`CODE_PATH`** 为首选锚点，必要时扩展到 `CODE_ROOT` 全仓；路径须在工单 clone 内。
- **在线**：`run_skill_script` 调用 `gnx-tools.js` 的 `search` / `explore` / `impact` / `cypher`（及可选 `overview`），`--repo` 使用当前选定的 **`REPO_NAME`**。
- **禁止**为读单个文件而要求用户传缓存目录或执行 `materialize`（会议室已由 `room_opened` 提供源码）。

---

## 入口文件优先级

在 `ENTRY_FILES` 对应目录下选锚点：

| 优先级 | 模式 | 说明 |
|--------|------|------|
| 0 | 架构表列出的具体文件 | **最优先** |
| 1 | 入口文件的直接依赖（import / include / 接口定义） | 实现入口 |
| 2 | `<Dir>/<DirName>Manager` / `Mgr` / `Service` / `Controller` | 管理/服务类 |
| 3 | `<Dir>/<DirName>` 同名主文件 | 同名主文件 |
| 4 | `Common` / `Base` / `Utils` 公共基类 | 公共基础 |
| 5 | 目录内最大文件 | fallback |

---

## 工作流程

```
Phase 0 — 诉求、模块与读码路径确认
  0a. 读取 {PRODUCT_DOC_ROOT}/产品架构/（及工单内相关产品文档）；**先于读码**。
  0b. **提取 `ENTRY_MODULE`**：根据 USER_REQUEST 在 FUNCTIONAL_ARCH §3、TECH_ARCH 分层/目录表中定位模块名；记录文档出处；无匹配则中止或 `[待确认]`。
  0c. **读取路径参数表**：从 system「产品工作区路径」列出全部 `REPO_NAME` / `CODE_PATH` 对。
  0d. **选定读码路径**：按「路径选取」规则，结合 ENTRY_MODULE 与文档中的仓库列 / `仓库名:` 前缀，选定**与目标代码对应**的一组 REPO_NAME + CODE_PATH；与 list_directory({PRODUCT_CODE_ROOT}) 交叉核对；多仓无法区分则中止或请用户确认。
  0e. **确认 `USER_REQUEST`**：从会话/委派上下文归纳一句话诉求；含糊则向用户确认后再继续。
  0f. 校验 GITNEXUS_URL、WORK_ORDER_DIR；确认 CODE_PATH 目录存在（或 CODE_ROOT 非空）；计算 CODE_ROOT = {PRODUCT_CODE_ROOT}/{REPO_NAME}/。
  0g. ENTRY_MODULE + 文档 → ENTRY_FILES；写入追踪表（含每条路径的文档依据，且落在 CODE_PATH / CODE_ROOT 可访问范围内）。

Phase 1 — 工程确认（可选图线索）
  1a. 在 CODE_PATH（必要时上溯到 CODE_ROOT）读构建文件（Makefile / CMakeLists.txt / pom.xml / build.gradle / go.mod / pyproject.toml 等）：TARGET、依赖、编译选项。
  1b. （可选）overview 写本地便于对照：
        run_skill_script(..., script_name="gnx-tools.js",
          args=["overview", "--url", "{GITNEXUS_URL}", "--repo", "{REPO_NAME}",
                "--out", "{CODE_ROOT}/overview.json"])
  1c. （可选）工程类型检测：
        run_skill_script(..., script_name="detect-project-kind.js",
          args=["--cache", "{CODE_ROOT}", "--overview", "{CODE_ROOT}/overview.json"])

Phase 2 — 入口精读（必读，本地读码）
  【Token 节约强约束】读任何源文件前，**必须**先 Grep 定位目标符号/关键词的行号，再用 offset+limit 精确读取目标片段（±60 行），**禁止**直接 read_file 整个文件。仅当文件总行数 ≤ 120 行时，可不 Grep 直接全文读取。
  对 ENTRY_FILES（按入口优先级）：
  2a. 先 Grep 目标类名/函数名/关键词 → 获得行号 → read_file(path, offset=<行号-30>, limit=120)；禁止臆造路径；优先从 CODE_PATH 向下展开。
  2b. 提取类/方法、依赖引用、与 USER_REQUEST 相关的逻辑。
  2c. 追踪直接依赖：Grep 依赖文件中目标类/接口名 → 精确读取相关片段。
  2d. 诉求涉及启动/CLI 时：在 CODE_ROOT 下 Grep 入口模式（如 `int main(`、`if __name__ == "__main__"`、`func main(`）。
  2e. 跨目录依赖：在 CODE_ROOT 下 Grep 类名、接口名、关键符号。

Phase 3 — 诉求驱动扩展（按需、早停）
  Phase 2 不足以回答时再执行：
  3a. run_skill_script(..., args=["search", "--url", "{GITNEXUS_URL}", "--repo", "{REPO_NAME}",
        "--query", "<类名/关键词>", "--limit", "15"])
  3b. run_skill_script(..., args=["explore"|"impact", ...]) — 已知符号/target。
  3c. **回到本地验证**：对图检索给出的 filePath，先 Grep 目标符号行号 → read_file(path, offset=<行号-30>, limit=120) 精确读取，**禁止**全文 read_file。
  3d. 必要时 run_skill_script(..., args=["cypher", ...])，filePath 过滤入口目录前缀。
  3e. 已能回答 USER_REQUEST 即停止。

Phase 4 — 输出阅读报告
  4a. **结论摘要**：直接回答 USER_REQUEST。
  4b. **入口与调用链**：ENTRY_MODULE → 文件 → 关键调用。
  4c. **证据表**：| 结论 | REPO:路径 | 依据（read_file / Grep / gnx-tools） |
  4d. **未决项**：`[待代码确认]` / `[待确认-架构未覆盖]`。
```

---

## gnx-tools 使用范围（会议室）

| 子命令 | 会议室是否使用 | 说明 |
|--------|----------------|------|
| `read` / `grep` / `materialize` | **否**（默认） | 本地用 `read_file` / 工作区 Grep 读 `CODE_ROOT` |
| `overview` | 可选 | 辅助 explore 选 target |
| `search` / `explore` / `impact` / `cypher` | 是 | 图检索，结果须回本地 read_file 验证 |

---

## 推荐本地 Grep 模式

在 `CODE_ROOT` 下（按语言选用）：

```text
# C/C++
#include\s+\"[^\"]+"
class\s+\w+(Mgr|Manager|Ctrl|Service)
#ifdef\s+_[A-Z0-9_]+
int\s+main\s*\(

# Java
class\s+\w+\s+(implements|extends)
@Override|@Service|@Component
public\s+static\s+void\s+main

# Python
^class\s+\w+
^def\s+\w+
if\s+__name__\s*==\s*["']__main__["']

# Go
^func\s+\w+
^type\s+\w+\s+(struct|interface)
^func\s+main\(
```

---

## Error Handling

| 情况 | 处理 |
|------|------|
| `USER_REQUEST` / `ENTRY_MODULE` 未确认，或 `ENTRY_MODULE` 无文档依据 | **中止**（禁止臆造后继续读码） |
| system 未注入 `REPO_NAME` / `CODE_PATH`，或多仓无法选定对应一组 | **中止**或向用户确认 |
| 文档中的仓库/路径与选定 `REPO_NAME` / `CODE_PATH` 不一致 | 标 `[待确认]`，**中止**或请用户确认 |
| 其它必填项缺失 | **中止** |
| `CODE_PATH` / `CODE_ROOT` 不存在或为空 | **中止**（工单未 clone 或未开门） |
| 架构文档缺失或 ENTRY_MODULE 无映射 | `[待确认]`，向用户确认 |
| 图检索无结果 | 记录；结论仍给出则标 `[待代码确认]` |
| 图检索路径与本地文件不一致 | 以本地 `read_file` 为准，标注差异 |

---

## Checklist

- [ ] `USER_REQUEST`、`ENTRY_MODULE` 已从上下文/产品文档提取并有依据（非臆造）
- [ ] 已从 system「产品工作区路径」**选定**与目标代码对应的 `REPO_NAME` + `CODE_PATH`（多仓时已匹配，非默认第一组）
- [ ] `CODE_PATH` / `CODE_ROOT` 可访问，架构文档已从 `{PRODUCT_DOC_ROOT}/产品架构/` 读取
- [ ] `ENTRY_FILES` 已从架构导出
- [ ] 入口文件已本地精读，依赖链已按需展开
- [ ] 图检索结论已在 `CODE_ROOT` 本地核对
- [ ] 每条结论含 `{REPO_NAME}:路径` 证据
