---
name: whalecloud-dev-tool-flight-optimize-plan
description: "试飞优化方案技能：解析代码提交节点试飞结果，逐条定位构建/静态检查失败项，制定可执行的代码优化研发计划，确保解决已识别问题且不引入新的试飞风险，产出试飞优化方案.md。"
label: 试飞优化方案
---

# 试飞优化方案技能

基于**代码提交**节点落盘的特性分支试飞结果，识别全部失败与告警项，结合函数级方案与任务执行上下文，输出**可执行的试飞优化研发计划**，最终经 `whalecloud-dev-tool-doc-generate` 落盘 `试飞优化方案.md`。

**核心目标**：解决试飞已识别的全部问题，且优化方案**不得**引入新的静态检查违规、复杂度回退或重复代码等试飞风险。

## 何时使用

- 研发会议室 `task_feedback`（试飞方案）节点；
- 前序 `exception_check` 已产出 `试飞结果.md`（必需）；
- 由**浩鲸产品研发专家**（`whalecloud-rd-expert`）执行本技能。

## 研发会议室：工单目录读文档

`room_opened` 已将产品资产落盘到工单目录。**只读下列路径，禁止臆造目录。**

| 用途 | 路径约定 |
|------|----------|
| 工单根目录 | `{WORK_ORDER_DIR}` — 系统提示「产品工作区路径」，形如 `work/<scope_id>/` |
| **试飞结果（必读）** | `{WORK_ORDER_DIR}/archive/开发中/exception_check/试飞结果.md` |
| 代码提交日志 | `{WORK_ORDER_DIR}/archive/开发中/exception_check/代码提交日志.md` |
| 函数级方案 | `{WORK_ORDER_DIR}/archive/需求设计/func_solution/函数级方案.md` |
| 任务执行记录 | `{WORK_ORDER_DIR}/archive/开发中/task_exec/任务执行记录.md` |
| **本节点产出** | `{WORK_ORDER_DIR}/archive/开发中/task_feedback/试飞优化方案.md` |

---

## Parameters

| Parameter | 必填 | 说明 |
|-----------|------|------|
| `WORK_ORDER_DIR` | 是 | 工单工作目录 |
| `FLIGHT_RESULT_DOC` | 否 | 默认 `{WORK_ORDER_DIR}/archive/开发中/exception_check/试飞结果.md` |
| `OUTPUT_DIR` | 否 | 默认 `{WORK_ORDER_DIR}/archive/开发中/task_feedback` |

---

## 核心约束

### A. 试飞结果优先（强制）

- **必须先读** `试飞结果.md`；不存在则**立即中止**，说明固定路径。
- 方案中的每一条优化项**必须**可回溯到试飞结果中的具体子单、检查项（`resultType`）与失败描述（`resultMsg`）。
- 试飞结果为「全部成功」时：输出**确认型**方案（说明无需代码改动、可进入下游节点），仍须落盘 `试飞优化方案.md`。

### B. 全量覆盖已识别问题（强制）

- 对试飞结果中**每一个**失败/超时/告警检查项，须在「已识别问题清单」中有一条对应记录。
- 对每条问题须给出：**根因假设**、**具体改动计划**、**验证方式**（如何在本地或下一轮试飞验证已修复）。
- **禁止**遗漏任一 `buildResult` / 构建明细项；禁止用「整体重构」等空泛描述替代逐条计划。

### C. 不引入新的试飞问题（强制）

制定计划时须对照常见试飞检查项做**回归风险自检**（按项目语言择适用项，见 `AGENTS.md` / 产品规范）：

| 检查类型 | 计划须遵守 |
|----------|------------|
| CheckStyle / ESLint / Pylint 等 | 新增/修改文件告警必须为 0；修改文件告警须下降 |
| PMD / FindBugs / CppCheck 等 | 同上 |
| Simian 重复代码 | 重复行数 ≤ 20，新增文件 0 告警 |
| JavaNCSS / SourceMonitor 复杂度 | 新增方法 ≤ 阈值；已有超标方法复杂度不可上升 |
| 编译/构建 | 不删除必要依赖、不引入未使用 import 导致构建失败 |

