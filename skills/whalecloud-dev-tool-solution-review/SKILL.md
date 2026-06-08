---
name: whalecloud-dev-tool-solution-review
description: "方案评审技能：汇总需求设计阶段已开启 SOP 产出，对照历史方案/函数级方案/控熵进行可靠性安全性评审，输出结构化 solution_review.json 与方案评审结论.md。"
label: 方案评审
---

# 方案评审技能

对**需求设计阶段**已开启且已归档的 SOP 产出物进行综合评审，输出机器可读 JSON（供前端方案评审面板渲染）与人类可读结论文档。

## 何时使用

- 研发会议室 `solution_review`（方案评审）节点；
- 函数级方案、历史方案映射、控熵文件等前序产出已落盘。

## Parameters

| Parameter | 必填 | 说明 |
|-----------|------|------|
| `WORK_ORDER_DIR` | 是 | 工单目录，如 `work/21881451` |
| `ARCHIVE_DIR` | 否 | 默认 `{WORK_ORDER_DIR}/archive/需求设计/solution_review` |
| `DEMAND_NO` | 否 | 需求单号，默认取目录名 |
| `REQUIREMENT_NAME` | 否 | 需求标题，用于拆单标题 |
| `SKIPPED_NODE_IDS` | 否 | 逗号分隔的已跳过节点 id，评审输入须排除 |

## 必读输入（按节点开启状态）

| 节点 | 产出物 | 路径 |
|------|--------|------|
| func_assign | 功能点分派清单.md | `archive/需求设计/func_assign/` |
| history_solution | 历史方案映射.md | `archive/需求设计/history_solution/` |
| module_confirm | 模块范围确认.md | `archive/需求设计/module_confirm/` |
| func_solution | 函数级方案.md | `archive/需求设计/func_solution/` |
| entropy_gen | agent.md, rule.md | `archive/需求设计/entropy_gen/` |

未开启或跳过的节点：在 JSON `inputs.stage2_artifacts` 中标记 `included: false`，**不得**伪造其内容。

## 输出（强制双文件）

1. **`solution_review.json`** — `schema_version: 1`，结构见下方（必须用 `write_file` UTF-8 写入）
2. **`方案评审结论.md`** — 调用 `whalecloud-dev-tool-doc-generate`，`OUTPUT=方案评审结论.md`，`CONTEXT_JSON` 为 JSON 文件路径或对象

**禁止**使用 `submit_hitl_questionnaire`；人工补丁选择与通过/不由此技能完成。

## solution_review.json 结构

```json
{
  "schema_version": 1,
  "demand_no": "需求单号",
  "requirement_name": "需求名称",
  "reviewed_at": "ISO8601",
  "inputs": { "stage2_artifacts": [] },
  "whale_review": {
    "score": 0,
    "score_breakdown": {
      "reliability": 0,
      "security": 0,
      "consistency": 0,
      "entropy_compliance": 0
    },
    "verdict": "conditional_pass",
    "summary_markdown": "总评",
    "split_strategy_rationale": "拆单策略与理由（必填，1～3 句：单任务 / 按仓库 / 按模块及依据）",
    "suggestions": [
      {
        "severity": "high",
        "dimension": "security",
        "title": "标题",
        "detail": "说明",
        "evidence_refs": ["函数级方案.md#1.10.5"]
      }
    ]
  },
  "func_solution_parsed": {
    "repos": [
      {
        "branch_version_id": "",
        "repo_url": "",
        "change_summary": "",
        "product_module_name": "",
        "branch_version_name": ""
      }
    ],
    "impact_assessment": {
      "performance": [],
      "functional": [],
      "config": [],
      "upgrade_risk": [],
      "security": [],
      "compatibility": [],
      "ui_ue": []
    }
  },
  "split_strategy_rationale": "与 whale_review.split_strategy_rationale 相同，供前端拆单区直接展示",
  "split_tasks_draft": [
    {
      "taskNo": "需求单号",
      "taskTitle": "研发单标题",
      "comments": "研发单描述",
      "productModuleName": "应用模块",
      "branchVersionName": "产品分支",
      "patchName": "",
      "taskImpactDesc": "研发单影响",
      "performanceImpact": "",
      "functionalImpact": "",
      "cfgChangeDescription": "",
      "upgradeRisk": "",
      "securityImpact": "",
      "compatibilityImpact": "",
      "branch_version_id": ""
    }
  ],
  "human_review": {
    "status": "pending",
    "comment": "",
    "decided_at": null
  }
}
```

### 评审维度

