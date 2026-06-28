#!/usr/bin/env python3
"""Apply Synapse branding to a copied upstream tree (plugins, synapse-plugin-sdk, packages)."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

SKIP_DIRS = {
    ".git",
    "__pycache__",
    "node_modules",
    ".venv",
    ".mypy_cache",
    ".ruff_cache",
}
SKIP_EXT = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".woff",
    ".woff2",
    ".mp4",
    ".zip",
    ".exe",
    ".dll",
    ".pdf",
    ".wasm",
    ".min.js.map",
}

_UI_BRIDGE_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("window.OpenAkita", "window.Synapse"),
    ("OpenAkitaI18n", "SynapseI18n"),
    ("OpenAkitaIcons", "SynapseIcons"),
    ("OpenAkitaMD", "SynapseMD"),
    ("openakita:ready", "synapse:ready"),
    ("openakita:theme-change", "synapse:theme-change"),
    ("openakita:locale-change", "synapse:locale-change"),
    ("openakita:event", "synapse:event"),
    ("__akita_bridge", "__synapse_bridge"),
)


def _is_plugin_ui_dist(path: Path) -> bool:
    parts = path.parts
    return "plugins" in parts and "ui" in parts and "dist" in parts


def _should_skip_path(path: Path) -> bool:
    parts = path.parts
    if any(p in SKIP_DIRS for p in parts):
        return True
    # Skip generic build output, but keep plugin prebuilt UI bundles.
    if "dist" in parts and not _is_plugin_ui_dist(path):
        return True
    return False


def transform_text(text: str) -> str:
    for old, new in _UI_BRIDGE_REPLACEMENTS:
        text = text.replace(old, new)

    text = text.replace("openakita_plugin_sdk", "synapse_plugin_sdk")
    text = text.replace("openakita-plugin-sdk", "synapse-plugin-sdk")
    text = text.replace("@openakita/plugin-ui-sdk", "@synapse/plugin-ui-sdk")
    text = text.replace("OPENAKITA_", "SYNAPSE_")
    text = text.replace("OpenAkita", "Synapse")
    text = re.sub(r"\bOPENAKITA\b", "SYNAPSE", text)
    text = text.replace("from openakita.", "from synapse.")
    text = text.replace("import openakita.", "import synapse.")
    text = re.sub(r'("openakita"\s*:\s*)', r'"synapse": ', text)
    text = text.replace("MIN_OPENAKITA_VERSION", "MIN_SYNAPSE_VERSION")
    text = text.replace("~/.openakita/", "~/.synapse/")
    text = text.replace("~/.openakita", "~/.synapse")
    text = text.replace("openakita_jyhk", "\x00REPO_SLUG\x00")
    text = text.replace("openakita", "synapse")
    text = text.replace("\x00REPO_SLUG\x00", "openakita_jyhk")

    return text


def brand_tree(root: Path) -> int:
    if not root.is_dir():
        raise SystemExit(f"Not a directory: {root}")

    changed = 0
    for path in root.rglob("*"):
        if path.is_dir():
            continue
        if _should_skip_path(path):
            continue
        if path.suffix.lower() in SKIP_EXT:
            continue
        try:
            raw = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        new = transform_text(raw)
        if new != raw:
            path.write_text(new, encoding="utf-8", newline="\n")
            changed += 1
    return changed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", help="Directories to brand (relative to repo root)")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[1]

    for rel in args.paths:
        target = (repo / rel).resolve()
        n = brand_tree(target)
        print(f"Branded {n} files under {target}")


if __name__ == "__main__":
    main()
