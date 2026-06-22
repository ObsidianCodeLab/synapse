---
name: whalecloud-dev-tool-leader-review
description: "研发组长综合评审技能：汇总自动化研发全流程关键产出（需求分析/需求设计/代码实施/测试/风险/熵指标），生成可推送至多方评审人的 HTML 报告文件（研发组长评审报告.html）与结构化 JSON（leader_review.json），供前端评审中心渲染和统一服务 API 推送。"
label: 研发组长评审
---

# 研发组长综合评审技能

对**自动化研发全流程**已归档的 SOP 产出物进行综合梳理，输出：

1. **`leader_review.json`** — 结构化评审数据（机器可读，供前端评审面板与统一服务 API 消费）
2. **`研发组长评审报告.html`** — 完整 HTML 评审报告（推送给团队负责人、产品负责人等多方评审人，可在浏览器独立打开）
3. **`ai_review.md`** — AI 综合评审意见（AI 独立分析并落地形成评审结论，在人工评审前先行输出，作为评审参考）

> **流程说明**：`ai_review.md` 是 AI 自主形成的评审意见，**不是**人工评审的最终结论。后续需通过前端评审中心完成各评审人（开发者自评 + 产品负责人 + 团队负责人）的逐一确认；**所有人通过后**，NodeReview 门控才落地 `研发组长评审结论.md`（最终归档文档）。禁止在人工评审完成前预先生成结论文档。

---

## 何时使用

- 研发会议室 `leader_review`（研发组长综合审批）节点；
- `diff_analysis`、`entropy_review`、`risk_review`、`unit_test` 等研发实施阶段节点已完成，产出已归档。

---

## Parameters

| Parameter | 必填 | 说明 |
|-----------|------|------|
| `WORK_ORDER_DIR` | 是 | 工单工作目录，如 `work/21881451` |
| `ARCHIVE_DIR` | 否 | 输出目录，默认 `{WORK_ORDER_DIR}/archive/研发实施/leader_review/` |
| `DEMAND_NO` | 否 | 需求单号，默认取目录名 |
| `REQUIREMENT_NAME` | 否 | 需求标题，用于报告页眉 |
| `ASSIGNEE_NAME` | 否 | 开发者姓名，用于报告署名 |
| `SKIPPED_NODE_IDS` | 否 | 逗号分隔的已跳过节点 id，相应输入标记 `included: false` |
| `UNIFIED_SERVICE_URL` | 否 | 统一服务 submit 接口地址，若提供则在生成后自动调用 `rd_view_report_submit` 推送 |

---

## 必读输入（按节点开启状态）

所有路径从 `WORK_ORDER_DIR` 推导；未开启/跳过的节点在 JSON `inputs` 中标记 `included: false`，**不得**伪造内容。

### 需求分析阶段

| 节点 | 产出物 | 路径 |
|------|--------|------|
| req_clarify | 需求澄清.md | `archive/需求分析/req_clarify/` |
| module_func | 模块功能.md | `archive/需求分析/module_func/` |
| acceptance | 验收标准.md | `archive/需求分析/acceptance/` |
| req_risk | 需求风险评估.md | `archive/需求分析/req_risk/` |

### 需求设计阶段

| 节点 | 产出物 | 路径 |
|------|--------|------|
| func_solution | 函数级方案.md | `archive/需求设计/func_solution/` |
| solution_review | 方案评审结论.md、solution_review.json | `archive/需求设计/solution_review/` |
| entropy_gen | agent.md、rule.md | `archive/需求设计/entropy_gen/` |

### 研发实施阶段

| 节点 | 产出物 | 路径 |
|------|--------|------|
| task_exec | 任务执行记录.md | `archive/研发实施/task_exec/` |
| diff_analysis | 试飞优化执行记录.md | `archive/研发实施/diff_analysis/` |
| unit_test | 测试案例说明.md | `archive/研发实施/unit_test/` |
| dev_process_review | 开发流程评审.md | `archive/研发实施/dev_process_review/` |
| risk_review | 风险评审.md | `archive/研发实施/risk_review/` |
| entropy_review | 控熵评审.md | `archive/研发实施/entropy_review/` |
| solution_consistency | 方案一致性检查.md | `archive/研发实施/solution_consistency/` |

