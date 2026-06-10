"""func_solution_review 解析与裁决单元测试。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.func_solution_review import (
    apply_human_decision,
    enrich_payload_from_archive,
    format_revision_brief,
    load_func_solution_review_payload,
    normalize_payload,
    save_plan_reviews,
    validate_func_solution_review_json,
    _parse_plans_from_markdown,
)

SAMPLE_REVIEW = {
    "schema_version": 1,
    "requirement_name": "测试需求",
    "overview": {
        "architecture_summary": "总览说明",
        "diagrams": [
            {"id": "d1", "title": "流程", "kind": "flowchart", "mermaid": "flowchart LR\n  A-->B"}
        ],
    },
    "consistency_analysis": {
        "summary": "无悖论",
        "contradiction_checks": ["方案 A 与 B 不冲突"],
    },
    "transformation_plans": [
        {
            "id": "plan-1",
            "requirement_ref": "功能要点-1",
            "requirement_summary": "支持优先级调整",
            "module_name": "任务调度模块",
            "title": "优先级接口改造",
            "design_rationale": "在现有 TaskService 扩展",
            "design_evidence": ["code/TaskService.java"],
            "expected_effect": "可在线调优先级",
            "content_markdown": "改造 TaskService.adjustPriority …",
            "human_review": {"status": "pending", "comment": ""},
        }
    ],
    "human_review": {"status": "pending", "comment": ""},
}


def test_normalize_payload():
    out = normalize_payload(SAMPLE_REVIEW)
    assert out["transformation_plans"][0]["module_name"] == "任务调度模块"
    assert out["overview"]["diagrams"][0]["mermaid"].startswith("flowchart")


def test_validate_and_apply(tmp_path, monkeypatch):
    scope_id = "fs-review-1"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"
    archive.mkdir(parents=True)
    (archive / "函数级方案.md").write_text("# 函数级方案\n\n" + ("x" * 100), encoding="utf-8")
    (archive / "func_solution_review.json").write_text(
        json.dumps(SAMPLE_REVIEW, ensure_ascii=False),
        encoding="utf-8",
    )

    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.archive_dir",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.json_path",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "func_solution_review.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.md_path",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "函数级方案.md",
    )

    ok, errors = validate_func_solution_review_json(scope_id)
    assert ok, errors

    save_plan_reviews(scope_id, [{"id": "plan-1", "status": "approved", "comment": ""}])

    with pytest.raises(ValueError, match="comment_too_short"):
        apply_human_decision(scope_id, decision="approve", comment="短")

    out = apply_human_decision(
        scope_id,
        decision="approve",
        comment="总体方案合理，各模块改造边界清晰，同意推进。",
    )
    assert out["human_review"]["status"] == "approved"


def test_enrich_prefers_structured_markdown_over_json_prose(tmp_path, monkeypatch):
    """JSON 中短 prose content_markdown 不应挡住 函数级方案.md 的四类小节。"""
    scope_id = "fs-md-over-json"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"
    archive.mkdir(parents=True)
    md = """# 函数级方案

### 1.7 模块改造方案

#### 1.7.1 账单模块

**模块概要**

- 涉及功能点：在线调账与账单核对
- 改造类型：修改

**函数设计清单**

| 函数签名 | 入参 | 出参 |
|----------|------|------|
| adjustBill | id | bool |

**函数伪代码**

##### adjustBill()

```
if valid(id): update()
```

**模块内部调用关系**

BillService -> BillDao
"""
    review = {
        "schema_version": 1,
        "transformation_plans": [
            {
                "id": "plan-1",
                "module_name": "账单模块",
                "title": "优先级接口改造",
                "design_rationale": "扩展 BillService",
                "expected_effect": "可在线调账",
                "content_markdown": "改造 BillService.adjustBill 方法实现调账逻辑。",
                "human_review": {"status": "pending", "comment": ""},
            }
        ],
    }
    (archive / "函数级方案.md").write_text(md, encoding="utf-8")
    (archive / "func_solution_review.json").write_text(
        json.dumps(review, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.archive_dir",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.json_path",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "func_solution_review.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.md_path",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "函数级方案.md",
    )
    payload = load_func_solution_review_payload(scope_id)
    cm = payload["transformation_plans"][0]["content_markdown"]
    assert "**模块概要**" in cm
    assert "**函数设计清单**" in cm
    assert "**函数伪代码**" in cm
    assert "**模块内部调用关系**" in cm
    assert "改造 BillService.adjustBill" not in cm


def test_enrich_from_markdown(tmp_path, monkeypatch):
    scope_id = "fs-md-fallback"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"
    archive.mkdir(parents=True)
    md = """# 函数级方案

## 1.7 模块改造方案

#### 1.7.1 账单模块

**模块概要**

- 涉及功能点：在线调账与账单核对
- 改造类型：修改
- 职责：账单生命周期管理
- 关键文件：BillService.java, BillDao.java

**函数设计清单**

| 函数签名 | 入参 | 出参 |
|----------|------|------|
| adjustBill | id | bool |
"""
    (archive / "函数级方案.md").write_text(md, encoding="utf-8")
    (archive / "func_solution_review.json").write_text(
        json.dumps({"schema_version": 1, "transformation_plans": []}, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.archive_dir",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.json_path",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "func_solution_review.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.md_path",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "函数级方案.md",
    )
    payload = load_func_solution_review_payload(scope_id)
    assert payload is not None
    enriched = enrich_payload_from_archive(scope_id, payload)
    plans = enriched.get("transformation_plans") or []
    assert len(plans) >= 1
    plan = plans[0]
    assert plan["module_name"] == "账单模块"
    assert "在线调账" in plan["requirement_summary"]
    assert plan["design_rationale"]
    assert "BillService.java" in plan["design_evidence"][0]


def test_parse_markdown_extracts_rationale():
    md = """## 1.7 模块改造方案

#### 1.7.2 索引模块

- **涉及功能点**：优先级在线变更
- **改造类型**：修改
- **职责**：索引维护
"""
    plans = _parse_plans_from_markdown(md)
    assert len(plans) == 1
    assert plans[0]["module_name"] == "索引模块"
    assert "优先级" in plans[0]["requirement_summary"]
    assert "改造类型" in plans[0]["design_rationale"]


def test_format_revision_brief_and_revise_validation(tmp_path, monkeypatch):
    scope_id = "fs-revise"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"
    archive.mkdir(parents=True)
    review = dict(SAMPLE_REVIEW)
    (archive / "函数级方案.md").write_text("# 函数级方案\n\n" + ("x" * 100), encoding="utf-8")
    (archive / "func_solution_review.json").write_text(
        json.dumps(review, ensure_ascii=False),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.archive_dir",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.json_path",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "func_solution_review.json",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review.md_path",
        lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "函数级方案.md",
    )

    payload = load_func_solution_review_payload(scope_id)
    review["transformation_plans"][0]["human_review"] = {
        "status": "needs_change",
        "comment": "应复用 TaskService 而非新增入口",
    }
    brief = format_revision_brief(review, "总体需收紧边界")
    assert "TaskService" in brief
    assert "总体" in brief

    with pytest.raises(ValueError, match="no_plans_need_change"):
        apply_human_decision(scope_id, decision="revise", comment="无具体条目")

    save_plan_reviews(
        scope_id,
        [{"id": "plan-1", "status": "needs_change", "comment": "应复用 TaskService 而非新增入口"}],
    )
    out = apply_human_decision(scope_id, decision="revise", comment="请按意见调整")
    assert out["human_review"]["status"] == "needs_revision"
