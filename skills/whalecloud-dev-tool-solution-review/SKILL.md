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

### split_tasks_draft 生成规则

- 按 `func_solution_parsed.repos` 每个仓库一行生成一条（同一 `taskNo`）；
- `taskImpactDesc` 与 `performanceImpact` 等从 §1.10 对应表归纳，勿臆造；
- 无仓库表时生成单条草案。

## 工作流程

```
1. 读取 WORK_ORDER_DIR 下需求设计阶段各节点产出（仅 included 项）
2. 重点精读：历史方案映射.md、函数级方案.md、entropy agent.md/rule.md
3. 填写 whale_review（评分 0-100、建议带 evidence_refs）
4. 从函数级方案解析 repos 与 impact_assessment（表格行转为对象数组）
5. 生成 split_tasks_draft（patchName 为空）
6. write_file → {ARCHIVE_DIR}/solution_review.json
7. whalecloud-dev-tool-doc-generate → 方案评审结论.md
```

## 字符编码

与 `whalecloud-dev-tool-doc-generate` 相同：**必须** `write_file`，UTF-8 无 BOM。