---

## 输出（三文件）

1. **`leader_review.json`** — `schema_version: 1`，结构见下方（`write_file` UTF-8 写入）
2. **`研发组长评审报告.html`** — 调用 `whalecloud-dev-tool-doc-generate`，`OUTPUT=研发组长评审报告.html`，`CONTEXT_JSON` 为 JSON 文件路径
3. **`ai_review.md`** — AI 独立评审意见（`write_file` UTF-8 写入），包含综合评分、风险结论、逐章节评审意见，**在前端报告展示时同步呈现**

**禁止**：
- **禁止**在人工评审完成前输出 `研发组长评审结论.md`（该文件由 NodeReview 人工门控通过后才由系统生成）
- **禁止** `submit_hitl_questionnaire(kind="interactive")`；人工通过前端「研发组长评审」专用面板完成评审确认

> `研发组长评审结论.md` 的生成时机：前端评审中心所有评审人确认通过 → NodeReview 门控触发 → 系统自动从 `leader_review.json` + 各评审意见汇总生成。

---

## leader_review.json 结构

```json
{
  "schema_version": 1,
  "demand_no": "需求单号",
  "requirement_name": "需求标题",
  "assignee_name": "开发者姓名",
  "generated_at": "ISO8601",
  "inputs": {
    "req_clarify":         { "included": true,  "path": "archive/需求分析/req_clarify/需求澄清.md" },
    "module_func":         { "included": true,  "path": "archive/需求分析/module_func/模块功能.md" },
    "acceptance":          { "included": true,  "path": "archive/需求分析/acceptance/验收标准.md" },
    "req_risk":            { "included": false, "path": null },
    "func_solution":       { "included": true,  "path": "archive/需求设计/func_solution/函数级方案.md" },
    "solution_review":     { "included": true,  "path": "archive/需求设计/solution_review/方案评审结论.md" },
    "entropy_gen":         { "included": true,  "path": "archive/需求设计/entropy_gen/agent.md" },
    "task_exec":           { "included": true,  "path": "archive/研发实施/task_exec/任务执行记录.md" },
    "diff_analysis":       { "included": true,  "path": "archive/研发实施/diff_analysis/试飞优化执行记录.md" },
    "unit_test":           { "included": true,  "path": "archive/研发实施/unit_test/测试案例说明.md" },
    "dev_process_review":  { "included": false, "path": null },
    "risk_review":         { "included": true,  "path": "archive/研发实施/risk_review/风险评审.md" },
    "entropy_review":      { "included": true,  "path": "archive/研发实施/entropy_review/控熵评审.md" },
    "solution_consistency":{ "included": false, "path": null }
  },
  "summary": {
    "scope_overview": "改造范围概述（1-3句）",
    "key_changes": ["变更亮点1", "变更亮点2"],
    "overall_risk_level": "low",
    "overall_quality_score": 85,
    "conclusion": "综合评审结论（2-5句）"
  },
  "stage_summaries": [
    {
      "stage": "需求分析",
      "node_id": "req_clarify",
      "node_name": "需求澄清",
      "included": true,
      "summary": "本阶段关键结论摘要"
    }
  ],
  "diff_stats": {
    "repos": [
      {
        "repo_url": "仓库地址",
        "repo_name": "仓库名称",
        "branch": "分支名",
        "lines_added": 0,
        "lines_deleted": 0,
        "commit_count": 0,
        "change_files": ["文件路径"]
      }
    ],
    "total_lines_added": 0,
    "total_lines_deleted": 0,
    "diff_summary": "代码变更简述"
  },
  "test_cases": [
    { "name": "测试用例名称", "result": "passed" }
  ],
  "risk_items": [
    {
      "level": "medium",
      "title": "风险标题",
      "description": "风险说明",
      "mitigation": "应对措施"
    }
  ],
  "entropy_stats": {
    "avg_complexity": 0.0,
    "max_complexity": 0,
    "duplicate_lines": 0,
    "new_warnings": 0,
    "entropy_conclusion": "控熵合规"
  },
  "reviewers": [
    {
      "employee_id": "开发者工号",
      "reviewer_name": "开发者姓名",
      "role": "submitter"
    }
  ],
  "output_files": {
    "html_report": "archive/研发实施/leader_review/研发组长评审报告.html",
    "ai_review_md": "archive/研发实施/leader_review/ai_review.md"
  }
}
```

