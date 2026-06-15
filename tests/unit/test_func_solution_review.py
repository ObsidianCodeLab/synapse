"""func_solution_review 解析与裁决单元测试。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting.func_solution_review import (
    apply_human_decision,
    ensure_func_solution_review_json_from_archive,
    enrich_payload_from_archive,
    format_revision_brief,
    load_func_solution_review_payload,
    normalize_payload,
    save_plan_reviews,
    validate_func_solution_review_json,
    _parse_plans_from_markdown,
    _validate_func_solution_payload,
    _resolve_mmdc_argv,
    _validate_mermaid_diagrams_structure,
    _validate_mermaid_diagrams_syntax,
    _sanitize_mermaid_source,
    sanitize_mermaid_diagrams,
)

VALID_FLOWCHART = "flowchart LR\n  Entry[入口] --> Module[账单模块]"
VALID_SEQUENCE = "sequenceDiagram\n  participant U as 调用方\n  participant S as Service\n  U->>S: 请求\n  S-->>U: 响应"

SAMPLE_REVIEW = {
    "schema_version": 1,
    "requirement_name": "测试需求",
    "overview": {
        "architecture_summary": "总览说明：改造在系统中的位置、主链路与关键架构决策摘要。",
        "diagrams": [
            {"id": "d1", "title": "流程", "kind": "flowchart", "mermaid": VALID_FLOWCHART},
            {
                "id": "d2",
                "title": "时序",
                "kind": "sequenceDiagram",
                "mermaid": VALID_SEQUENCE,
            },
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


@pytest.fixture(autouse=True)
def _mock_mmdc_syntax_ok(monkeypatch):
    """单元测试默认跳过真实 mmdc 子进程，仅测结构门控与集成接线。"""
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review._validate_mermaid_syntax_with_mmdc",
        lambda _mermaid, *, diagram_id: None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review._resolve_mmdc_argv",
        lambda: ["mmdc"],
    )


def _archive_paths(tmp_path, scope_id: str):
    archive = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"

    def _patch(monkeypatch):
        monkeypatch.setattr(
            "synapse.rd_meeting.func_solution_review.archive_dir",
            lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution",
        )
        monkeypatch.setattr(
            "synapse.rd_meeting.func_solution_review.json_path",
            lambda sid: tmp_path
            / sid
            / "archive"
            / "需求设计"
            / "func_solution"
            / "func_solution_review.json",
        )
        monkeypatch.setattr(
            "synapse.rd_meeting.func_solution_review.md_path",
            lambda sid: tmp_path / sid / "archive" / "需求设计" / "func_solution" / "函数级方案.md",
        )

    return archive, _patch


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


def test_ensure_review_json_bootstraps_from_markdown_only(tmp_path, monkeypatch):
    """仅落盘 函数级方案.md 时，门控前应能自动补全 func_solution_review.json。"""
    scope_id = "fs-bootstrap-json"
    archive = tmp_path / scope_id / "archive" / "需求设计" / "func_solution"
    archive.mkdir(parents=True)
    md = """# 函数级方案

## 改造范围概述

本方案覆盖账单模块在线调账能力改造。

```mermaid
flowchart TD
  A[入口] --> B[账单模块]
```

```mermaid
sequenceDiagram
  participant U as 调用方
  participant B as 账单模块
  U->>B: 调账请求
  B-->>U: 结果
```

## 1.7 模块改造方案

#### 1.7.1 账单模块

