---
name: whalecloud-dev-tool-development-detection
description: "代码改造完整性检测：对照 split_plan.json 研发单 functionPoints，仅审计 CODE_SANDBOX 中已修改的源码与配置，输出 development_detection.json。"
label: 代码开发检测
---

## 目标

对照 `split_plan.json` 中指定研发单的 `functionPoints[]`，判断 **CODE_SANDBOX 内已修改的代码** 是否实现了各改造功能点。

**审计范围**：仅 `CODE_SANDBOX` 中相对 Git 基线有改动的文件（通过 `git diff` 确定）。未改动的文件不作为实现证据，除非改动文件中的调用链明确依赖其中新增符号。

---

## 输入

| 变量 | 说明 |
|------|------|
| `WORK_DIR` | 工作目录 |
| `CODE_SANDBOX` | 待检测的代码目录根 |
| `SPLIT_PLAN_DOC` | `{WORK_DIR}/archive/需求设计/solution_review/split_plan.json` |
| `CURRENT_TASK` | `split_plan.json` 的 `tasks[]` 中待检测的一条研发单 |
| `FUNC_SOLUTION_DOC` | `{CODE_SANDBOX}/synapse_archive/需求设计/func_solution/函数级方案.md`（可选，用于映射功能点与预期改造位置） |
| `OUTPUT_DIR` | 检测结果输出路径 |

**路径约束**：

- 若使用函数级方案，**必须**读 `FUNC_SOLUTION_DOC`（`synapse_archive/` 下），**禁止**用 `{WORK_DIR}/archive/需求设计/func_solution/函数级方案.md` 替代。
- **禁止** `write_file` 修改 `CODE_SANDBOX` 下业务源码或配置。

---

## 前置条件

1. `read_file` `SPLIT_PLAN_DOC`，取出 `CURRENT_TASK`。
2. 确认 `CURRENT_TASK.functionPoints` 非空；为空则 `verdict=fail`，`summary` 说明无功能点可审计，写 JSON 后结束。
3. 在 `CODE_SANDBOX` 所属 Git 仓库根执行 `git diff --name-only`；若无任何改动文件，则全部功能点标 `missing`，`verdict=fail`，写 JSON 后结束。

---

## 审计清单

本任务须审计的功能点 = **`CURRENT_TASK.functionPoints[]`**（逐条、顺序不变）。

对每条功能点，从 `demand_function[]` 中取 `functionPoint` 相同且 `assignedTaskTitle === CURRENT_TASK.taskTitle` 的 `functionDesc` 作为补充说明（若无匹配项则仅用 `functionPoints` 文本）。

---

## 处理逻辑（大模型逐条审计）

> **核心原则**：全程由本智能体使用 `read_file` / `grep` / `list_directory` 阅读文档与代码；可用 `run_shell` **仅**执行只读命令（`git diff`、`git status`、`git diff --name-only`）确定改动范围。**禁止**调用任何检测脚本。

### Step 1 — 确定改动文件

1. 在 `CODE_SANDBOX` 所属 Git 仓库根执行：
   - `git diff --name-only` → 改动文件列表；
   - `git diff` → 具体改动内容。
2. 后续阅读与判定**仅**基于上述改动文件及其 diff 内容；**禁止**将未改动文件中的既有逻辑计为本轮实现。

### Step 2 — 列出待审计功能点

从 `CURRENT_TASK.functionPoints[]` 列出全部待审计项（FP-1 … FP-N），顺序与 JSON 数组一致。

### Step 3 — 逐条审计

对**每一条** `functionPoint`（按数组顺序，一次只处理一条）：

#### 3a — 映射预期改造（可选）

1. 若有 `FUNC_SOLUTION_DOC`：`read_file` / `grep` 定位与该功能点对应的改造内容（目标模块/类/函数、配置路径与键名、预期行为）。
2. 记录映射结果：`mapped` | `inferred` | `unmapped`（无法定位时记入 `unmapped_function_points`，**不**直接判代码未完成）。
3. 若无函数级方案，则直接依据 `functionPoint` 与 `functionDesc` 理解预期改造。

#### 3b — 在改动代码中确认实现

1. 在 Step 1 的改动文件中 `read_file` / `grep`，结合 `git diff` 内容，查找与本功能点相关的实现。
2. 对照预期行为，判定本条状态：

