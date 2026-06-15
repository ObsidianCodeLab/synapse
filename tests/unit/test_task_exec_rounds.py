"""任务执行重处理轮次记录。"""

from __future__ import annotations

from synapse.rd_meeting.pipeline import MeetingPipeline
from synapse.rd_meeting.task_exec import RESULT_JSON
from synapse.rd_meeting.task_exec_rounds import (
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
