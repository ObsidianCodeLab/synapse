---
name: whalecloud-dev-tool-development
description: "代码开发技能 - 根据函数级方案文档，通过 Cursor CLI 实现代码开发；支持验收检查与多轮纠偏。智能体通过 cursor-operation.py 执行，产出改后源码与执行日志。"
label: 代码开发技能
---

# 代码开发技能

根据函数级方案文档，通过 Cursor Agent CLI 实现代码开发。智能体**必须**调用 `scripts/cursor-operation.py`（禁止直接调用 `agent`），并在每轮执行后**自行验收**；不通过则带 `--fix-feedback` 再次调用脚本，直至通过或达到轮次上限。

---

## Parameters

| Parameter | 必填 | 说明 / 示例 |
|-----------|------|----------------|
| `WORK_DIR` | 是 | 研发会议室工作目录（与注入的 `WORK_ORDER_DIR` **同义**）。 |
| `FUNC_SOLUTION_DOC` | 是 | 函数级方案路径。默认：`{WORK_DIR}/archive/需求设计/func_solution/函数级方案.md` |
| `MODIFY_CODE_PATH` | 是 | 源代码工作目录（脚本 `--code-path`；须在 Git 仓库内，供改码与 `git diff` 验收）。会议室 system 段中的 **`MODIFY_CODE_PATH`**（或与 `CODE_PATH` 同值）为本参数，**禁止**从 `WORK_DIR` 臆造。 |
| `OUTPUT_DIR` | 是 | 产物目录。默认：`{WORK_DIR}/archive/需求研发/task_exec/` |
| `ACCEPTANCE_DOC` | 否 | 工单级验收标准。默认：`{WORK_DIR}/archive/需求分析/acceptance/验收标准.md`（**存在则必查**，并传入 `--acceptance-doc`） |
| `CODING_STD_DOC` | 否 | 研发编码规范路径。未指定时按方案涉及文件语言选 `references/{语言}研发规范.md`（见下文） |
| `MAX_ROUNDS` | 否 | 最大 Cursor 调用轮次（含首轮），默认 `10` |
| `TIMEOUT` | 否 | 单次脚本 `--timeout`（秒），默认 `600`（与 `run_skill_script` 平台超时一致） |

### 参数关系

- **`WORK_DIR`**：归档根；`FUNC_SOLUTION_DOC`、`OUTPUT_DIR`、`ACCEPTANCE_DOC` 可按标准布局推导。
- **`MODIFY_CODE_PATH`**：独立参数，不能从 `WORK_DIR` 推导。
- **统一日志文件**：`{OUTPUT_DIR}/development.log`（**所有轮次共用**同一个文件，按时间顺序追加写入；含完整 `stream-json` + 每轮元信息头）。脚本以追加模式打开日志。
- **不产出 patch 文件**；变更以 `MODIFY_CODE_PATH` 工作区源码为准。

---

## 核心约束

### A. 调用方式

1. 智能体**不得**直接调用 Cursor CLI，**只能** `run_skill_script` 执行 `scripts/cursor-operation.py`。
2. 每轮须传 `--timeout` = `TIMEOUT`（默认 `600`）。
3. 每轮结束后**必须** `read_file` 当轮 `--log`，并解析 stdout 中 `SYNAPSE_CURSOR_*` 行。
4. `run_skill_script` 返回非 0 时**仍须读 log**：区分 **Cursor 执行失败**（`SYNAPSE_CURSOR_SUCCESS=0`）与 **脚本包装错误**（超时等）。

详见 `references/cursor-operation-readme.md`、`references/cursor-cli-headless.md`。

### B. 输入要求

1. **函数级方案**（`FUNC_SOLUTION_DOC`）：首轮前通读；验收维度一。
2. **研发编码规范**：首轮前按**方案列出的文件/语言**选定 `CODING_STD_DOC` 并 `read_file` 相关章节；验收维度二。
3. **验收标准**（`ACCEPTANCE_DOC`）：若文件存在则**必查**（验收维度三），并传入 `--acceptance-doc`。
4. **代码目录**（`MODIFY_CODE_PATH`）：有效 Git 工作区。

