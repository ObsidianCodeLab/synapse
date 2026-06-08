#!/usr/bin/env python3
"""Resolve git merge conflicts after merging upstream openakita into Synapse fork.

- Drop duplicate src/openakita/* (canonical package is src/synapse).
- For most src/synapse/*: take upstream (:3) and rewrite openakita -> synapse imports.
- Preserve fork-heavy apps/setup-center via --ours.
- Skip manual-merge paths listed in PROTECTED_SYNAPSE (resolved separately).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# Keep Synapse-only behavior; merge these by hand after script if needed.
PROTECTED_SYNAPSE = {
    "src/synapse/api/server.py",  # already resolved
    "src/synapse/api/routes/identity.py",
    "src/synapse/api/auth.py",
    "src/synapse/api/schemas.py",
    "src/synapse/llm/registries/providers.json",
    "src/synapse/skills/registry.py",
}


def run(cmd: list[str], check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=REPO,
        check=check,
        text=True,
        capture_output=True,
    )


def unmerged_paths() -> list[str]:
    p = run(["git", "diff", "--name-only", "--diff-filter=U"])
    return [line.strip() for line in p.stdout.splitlines() if line.strip()]


def brand_synapse_text(content: str) -> str:
    """Rewrite upstream package name to synapse for merged Python/text."""
    content = content.replace("from openakita.", "from synapse.")
    content = content.replace("import openakita.", "import synapse.")
    content = content.replace("import openakita as", "import synapse as")
    content = content.replace("import openakita\n", "import synapse\n")
    content = content.replace("OpenAkita", "Synapse")
    content = content.replace("OPENAKITA_", "SYNAPSE_")
    return content


def main() -> int:
    paths = unmerged_paths()
    if not paths:
        print("No unmerged paths.")
        return 0

    # Upstream removed tracked dist-web artifacts; accept deletion to clear UD conflicts.
    for path in list(paths):
        if path.startswith("apps/setup-center/dist-web/"):
            run(["git", "rm", "-f", "--", path])

    paths = unmerged_paths()

    for path in paths:
        if path.startswith("src/openakita/"):
            r = run(["git", "rm", "-f", path])
            if r.returncode != 0:
                print(f"warn: git rm {path}: {r.stderr}", file=sys.stderr)
            continue

        if path in PROTECTED_SYNAPSE:
            print(f"skip (protected): {path}")
            continue

        if path.startswith("src/synapse/"):
            r = run(["git", "checkout", "--theirs", "--", path], check=False)
            if r.returncode != 0:
                print(f"err: checkout --theirs {path}: {r.stderr}", file=sys.stderr)
                continue
            fp = REPO / path
            if fp.suffix in {".py", ".json", ".txt", ".md"} or "Dockerfile" in path:
                try:
                    text = fp.read_text(encoding="utf-8")
                except OSError as e:
                    print(f"warn: read {path}: {e}", file=sys.stderr)
                    continue
                new_text = brand_synapse_text(text)
                if new_text != text:
                    fp.write_text(new_text, encoding="utf-8", newline="\n")
            run(["git", "add", "--", path])
            continue

        if path.startswith("apps/setup-center/"):
            r = run(["git", "checkout", "--ours", "--", path])
            if r.returncode != 0:
                print(f"err: checkout --ours {path}: {r.stderr}", file=sys.stderr)
                continue
            ar = run(["git", "add", "--", path])
            if ar.returncode != 0:
                print(f"warn: git add {path}: {ar.stderr}", file=sys.stderr)
            continue

        # Root docs, tests, skills, pyproject, examples, etc.: prefer upstream
        r = run(["git", "checkout", "--theirs", "--", path], check=False)
        if r.returncode != 0:
            print(f"warn: checkout --theirs {path}: {r.stderr}", file=sys.stderr)
            continue
        fp = REPO / path
        if fp.suffix in {".py", ".md", ".toml", ".json", ".yml", ".yaml"}:
            try:
                text = fp.read_text(encoding="utf-8")
            except OSError:
                run(["git", "add", "--", path])
                continue
            new_text = brand_synapse_text(text)
            if new_text != text:
                fp.write_text(new_text, encoding="utf-8", newline="\n")
        ar = run(["git", "add", "--", path])
        if ar.returncode != 0:
            print(f"warn: git add {path}: {ar.stderr}", file=sys.stderr)

    remaining = unmerged_paths()
    if remaining:
        print("Remaining unmerged:", *remaining, sep="\n  ")
        return 1
    print("All conflicts resolved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
