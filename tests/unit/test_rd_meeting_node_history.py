"""room_history 按 SOP 节点隔离存储（agents/<node_id>/room_history.jsonl）。"""

from __future__ import annotations

import pytest

from synapse.rd_meeting.paths import agent_sop_node_dir, room_history_path
from synapse.rd_meeting.room_runtime import append_history_event, read_history


@pytest.fixture
def synapse_work_home(monkeypatch: pytest.MonkeyPatch, tmp_path):
    work = tmp_path / "work"
    work.mkdir()

    def _work_root():
        return work

    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", _work_root)
    return work


def test_room_history_path_under_agent_sop_node_dir(synapse_work_home):
    scope_id = "21883180"
    assert room_history_path(scope_id, "req_clarify") == (
        agent_sop_node_dir(scope_id, "req_clarify") / "room_history.jsonl"
    )


def test_append_and_read_history_isolated_by_node(synapse_work_home):
    scope_id = "21883181"
    append_history_event(
        scope_id,
        {"event": "node_init", "node_id": "req_clarify", "text": "节点A", "agent_id": "host"},
    )
    append_history_event(
        scope_id,
        {"event": "node_init", "node_id": "arch_design", "text": "节点B", "agent_id": "host"},
    )

    a_path = room_history_path(scope_id, "req_clarify")
    b_path = room_history_path(scope_id, "arch_design")
    assert a_path.is_file()
    assert b_path.is_file()

    a_hist = read_history(scope_id, node_id="req_clarify")
    b_hist = read_history(scope_id, node_id="arch_design")
    assert len(a_hist) == 1
    assert len(b_hist) == 1
    assert a_hist[0]["node_id"] == "req_clarify"
    assert b_hist[0]["node_id"] == "arch_design"

    merged = read_history(scope_id, limit=500)
    assert len(merged) == 2
