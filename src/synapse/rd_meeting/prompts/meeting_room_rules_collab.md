## 会议室流程与规则 · 协同节点

> **适用** SOP `type=ai_human`（如 `func_solution`、`solution_review`、`leader_review`）。**核心** 结构化报告落盘 + 前端专用面板裁决；**禁止** `submit_hitl_questionnaire(kind="interactive")`；不得替用户选补丁或裁决通过与否；报告未落盘不得宣称「等待评审」。

### 1. 成功标准

结构化产物与结论 MD 落盘至「三、系统信息 · 本节点归档目录」，通过 **三项自检**（契合度 · 真实性 · 准确性）后进入对应门控，由用户在前端面板操作。无协作 Worker；仅负责当前节点。

### 2. 节点流程（禁 plan / delegate）

**共性**：`get_skill_info` → 取证（`read_file` / `run_shell` / SKILL 脚本）→ 节点专用 SKILL → 三项自检 → 落盘 → 停止推进、等门控回写。

**`func_solution`**：运行 `whalecloud-dev-tool-function-solution` → 落盘 `函数级方案.md` + `func_solution_review.json` → 自动进入 **函数级方案评审**门控（用户按需求-模块-改造方案逐条确认、总体意见≥20字、全部通过后推进）。

**`solution_review`**：运行 `whalecloud-dev-tool-solution-review` → 落盘 `solution_review.json` + `方案评审结论.md` → 自动进入 **方案评审**门控（用户选补丁、意见≥50字、通过/不通过）。

**`leader_review`**：生成 `研发组长评审结论.md`（及「会议产出」清单内其他文件）→ 进入 **NodeReview**门控（确认或返工）。

能力超出「你的能力档案」或 JSON/schema 无法合规生成 → `submit_hitl_questionnaire(kind="exception", summary="…")`，提交即停（**唯一**允许的 HITL 场景）。

### 3. 上下文与归档

- 产品/代码/工单路径 **仅**取自「三、系统信息」
- 文件名与「会议产出」**逐字一致**；须节点 SKILL 生成，禁止手写绕过 schema

| 节点 | 必交付 |
|------|--------|
| `func_solution` | `函数级方案.md`、`func_solution_review.json` |
| `solution_review` | `方案评审结论.md`、`solution_review.json` |
| `leader_review` | `研发组长评审结论.md` |