1. **历史方案**：映射是否充分、本次是否偏离历史结论  
2. **函数级方案**：范围、接口、数据设计、待确认项、代码确认率  
3. **控熵**：agent/rule 与改造范围是否一致  
4. **安全 / 升级 / 兼容**：以 §1.10 为主要证据  

`patchName` 在 SKILL 阶段**一律留空**；`human_review.status` 初始为 `pending`。

### split_tasks_draft 生成规则（拆单策略）

**核心原则**：拆单是为了方便并行开发与降低改造冲突；简单方案保持单任务，复杂或跨仓库方案才拆分。

#### 何时必须 / 可以拆分

| 场景 | 是否拆分 | 说明 |
|------|----------|------|
| 涉及 **2 个及以上不同仓库** | **必须拆分** | 每个仓库至少 1 条任务，按仓库边界切分 |
| **复杂方案**（跨模块 + 大范围代码改造） | **应当拆分** | 按模块独立性拆成 2～5 条，避免多任务改同一文件/类 |
| 单仓库、单模块、改造范围可控 | **不拆分** | 仅生成 **1 条** 任务 |
| 跨模块但改造范围小（局部函数/配置） | **不拆分** | 仍生成 1 条，在 `comments` 中列明涉及模块 |

**复杂方案判定**（须同时满足）：
1. **跨模块**：函数级方案 §1.3 / §1.10 功能影响涉及 **≥2 个**  distinct 应用模块或业务域；
2. **大范围改造**：待改造函数/类 **≥5 个**，或涉及核心链路重构、数据库结构变更、公共接口 Breaking Change 之一。

#### 拆分颗粒度

- **以模块独立为首要依据**：每条任务应能独立开发、独立验收，尽量不让多条任务交叉改造相同代码（同一文件、同一类、同一接口）。
- **同一仓库内多模块**：按模块或子域拆成多条，每条 `productModuleName` / `comments` 明确本任务改造边界。
- **跨仓库**：按仓库拆；若某仓库内仍跨多模块且属复杂方案，可在该仓库下再按模块拆（总任务数仍 ≤5）。
- **硬上限**：一个需求 **最多 5 条** 任务（`split_tasks_draft.length ≤ 5`）；若按规则需超过 5 条，优先合并相邻模块并在 `whale_review.suggestions` 中提示「建议收缩范围或分阶段交付」。

#### 字段填写

- 所有任务共用同一 `taskNo`（需求单号）；
- `taskTitle`：「{需求名称} — {模块/子域/仓库简称}」；
- `taskImpactDesc` 与 `performanceImpact` 等从 §1.10 **仅归纳本任务范围** 内的影响，勿把全方案影响复制到每条；
- `branch_version_id` / `productModuleName` / `branchVersionName` 须与函数级方案 §1.3 一致；
- `patchName` 在 SKILL 阶段 **一律留空**（人工在评审面板选择）；
- 无仓库表时生成 **单条** 草案。

#### 决策流程（生成前自检）

```
1. 统计 repos 数量 → ≥2 则必须按仓库拆分
2. 判定是否复杂方案（跨模块 + 大范围）→ 否且单仓库 → 输出 1 条
3. 是复杂方案 → 按模块独立性划分，检查任务间是否有重叠改造点
4. 合并/调整直至 1 ≤ 任务数 ≤ 5
5. 填写 `whale_review.split_strategy_rationale` 与顶层 `split_strategy_rationale`（内容一致）：用 1～3 句说明为何拆成当前条数（单任务 / 按仓库 / 按模块）及依据（仓库数、模块数、改造范围等）；`summary_markdown` 末尾可简要呼应，但以结构化字段为准
```

## 工作流程

```
1. 读取 WORK_ORDER_DIR 下需求设计阶段各节点产出（仅 included 项）
2. 重点精读：历史方案映射.md、函数级方案.md、entropy agent.md/rule.md
3. 填写 whale_review（评分 0-100、建议带 evidence_refs）
4. 从函数级方案解析 repos 与 impact_assessment（表格行转为对象数组）
5. 按「拆单策略」生成 split_tasks_draft（1～5 条，patchName 为空）
6. 自检：跨仓库必拆、简单方案单条、复杂方案按模块切分且无交叉改造
7. write_file → {ARCHIVE_DIR}/solution_review.json
8. whalecloud-dev-tool-doc-generate → 方案评审结论.md
```

## 字符编码

与 `whalecloud-dev-tool-doc-generate` 相同：**必须** `write_file`，UTF-8 无 BOM。
