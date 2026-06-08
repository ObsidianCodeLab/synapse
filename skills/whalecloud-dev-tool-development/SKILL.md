---
name: whalecloud-dev-tool-development
description: "代码开发技能 - 按 split_plan.json 研发单清单，在 WORK_DIR/sandbox 沙箱中通过 Cursor CLI 逐单实现代码；支持 create_todo 排期、完成度检查与多轮纠偏。"
label: 代码开发技能
---

# 代码开发技能

按 **`split_plan.json`** 中的研发单清单，在 **`{WORK_DIR}/sandbox/`** 沙箱工作区内逐单改码。智能体须先 **`create_todo`** 排定执行顺序，再对外层**研发单**、内层 **Cursor 轮次**双重循环；每轮**必须**调用 `scripts/cursor-operation.py`（禁止直接调用 `agent`），自行验收；不通过则带 `--fix-feedback` 再次调用，直至该研发单完成或达到轮次上限。

---

## Parameters

| Parameter | 必填 | 说明 / 示例 |
|-----------|------|----------------|
| `WORK_DIR` | 是 | 研发会议室工作目录（与注入的 `WORK_ORDER_DIR` **同义**）。改码、拆单计划、执行日志均在此树下。 |
| `SPLIT_PLAN_DOC` | 否 | 研发单清单。默认：`{WORK_DIR}/archive/需求设计/solution_review/split_plan.json`（**唯一权威来源**；子智能体读取，不在代码仓内） |
| `FUNC_SOLUTION_DOC` | 是 | 函数级方案。默认：`{REPO_ROOT}/synapse_archive/需求设计/func_solution/函数级方案.md`（**Cursor 可读**） |
| `OUTPUT_DIR` | 是 | 产物目录。默认：`{WORK_DIR}/archive/需求研发/task_exec/` |
| `ACCEPTANCE_DOC` | 否 | 工单级验收标准。默认：`{REPO_ROOT}/synapse_archive/需求分析/acceptance/验收标准.md`（**存在则必查**；**Cursor 可读**） |
| `MAX_ROUNDS_PER_TASK` | 否 | **单个研发单**内最大 Cursor 轮次（含首轮），默认 `10` |
| `TIMEOUT` | 否 | 单次脚本 `--timeout`（秒），默认 `600` |

### 参数关系

- **`WORK_DIR`**：会议室根；`SPLIT_PLAN_DOC`、`OUTPUT_DIR` 在此树下推导。
- **`REPO_ROOT`**：当前研发单 `SANDBOX_PATH` 所属 Git 仓库根（含 `synapse_archive/`、`AGENTS.md`）；`FUNC_SOLUTION_DOC`、`ACCEPTANCE_DOC` 在其下 `synapse_archive/` 推导（**供 Cursor CLI 读取，禁止仍用 `{WORK_DIR}/archive/` 下副本**）。
- **研发单清单**：**仅以 `split_plan.json` 的 `tasks[]` 为准**；不使用 `userwork.json` 或其它来源覆盖顺序与条目。
- **改码目录**：**禁止**使用 `MODIFY_CODE_PATH` 参数；由 `WORK_DIR` + system 注入的 `CODE_PATH` **派生** `SANDBOX_PATH`（见下文）。
- **一研发单 ↔ 一仓库**：`split_plan` 每条 `tasks[]` 对应**恰好一个**代码仓库（一组 `REPO_NAME` + `CODE_PATH` + `SANDBOX_PATH`）。
- **统一日志**：`{OUTPUT_DIR}/development.log`（所有研发单、所有轮次**追加**写入；元信息头含研发单标识与轮次）。
- **不产出 patch**；变更以各研发单 `SANDBOX_PATH` 工作区源码为准。

---

## 沙箱路径派生（必读）

只读参考代码在 `{WORK_DIR}/code/`（`sandbox_build` 之前的开门落盘）；**本次改造只写** `{WORK_DIR}/sandbox/`（`sandbox_build` 节点已 clone 的 Git 工作区）。

从 system「产品工作区路径」读取各组 `REPO_NAME`、`CODE_PATH`，对每条研发单选定**唯一**匹配的一组，再派生沙箱路径：