若某项优化可能触发上述检查（如大段复制粘贴、提高方法复杂度），须在「回归风险与防引入策略」中说明**替代做法**。

### D. 输出范围

- 本技能**只输出方案文档**，**不在此技能内修改业务代码**（代码改动由下游 `diff_analysis` 节点执行）。
- **禁止**使用 `submit_hitl_questionnaire`；与研发人员评估可靠性由会议室 Host / 人工门控完成，非本技能职责。
- **禁止**直接使用 `write_file` 写 `试飞优化方案.md`；**必须**组装 `CONTEXT_JSON` 后调用 [`whalecloud-dev-tool-doc-generate`](../whalecloud-dev-tool-doc-generate/SKILL.md) 落盘。

---

## 工作流程

```
Step 0 — 参数与环境
  0a. 校验 WORK_ORDER_DIR
  0b. FLIGHT_RESULT = FLIGHT_RESULT_DOC 或默认路径
  0c. OUTPUT_DIR .mkdir(parents=True, exist_ok=True)

Step 1 — 读取试飞结果
  1a. read_file(FLIGHT_RESULT)
  1b. 解析：总体试飞状态、各研发子单 task_no / feature_id、试飞状态、构建明细（resultType + resultMsg）
  1c. 若文件为空或无子单记录 → 中止
  1d. **编译节点日志分析（强制）**：
      - 优先阅读 `【编译/构建错误摘录】` 段或含 `error:` / `make:` / `cc1plus:` 的行
      - 构建日志开头的 `chmod: cannot access '/root/build.sh'` 等 CI 环境告警**通常非根因**（后续 makeall 仍会继续执行）
      - 根因须对应具体文件/行号/符号（如 `ZmdbConfig.cpp:13554: error: 'iDays' was not declared`）
      - 若 `试飞结果.md` 仅有环境告警、无编译错误摘录 → 读取 `meeting_pipeline.json` 中 `code_commit_assets.flight.tasks[].data.buildResult[].resultMsg` 全文，或标注 `[待研发确认]` 并给出排查步骤

Step 2 — 读取上下文（可选但推荐）
  2a. 代码提交日志.md — 提交 hash、分支、子单映射
  2b. 函数级方案.md — 对照改造范围，避免优化偏离方案
  2c. 任务执行记录.md — 已实现功能与变更文件线索

Step 3 — 逐条分析已识别问题
  对每条失败/告警检查项：
  3a. 摘录原文（检查项类型 + 失败信息）
  3b. 推断根因（文件/规则/模式，须具体）
  3c. 制定改动计划（改哪些文件、改什么、注意何种规范）
  3d. 本地/试飞验证方式

Step 4 — 汇总研发计划
  4a. 按子单或按检查类型分组排序
  4b. 明确执行顺序（依赖关系：如先修编译再修风格）
  4c. 填写「回归风险与防引入策略」
  4d. 汇总「附录：代码变更摘要」与执行结论

Step 5 — 组装 CONTEXT_JSON 并落盘
  5a. 按「CONTEXT_JSON 字段契约」组装 JSON 对象
  5b. write_file → {OUTPUT_DIR}/.tmp/_flight_optimize_plan_fill_ctx.json
  5c. 可选预检：run_skill_script fill_flight_optimize_plan.py --validate-only
  5d. 调用 whalecloud-dev-tool-doc-generate（OUTPUT=试飞优化方案.md）
  5e. read_file 抽查关键段，确认无残留占位符、中文可读
```

---

## Error Handling

| 情况 | 处理 |
|------|------|
| 缺少 `WORK_ORDER_DIR` | **中止** |
| `试飞结果.md` 不存在 | **中止**，注明固定路径 |
| 试飞结果无法解析出子单 | **中止**，说明文件格式问题 |
| 试飞全部成功 | 输出「无需代码优化」方案（`needs_code_change: false`），仍落盘 |
| 某条失败信息过于模糊 | 列入清单并标注 `[待研发确认]`，给出排查步骤 |
| 未调用 doc-generate 而直接 write_file | **视为未完成**，须改用 doc-generate 重写 |
| doc-generate / fill 脚本契约校验失败 | **中止**，对照 skeleton 修正 JSON 后重试 |