### C. 输出产物

1. 修改后的源码（`MODIFY_CODE_PATH`）。
2. **统一日志文件**：`{OUTPUT_DIR}/development.log`（唯一文件，所有轮次按时间顺序**追加**写入；含完整 `stream-json` + 每轮元信息头）。脚本以追加模式打开日志；如需从空白日志开始，先手动删除该文件。
3. 清单（可选）：`{WORK_DIR}/artifacts/manifest.json`（记录轮次、`development.log` 路径、`modify_code_path`、验收结论；**不含 patch**）。

### D. 禁止事项

- 不要 `git commit`；不要生成或要求 `*.patch` 落盘。
- 不要用 `run_shell` 直接调 `agent` 代替脚本改业务代码。
- 不要跳过验收直接宣告完成。

---

## 工作流程（多轮开发闭环）

```
Step 1 — 准备
  1a. 确认 FUNC_SOLUTION_DOC、MODIFY_CODE_PATH 存在
  1b. read_file FUNC_SOLUTION_DOC；按方案涉及语言选定并 read_file CODING_STD_DOC
  1c. 若存在 ACCEPTANCE_DOC 则 read_file；创建 OUTPUT_DIR（无需 diff/ 子目录）

Step 2 — 第 N 轮开发（N=1..MAX_ROUNDS）
  2a. run_skill_script → cursor-operation.py
      --code-path MODIFY_CODE_PATH
      --doc FUNC_SOLUTION_DOC（首轮必填；纠偏轮建议保留）
      --acceptance-doc ACCEPTANCE_DOC（若存在）
      --target "…"
      --log OUTPUT_DIR/development.log
      --round N
      --timeout TIMEOUT
      --continue（仅当 N≥2 且第 N-1 轮 SYNAPSE_CURSOR_SUCCESS=1 时加；否则靠完整 prompt）
  2b. read_file 同一份 development.log 中第 N 轮段落；记录 SYNAPSE_CURSOR_SUCCESS / SYNAPSE_CURSOR_LOG

Step 2′ — 执行结果分支（在 Step 3 之前）
  若 SYNAPSE_CURSOR_SUCCESS=0 或 run_skill_script 超时/失败：
    → 视为 [执行] 失败，**不得**进入方案/规范验收结论
    → 若 N < MAX_ROUNDS：带 --fix-feedback（前缀 [执行]）重试同轮或下一轮，说明 log 中错误/超时原因
    → 若已达 MAX_ROUNDS：status=failed，更新 manifest，结束
  若 SYNAPSE_CURSOR_SUCCESS=1：
    → 进入 Step 3

Step 3 — 验收（方案 + 规范 + 可选工单验收）
  3A. FUNC_SOLUTION_DOC + git diff（在 Git 仓库根或 MODIFY_CODE_PATH 相对路径范围内）
  3B. CODING_STD_DOC / references/*研发规范.md
  3C. ACCEPTANCE_DOC（若存在则**必过**）
  全部通过 → Step 5；否则整理未通过项 → Step 4（N+1）

Step 4 — 纠偏（功能/规范/验收，非 [执行]）
  4a. --fix-feedback 含 [方案]/[规范]/[验收] 逐条
  4b. 回到 Step 2（round=N+1），满足 --continue 条件时可加 --continue
  4c. N+1 > MAX_ROUNDS → failed，写 manifest，结束

Step 5 — 完成
  5a. 更新 WORK_DIR/artifacts/manifest.json（status=completed，cursor_logs，modify_code_path）
  5b. 汇报：轮次、统一日志路径 `{OUTPUT_DIR}/development.log`、验收结论、关键改动文件列表（无需 patch 路径）
```

---

## 子智能体验收（Step 3 核心）

须先满足 **Step 2′：`SYNAPSE_CURSOR_SUCCESS=1`**，再做工单/方案/规范验收。

### 文档一：`FUNC_SOLUTION_DOC`（[方案]）

1. 提取可核对清单；对照 `MODIFY_CODE_PATH` 与 `git diff`（在**仓库根**执行，必要时限定路径前缀）。
2. 未全覆盖 → `--fix-feedback` 标 `[方案]`。