```
SANDBOX_PATH = CODE_PATH 中将 "{WORK_DIR}/code/" 替换为 "{WORK_DIR}/sandbox/"
```

**示例**（`WORK_DIR = /work/21881453`）：

| CODE_PATH | SANDBOX_PATH（`cursor-operation.py --code-path`） |
|-----------|---------------------------------------------------|
| `/work/21881453/code/ZmdbCore` | `/work/21881453/sandbox/ZmdbCore` |
| `/work/21881453/code/ZmdbCore/src/module/foo` | `/work/21881453/sandbox/ZmdbCore/src/module/foo` |

规则：

1. **禁止**在 `code/` 下改码；**禁止**臆造 `sandbox/` 路径。
2. 执行前确认 `SANDBOX_PATH` 存在且为有效 Git 工作区（`.git` 在仓库根或 `--code-path` 所在仓内）。
3. `git diff` 在**该 SANDBOX_PATH 所属仓库根**执行；`--code-path` 为子目录时用 `git diff -- <相对路径>`。

### 研发文档路径派生（Cursor 可读）

`需求分析`、`需求设计` 文档已同步至代码仓 `synapse_archive/`（与 `AGENTS.md` 同级），结构见 `dev/agents.md.template_202606` §1.2。Cursor CLI **仅能访问沙箱工作区**，故 `--doc` / `--acceptance-doc` **必须**使用仓内路径：

```
REPO_ROOT     = SANDBOX_PATH 向上定位至含 synapse_archive/ 的 Git 仓库根
FUNC_SOLUTION = {REPO_ROOT}/synapse_archive/需求设计/func_solution/函数级方案.md
ACCEPTANCE    = {REPO_ROOT}/synapse_archive/需求分析/acceptance/验收标准.md
```

**示例**（`SANDBOX_PATH = /work/21881453/sandbox/ZmdbCore`）：

| 文档 | 路径 |
|------|------|
| 函数级方案 | `/work/21881453/sandbox/ZmdbCore/synapse_archive/需求设计/func_solution/函数级方案.md` |
| 验收标准 | `/work/21881453/sandbox/ZmdbCore/synapse_archive/需求分析/acceptance/验收标准.md` |

规则：

1. 执行前确认 `synapse_archive/` 已在 `REPO_ROOT` 落盘；缺失则 **中止该研发单**。
2. `SPLIT_PLAN_DOC` 仍在 `{WORK_DIR}/archive/`，由子智能体 `read_file`；**不要**传给 Cursor（无仓内副本）。
3. 其它 `synapse_archive/需求分析/*`、`synapse_archive/需求设计/*` 文档按需引用，路径均相对 `REPO_ROOT/synapse_archive/`。

### 路径错误示例（禁止）

以下写法**均会被脚本拒绝**（`WORK_DIR = C:\Users\jetlin\.synapse\work\21881453`）：

| 参数 | 错误 ❌ | 正确 ✅ |
|------|---------|---------|
| `--code-path` | `...\work\21881453\code\ZMDB\BackServiceCpp\src\cpp\Zmdb` | `...\work\21881453\sandbox\ZMDB\BackServiceCpp\src\cpp\Zmdb` |
| `--doc` | `...\work\21881453\archive\需求设计\func_solution\函数级方案.md` | `...\work\21881453\sandbox\ZMDB\synapse_archive\需求设计\func_solution\函数级方案.md`（`REPO_ROOT` 以含 `synapse_archive/` 的目录为准） |
| `--target` 内文档路径 | 同上 `archive\...` | 与 `--doc` 相同的 `synapse_archive\...` 路径 |

**派生步骤（Step 3 调用前必做）**：

1. `SANDBOX_PATH` = `CODE_PATH` 中 `code` → `sandbox`。
2. `REPO_ROOT` = 从 `SANDBOX_PATH` 向上直至找到 `synapse_archive/` 目录。
3. `FUNC_SOLUTION_DOC` = `{REPO_ROOT}/synapse_archive/需求设计/func_solution/函数级方案.md`。
4. `--doc`、`--target` 中的函数级方案路径 **均填步骤 3 的绝对路径**。

