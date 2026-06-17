"""方案评审：解析、裁决与落盘。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synapse.rd_meeting.solution_review import (
    MAX_SPLIT_TASKS,
    MIN_HUMAN_REVIEW_COMMENT_LEN,
    apply_human_decision,
    build_demand_function_with_assignments,
    build_split_task_comments,
    ensure_human_review_pending_for_gate,
    ensure_split_tasks_draft,
    enrich_func_solution_repos_from_catalog,
    enrich_payload_from_archive,
    enrich_split_tasks_from_func_solution,
    parse_func_solution_demand_functions,
    parse_func_solution_impact_assessment,
    parse_func_solution_md,
    parse_module_func_md,
    render_conclusion_markdown,
    resolve_demand_functions,
    save_split_tasks_draft,
    validate_function_point_assignment,
    validate_human_review_comment,
    validate_split_tasks_draft,
    validate_solution_review_json,
)


SAMPLE_FUNC_SOLUTION = """# 函数级方案

## 1. 方案内容

### 1.3 涉及仓库
| 产品分支ID | 应用模块 | 仓库地址 | 改造内容 |
|-----------|---------|---------|---------|
| 4531 | ZMDB | https://git.example.com/repo.git | 改造计费模块 |

### 影响评估

#### 性能影响分析
| 变更点 | 性能影响类型 | 影响程度 | 无法规避原因 | 规避措施 |
|--------|-------------|----------|-------------|----------|
| 查询接口 | 延迟 | 低 | 数据量增长 | 加索引 |

#### 安全影响
| 安全维度 | 影响说明 | 影响程度 | 安全措施 | 备注 |
|---------|---------|---------|---------|------|
| 鉴权 | 新增接口需鉴权 | 中 | 沿用现有网关 | |
"""

TITLE_ONLY_PARTIAL = """### 影响评估

#### 性能影响分析
| 变更点 | 性能影响类型 | 影响程度 | 无法规避原因 | 规避措施 |
|--------|-------------|----------|-------------|----------|
| 查询 | 延迟 | 低 | 数据量 | 索引 |

#### 配置变更说明
| 配置项 | 变更类型 | 配置位置 | 影响范围 | 变更说明 |
|--------|----------|---------|---------|----------|
| pool.size | 修改 | application.yml | 全局 | 调大连接池 |
"""


def test_parse_func_solution_md_repos_and_security():
    parsed = parse_func_solution_md(SAMPLE_FUNC_SOLUTION)
    assert len(parsed["repos"]) == 1
    assert parsed["repos"][0]["branch_version_id"] == "4531"
    assert parsed["repos"][0]["product_module_name"] == "ZMDB"
    impact = parsed["impact_assessment"]
    sections = impact["sections"]
    assert len(sections) == 2
    assert sections[0]["title"] == "性能影响分析"
    assert sections[0]["rows"][0]["变更点"] == "查询接口"
    assert sections[1]["title"] == "安全影响"
    assert "配置" not in sections[0]["title"]


def test_parse_impact_by_title_not_section_number():
    """无章节编号、仅部分子节：按标题切分，不错位。"""
    impact = parse_func_solution_impact_assessment(TITLE_ONLY_PARTIAL)
    sections = impact["sections"]
    assert len(sections) == 2
    assert sections[0]["title"] == "性能影响分析"
    assert sections[0]["rows"][0].get("变更点") == "查询"
    assert sections[1]["title"] == "配置变更说明"
    assert sections[1]["rows"][0].get("配置项") == "pool.size"
    perf_rows = sections[0]["rows"][0]
    assert "配置项" not in perf_rows


def test_enrich_func_solution_repos_from_catalog(monkeypatch):
    catalog = [
        {
            "repo_url": "https://git.example.com/xmjfbss/ZMDB.git",
            "repo_module": "ZMDB",
            "prod_branch": "4531|CBOSS_BSS_ZMDB_V9.0_主分支",
        }
    ]
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review._load_catalog_repos",
        lambda _sid: catalog,
    )
    repos = [
        {
            "branch_version_id": "4531",
            "repo_url": "https://git.example.com/xmjfbss/ZMDB.git",
            "branch_version_name": "",
            "product_module_name": "",
            "change_summary": "改造",
        }
    ]
    out = enrich_func_solution_repos_from_catalog("21881451", repos)
    assert out[0]["product_module_name"] == "ZMDB"
    assert out[0]["branch_version_name"] == "CBOSS_BSS_ZMDB_V9.0_主分支"


def test_ensure_split_tasks_draft_fills_branch_from_catalog(monkeypatch):
    catalog = [
        {
            "repo_url": "https://git.example.com/ZMDB.git",
            "repo_module": "ZMDB",
            "prod_branch": "4531|CBOSS_BSS_ZMDB_V9.0_主分支",
        }
    ]
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review._load_catalog_repos",
        lambda _sid: catalog,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review._demand_functions_from_func_solution_archive",
        lambda _sid: [],
    )
    payload = {
        "requirement_name": "ZMDB改造",
        "func_solution_parsed": {
            "repos": [
                {
                    "branch_version_id": "4531",
                    "repo_url": "https://git.example.com/ZMDB.git",
                    "change_summary": "核心改造",
                }
            ],
            "impact_assessment": {"sections": []},
        },
    }
    tasks = ensure_split_tasks_draft(payload, "21881451", scope_id="21881451")
    assert len(tasks) == 1
    assert tasks[0]["productModuleName"] == "ZMDB"
    assert tasks[0]["branchVersionName"] == "CBOSS_BSS_ZMDB_V9.0_主分支"
    assert tasks[0]["branch_version_id"] == "4531"
    assert tasks[0]["comments"] == "核心改造"


def test_enrich_payload_from_archive_reparses_impact(tmp_path, monkeypatch):
    scope_id = "enrich-impact"
    archive_func = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"
    archive_func.mkdir(parents=True)
    (archive_func / "函数级方案.md").write_text(SAMPLE_FUNC_SOLUTION, encoding="utf-8")
    archive_review = tmp_path / scope_id / "archive" / "需求设计" / "solution_review"
    archive_review.mkdir(parents=True)
    payload = {
        "func_solution_parsed": {
            "repos": [{"branch_version_id": "4531"}],
            "impact_assessment": {"sections": [], "performance": []},
        }
    }
    (archive_review / "solution_review.json").write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review._func_solution_archive_path",
        lambda sid: archive_func / "函数级方案.md",
    )
    out = enrich_payload_from_archive(scope_id, payload)
    sections = out["func_solution_parsed"]["impact_assessment"]["sections"]
    assert len(sections) == 2


SAMPLE_MODULE_FUNC = """# 模块功能

