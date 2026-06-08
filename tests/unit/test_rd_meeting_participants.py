"""会议室 participants 展示名解析（含 ephemeral 分身 profile_id）。"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from synapse.rd_meeting.participants import (
    parse_ephemeral_profile_id,
    resolve_profile_display_name,
)


def test_parse_ephemeral_profile_id_hyphenated_base() -> None:
    parsed = parse_ephemeral_profile_id("ephemeral_whalecloud-rd-expert_1779884891237_1")
    assert parsed == ("whalecloud-rd-expert", 1)


def test_parse_ephemeral_profile_id_underscore_base() -> None:
    parsed = parse_ephemeral_profile_id("ephemeral_some_agent_id_1779884891237_2")
    assert parsed == ("some_agent_id", 2)


def test_parse_ephemeral_profile_id_rejects_non_ephemeral() -> None:
    assert parse_ephemeral_profile_id("whalecloud-rd-expert") is None
    assert parse_ephemeral_profile_id("ephemeral_only_two_parts_1") is None


@patch("synapse.rd_meeting.participants._lookup_profile_name")
def test_resolve_ephemeral_when_base_known(mock_lookup: MagicMock) -> None:
    def side(pid: str) -> str | None:
        if pid == "ephemeral_whalecloud-rd-expert_1779884891237_1":
            return None
        if pid == "whalecloud-rd-expert":
            return "研发专家"
        return None

    mock_lookup.side_effect = side
    assert (
        resolve_profile_display_name("ephemeral_whalecloud-rd-expert_1779884891237_1")
        == "研发专家 (分身1)"
    )


@patch("synapse.rd_meeting.participants._lookup_profile_name")
def test_resolve_ephemeral_fallback_to_base_id(mock_lookup: MagicMock) -> None:
    mock_lookup.return_value = None
    assert (
        resolve_profile_display_name("ephemeral_whalecloud-rd-expert_1779884891237_2")
        == "whalecloud-rd-expert (分身2)"
    )


@patch("synapse.rd_meeting.participants._lookup_profile_name")
def test_resolve_direct_profile(mock_lookup: MagicMock) -> None:
    mock_lookup.return_value = "研发专家"
    assert resolve_profile_display_name("whalecloud-rd-expert") == "研发专家"