### 研发单 → 仓库匹配

对 `split_plan.tasks[]` 每条，用下列字段与 system 注入的仓库表、函数级方案 §1.3「涉及仓库」表**交叉匹配**，选定唯一 `REPO_NAME` + `CODE_PATH`：

| split_plan 字段 | 匹配用途 |
|-----------------|----------|
| `productModuleName` | 对齐 §1.3「应用模块」与 `REPO_NAME` |
| `branchVersionName` / `branch_version_id` | 对齐 §1.3「产品分支」 |
| `patchName` | 辅助确认分支/补丁（若存在） |
| `comments` | 该单改造摘要（来自对应仓库行的「改造内容」） |

无法唯一匹配 → **中止该研发单**，在 manifest 标 `failed` 并说明原因，**不得**猜测路径。

---

## 方案切片（按 split_plan）

每个研发单**不**使用整份函数级方案做验收，而是按 **split_plan 行 + 对应仓库** 切片：

1. **范围锚点**：当前 `tasks[]` 行的 `taskTitle`、`comments`、`taskImpactDesc` 及影响字段（`performanceImpact` 等）。
2. **方案对照**：在 `FUNC_SOLUTION_DOC` 中定位 §1.3 与该单 `productModuleName` / `branchVersionName` 一致的仓库行，以及 §1.6 中**该模块**相关的小节（函数清单、伪代码、文件路径）。
3. **验收清单**：仅包含上述切片内的可核对项；`git diff` 仅检查该 `SANDBOX_PATH` 范围内、与该单相关的文件。
4. **工单验收**：`ACCEPTANCE_DOC` 若存在，只核对与**本研发单改造范围**相关的条款（与方案切片取交集）；无关条款跳过。

### 首轮 `--target` 编写（Step 3 第 1 轮）

首轮 `--target` **不以 `comments` 改造摘要为主**，而应聚焦**函数级方案文档路径**与**本单涉及的章节**，供 Cursor 精准阅读与改码。子智能体在 Step 2c 生成方案切片后，按下述模板拼装（`FUNC_SOLUTION_DOC` 为 `{REPO_ROOT}/synapse_archive/...` 的**完整绝对路径**，与 `--doc` 一致）：

```
研发单 {taskNo}：{taskTitle}。
函数级方案文档：{FUNC_SOLUTION_DOC}
涉及章节：{章节列表}
```

**`{章节列表}`** 须来自本单方案切片，至少包含：

| 章节 | 写法要求 |
|------|----------|
| §1.3 | 写明与本单 `productModuleName` / `branchVersionName` 对应的仓库行（如 `§1.3 涉及仓库 — 模块A / 分支 v2.1`） |
| §1.6 | 列出本单相关的**全部**小节标题或函数名（如 `§1.6.2 FooService.validate()`、`§1.6.3 伪代码 — BarHandler`）；不得笼统写「见 §1.6」 |

可选在末行附一句极短范围提示（如目标文件路径），**不得**用 `comments` 长文替代章节列表。切换研发单时 `--target` 须更新为**该单**的文档路径与章节，避免改到其它仓库。

**示例**：

```
研发单 21881453：需求标题 — 模块A。
函数级方案文档：/work/21881453/sandbox/ZmdbCore/synapse_archive/需求设计/func_solution/函数级方案.md
涉及章节：§1.3 涉及仓库（模块A / 产品分支 v2.1）；§1.6.2 FooService.validate()；§1.6.4 文件路径 — src/module/foo/BarService.java
```

纠偏轮（N≥2）的 `--target` 规则不变，仍以 `--fix-feedback` 为主。

---

## 核心约束

### A. 任务计划（create_todo）

1. 加载 `split_plan.json` 后，**必须**先调用 `create_todo`，再执行任何 `cursor-operation.py`。
2. `steps`：**一条研发单对应一个 step**；`id` 建议 `task_{taskNo}_{index}`；`description` 含 `taskTitle` 与 `productModuleName`。
3. **优先级**：严格按 `split_plan.tasks[]` **数组顺序**执行（索引小者优先）；`depends_on` 默认链式依赖前一条（`task_i` depends_on `task_{i-1}`），保证串行。
4. 每完成一个研发单：`update_todo_step` → `completed`；全部完成后 `complete_todo`。
5. 进行中可用 `get_todo_status` 查看进度。