### 文档二：研发编码规范（[规范]）

- 规范表见 `references/*研发规范.md`（技能内置）。
- **首轮前**：按方案列出的文件扩展名选规范；**每轮后**：可按 diff 涉及语言复核。
- 违规 → `[规范]`。

### 文档三：`ACCEPTANCE_DOC`（[验收]，文件存在时必查）

- 与方案不重复的工单条款须逐项满足；未过 → `[验收]`。

### 验收通过条件（同时满足）

1. `SYNAPSE_CURSOR_SUCCESS=1`（当轮）。
2. 方案全覆盖。
3. 规范合规（【规则】无违反）。
4. 若存在 `ACCEPTANCE_DOC`，工单验收通过。
5. 若方案要求改码，则 `git diff` 非空且在预期范围内。

### `--fix-feedback` 书写

- 前缀：`[执行]`（CLI/超时）、`[方案]`、`[规范]`、`[验收]`。
- 每条可验证（路径+行号或方案章节）。

---

## 验收检查清单（速查）

| 类别 | 检查内容 |
|------|----------|
| **执行** | `SYNAPSE_CURSOR_SUCCESS=1`；否则走 Step 2′，勿判为方案/规范问题 |
| **方案** | `FUNC_SOLUTION_DOC` 条目全覆盖 |
| **规范** | `CODING_STD_DOC` / references 与 diff 一致 |
| **验收** | `ACCEPTANCE_DOC` 存在则必过 |
| **范围** | diff 仅含预期文件 |

---

## 目录结构（示例）

**`WORK_DIR`（task_id = 21881453）**

```
C:\Users\<user>\.synapse\work\21881453\
├── archive/
│   ├── 需求设计/func_solution/函数级方案.md
│   ├── 需求分析/acceptance/验收标准.md
│   └── 需求研发/task_exec/
│       └── development.log     ← 所有轮次追加写入的唯一日志文件
└── artifacts/manifest.json
```

**`MODIFY_CODE_PATH`**：可与 `WORK_DIR` 无关，例如 `D:\repos\...\Zmdb\` 或 `{WORK_DIR}/code/...`。

---

## 产物清单结构（无 patch）

```json
{
  "task_id": "21881453",
  "status": "completed",
  "modify_code_path": "D:/repos/.../Zmdb",
  "development_rounds": 2,
  "cursor_logs": [
    "archive/需求研发/task_exec/development.log"
  ],
  "acceptance": {
    "func_solution": "passed",
    "coding_standard": "passed",
    "acceptance_doc": "passed"
  }
}
```

失败时 `"status": "failed"`，附 `failure_reason` 与 `development.log` 路径。

---

## 实施建议（维护者 / 智能体）

1. **`--continue`**：仅上一轮同工作区 Cursor 成功结束时使用；并行多工单、或上轮超时/失败时**不要**加，避免串会话。
2. **`git diff`**：在 Git 仓库根执行；`MODIFY_CODE_PATH` 为子目录时用 `git diff -- <相对路径>`。
3. **`run_skill_script` 报失败但 log 存在**：以 log 中 `SYNAPSE_CURSOR_SUCCESS` 为准，勿重复盲目重跑。
4. **会议室路径**：以 system 注入的 `MODIFY_CODE_PATH` 为准；`CODE_PATH` 若同时出现，与之同值，仅作兼容。
5. **与 SOP 归档**：本技能默认 `OUTPUT_DIR` 在 `archive/需求研发/task_exec/`；若会议室 `archive_dir` 指向 `archive/开发中/task_exec/`，以会议室注入的 `OUTPUT_DIR` / `archive_dir` 覆盖默认值。

---

## 与上游技能衔接

| 上游技能 | 输出物 | 本技能用途 |
|----------|--------|------------|
| `whalecloud-dev-tool-function-solution` | 函数级方案.md | `--doc`；方案验收依据 |

首轮改码由 Cursor 读方案实现；**验收与纠偏由子智能体**依据方案 + 规范 +（可选）工单验收文档驱动。