### overall_risk_level 取值规则

| 取值 | 条件 |
|------|------|
| `high` | risk_review 存在高风险项，或 entropy_review 存在 Critical 告警 |
| `medium` | risk_review 存在中风险项，或 overall_quality_score < 70 |
| `low` | 其余情况 |

### overall_quality_score 评分维度（0-100）

| 维度 | 权重 | 说明 |
|------|------|------|
| 需求覆盖 | 20% | 验收标准与需求澄清的覆盖度 |
| 方案评审 | 25% | solution_review.json whale_review.score |
| 代码质量 | 25% | entropy_review 控熵合规性 |
| 测试覆盖 | 15% | 测试用例通过率 |
| 风险管控 | 15% | risk_review 高风险项数量 |

---

## 工作流程

```
Step 0 — 参数校验与路径推导
  0a. 校验必填参数：WORK_ORDER_DIR
  0b. 推导 ARCHIVE_DIR（默认 {WORK_ORDER_DIR}/archive/研发实施/leader_review/）
  0c. 确认输出目录可写（mkdir -p）

Step 1 — 收集前序产出物可读性
  1a. 按「必读输入」表逐项检查文件是否存在
  1b. 标记每项 included: true/false（含 SKIPPED_NODE_IDS 强制排除）
  1c. 若 func_solution 与 task_exec 均缺失，则中止并提示

Step 2 — 读取并提取各阶段关键信息
  2a. 需求分析阶段：读取需求澄清（IN/OUT/功能要点）、模块功能（改造模块清单）
      、验收标准（验收条件）、需求风险（风险等级与应对）
  2b. 需求设计阶段：读取函数级方案（改造范围/仓库/模块清单）、方案评审结论
      （score/verdict/suggestions）、entropy_gen（控熵规则摘要）
  2c. 研发实施阶段：读取任务执行记录（完成情况）、试飞优化执行记录（diff 统计）
      、测试案例说明（用例列表/通过率）、风险评审（风险项）、控熵评审（指标）
      、方案一致性检查（结论）

Step 3 — 组装 leader_review.json
  3a. 填写 inputs（含 included/path）
  3b. 按「评分维度」计算 overall_quality_score
  3c. 按「risk_level 规则」确定 overall_risk_level
  3d. 提取 diff_stats（优先从 solution_review.json func_solution_parsed.repos 取仓库信息；
      diff 数值从「试飞优化执行记录.md」或「任务执行记录.md」提取，无则留 0）
  3e. 提取 test_cases（从测试案例说明.md 提取用例名称与结果；无则 []）
  3f. 提取 risk_items（从风险评审.md 提取；无则 []）
  3g. 提取 entropy_stats（从控熵评审.md 提取；无则填默认值）
  3h. 填写 stage_summaries（每个 included 节点写 1-3 句关键结论）
  3i. 写 summary.conclusion（综合 score/risk/测试通过率的 2-5 句总评）
  3j. write_file → {ARCHIVE_DIR}/leader_review.json（UTF-8）

Step 4 — 生成 HTML 报告（调用 whalecloud-dev-tool-doc-generate）
  4a. 将 leader_review.json 路径作为 CONTEXT_JSON 传入
  4b. OUTPUT = 研发组长评审报告.html
  4c. OUTPUT_DIR = {ARCHIVE_DIR}
  4d. doc-generate 执行 scripts/fill_leader_review.py 落盘 HTML 文件
  4e. 确认文件存在且 > 5KB；若失败则中止

Step 5 — 生成 AI 评审报告（write_file 直接写入，不调用 doc-generate）
  5a. 基于已读取的全部产出物，独立形成 AI 评审意见，内容须包含：
      ① 综合评分与风险判断（引用 overall_quality_score 与 overall_risk_level 说明评分依据）
      ② 各阶段逐项评审意见（需求分析 / 需求设计 / 研发实施，每阶段 2-5 句，指出亮点与不足）
      ③ 代码变更重点关注项（结合 diff_stats，指出高风险文件或模块）
      ④ 测试与熵指标评价（结合 test_cases 通过率与 entropy_stats 合规情况）
      ⑤ AI 综合意见与建议（2-5 句，明确给出「建议通过」或「建议返工」及理由）
  5b. OUTPUT = ai_review.md，OUTPUT_DIR = {ARCHIVE_DIR}
  5c. write_file 落盘（UTF-8），文件名固定为 ai_review.md
  5d. 确认文件存在且 > 500B；若失败则中止
  5e. 将 ai_review_md 路径写入 leader_review.json 的 output_files.ai_review_md 字段（更新 JSON）

  **禁止**：在此 Step 输出 `研发组长评审结论.md`；结论文档由人工评审全部通过后方可生成。

Step 6 — （可选）推送统一服务
  6a. 若传入 UNIFIED_SERVICE_URL：
      读取 HTML 文件内容 → POST {UNIFIED_SERVICE_URL}/rd_view_report_submit
      payload: { demand_no, submitter_id: assignee_id, report_html, diff_analysis, reviewers }
  6b. 若接口不通或未传入：跳过，仅落盘本地文件

Step 7 — 自检
  7a. leader_review.json 可被 json.load 解析（write_file 落 check.py + run_shell python）
  7b. 研发组长评审报告.html 文件大小 > 5KB，含需求标题关键字
  7c. ai_review.md 存在且 > 500B，包含「AI 评审意见」或「综合评分」关键字
  7d. **确认** output_files.conclusion_md 字段不存在（该字段为禁止提前生成标志）
```