### B. 调用方式（cursor-operation.py）

1. **不得**直接调用 Cursor CLI，**只能** `run_skill_script` 执行 `scripts/cursor-operation.py`。
2. `--code-path` = 当前研发单的 **`SANDBOX_PATH`**（非 `CODE_PATH`）；路径中**不得**出现 `...\work\{id}\code\...`。
3. `--doc` / `--acceptance-doc` = **`{REPO_ROOT}/synapse_archive/...`** 的完整绝对路径；**禁止**传 `{WORK_DIR}/archive/需求设计/...` 或 `{WORK_DIR}/archive/需求分析/...`（子智能体可读，Cursor **读不到**）。`--target` 中的「函数级方案文档」路径须与 `--doc` **完全一致**。
4. 每轮传 `--timeout` = `TIMEOUT`；结束后 **必须** `read_file` `--log` 并解析 `SYNAPSE_CURSOR_*`。
5. `--continue`：**仅**同一研发单、同一 `SANDBOX_PATH`、上一轮 `SYNAPSE_CURSOR_SUCCESS=1` 时添加；**切换研发单必须新开会话**（不加 `--continue`）。
6. `cursor-operation.py` 会在启动时**校验**上述路径；不合规将直接报错退出（见「路径错误示例」）。

详见 `references/cursor-operation-readme.md`、`references/cursor-cli-headless.md`。

### C. 输入要求

1. **`split_plan.json`**：`tasks[]` 非空且已评审落盘（含 `approved_at`）。
2. **`FUNC_SOLUTION_DOC`**：通读；按单切片用于验收。
3. **`ACCEPTANCE_DOC`**：若存在则传入 `--acceptance-doc`，并按单过滤相关条款。
4. **`{WORK_DIR}/sandbox/`**：已由 `sandbox_build` 落盘。

### D. 输出产物

1. 各研发单修改后的沙箱源码（对应 `SANDBOX_PATH`）。
2. **`{OUTPUT_DIR}/development.log`**（追加；头部分隔：`=== 研发单 {taskNo} | {taskTitle} | 第 N 轮 ===`）。
3. **`{WORK_DIR}/artifacts/manifest.json`**（含 per-task 完成度、轮次、路径、验收结论）。

### E. 禁止事项

- 不要 `git commit`；不要生成 `*.patch`。
- 不要用 `run_shell` 直接调 `agent`。
- 不要跳过 `create_todo` 或跳过单研发单验收就宣告全局完成。
- 不要改 `WORK_DIR/code/` 下的只读参考树。
- **不要**将 `{WORK_DIR}/archive/` 下的 `函数级方案.md`、`验收标准.md` 传给 `--doc` / `--acceptance-doc`（须用 `{REPO_ROOT}/synapse_archive/`）。

---

## 工作流程（双层循环）

