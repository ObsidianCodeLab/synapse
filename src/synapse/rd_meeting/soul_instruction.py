"""全局灵魂建议（``work/SOUL_INSTRUCTION.json``）：辅助工单处理的关键流程与模块指引。"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from synapse.rd_meeting.paths import soul_instruction_path

FILENAME = "SOUL_INSTRUCTION.json"


def load_soul_instruction_payload() -> dict[str, Any]:
    path = soul_instruction_path()
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def load_soul_instruction() -> str:
    payload = load_soul_instruction_payload()
    return str(payload.get("instruction") or "").strip()


def save_soul_instruction(instruction: str) -> dict[str, Any]:
    text = (instruction or "").strip()
    payload: dict[str, Any] = {
        "instruction": text,
        "updated_at": datetime.now().isoformat(timespec="seconds"),
    }
    path = soul_instruction_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def save_soul_instruction_if_provided(instruction: str | None) -> bool:
    text = (instruction or "").strip()
    if not text:
        return False
    save_soul_instruction(text)
    return True


def format_soul_instruction_prompt_lines() -> list[str]:
    text = load_soul_instruction()
    if not text:
        return []
    return [
        f"- **灵魂建议**：{text}",
        "- **参考要求**：本条用于辅助工单处理，指明关键流程与模块；"
        "使用技能、编写方案、执行开发与完成检测时须**充分参考**，不得忽略。",
    ]


def format_soul_instruction_block() -> str:
    lines = format_soul_instruction_prompt_lines()
    if not lines:
        return ""
    return "\n".join(["## 灵魂建议（SOUL_INSTRUCTION）", ""] + lines)


def format_soul_instruction_cli_lines() -> list[str]:
    """供 CLI 开发 / 检测 prompt 注入的段落行。"""
    text = load_soul_instruction()
    if not text:
        return []
    return [
        "【灵魂建议 · SOUL_INSTRUCTION】",
        text,
        "使用技能、改码与验收时须充分参考上述关键流程与模块指引。",
        "",
    ]