---

## CONTEXT_JSON 字段契约

与 `whalecloud-dev-tool-doc-generate/templates/试飞优化方案.md` 占位符一一对应。骨架见 [`../whalecloud-dev-tool-doc-generate/references/flight_optimize_plan_context.skeleton.json`](../whalecloud-dev-tool-doc-generate/references/flight_optimize_plan_context.skeleton.json)。

**标量**

| 字段 | 说明 |
|------|------|
| `WORK_ORDER_DIR` | 工单目录绝对路径 |
| `FLIGHT_RESULT_SOURCE` | 默认 `archive/开发中/exception_check/试飞结果.md` |
| `OVERALL_FLIGHT_STATUS` | `ok` / `failed` / `partial` / `timeout` 等 |
| `TIMESTAMP` | 可选；缺省由 doc-generate 自动生成 |

**列表**

| 字段 | 说明 |
|------|------|
| `flight_summary[]` | 试飞结果摘要表：`task_no`, `feature_id`, `flight_status`, `build_conclusion` |
| `identified_issues[]` | 已识别问题：`sub_task`, `check_item`, `failure_summary`, `root_cause`, `priority` |
| `plan_items[]` | 优化计划项：`title`, `problem_ref`, `change_scope`, `change_description`（Markdown 列表字符串）, `before_code_snippet`（可选）, `after_code_structure`（可选）, `standard_alignment`, `verification_steps[]` |
| `regression_risks[]` | 回归风险：`risk_type`, `description`, `mitigation` |
| `change_summary[]` | 附录变更摘要：`file`, `change_type`, `change_content` |

**对象 `conclusion`**

| 字段 | 说明 |
|------|------|
| `needs_code_change` | `true` / `false`（渲染为「是」/「否」） |
| `affected_sub_tasks[]` | 预计影响子单号列表 |
| `downstream_suggestions[]` | 供 diff_analysis / 人工评审的建议 |
| `summary` | 文末结论摘要 |

列表无数据时填 `[]`（doc-generate 脚本对表格写「（无）」，**保留**表头与章节标题）。

---

## 文档落地（whalecloud-dev-tool-doc-generate）

本技能**只负责分析与 JSON 组装**；**写盘一律委托** `whalecloud-dev-tool-doc-generate`。

| 项 | 值 |
|----|-----|
| 下游技能 | `whalecloud-dev-tool-doc-generate` |
| `OUTPUT_DIR` | `{WORK_ORDER_DIR}/archive/开发中/task_feedback` |
| `OUTPUT` | `试飞优化方案.md` |
| `CONTEXT_JSON` | `{OUTPUT_DIR}/.tmp/_flight_optimize_plan_fill_ctx.json` |
| 数据契约 | 结构化 JSON；**必须**经 `scripts/fill_flight_optimize_plan.py` 填充模板 |

调用示例：

```
Skill: whalecloud-dev-tool-doc-generate
OUTPUT_DIR: {WORK_ORDER_DIR}/archive/开发中/task_feedback
OUTPUT: 试飞优化方案.md
CONTEXT_JSON: {WORK_ORDER_DIR}/archive/开发中/task_feedback/.tmp/_flight_optimize_plan_fill_ctx.json
OUTPUT_MODE: file
```

验收：

- doc-generate 已执行 `fill_flight_optimize_plan.py` 并写入 `{OUTPUT_DIR}/试飞优化方案.md`
- 无 `{{` 残留；保留模板全部固定章节与表头
- `identified_issues` 与试飞结果失败项一一对应；`plan_items` 与问题清单一一可追溯

---

## 与下游节点衔接

- 产出 `试飞优化方案.md` 供 **`diff_analysis`（试飞优化）** 节点作为强制输入；
- 方案通过人工评估后，由试飞优化节点按本方案修改代码并再次提交。