| 状态 | 含义 |
|------|------|
| `covered` | 改动代码中已实现该功能点，证据充分 |
| `partial` | 改动中有部分实现，但未满足功能点或 `functionDesc` 的全部要求 |
| `missing` | 改动中未见相关实现，或与预期明显不符 |

3. **复合功能点**（一条含多个能力）：内部分解为子能力，**任一子能力缺失则整条为 `partial` 或 `missing`**。
4. 判定为 `partial` / `missing` → 记入未完成列表；继续下一条。
5. **禁止**因「同一改动可能覆盖多条功能点」而跳过审计；每条须独立给出状态与证据。允许一条改动证据同时支撑多条 `covered`，但须分别说明。

### Step 4 — 汇总并落盘

1. **未完成修改点** = 所有状态为 `partial` 或 `missing` 的条目。
2. 每条未完成项须包含：
   - `functionPoint`：`CURRENT_TASK.functionPoints[]` 中的**原文字符串**；
   - `status`：`partial` | `missing`；
   - `gap`：具体缺失说明（含改动文件路径、类/函数名、方案章节若有）；
   - `solution_ref`：函数级方案章节引用（若有）；
   - `evidence`：已读到的改动位置或「改动文件中未找到」说明。
3. 生成 **`fix_feedback`**（纯文本摘要）：

```
研发单 {taskNo}（{taskTitle}）：
[缺口] {functionPoint}：{gap}
```

多条缺口各占一行 `[缺口]` 前缀；无缺口时为空字符串。

4. 判定 **`verdict`**：
   - 全部功能点为 `covered`，且无 blocking 级 `unmapped` → `pass`；
   - 存在任一 `partial` 或 `missing` → `fail`；
   - 若存在 `unmapped` 且无法推断改动是否满足 → `fail`，并在 `summary` 中说明方案映射问题。

5. **`write_file`** 落盘 `OUTPUT_DIR`（UTF-8，无 BOM）。

---

## 输出

### `development_detection.json`（必填）

```json
{
  "schema_version": 1,
  "taskNo": "研发单号",
  "taskTitle": "研发单标题",
  "detected_at": "ISO8601",
  "verdict": "pass",
  "summary": "N 条功能点中 X 条 covered，Y 条 partial，Z 条 missing",
  "changed_files": ["git diff 涉及的相对路径"],
  "function_points": [
    {
      "functionPoint": "CURRENT_TASK.functionPoints 原文字符串",
      "functionDesc": "来自 demand_function，无则空字符串",
      "solution_mapping": "mapped",
      "solution_ref": "函数级方案.md §…",
      "status": "covered",
      "evidence": ["相对 CODE_SANDBOX 的路径:行号或配置键（须为改动文件内位置）"],
      "gap": ""
    }
  ],
  "incomplete_function_points": [
    {
      "functionPoint": "未完成项的原文字符串",
      "status": "missing",
      "gap": "具体缺失说明",
      "solution_ref": "…",
      "evidence": []
    }
  ],
  "unmapped_function_points": [],
  "fix_feedback": "研发单 …（无缺口时为空字符串）"
}
```

字段约束：

- `function_points[].evidence` 中的路径**必须**来自 Step 1 的改动文件列表。
- `incomplete_function_points[].functionPoint` **必须**与 `split_plan` 中字符串**完全一致**。
- `verdict=pass` 时 `incomplete_function_points` 为空数组，`fix_feedback` 为空字符串。
- `verdict=fail` 时 `incomplete_function_points` 非空，`fix_feedback` 须与其中条目一一对应。

### 口头汇报

须包含：`taskNo`、`verdict`、改动文件数、`incomplete_function_points` 数量、JSON 路径。

---

## 禁止事项

- **不要** `run_skill_script` 或调用任何检测类脚本。
- **不要** `write_file` 修改 `CODE_SANDBOX` 下业务源码或配置（本技能只读）。
- **不要** `git commit`、生成 `*.patch`。
- **不要** 用 `{WORK_DIR}/archive/` 下的函数级方案替代 `FUNC_SOLUTION_DOC`。
- **不要** 跳过 `functionPoints` 中的任一条。
- **不要** 将未在 `git diff` 中出现的文件作为实现证据。


