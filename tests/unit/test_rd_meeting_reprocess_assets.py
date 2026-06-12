"""重处理：prod 校验与强制刷新 code/doc。"""

from __future__ import annotations

import json
import os
import stat
import sys

import pytest

from synapse.rd_meeting.paths import product_code_dir, product_doc_dir, product_code_root, product_doc_root
from synapse.rd_meeting.pipeline import (
    MeetingPipeline,
    PipelineRunContext,
    STEP_NODE_INIT,
    STEP_REPROCESS_PREP,
    STEP_WAITING,
    _step_reprocess_prep,
)
from synapse.rd_meeting.reprocess_assets import (
    _force_rmtree,
    clear_product_code_and_doc_dirs,
    finish_reprocess_product_assets,
    force_refresh_product_assets,
    resolve_userwork_prod,
)


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


@pytest.mark.skipif(sys.platform != "win32", reason="readonly git pack simulation")
def test_force_rmtree_removes_readonly_git_pack(tmp_path):
    repo = tmp_path / "code" / "ZMDB"
    pack_dir = repo / ".git" / "objects" / "pack"
    pack_dir.mkdir(parents=True)
    idx = pack_dir / "pack-deadbeef.idx"
    idx.write_bytes(b"idx")
    os.chmod(idx, stat.S_IREAD)

    _force_rmtree(tmp_path / "code")
    assert not (tmp_path / "code").exists()


def test_clear_product_code_and_doc_dirs_removes_trees(userwork_env):
    scope_id = "clear-scope"
    code_dir = product_code_dir(scope_id, "r")
    doc_dir = product_doc_dir(scope_id, "产品架构")
    code_dir.mkdir(parents=True)
    doc_dir.mkdir(parents=True)
    (code_dir / "a.txt").write_text("1", encoding="utf-8")
    (doc_dir / "b.md").write_text("2", encoding="utf-8")

    clear_product_code_and_doc_dirs(scope_id)

    assert not product_code_root(scope_id).is_dir()
    assert not product_doc_root(scope_id).is_dir()


def test_force_refresh_clears_then_bootstrap(userwork_env, monkeypatch):
    scope_id = "force-scope"
    userwork_env["write_userwork"](
        [{"demand_no": scope_id, "prod": "P1", "owned_work_items": []}],
    )
    work = userwork_env["work_root"] / scope_id
    work.mkdir(parents=True, exist_ok=True)
    stale = product_code_dir(scope_id, "old")
    stale.mkdir(parents=True)
    (stale / "stale.txt").write_text("old", encoding="utf-8")
    pipe_path = work / "meeting_pipeline.json"
    pipe_path.write_text(
        json.dumps({"schema_version": 1, "scope_id": scope_id, "context": {}, "flow_step": "idle"}),
        encoding="utf-8",
    )

    calls = {"bootstrap": 0, "cleared": False}

    def _clear(sid):
        calls["cleared"] = True
        clear_product_code_and_doc_dirs(sid)

    monkeypatch.setattr(
        "synapse.rd_meeting.reprocess_assets.clear_product_code_and_doc_dirs",
        _clear,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.product_context.ensure_prod_in_catalog",
        lambda _p: ([{"prod": "P1", "repos": [], "docs": []}], ""),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.product_context.save_prod_catalog_to_pipeline",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.product_context.match_prod_row_by_prod",
        lambda *_a, **_k: {"prod": "P1", "repos": [], "docs": []},
    )

    def _bootstrap(sid, prod, **kwargs):
        calls["bootstrap"] += 1
        fresh = product_code_dir(sid, "new")
        fresh.mkdir(parents=True)
        (fresh / "main.cpp").write_text("//", encoding="utf-8")
        return {"status": "ok", "repos": [], "docs": []}

    monkeypatch.setattr(
        "synapse.rd_meeting.product_assets.bootstrap_product_assets",
        _bootstrap,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.product_assets.save_product_assets_to_pipeline",
        lambda *_a, **_k: None,
    )

    result = force_refresh_product_assets(scope_id, "P1")
    assert calls["cleared"] is True
    assert calls["bootstrap"] == 1
    assert result.get("status") == "ok"
    assert not (stale / "stale.txt").exists()


def test_finish_reprocess_product_assets_gates_without_prod(userwork_env, monkeypatch):
    scope_id = "gate-reprocess"
    userwork_env["write_userwork"]([{"demand_no": scope_id, "owned_work_items": []}])
    work = userwork_env["work_root"] / scope_id
    work.mkdir(parents=True, exist_ok=True)
    hist = work / "room_history.jsonl"
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.room_history_path",
        lambda sid, node_id="pending": hist,
    )

    pipe = MeetingPipeline.create(scope_id, scope_type="demand", flow_step=STEP_REPROCESS_PREP)
    ctx = PipelineRunContext(scope_type="demand", scope_id=scope_id)
    dev = {
        "current_node_id": "req_clarify",
        "meeting_room": {"room_id": "mr_d_gate", "active": True},
    }

    ok = finish_reprocess_product_assets(
        pipe,
        ctx,
        room_id="mr_d_gate",
        run_node="req_clarify",
        dev_status=dev,
    )
    assert ok is False
    assert pipe.flow_step == STEP_WAITING
    rs = json.loads((work / "room_state.json").read_text(encoding="utf-8"))
    assert rs["intervention_kind"] == "prod_selection"


def test_reprocess_prep_tail_calls_product_refresh(userwork_env, monkeypatch):
    scope_id = "prep-tail"
    userwork_env["write_userwork"](
        [{"demand_no": scope_id, "prod": "P1", "owned_work_items": []}],
    )
    work = userwork_env["work_root"] / scope_id
    work.mkdir(parents=True, exist_ok=True)
    hist = work / "room_history.jsonl"
    monkeypatch.setattr(
        "synapse.rd_meeting.room_runtime.room_history_path",
        lambda sid, node_id="pending": hist,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.reprocess_assets.force_refresh_product_assets",
        lambda *_a, **_k: {"status": "ok"},
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.hitl_lifecycle.reset_human_confirm_lifecycle",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.hitl_submit.clear_pending_questionnaire",
        lambda *_a, **_k: None,
    )

    pipe = MeetingPipeline.create(scope_id, scope_type="demand", flow_step=STEP_REPROCESS_PREP)
    pipe._data["room_id"] = "mr_d_prep"
    pipe._data["current_node_id"] = "req_clarify"
    pipe.save()
    (work / "dev.status").write_text(
        json.dumps(
            {
                "current_node_id": "req_clarify",
                "stage_id": 1,
                "meeting_room": {"room_id": "mr_d_prep", "active": True},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.pipeline.load_dev_status",
        lambda sid: json.loads((work / "dev.status").read_text(encoding="utf-8")),
    )

    ctx = PipelineRunContext(scope_type="demand", scope_id=scope_id, dev_status={})
    _step_reprocess_prep(pipe, ctx)

    assert STEP_REPROCESS_PREP in (pipe.data.get("steps_completed") or [])
    assert pipe.flow_step == STEP_NODE_INIT