```
Step 0 — 准备（一次）
  0a. 确认 WORK_DIR、SPLIT_PLAN_DOC 存在
  0b. read_file SPLIT_PLAN_DOC → tasks[]；为空则 failed 结束
  0c. 确认 WORK_DIR/sandbox/ 已落盘；从 system 读取全部 REPO_NAME + CODE_PATH
  0d. 创建 OUTPUT_DIR

Step 1 — create_todo 排期
  1a. 按 tasks[] 顺序生成 steps（优先级 = 数组下标）
  1b. create_todo(task_summary, steps)
  1c. 为每个研发单预匹配 REPO_NAME、CODE_PATH、SANDBOX_PATH、REPO_ROOT、FUNC_SOLUTION_DOC、ACCEPTANCE_DOC（写入执行笔记或 manifest 草稿）

Step 2 — 外循环：按 split_plan 顺序处理每个研发单 T
  2a. update_todo_step(T, in_progress)
  2b. 确认 T 的 REPO_ROOT/synapse_archive/ 存在；read_file T 的 FUNC_SOLUTION_DOC；若 ACCEPTANCE_DOC 存在则 read_file
  2c. 生成 T 的方案切片与验收清单
  2d. 内循环：第 N 轮（N=1..MAX_ROUNDS_PER_TASK）→ 见 Step 3
  2e. 计算 T 的完成度；100% → update_todo_step(T, completed)；否则继续内循环或 T failed
  2f. 进入下一个研发单（**不加 --continue**）

Step 3 — 内循环：研发单 T 的第 N 轮 Cursor
  3a. run_skill_script → cursor-operation.py
      --code-path SANDBOX_PATH
      --doc T 的 FUNC_SOLUTION_DOC（{REPO_ROOT}/synapse_archive/...）
      --acceptance-doc T 的 ACCEPTANCE_DOC（若存在）
      --target "研发单 {taskNo}：{taskTitle}。函数级方案文档：{FUNC_SOLUTION_DOC}。涉及章节：{§1.3…；§1.6.x…}"
      --log OUTPUT_DIR/development.log
      --round N
      --timeout TIMEOUT
      --continue（仅当 N≥2 且同 T、同 SANDBOX_PATH、上一轮 SUCCESS=1）
  3b. read_file development.log 中本单本轮段落；记录 SYNAPSE_CURSOR_SUCCESS

Step 3′ — 执行分支
  SUCCESS=0 或超时 → [执行] 失败；N < MAX → --fix-feedback [执行] 重试；否则 T failed
  SUCCESS=1 → Step 4

Step 4 — 单研发单验收
  4A. 方案切片 + git diff（SANDBOX_PATH / 仓库根）
  4B. ACCEPTANCE_DOC 相关条款（若存在）
  全部通过 → T 完成度 100%，回到 Step 2 下一单；否则 Step 5

Step 5 — 单研发单纠偏
  5a. --fix-feedback：[方案]/[验收] 逐条（仅本单范围）
  5b. 回到 Step 3（N+1）；N+1 > MAX_ROUNDS_PER_TASK → T failed

Step 6 — 全局收尾
  6a. 全部 T completed → complete_todo；manifest status=completed
  6b. 任一 T failed → manifest status=partial_failed 或 failed，附 failure_reason
  6c. 汇报：研发单列表、各单轮次、development.log、关键改动文件（按 SANDBOX_PATH）
```

---

## 子智能体验收（Step 4 核心）

须先满足 **Step 3′：`SYNAPSE_CURSOR_SUCCESS=1`**，再验收**当前研发单**的方案切片。

### 方案（[方案]）

1. 仅核对本单切片清单；对照 `SANDBOX_PATH` 与 `git diff`。
2. 未覆盖 → `--fix-feedback` 标 `[方案]`，注明 `taskNo` 与文件路径。

### 验收（[验收]）

- 仅核与本单相关的 `ACCEPTANCE_DOC` 条款；未过 → `[验收]`。

### 单研发单通过条件

1. `SYNAPSE_CURSOR_SUCCESS=1`（当轮）。
2. 本单方案切片全覆盖。
3. 相关工单验收条款通过（若 `ACCEPTANCE_DOC` 存在）。
4. 本单预期范围内 `git diff` 非空且文件集合理。

### 完成度

- `完成度 = 已通过核对项 / 本单核对项总数`。
- **100%** 方可 `update_todo_step(completed)`；否则继续内循环。

### `--fix-feedback` 书写

- 前缀：`[执行]`、`[方案]`、`[验收]`。
- 首行建议：`研发单 {taskNo} ({taskTitle})：` …
- 每条可验证（路径+行号或方案章节）。

---

## 验收检查清单（速查）

| 类别 | 检查内容 |
|------|----------|
| **计划** | 已 `create_todo` 且按 `split_plan` 顺序执行 |
| **target** | 首轮含 `FUNC_SOLUTION_DOC` 完整路径及 §1.3 / §1.6 章节列表 |
| **doc** | `--doc` / `--acceptance-doc` 在 `synapse_archive/`，非 `{WORK_DIR}/archive/` |
| **路径** | `--code-path` 为 `SANDBOX_PATH`（`sandbox/`，非 `code/`） |
| **执行** | `SYNAPSE_CURSOR_SUCCESS=1` |
| **方案** | 本单 split_plan + 方案切片全覆盖 |
| **验收** | 相关 `ACCEPTANCE_DOC` 条款通过 |
| **范围** | diff 仅含本单预期文件 |

