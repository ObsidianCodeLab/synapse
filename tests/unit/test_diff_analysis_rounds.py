"""试飞优化轮次：与 task_exec 隔离。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.diff_analysis_rounds import load_diff_analysis_rounds


def test_load_diff_analysis_rounds_empty_without_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    scope_id = "da-rounds-scope"
    monkeypatch.setattr(
        "synapse.rd_meeting.diff_analysis_rounds._pipeline_context",
        lambda _sid: (None, {}),
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.diff_analysis_rounds._backfill_rounds_from_diff_analysis_payload",
        lambda _sid: [],
    )
    assert load_diff_analysis_rounds(scope_id) == []


def test_load_diff_analysis_rounds_from_context(monkeypatch: pytest.MonkeyPatch) -> None:
    scope_id = "da-rounds-ctx"
    monkeypatch.setattr(
        "synapse.rd_meeting.diff_analysis_rounds._pipeline_context",
        lambda _sid: (
            None,
            {
                "diff_analysis_rounds": [
                    {"round": 1, "kind": "initial", "status": "ok", "reason": ""},
                    {"round": 2, "kind": "reprocess", "status": "pending", "reason": "再降 CCN"},
                ]
            },
        ),
    )
    rounds = load_diff_analysis_rounds(scope_id)
    assert len(rounds) == 2
    assert rounds[1]["reason"] == "再降 CCN"
