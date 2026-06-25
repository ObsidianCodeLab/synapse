"""synapse_home 路径解析单元测试。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synapse.synapse_home import (
    default_synapse_home,
    read_custom_root_from_config,
    resolve_synapse_home,
    root_config_path,
)


@pytest.fixture
def isolated_home(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    home = tmp_path / "userhome"
    home.mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("USERPROFILE", str(home))
    monkeypatch.delenv("SYNAPSE_ROOT", raising=False)
    return home


def test_default_synapse_home(isolated_home: Path):
    assert default_synapse_home() == isolated_home / ".synapse"


def test_resolve_prefers_synapse_root_env(isolated_home: Path, monkeypatch: pytest.MonkeyPatch):
    custom = isolated_home / "data" / ".synapse"
    custom.mkdir(parents=True)
    monkeypatch.setenv("SYNAPSE_ROOT", str(custom))
    assert resolve_synapse_home() == custom


def test_resolve_reads_root_config_custom_root(isolated_home: Path):
    custom = isolated_home / "d-drive" / ".synapse"
    custom.mkdir(parents=True)
    config_dir = isolated_home / ".synapse"
    config_dir.mkdir()
    config_dir.joinpath("root_config.json").write_text(
        json.dumps({"custom_root": str(custom)}),
        encoding="utf-8",
    )
    assert resolve_synapse_home() == custom


def test_resolve_env_overrides_root_config(isolated_home: Path, monkeypatch: pytest.MonkeyPatch):
    env_root = isolated_home / "env-root"
    env_root.mkdir()
    config_root = isolated_home / "config-root"
    config_root.mkdir()
    config_dir = isolated_home / ".synapse"
    config_dir.mkdir()
    config_dir.joinpath("root_config.json").write_text(
        json.dumps({"custom_root": str(config_root)}),
        encoding="utf-8",
    )
    monkeypatch.setenv("SYNAPSE_ROOT", str(env_root))
    assert resolve_synapse_home() == env_root


def test_read_custom_root_ignores_invalid_path(isolated_home: Path):
    config_dir = isolated_home / ".synapse"
    config_dir.mkdir()
    config_dir.joinpath("root_config.json").write_text(
        json.dumps({"custom_root": "relative/path"}),
        encoding="utf-8",
    )
    assert read_custom_root_from_config() is None
    assert resolve_synapse_home() == default_synapse_home()


def test_root_config_path_is_fixed(isolated_home: Path):
    assert root_config_path() == isolated_home / ".synapse" / "root_config.json"