## 模块改造清单

### 修改模块

| # | 功能模块名称 | 模块目标 | 满足的需求 | 验证方式 | 核心类 | 澄清文档依据 | 确认依据 |
|---|-------------|---------|-----------|---------|--------|-------------|---------|
| 1 | 任务调度模块 | 支持运营在线调整任务优先级 | 功能要点-优先级调整 | 联调：调整优先级后任务队列顺序变更 | TaskService | 功能要点 §4 | code/TaskService.java |

### 新增模块

| # | 模块名称 | 模块目标 | 满足的需求 | 验证方式 | 核心类 | 新增原因 | 澄清文档依据 | 确认依据 |
|---|---------|---------|-----------|---------|--------|---------|-------------|---------|
| 1 | 账单导出模块 | 支持导出 PDF/Excel 账单 | 功能要点-账单导出 | 导出文件格式与内容校验 | ExportService | 架构无对应模块 | 功能要点 §5 | [待确认] |
"""


SAMPLE_FUNC_SOLUTION_WITH_MODULES = """# 函数级方案

## 1. 方案内容

### 1.3 涉及仓库
| 产品分支ID | 应用模块 | 仓库地址 | 改造内容 |
|-----------|---------|---------|---------|
| 4531 | ZMDB | https://git.example.com/repo.git | 改造计费模块 |

### 1.7 模块改造方案

#### 1.7.1 任务调度模块

**模块概要**

- 职责：支持运营在线调整任务优先级

#### 1.7.2 账单导出模块

**模块概要**

- 职责：支持导出 PDF/Excel 账单
"""


def test_parse_func_solution_demand_functions():
    rows = parse_func_solution_demand_functions(SAMPLE_FUNC_SOLUTION_WITH_MODULES)
    assert len(rows) == 2
    assert rows[0]["functionPoint"] == "任务调度模块"
    assert rows[0]["functionDesc"] == "支持运营在线调整任务优先级"
    assert rows[1]["functionPoint"] == "账单导出模块"


def test_build_split_task_comments():
    text = build_split_task_comments(
        change_summary="核心改造",
        module_points=[{"functionPoint": "模块A", "functionDesc": "职责A"}],
    )
    assert "核心改造" in text
    assert "模块A：职责A" in text


def test_parse_module_func_md():
    rows = parse_module_func_md(SAMPLE_MODULE_FUNC)
    assert len(rows) == 2
    assert rows[0]["functionPoint"] == "任务调度模块"
    assert rows[0]["functionDesc"] == "支持运营在线调整任务优先级"
    assert rows[1]["functionPoint"] == "账单导出模块"
    assert rows[1]["functionDesc"] == "支持导出 PDF/Excel 账单"


LEGACY_MODULE_FUNC = """# 模块功能