- **涉及功能点**：在线调账与账单核对
- **改造类型**：修改
- **职责**：账单生命周期管理
- **关键文件**：BillService.java
"""
    (archive / "函数级方案.md").write_text(md, encoding="utf-8")
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

    assert ensure_func_solution_review_json_from_archive(scope_id)
    ok, errors = validate_func_solution_review_json(scope_id)
    assert ok, errors
    payload = load_func_solution_review_payload(scope_id)
    assert payload is not None
    assert len(payload.get("transformation_plans") or []) >= 1
    assert payload["overview"]["diagrams"]


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


def test_mermaid_structure_requires_two_diagrams():
    errors = _validate_mermaid_diagrams_structure(
        [{"id": "d1", "mermaid": VALID_FLOWCHART}],
    )
    assert any("至少需要 2 张" in e for e in errors)


def test_mermaid_structure_requires_flowchart_and_sequence():
    errors = _validate_mermaid_diagrams_structure(
        [
            {"id": "d1", "mermaid": VALID_FLOWCHART},
            {"id": "d2", "mermaid": "flowchart TD\n  X-->Y"},
        ],
    )
    assert any("graph 或 sequenceDiagram" in e for e in errors)


def test_mermaid_structure_rejects_placeholder():
    errors = _validate_mermaid_diagrams_structure(
        [
            {"id": "d1", "mermaid": VALID_FLOWCHART},
            {"id": "d2", "mermaid": "sequenceDiagram\n  TODO participant A"},
        ],
    )
    assert any("占位符" in e for e in errors)


def test_sanitize_mermaid_quotes_special_char_labels():
    """含 {}()/ 的方括号标签自动补引号（如 J[/bake/{iNo}] → J["/bake/{iNo}"]）。"""
    src = "flowchart LR\n  I --> J[/bake/{iNo}]\n  J --> K[done]"
    fixed = _sanitize_mermaid_source(src)
    assert 'J["/bake/{iNo}"]' in fixed
    # 无特殊字符的标签保持不变
    assert "K[done]" in fixed


def test_sanitize_mermaid_keeps_quoted_and_plain_labels():
    src = 'flowchart LR\n  A["already quoted (x)"] --> B[plain]'
    assert _sanitize_mermaid_source(src) == src


def test_sanitize_mermaid_diagrams_inplace_reports_change():
    diagrams = [
        {"id": "d1", "mermaid": "flowchart LR\n  A --> B[/p/{id}]"},
        {"id": "d2", "mermaid": "flowchart LR\n  A --> B[ok]"},
    ]
    assert sanitize_mermaid_diagrams(diagrams) is True
    assert 'B["/p/{id}"]' in diagrams[0]["mermaid"]
    assert sanitize_mermaid_diagrams(diagrams) is False


def test_normalize_overview_accepts_type_and_content_aliases(tmp_path, monkeypatch):
    """LLM 实际产出用 type/content 承载图类型与 mermaid 源，须被兼容而非丢弃。"""
    scope_id = "fs-alias-1"
    archive, patch = _archive_paths(tmp_path, scope_id)
    archive.mkdir(parents=True)
    patch(monkeypatch)
    (archive / "函数级方案.md").write_text("# 函数级方案\n\n" + ("x" * 100), encoding="utf-8")
    real_shape = {
        "schema_version": "1",
        "requirement_name": "定时备份",
        "overview": {
            "architecture_summary": "本需求在 mdbRep 进程内部新增定时备份能力，主链路复用既有同步通道。",
            "diagrams": [
                {"id": "diagram_1", "type": "flowchart", "title": "主流程", "content": VALID_FLOWCHART},
                {"id": "diagram_2", "type": "sequenceDiagram", "title": "时序", "content": VALID_SEQUENCE},
            ],
        },
        "consistency_analysis": {"summary": "无悖论", "contradiction_checks": []},
        "transformation_plans": [
            {
                "id": "plan-1",
                "module_name": "M-A",
                "title": "配置加载",
                "design_rationale": "复用既有解析",
                "design_evidence": ["code/Config.cpp"],
                "expected_effect": "可解析 BackupInfo",
                "content_markdown": "**模块概要**\n说明",
                "human_review": {"status": "pending", "comment": ""},
            }
        ],
        "human_review": {"status": "pending", "comment": ""},
    }
    (archive / "func_solution_review.json").write_text(
        json.dumps(real_shape, ensure_ascii=False), encoding="utf-8"
    )

    payload = load_func_solution_review_payload(scope_id)
    diagrams = payload["overview"]["diagrams"]
    assert len(diagrams) == 2
    assert diagrams[0]["mermaid"].startswith("flowchart")
    assert diagrams[0]["kind"] == "flowchart"
    assert diagrams[1]["kind"] == "sequenceDiagram"

    ok, errors = validate_func_solution_review_json(scope_id)
    assert ok, errors


def test_autoheal_retries_on_structure_error(tmp_path, monkeypatch):
    """缺图等结构错误应触发主控重跑一次，而非直接抛给用户。"""
    import asyncio

    from synapse.rd_meeting.orchestrator import MeetingRoomOrchestrator

    scope_id = "fs-autoheal-1"
    archive, patch = _archive_paths(tmp_path, scope_id)
    archive.mkdir(parents=True)
    patch(monkeypatch)
    (archive / "函数级方案.md").write_text("# 函数级方案\n\n" + ("x" * 100), encoding="utf-8")
    only_one_diagram = json.loads(json.dumps(SAMPLE_REVIEW))
    only_one_diagram["overview"]["diagrams"] = only_one_diagram["overview"]["diagrams"][:1]
    (archive / "func_solution_review.json").write_text(
        json.dumps(only_one_diagram, ensure_ascii=False), encoding="utf-8"
    )

    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.append_history_event",
        lambda *a, **k: None,
    )
    calls: list[str] = []

    class _Res:
        success = True

    async def _fake_host(msg: str):
        calls.append(msg)
        return _Res()

    orch = MeetingRoomOrchestrator()
    asyncio.run(
        orch._autoheal_func_solution_review(
            scope_id=scope_id,
            room_id="room-1",
            node_id="func_solution",
            host_run_fn=_fake_host,
            host_run_prompt="原始提示",
            host_run_profile_id="default",
        )
    )
    assert len(calls) == 1
    assert "至少 2 张" in calls[0]


def test_autoheal_skips_when_valid(tmp_path, monkeypatch):
    """校验通过时不应重跑。"""
    import asyncio

    from synapse.rd_meeting.orchestrator import MeetingRoomOrchestrator

    scope_id = "fs-autoheal-2"
    archive, patch = _archive_paths(tmp_path, scope_id)
    archive.mkdir(parents=True)
    patch(monkeypatch)
    (archive / "函数级方案.md").write_text("# 函数级方案\n\n" + ("x" * 100), encoding="utf-8")
    (archive / "func_solution_review.json").write_text(
        json.dumps(SAMPLE_REVIEW, ensure_ascii=False), encoding="utf-8"
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.orchestrator.append_history_event",
        lambda *a, **k: None,
    )
    calls: list[str] = []

    async def _fake_host(msg: str):
        calls.append(msg)
        return None

    orch = MeetingRoomOrchestrator()
    asyncio.run(
        orch._autoheal_func_solution_review(
            scope_id=scope_id,
            room_id="room-1",
            node_id="func_solution",
            host_run_fn=_fake_host,
            host_run_prompt="原始提示",
            host_run_profile_id="default",
        )
    )
    assert calls == []


def test_mermaid_syntax_gate_skips_when_mmdc_missing(monkeypatch):
    """无 mmdc 时降级跳过语法门控，不得当硬错误导致节点必挂。"""
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review._resolve_mmdc_argv",
        lambda: None,
    )
    errors = _validate_mermaid_diagrams_syntax(
        [{"id": "d1", "mermaid": VALID_FLOWCHART}],
    )
    assert errors == []


def test_resolve_mmdc_prefers_setup_center_local(monkeypatch, tmp_path):
    bin_dir = tmp_path / "apps" / "setup-center" / "node_modules" / ".bin"
    bin_dir.mkdir(parents=True)
    mmdc = bin_dir / "mmdc.cmd"
    mmdc.write_text("@echo off", encoding="utf-8")
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review._repo_root",
        lambda: tmp_path,
    )
    monkeypatch.setattr("shutil.which", lambda _name: None)
    argv = _resolve_mmdc_argv()
    assert argv == [str(mmdc)]


def test_mermaid_syntax_gate_surfaces_mmdc_error(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review._resolve_mmdc_argv",
        lambda: ["mmdc"],
    )
    def _fail_first_only(_mermaid: str, *, diagram_id: str) -> str | None:
        if diagram_id == "d1":
            return f"diagram[{diagram_id}] Mermaid 语法错误: parse error"
        return None

    monkeypatch.setattr(
        "synapse.rd_meeting.func_solution_review._validate_mermaid_syntax_with_mmdc",
        _fail_first_only,
    )
    errors = _validate_mermaid_diagrams_syntax(
        [
            {"id": "d1", "mermaid": VALID_FLOWCHART},
            {"id": "d2", "mermaid": VALID_SEQUENCE},
        ],
    )
    assert len(errors) == 1
    assert "d1" in errors[0]
    assert "语法错误" in errors[0]


def test_validate_payload_blocks_summary_only_overview():
    payload = dict(SAMPLE_REVIEW)
    payload["overview"] = {
        "architecture_summary": "仅有总述、缺少两张 Mermaid 架构图的结构化说明。",
        "diagrams": [],
    }
    errors = _validate_func_solution_payload(payload)
    assert any("至少需要 2 张" in e for e in errors)


def test_validate_payload_blocks_single_diagram(tmp_path, monkeypatch):
    scope_id = "fs-one-diagram"
    archive, patch = _archive_paths(tmp_path, scope_id)
    archive.mkdir(parents=True)
    review = dict(SAMPLE_REVIEW)
    review["overview"]["diagrams"] = review["overview"]["diagrams"][:1]
    (archive / "函数级方案.md").write_text("# 函数级方案\n\n" + ("x" * 100), encoding="utf-8")
    (archive / "func_solution_review.json").write_text(
        json.dumps(review, ensure_ascii=False),
        encoding="utf-8",
    )
    patch(monkeypatch)
    ok, errors = validate_func_solution_review_json(scope_id)
    assert not ok
    assert any("至少需要 2 张" in e for e in errors)
