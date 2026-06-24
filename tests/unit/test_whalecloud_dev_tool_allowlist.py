"""研发工具技能强制加载：不受 skills.json external_allowlist 勾选影响。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest


@pytest.fixture
def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


class TestWhalecloudDevToolAllowlistHelpers:
    def test_discover_finds_repo_dev_tools(self, repo_root: Path):
        from synapse.utils.whaleclouddevtool import discover_whalecloud_dev_tool_skill_ids

        ids = discover_whalecloud_dev_tool_skill_ids(repo_root)
        assert "whalecloud-dev-tool-base-scripts" in ids
        assert "whalecloud-dev-tool-doc-generate" in ids
        assert len(ids) >= 10

    def test_ensure_merges_into_empty_allowlist(self, repo_root: Path):
        from synapse.utils.whaleclouddevtool import ensure_whalecloud_dev_tools_in_allowlist

        merged = ensure_whalecloud_dev_tools_in_allowlist(set(), project_root=repo_root)
        assert merged is not None
        assert "whalecloud-dev-tool-base-scripts" in merged

    def test_ensure_none_stays_none(self):
        from synapse.utils.whaleclouddevtool import ensure_whalecloud_dev_tools_in_allowlist

        assert ensure_whalecloud_dev_tools_in_allowlist(None) is None


class TestLoaderPruneKeepsDevTools:
    def test_empty_allowlist_still_keeps_dev_tools(self, repo_root: Path):
        from synapse.skills.loader import SkillLoader

        loader = SkillLoader()
        loader.load_all(repo_root)
        effective = loader.compute_effective_allowlist(set())
        assert "whalecloud-dev-tool-base-scripts" in effective

        loader.prune_external_by_allowlist(effective)
        remaining = {
            sid
            for sid, skill in loader._loaded_skills.items()
            if sid.startswith("whalecloud-dev-tool-")
        }
        assert "whalecloud-dev-tool-base-scripts" in remaining
        assert loader.registry.get("whalecloud-dev-tool-base-scripts") is not None


class TestAllowlistIoRemoveProtectsDevTools:
    def test_remove_skips_whalecloud_dev_tools(self, tmp_path: Path, monkeypatch):
        from synapse.config import settings as real_settings
        from synapse.skills import allowlist_io

        monkeypatch.setattr(real_settings, "project_root", tmp_path, raising=False)
        (tmp_path / "data").mkdir()
        allowlist_io.overwrite_allowlist(
            {
                "whalecloud-dev-tool-doc-generate",
                "some-other-skill",
            }
        )

        allowlist_io.remove_skill_ids({"whalecloud-dev-tool-doc-generate", "some-other-skill"})
        content = json.loads((tmp_path / "data" / "skills.json").read_text(encoding="utf-8"))
        assert content["external_allowlist"] == ["whalecloud-dev-tool-doc-generate"]
