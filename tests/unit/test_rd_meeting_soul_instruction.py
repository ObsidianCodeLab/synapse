"""灵魂建议（SOUL_INSTRUCTION.json）读写与 prompt 注入。"""

from __future__ import annotations

import json

import pytest

from synapse.rd_meeting import soul_instruction as si
from synapse.rd_meeting.room_skill import build_meeting_runtime_header, make_context

SCOPE_ID = "21881453"


@pytest.fixture
def work_home(monkeypatch: pytest.MonkeyPatch, tmp_path):
    work = tmp_path / "work"
    work.mkdir()
    monkeypatch.setattr("synapse.rd_meeting.paths.work_root", lambda: work)
    return work


def test_save_and_load_soul_instruction(work_home):
    payload = si.save_soul_instruction(SCOPE_ID, "关注账务中心限流模块与 REST 接入")
    assert payload["instruction"] == "关注账务中心限流模块与 REST 接入"
    assert payload["scope_id"] == SCOPE_ID
    assert payload.get("updated_at")

    path = work_home / SCOPE_ID / "SOUL_INSTRUCTION.json"
    assert path.is_file()
    on_disk = json.loads(path.read_text(encoding="utf-8"))
    assert on_disk["instruction"] == payload["instruction"]

    assert si.load_soul_instruction(SCOPE_ID) == payload["instruction"]
    assert si.save_soul_instruction_if_provided(SCOPE_ID, "") is False
    assert si.save_soul_instruction_if_provided(SCOPE_ID, "  有内容  ") is True


def test_format_soul_instruction_block_empty(work_home):
    assert si.format_soul_instruction_block(SCOPE_ID) == ""
    assert si.format_soul_instruction_cli_lines(SCOPE_ID) == []


def test_format_soul_instruction_block_renders(work_home):
    si.save_soul_instruction(SCOPE_ID, "优先查 MDB 配置")
    block = si.format_soul_instruction_block(SCOPE_ID)
    assert "灵魂建议" in block
    assert "优先查 MDB 配置" in block
    assert "充分参考" in block
    assert "参考要求" not in block
    assert len(si.format_soul_instruction_prompt_lines(SCOPE_ID)) == 1

    cli_lines = si.format_soul_instruction_cli_lines(SCOPE_ID)
    assert cli_lines[0].startswith("【灵魂建议（")
    assert "优先查 MDB 配置" in cli_lines[1]


def test_runtime_header_includes_soul_instruction(work_home, monkeypatch):
    si.save_soul_instruction(SCOPE_ID, "模块 A → 模块 B")
    ctx = make_context(
        role="host",
        binding={
            "node_id": "req_clarify",
            "node_name": "需求澄清",
            "stage_id": 1,
            "stage_name": "需求分析",
            "node_intent": "澄清需求",
            "host_profile_id": "default",
            "worker_profile_ids": [],
            "human_confirm": False,
        },
        scope_type="demand",
        scope_id=SCOPE_ID,
        ticket_title="测试工单",
        archive_dir="/tmp/archive",
    )
    monkeypatch.setattr(
        "synapse.rd_meeting.room_skill.load_reprocess_reason",
        lambda _sid: "",
    )
    header = build_meeting_runtime_header(ctx, binding=ctx.__dict__)
    assert "灵魂建议" in header
    assert "模块 A → 模块 B" in header
