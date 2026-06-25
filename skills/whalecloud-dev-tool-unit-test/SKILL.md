---
name: whalecloud-dev-tool-unit-test
description: "测试案例技能：完善任务执行阶段单元测试代码，输出 unit_test_review.json 与 测试案例说明.md，经专用评审面板执行测试并人工确认。"
label: 测试案例
---

# 测试案例技能

在**任务执行**已产出初步单元测试的基础上，完善测试代码与用例说明，输出机器可读 JSON（供前端测试案例评审面板）与人类可读说明文档。

## 何时使用

- 研发会议室 `unit_test`（测试案例）节点；
- 任务检查（`env_start`）已通过，任务执行产出与验收标准已归档。

## Parameters

| Parameter | 必填 | 说明 |
|-----------|------|------|
| `WORK_ORDER_DIR` | 是 | 工单目录，如 `work/21881451` |
| `ARCHIVE_DIR` | 否 | 默认 `{WORK_ORDER_DIR}/archive/开发中/unit_test` |
| `PRODUCT_CODE_ROOT` | 是 | 工程根目录（环境预生成 engineering_root 或 code_root） |
| `DEMAND_NO` | 否 | 需求单号 |

## 必读输入

| 来源 | 产出物 | 路径 |
|------|--------|------|
| acceptance | 验收标准.md | `archive/需求分析/acceptance/` |
| task_exec | 任务执行记录.md | `archive/开发中/task_exec/` |
| task_exec | 单元测试用例列表.md | `{WORK_ORDER_DIR}/archive/开发中/task_exec/` |
| 工程目录 | 任务执行阶段生成的 tests/** | `{PRODUCT_CODE_ROOT}/tests/` |

## 核心任务

1. **完善单元测试代码**：在 `{PRODUCT_CODE_ROOT}` 内补全/修正任务执行阶段生成的 Python 单元测试（统一 Python 实现，mock 外部依赖）。
2. **维护用例列表**：更新或创建 `{WORK_ORDER_DIR}/archive/开发中/task_exec/单元测试用例列表.md`（**不要**写入工程 `tests/` 目录）。
3. **输出结构化 JSON**：`unit_test_review.json`（schema 见 `references/unit_test_review.skeleton.json`）。
4. **输出说明文档**：`测试案例说明.md`（每条用例的场景、要求、文件路径、预期结果）。

**禁止**使用 `submit_hitl_questionnaire`；测试执行与通过/不通过裁决由前端「测试案例评审」面板完成。

## 输出（强制双文件）

1. **`unit_test_review.json`** — `schema_version: 1`，必须用 `write_file` UTF-8 写入 `{ARCHIVE_DIR}/`
2. **`测试案例说明.md`** — 写入 `{ARCHIVE_DIR}/`

## unit_test_review.json 要求

- `test_cases`：每条须含 `name`、`scenario`、`requirements`、`test_file`、`test_function`
- `test_suite.test_files`：须列出本次执行涉及的测试文件（相对 `PRODUCT_CODE_ROOT`）
- `whale_summary.markdown`：说明相对任务执行阶段的改进点
- 首次落盘时 `last_run` 可为空；**不要在技能内代替用户执行 pytest 并伪造通过结果**

## 测试案例说明.md 结构

```markdown
# 测试案例说明

## 概述
（覆盖范围、与验收标准对齐）

## 用例清单
| 编号 | 用例名称 | 场景说明 | 验证要求 | 测试文件 | 测试函数 |
|------|----------|----------|----------|----------|----------|

## 相对任务执行的改进
（完善了哪些测试、新增哪些边界场景）
```

## 增量修订

若存在 `{ARCHIVE_DIR}/revision_context.json`，须优先修订 `cases_to_revise` 中列出的用例，改完后清除对应 `human_review.status=needs_change` 并更新 JSON/Markdown。

## 三项自检

1. **契合度**：用例覆盖验收标准要点
2. **真实性**：`test_file` / `test_function` 在工程中真实存在
3. **准确性**：JSON 与 Markdown 逐条一致

自检通过后停止推进，等待前端测试案例评审门控。
