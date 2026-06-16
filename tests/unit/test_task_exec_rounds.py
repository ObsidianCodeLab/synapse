"""任务执行重处理轮次记录。"""

from __future__ import annotations

from synapse.rd_meeting.pipeline import MeetingPipeline
from synapse.rd_meeting.task_exec import RESULT_JSON
from synapse.rd_meeting.task_exec_rounds import (
    format_task_exec_reprocess_prompt_block,
    load_task_exec_rounds,
    on_task_exec_cli_finished,
    on_task_exec_cli_starting,
    on_task_exec_reprocess_prep,
)


def test_task_exec_rounds_first_run_and_reprocess(tmp_path, monkeypatch):
    scope_id = "te-rounds"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    (tmp_path / "work" / scope_id).mkdir(parents=True)
    MeetingPipeline.create(scope_id, scope_type="demand")
    pipe = MeetingPipeline.load(scope_id)

    started = on_task_exec_cli_starting(scope_id, reason="")
    assert started is not None
    assert started["round"] == 1
    assert started["kind"] == "initial"

    finished = on_task_exec_cli_finished(
        scope_id,
        {
            "status": "ok",
            "started_at": "2026-06-16T10:00:00",
            "finished_at": "2026-06-16T10:12:00",
            "summary": {"total": 1, "ok": 1, "total_tokens": 100, "total_duration_sec": 60},
        },
    )
    assert finished is not None
    assert finished["status"] == "ok"

    on_task_exec_reprocess_prep(pipe, reason="需补单测与边界校验")
    rounds = load_task_exec_rounds(scope_id)
    assert len(rounds) == 2
    assert rounds[0]["round"] == 1
    assert rounds[1]["round"] == 2
    assert rounds[1]["reason"] == "需补单测与边界校验"
    assert rounds[1]["kind"] == "reprocess"
    assert rounds[1]["status"] == "pending"

    active = on_task_exec_cli_starting(scope_id, reason="需补单测与边界校验")
    assert active is not None
    assert active["round"] == 2
    assert active["status"] == "running"


def test_reprocess_prep_rounds_survive_caller_save(tmp_path, monkeypatch):
    """重处理轮次须写入调用方 pipe，避免 reload 后外层 save 覆盖 pending 轮次。"""
    scope_id = "te-rounds-stale-save"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    (tmp_path / "work" / scope_id).mkdir(parents=True)
    MeetingPipeline.create(scope_id, scope_type="demand")

    on_task_exec_cli_starting(scope_id, reason="")
    on_task_exec_cli_finished(
        scope_id,
        {
            "status": "ok",
            "started_at": "2026-06-16T10:00:00",
            "finished_at": "2026-06-16T10:12:00",
            "summary": {"total": 1, "ok": 1, "total_tokens": 100, "total_duration_sec": 60},
        },
    )

    pipe = MeetingPipeline.load(scope_id)
    assert len(load_task_exec_rounds(scope_id)) == 1

    on_task_exec_reprocess_prep(pipe, reason="补测")
    pipe.save()

    rounds = load_task_exec_rounds(scope_id)
    assert len(rounds) == 2
    assert rounds[1]["round"] == 2
    assert rounds[1]["reason"] == "补测"
    assert rounds[1]["status"] == "pending"


def test_load_task_exec_rounds_synthetic_from_payload(tmp_path, monkeypatch):
    scope_id = "te-rounds-legacy"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    work = tmp_path / "work" / scope_id
    archive = work / "archive" / "开发中" / "task_exec"
    archive.mkdir(parents=True)
    MeetingPipeline.create(scope_id, scope_type="demand")
    (archive / RESULT_JSON).write_text(
        '{"status":"ok","started_at":"2026-06-15T21:26:41","finished_at":"2026-06-15T21:38:45",'
        '"summary":{"total":1,"ok":1,"total_tokens":253350,"total_duration_sec":695}}',
        encoding="utf-8",
    )
    rounds = load_task_exec_rounds(scope_id)
    assert len(rounds) == 1
    assert rounds[0]["round"] == 1
    assert rounds[0]["summary"]["total_tokens"] == 253350


def test_backfill_rounds_from_task_exec_history(tmp_path, monkeypatch):
    scope_id = "te-rounds-hist"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    work = tmp_path / "work" / scope_id
    hist_dir = work / "agents" / "task_exec"
    hist_dir.mkdir(parents=True)
    MeetingPipeline.create(scope_id, scope_type="demand")
    history = hist_dir / "room_history.jsonl"
    history.write_text(
        "\n".join(
            [
                '{"event":"reprocess_prep","node_id":"task_exec","reprocess_reason":"需补单测","ts":"2026-06-16T02:10:46"}',
                '{"event":"task_exec_cli_finished","node_id":"task_exec","ts":"2026-06-16T02:17:23","result":{"status":"ok","started_at":"2026-06-16T02:11:07","finished_at":"2026-06-16T02:17:23","summary":{"total":1,"ok":1,"total_tokens":99,"total_duration_sec":10}}}',
            ]
        ),
        encoding="utf-8",
    )
    rounds = load_task_exec_rounds(scope_id)
    assert len(rounds) == 2
    assert rounds[0]["status"] == "superseded"
    assert rounds[1]["kind"] == "reprocess"
    assert rounds[1]["reason"] == "需补单测"
    assert rounds[1]["summary"]["total_tokens"] == 99


def test_format_task_exec_reprocess_prompt_block_includes_history(tmp_path, monkeypatch):
    scope_id = "te-rounds-prompt"
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: tmp_path / "work")
    (tmp_path / "work" / scope_id).mkdir(parents=True)
    MeetingPipeline.create(scope_id, scope_type="demand")
    pipe = MeetingPipeline.load(scope_id)

    on_task_exec_cli_starting(scope_id, reason="")
    on_task_exec_cli_finished(
        scope_id,
        {
            "status": "ok",
            "started_at": "2026-06-16T10:00:00",
            "finished_at": "2026-06-16T10:12:00",
            "summary": {"total": 1, "ok": 1, "total_tokens": 100, "total_duration_sec": 60},
        },
    )
    on_task_exec_reprocess_prep(pipe, reason="需补单测与边界校验")
    on_task_exec_cli_starting(scope_id, reason="需补单测与边界校验")
    on_task_exec_cli_finished(
        scope_id,
        {
            "status": "ok",
            "started_at": "2026-06-16T11:00:00",
            "finished_at": "2026-06-16T11:12:00",
            "summary": {"total": 1, "ok": 1, "total_tokens": 80, "total_duration_sec": 50},
        },
    )
    on_task_exec_reprocess_prep(pipe, reason="再加集成测试")
    on_task_exec_cli_starting(scope_id, reason="再加集成测试")

    block = format_task_exec_reprocess_prompt_block(
        scope_id,
        current_reason="再加集成测试",
        mode="develop",
    )
    assert "历史轮次用户要求" in block
    assert "第2轮（重处理）：需补单测与边界校验" in block
    assert "用户重处理要求（第3轮）：再加集成测试" in block

    from synapse.rd_meeting.task_exec import build_task_develop_prompt

    prompt = build_task_develop_prompt(
        scope_id=scope_id,
        order={"task_no": "T-1", "task_title": "demo", "goal": "改接口", "coverage": []},
        func_doc="",
        accept_doc="",
        human_suggestions="",
        reprocess_reason="再加集成测试",
    )
    assert "需补单测与边界校验" in prompt
    assert "再加集成测试" in prompt
