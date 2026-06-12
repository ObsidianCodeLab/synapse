"""node_init 前置：prod 门控与 code/doc 补拉。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synapse.rd_meeting.node_init_prereq import (
    backfill_userwork_prod_if_missing,
    code_assets_present_on_disk,
    doc_assets_present_on_disk,
    ensure_product_assets_if_absent,
    prepare_node_init_prerequisites,
    product_assets_present_on_disk,
    resolve_userwork_prod,
)
from synapse.rd_meeting.pipeline import (
    MeetingPipeline,
    PipelineRunContext,
    STEP_NODE_INIT,
    STEP_WAITING,
)
from synapse.rd_meeting.paths import product_code_dir, product_doc_dir


@pytest.fixture
def userwork_env(monkeypatch, tmp_path):
    uw_path = tmp_path / "userwork.json"
    work_root = tmp_path / "work"

    def _write_userwork(rows: list[dict]) -> None:
        uw_path.write_text(
            json.dumps({"list": rows, "updated_at": "2026-01-01"}, ensure_ascii=False),
            encoding="utf-8",
        )

    for mod in (
        "synapse.api.routes.dev_iwhalecloud",
        "synapse.rd_meeting.userwork_sync",
    ):
        monkeypatch.setattr(f"{mod}._owner_order_file_name", lambda: uw_path)
        monkeypatch.setattr(f"{mod}._owner_order_file_lock_path", lambda: tmp_path / "userwork.lock")
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: work_root)

    return {"uw_path": uw_path, "work_root": work_root, "write_userwork": _write_userwork}


def test_resolve_userwork_prod_reads_demand_row(userwork_env):
    userwork_env["write_userwork"](
        [{"demand_no": "d1", "prod": "产品A", "owned_work_items": []}],
    )
    assert resolve_userwork_prod("demand", "d1") == "产品A"
    assert resolve_userwork_prod("demand", "missing") == ""


def test_product_assets_present_requires_both_code_and_doc(userwork_env):
    scope_id = "scope-a"
    code_dir = product_code_dir(scope_id, "demo")
    code_dir.mkdir(parents=True)
    (code_dir / "README.md").write_text("x", encoding="utf-8")
    assert code_assets_present_on_disk(scope_id) is True
    assert doc_assets_present_on_disk(scope_id) is False
    assert product_assets_present_on_disk(scope_id) is False

    doc_dir = product_doc_dir(scope_id, "产品架构")
    doc_dir.mkdir(parents=True)
    (doc_dir / "TECH_ARCH.md").write_text("y", encoding="utf-8")
    assert doc_assets_present_on_disk(scope_id) is True
    assert product_assets_present_on_disk(scope_id) is True
    assert product_assets_present_on_disk("empty-scope") is False


def test_prepare_node_init_gate_when_no_prod(userwork_env, monkeypatch):
    scope_id = "gate-demand"
    userwork_env["write_userwork"](
        [{"demand_no": scope_id, "owned_work_items": [], "local_process_state": "待处理"}],
    )
    work = userwork_env["work_root"] / scope_id
    work.mkdir(parents=True)
    hist = work / "room_history.jsonl"
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.room_history_path",
        lambda sid, node_id="pending": hist,
    )

    pipe = MeetingPipeline.create(scope_id, scope_type="demand", flow_step=STEP_NODE_INIT)
    ctx = PipelineRunContext(scope_type="demand", scope_id=scope_id, detail={"ticket_title": "t"})
    dev = {
        "current_node_id": "req_clarify",
        "meeting_room": {"room_id": "mr_d_gate", "active": True},
    }

    ok = prepare_node_init_prerequisites(
        pipe,
        ctx,
        dev_status=dev,
        room_id="mr_d_gate",
        run_node="req_clarify",
    )
    assert ok is False
    assert pipe.flow_step == STEP_WAITING
    rs = json.loads((work / "room_state.json").read_text(encoding="utf-8"))
    assert rs["status"] == "human_intervention"
    assert rs["intervention_kind"] == "prod_selection"


def test_prepare_node_init_backfills_prod_and_pulls_assets(userwork_env, monkeypatch):
    scope_id = "pull-demand"
    userwork_env["write_userwork"](
        [{"demand_no": scope_id, "owned_work_items": [], "local_process_state": "处理中"}],
    )
    work = userwork_env["work_root"] / scope_id
    work.mkdir(parents=True)
    hist = work / "room_history.jsonl"
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.room_history_path",
        lambda sid, node_id="pending": hist,
    )

    pulled: list[str] = []

    def _fake_ensure(sid, prod, **kwargs):
        pulled.append(prod)
        code_dir = product_code_dir(sid, "demo")
        code_dir.mkdir(parents=True)
        (code_dir / "main.cpp").write_text("//", encoding="utf-8")
        return {"status": "ok"}

    monkeypatch.setattr(
        "synapse.rd_meeting.node_init_prereq.ensure_product_assets_if_absent",
        _fake_ensure,
    )

    pipe = MeetingPipeline.create(scope_id, scope_type="demand", flow_step=STEP_NODE_INIT)
    ctx = PipelineRunContext(scope_type="demand", scope_id=scope_id)
    dev = {
        "current_node_id": "req_clarify",
        "meeting_room": {"room_id": "mr_d_pull", "active": True, "prod": "分布式内存数据库"},
    }

    ok = prepare_node_init_prerequisites(
        pipe,
        ctx,
        dev_status=dev,
        room_id="mr_d_pull",
        run_node="req_clarify",
    )
    assert ok is True
    assert pulled == ["分布式内存数据库"]
    saved = json.loads(userwork_env["uw_path"].read_text(encoding="utf-8"))
    assert saved["list"][0]["prod"] == "分布式内存数据库"


def test_ensure_product_assets_skips_when_both_trees_have_files(userwork_env, monkeypatch):
    scope_id = "skip-pull"
    code_dir = product_code_dir(scope_id, "r")
    code_dir.mkdir(parents=True)
    (code_dir / "a.txt").write_text("1", encoding="utf-8")
    doc_dir = product_doc_dir(scope_id, "产品架构")
    doc_dir.mkdir(parents=True)
    (doc_dir / "b.md").write_text("2", encoding="utf-8")

    called = {"n": 0}

    def _bootstrap(*args, **kwargs):
        called["n"] += 1
        return {}

    monkeypatch.setattr(
        "synapse.rd_meeting.product_assets.bootstrap_product_assets",
        _bootstrap,
    )
    result = ensure_product_assets_if_absent(scope_id, "p")
    assert result is None
    assert called["n"] == 0


def test_ensure_product_assets_pulls_when_only_code_exists(userwork_env, monkeypatch):
    scope_id = "code-only"
    code_dir = product_code_dir(scope_id, "r")
    code_dir.mkdir(parents=True)
    (code_dir / "a.txt").write_text("1", encoding="utf-8")
    doc_dir = product_doc_dir(scope_id, "产品架构")
    doc_dir.mkdir(parents=True)

    called = {"n": 0}

    def _bootstrap(*_a, **_k):
        called["n"] += 1
        (doc_dir / "TECH_ARCH.md").write_text("ok", encoding="utf-8")
        return {"status": "ok", "repos": [], "docs": []}

    monkeypatch.setattr(
        "synapse.rd_meeting.product_context.ensure_prod_in_catalog",
        lambda _p: ([{"prod": "p"}], ""),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.product_context.save_prod_catalog_to_pipeline",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.product_context.match_prod_row_by_prod",
        lambda *_a, **_k: {"prod": "p", "repos": [], "docs": []},
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.product_assets.bootstrap_product_assets",
        _bootstrap,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.product_assets.save_product_assets_to_pipeline",
        lambda *_a, **_k: None,
    )

    work = userwork_env["work_root"] / scope_id
    work.mkdir(parents=True, exist_ok=True)
    pipe_path = work / "meeting_pipeline.json"
    pipe_path.write_text(
        json.dumps(
            {"schema_version": 1, "scope_id": scope_id, "context": {}, "flow_step": "node_init"},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    result = ensure_product_assets_if_absent(scope_id, "p")
    assert called["n"] == 1
    assert result is not None
    assert (doc_dir / "TECH_ARCH.md").is_file()


def test_backfill_userwork_prod_if_missing(userwork_env):
    scope_id = "bf-demand"
    userwork_env["write_userwork"]([{"demand_no": scope_id, "owned_work_items": []}])
    assert backfill_userwork_prod_if_missing(
        scope_type="demand",
        scope_id=scope_id,
        prod="产品X",
    )
    saved = json.loads(userwork_env["uw_path"].read_text(encoding="utf-8"))
    assert saved["list"][0]["prod"] == "产品X"