## 需求功能拆分

| # | 功能点 | 说明 |
|---|--------|------|
| 1 | 在线调优先级 | 支持运营调整任务优先级 |
| 2 | 账单导出 | 导出 PDF/Excel 账单 |
"""


def test_parse_module_func_md_legacy():
    rows = parse_module_func_md(LEGACY_MODULE_FUNC)
    assert len(rows) == 2
    assert rows[0]["functionPoint"] == "在线调优先级"
    assert rows[1]["functionDesc"] == "导出 PDF/Excel 账单"


def test_resolve_demand_functions_merges_split_tasks(tmp_path, monkeypatch):
    scope_id = "merge-fp"
    archive_func = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"
    archive_func.mkdir(parents=True)
    (archive_func / "函数级方案.md").write_text(SAMPLE_FUNC_SOLUTION_WITH_MODULES, encoding="utf-8")

    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review._func_solution_archive_path",
        lambda sid: archive_func / "函数级方案.md",
    )

    payload = {
        "demand_function": [],
        "split_tasks_draft": [
            {"taskTitle": "子单A", "functionPoints": ["账单导出模块"]},
            {"taskTitle": "子单B", "functionPoints": ["仅存在于拆单"]},
        ],
    }
    out = resolve_demand_functions(payload, scope_id)
    points = [row["functionPoint"] for row in out]
    assert "任务调度模块" in points
    assert "账单导出模块" in points
    assert "仅存在于拆单" in points


def test_enrich_split_tasks_from_func_solution_syncs_comments(tmp_path, monkeypatch):
    scope_id = "sync-comments"
    archive_func = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"
    archive_func.mkdir(parents=True)
    (archive_func / "函数级方案.md").write_text(SAMPLE_FUNC_SOLUTION_WITH_MODULES, encoding="utf-8")
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review._func_solution_archive_path",
        lambda sid: archive_func / "函数级方案.md",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.is_solution_review_formally_decided",
        lambda _sid: False,
    )
    payload = {
        "human_review": {"status": "pending", "comment": "", "decided_at": None},
        "func_solution_parsed": {
            "repos": [
                {
                    "branch_version_id": "4531",
                    "product_module_name": "ZMDB",
                    "change_summary": "改造计费模块",
                }
            ]
        },
        "split_tasks_draft": [
            {
                "taskTitle": "子单",
                "comments": "小鲸乱写的描述",
                "branch_version_id": "4531",
                "functionPoints": ["进程管理模块", "任务调度模块"],
            }
        ],
    }
    out = enrich_split_tasks_from_func_solution(scope_id, payload)
    task = out["split_tasks_draft"][0]
    assert "改造计费模块" in task["comments"]
    assert "任务调度模块" in task["functionPoints"]
    assert "账单导出模块" in task["functionPoints"]
    assert "进程管理模块" not in task["functionPoints"]
    assert "小鲸乱写的描述" not in task["comments"]


def test_validate_function_point_duplicate_rejected():
    demand = [{"functionPoint": "A", "functionDesc": ""}, {"functionPoint": "B", "functionDesc": ""}]
    tasks = [
        {"taskTitle": "t1", "functionPoints": ["A", "B"]},
        {"taskTitle": "t2", "functionPoints": ["A"]},
    ]
    with pytest.raises(ValueError, match="function_point_duplicate:A"):
        validate_function_point_assignment(tasks, demand)


def test_build_demand_function_with_assignments():
    demand = [{"functionPoint": "A", "functionDesc": "desc A"}]
    tasks = [{"taskTitle": "子单-计费", "functionPoints": ["A"]}]
    out = build_demand_function_with_assignments(demand, tasks)
    assert out[0]["assignedTaskTitle"] == "子单-计费"
    assert out[0]["functionDesc"] == "desc A"


def test_validate_human_review_comment_min_length():
    short = "a" * (MIN_HUMAN_REVIEW_COMMENT_LEN - 1)
    with pytest.raises(ValueError, match="human_review_comment_too_short"):
        validate_human_review_comment(short)
    ok = "a" * MIN_HUMAN_REVIEW_COMMENT_LEN
    validate_human_review_comment(ok)


def test_apply_human_decision_reject_writes_conclusion(tmp_path, monkeypatch):
    scope_id = "test-demand-001"
    work = tmp_path / scope_id
    archive = work / "archive" / "需求设计" / "solution_review"
    archive.mkdir(parents=True)

    payload = {
        "schema_version": 1,
        "demand_no": scope_id,
        "whale_review": {"score": 70, "verdict": "conditional_pass", "suggestions": []},
        "split_tasks_draft": [
            {
                "taskNo": scope_id,
                "taskTitle": "t",
                "comments": "c",
                "productModuleName": "m",
                "branchVersionName": "b",
                "patchName": "",
                "taskImpactDesc": "i",
                "performanceImpact": "p",
                "functionalImpact": "f",
                "cfgChangeDescription": "cfg",
                "upgradeRisk": "u",
                "securityImpact": "s",
                "compatibilityImpact": "c",
                "branch_version_id": "4531",
            }
        ],
    }
    (archive / "solution_review.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )

    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.archive_dir",
        lambda sid: archive if sid == scope_id else archive,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.json_path",
        lambda sid: archive / "solution_review.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.split_plan_path",
        lambda sid: archive / "split_plan.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.conclusion_path",
        lambda sid: archive / "方案评审结论.md",
    )

    reject_comment = (
        "方案改造范围过大，涉及多个模块联动，当前阶段无法一次性收敛，"
        "建议先收缩到计费核心链路并补充回归测试计划后再提交评审。"
    )
    assert len(reject_comment.strip()) >= MIN_HUMAN_REVIEW_COMMENT_LEN

    out = apply_human_decision(
        scope_id,
        decision="reject",
        comment=reject_comment,
        demand_no=scope_id,
    )
    assert out["human_review"]["status"] == "rejected"
    assert (archive / "方案评审结论.md").is_file()
    md = (archive / "方案评审结论.md").read_text(encoding="utf-8")
    assert "未通过" in md or "rejected" in md.lower() or "不通过" in md


def test_validate_solution_review_json_missing(tmp_path, monkeypatch):
    scope_id = "no-json"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "solution_review"
    archive.mkdir(parents=True)
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.json_path",
        lambda sid: archive / "solution_review.json",
    )
    ok, errs = validate_solution_review_json(scope_id)
    assert not ok
    assert errs


def test_ensure_human_review_pending_for_gate_resets_stale_approved(tmp_path, monkeypatch):
    scope_id = "sr-reset"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "solution_review"
    archive.mkdir(parents=True)
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.archive_dir",
        lambda sid: archive,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.json_path",
        lambda sid: archive / "solution_review.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.split_plan_path",
        lambda sid: archive / "split_plan.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.conclusion_path",
        lambda sid: archive / "方案评审结论.md",
    )
    payload = {
        "human_review": {
            "status": "approved",
            "comment": "",
            "decided_at": "2026-06-08T00:58:15",
        },
        "whale_review": {"score": 80, "verdict": "pass"},
    }
    out = ensure_human_review_pending_for_gate(scope_id, payload)
    assert out["human_review"]["status"] == "pending"
    assert out["human_review"]["decided_at"] is None
    on_disk = json.loads((archive / "solution_review.json").read_text(encoding="utf-8"))
    assert on_disk["human_review"]["status"] == "pending"


def test_ensure_human_review_pending_skips_when_split_plan_exists(tmp_path, monkeypatch):
    scope_id = "sr-decided"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "solution_review"
    archive.mkdir(parents=True)
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.split_plan_path",
        lambda sid: archive / "split_plan.json",
    )
    (archive / "split_plan.json").write_text(
        json.dumps(
            {"approved_at": "2026-06-08T01:00:00", "tasks": [{"taskNo": "1"}]},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    payload = {"human_review": {"status": "approved", "decided_at": "x"}}
    out = ensure_human_review_pending_for_gate(scope_id, payload)
    assert out["human_review"]["status"] == "approved"


def test_validate_split_tasks_draft_max_five():
    tasks = [{"taskTitle": f"t{i}"} for i in range(MAX_SPLIT_TASKS)]
    validate_split_tasks_draft(tasks)
    with pytest.raises(ValueError, match="split_tasks_draft_too_many"):
        validate_split_tasks_draft(tasks + [{"taskTitle": "extra"}])


def test_validate_split_tasks_draft_requires_title():
    with pytest.raises(ValueError, match="split_task_title_required"):
        validate_split_tasks_draft([{"taskTitle": ""}])


def test_save_split_tasks_draft_persists(tmp_path, monkeypatch):
    scope_id = "save-tasks"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "solution_review"
    archive.mkdir(parents=True)
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.json_path",
        lambda sid: archive / "solution_review.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.solution_review.load_solution_review_payload",
        lambda sid, **kw: {"demand_no": scope_id, "split_tasks_draft": []},
    )
    tasks = [{"taskNo": scope_id, "taskTitle": "模块A改造", "comments": "范围A"}]
    out = save_split_tasks_draft(scope_id, tasks)
    assert len(out["split_tasks_draft"]) == 1
    on_disk = json.loads((archive / "solution_review.json").read_text(encoding="utf-8"))
    assert on_disk["split_tasks_draft"][0]["taskTitle"] == "模块A改造"