---

## 大文档分段写规范（强制）

- **禁止**模型单次 inline 输出整篇 HTML；HTML 由 `fill_leader_review.py` 通过 Python 字符串拼装写入
- `leader_review.json` 体量较大时：先 `write_file` 落 `{ARCHIVE_DIR}/.tmp/build_leader_review.py`（`json.dump(ensure_ascii=False)`）再 `run_shell python` 生成
- **禁止** PowerShell 读写含中文文件；一律 `write_file` 落 `*.py` + `run_shell python xxx.py`（显式 `encoding="utf-8"`）

---

## Error Handling

| 情况 | 处理 |
|------|------|
| 缺少必填参数 WORK_ORDER_DIR | **中止**，列出缺失参数 |
| func_solution 与 task_exec 均不存在 | **中止**，提示无法生成报告 |
| 部分节点产出缺失 | 标记 `included: false`，继续执行 |
| json.load 校验失败 | **中止**，修正 JSON 后重试 |
| HTML 文件 < 5KB 或生成失败 | **中止**，检查 fill_leader_review.py 错误信息后重试 |
| ai_review.md 文件 < 500B 或生成失败 | **中止**，重新执行 Step 5，确保 AI 评审意见完整 |
| UNIFIED_SERVICE_URL 接口超时 | **跳过推送**，记录日志，不影响本地产出 |
| 调用 submit_hitl_questionnaire(kind="interactive") | **视为未完成**，禁止任何 interactive HITL |
| 提前生成 研发组长评审结论.md | **视为违规**，删除该文件，等待人工评审全部通过后再生成 |
