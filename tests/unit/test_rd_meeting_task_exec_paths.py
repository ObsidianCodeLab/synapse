"""resolve_sandbox_path_for_product_module 与 room_skill 路径段一致。"""

from __future__ import annotations

from synapse.rd_meeting.product_assets import resolve_sandbox_path_for_product_module


def test_resolve_sandbox_path_matches_repo_name(monkeypatch, tmp_path):
    scope_id = "te-path"
    code_path = str(tmp_path / "work" / scope_id / "code" / "ZMDB" / "BackServiceCpp" / "src" / "cpp" / "Zmdb")
    sandbox_path = str(tmp_path / "work" / scope_id / "sandbox" / "ZMDB" / "BackServiceCpp" / "src" / "cpp" / "Zmdb")

    monkeypatch.setattr(
        "synapse.rd_meeting.init_context.build_node_init_log_data",
        lambda scope_type, sid, **kw: {
            "product": {
                "code_root": str(tmp_path / "work" / scope_id / "code"),
                "repos": [
                    {
                        "repo_name": "ZMDB",
                        "repo_module": "123|ZMDB",
                        "local_path": str(tmp_path / "work" / scope_id / "code" / "ZMDB"),
                        "code_path": "BackServiceCpp/src/cpp/Zmdb",
                        "resolved_code_path": code_path,
                        "resolved_sandbox_path": sandbox_path,
                    }
                ],
            }
        },
    )

    resolved = resolve_sandbox_path_for_product_module("demand", scope_id, "ZMDB")
    assert resolved == sandbox_path


def test_resolve_sandbox_path_empty_when_no_match(monkeypatch):
    monkeypatch.setattr(
        "synapse.rd_meeting.init_context.build_node_init_log_data",
        lambda scope_type, sid, **kw: {
            "product": {
                "repos": [
                    {"repo_name": "A", "resolved_sandbox_path": "/a"},
                    {"repo_name": "B", "resolved_sandbox_path": "/b"},
                ]
            }
        },
    )
    assert resolve_sandbox_path_for_product_module("demand", "x", "A") == "/a"
    assert resolve_sandbox_path_for_product_module("demand", "x", "unknown") == ""