---

## 目录结构（示例）

```
{WORK_DIR}/
├── code/                          ← 只读参考（禁止改码）
│   └── ZmdbCore/...
├── sandbox/                       ← 改码目标（sandbox_build）
│   └── ZmdbCore/
│       ├── AGENTS.md
│       └── synapse_archive/       ← Cursor 可读研发文档（与 code 同步落盘）
│           ├── 需求分析/
│           │   ├── req_clarify/需求澄清.md
│           │   ├── boundary/边界确认说明.md
│           │   ├── module_func/模块功能.md
│           │   ├── acceptance/验收标准.md      ← ACCEPTANCE_DOC
│           │   └── req_risk/需求风险评估.md
│           └── 需求设计/
│               ├── func_assign/功能点分派清单.md
│               ├── history_solution/历史方案映射.md
│               ├── module_confirm/模块范围确认.md
│               └── func_solution/函数级方案.md   ← FUNC_SOLUTION_DOC
├── archive/
│   ├── 需求设计/solution_review/split_plan.json  ← 研发单清单（子智能体读）
│   └── 需求研发/task_exec/development.log
└── artifacts/manifest.json
```

---

## 产物清单结构（无 patch）

```json
{
  "demand_no": "21881450",
  "status": "completed",
  "split_plan_doc": "archive/需求设计/solution_review/split_plan.json",
  "cursor_logs": ["archive/需求研发/task_exec/development.log"],
  "tasks": [
    {
      "task_no": "21881453",
      "task_title": "需求标题 — 模块A",
      "product_module_name": "模块A",
      "repo_name": "ZmdbCore",
      "sandbox_path": "sandbox/ZmdbCore",
      "repo_root": "sandbox/ZmdbCore",
      "func_solution_doc": "sandbox/ZmdbCore/synapse_archive/需求设计/func_solution/函数级方案.md",
      "acceptance_doc": "sandbox/ZmdbCore/synapse_archive/需求分析/acceptance/验收标准.md",
      "rounds": 2,
      "completion": 1.0,
      "acceptance": {
        "func_solution_slice": "passed",
        "acceptance_doc": "passed"
      }
    }
  ]
}
```

失败时：`status` 为 `failed` 或 `partial_failed`；失败研发单附 `failure_reason` 与 `development.log` 定位说明。

---

## 实施建议

1. **`--continue`**：不得跨研发单、不得跨 `SANDBOX_PATH`。
2. **`git diff`**：在 sandbox 仓库根执行；子目录改码时限定路径前缀。
3. **日志定位**：按 `=== 研发单 {taskNo}` 分段阅读 `development.log`。
4. **会议室路径**：以 system 注入的 `WORK_DIR` / `WORK_ORDER_DIR` 为准；`OUTPUT_DIR` 可被 `archive_dir` 覆盖。
5. **研发文档**：`需求分析`、`需求设计` 以各仓 `synapse_archive/` 为准（Cursor 可读）；`split_plan.json` 仍在 `{WORK_DIR}/archive/`。
6. **上游依赖**：须先完成方案评审（`split_plan.json` 落盘）、文档同步至 `synapse_archive/` 与 `sandbox_build`。

---

## 与上游技能衔接

| 上游 | 输出物 | 本技能用途 |
|------|--------|------------|
| `whalecloud-dev-tool-solution-review` | `split_plan.json` | 研发单清单与执行顺序 |
| `whalecloud-dev-tool-function-solution` | `函数级方案.md` | 按单切片对照 §1.3 / §1.6 |
| 系统节点 `sandbox_build` | `WORK_DIR/sandbox/` | `--code-path` 改码根 |

Cursor 按 `--doc` 与首轮 `--target`（方案路径 + 章节）改沙箱源码；**验收、完成度与纠偏由子智能体**按 split_plan 切片 +（可选）工单验收驱动。
