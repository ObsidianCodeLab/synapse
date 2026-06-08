"""Generate icon.ico, Appx Square* logos, and other platform icons.

Delegates to `npm run tauri:icon` (Tauri CLI scales from `icon.png`).
Run from repo root: python tools/make_ico.py

Requires: Node.js, npm, and `apps/setup-center/node_modules` (install via npm ci / npm install).
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETUP_CENTER = ROOT / "apps" / "setup-center"
ICON_PNG = SETUP_CENTER / "src-tauri" / "icons" / "icon.png"


def _npm() -> str:
    for name in ("npm", "npm.cmd"):
        path = shutil.which(name)
        if path:
            return path
    return ""


def main() -> None:
    if not (SETUP_CENTER / "package.json").is_file():
        print(f"error: missing {SETUP_CENTER / 'package.json'}", file=sys.stderr)
        sys.exit(1)
    if not ICON_PNG.is_file():
        print(f"error: missing source icon {ICON_PNG}", file=sys.stderr)
        sys.exit(1)

    npm = _npm()
    if not npm:
        print("error: npm not found in PATH", file=sys.stderr)
        sys.exit(1)

    print(f"Running npm run tauri:icon (cwd={SETUP_CENTER})", flush=True)
    completed = subprocess.run(
        [npm, "run", "tauri:icon"],
        cwd=SETUP_CENTER,
        check=False,
    )
    if completed.returncode != 0:
        sys.exit(completed.returncode)
    print("Done: src-tauri/icons/icon.ico, Square*Logo.png, StoreLogo.png, ...")


if __name__ == "__main__":
    main()
