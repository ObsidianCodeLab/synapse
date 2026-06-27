#!/usr/bin/env python3
"""Copy a file from upstream openakita tag and apply Synapse branding."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = Path(r"D:/github/openakita")

REPLACEMENTS = (
    ("from openakita.", "from synapse."),
    ("import openakita.", "import synapse."),
    ("openakita.", "synapse."),
    ("OpenAkita", "Synapse"),
    ("OPENAKITA_", "SYNAPSE_"),
)


def upstream_path(local_rel: str) -> str:
    p = local_rel.replace("\\", "/")
    if p.startswith("src/synapse/"):
        return "src/openakita/" + p[len("src/synapse/") :]
    return p


def brand_py(text: str) -> str:
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    return text


def brand_content(text: str, path: str) -> str:
    if path.endswith(".py"):
        return brand_py(text)
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("local_rel", help="Path relative to repo root, e.g. src/synapse/api/chain_timeline.py")
    parser.add_argument("--ref", default="v1.27.20")
    args = parser.parse_args()

    up_rel = upstream_path(args.local_rel)
    result = subprocess.run(
        ["git", "-C", str(UPSTREAM), "show", f"{args.ref}:{up_rel}"],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        print(f"FAIL: upstream missing {up_rel}", file=sys.stderr)
        return 1

    content = brand_content(result.stdout.decode("utf-8"), args.local_rel)
    dest = REPO_ROOT / args.local_rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content, encoding="utf-8", newline="\n")
    print(f"OK: {args.local_rel} <- {up_rel}@{args.ref}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
