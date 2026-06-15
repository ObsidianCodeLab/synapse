"""uses_human_interactive_hitl：human 与 ai_human 协同节点分流。"""

from __future__ import annotations

from synapse.rd_meeting.binding import resolve_node_binding, uses_human_interactive_hitl


def test_human_node_uses_interactive_hitl() -> None:
    b = resolve_node_binding("req_clarify")
    assert b.get("human_confirm") is True
    assert uses_human_interactive_hitl("req_clarify", binding=b) is True


def test_collab_nodes_skip_interactive_hitl() -> None:
    for node_id in ("func_solution", "solution_review", "leader_review"):
        b = resolve_node_binding(node_id)
        assert b.get("human_confirm") is True
        assert uses_human_interactive_hitl(node_id, binding=b) is False


def test_ai_node_skips_interactive_hitl() -> None:
    b = resolve_node_binding("boundary")
    assert uses_human_interactive_hitl("boundary", binding=b) is False
