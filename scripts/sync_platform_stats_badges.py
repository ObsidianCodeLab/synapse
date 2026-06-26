#!/usr/bin/env python3
"""从 Synapse 统一服务拉取平台统计，更新 docs/badges/（Gitea README 动态徽章）。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BADGE_DIR = ROOT / "docs" / "badges"
# BSS 团队产品公共服务默认地址（与引导期 devservice.ip 探测目标一致）
DEFAULT_UNIFIED_SERVICE_BASE_URL = "http://10.10.8.21:10001"
# Gitea README 中 img 须用 absolute raw URL（HTML 相对路径不会被解析到仓库文件）
GITEA_BADGE_RAW_BASE = (
    "https://git-nj.iwhalecloud.com/xmjfbss/Synapse/raw/branch/master/docs/badges"
)


def _fetch_stats(base_url: str) -> dict[str, int]:
    url = f"{base_url.rstrip('/')}/dev/iwhalecloud/synapse/platform_stats"
    with urlopen(url, timeout=10) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if payload.get("code") != 0:
        raise RuntimeError(payload.get("message") or "platform_stats failed")
    data = payload.get("data") or {}
    return {
        "product_count": int(data.get("product_count") or 0),
        "processed_ticket_count": int(data.get("processed_ticket_count") or 0),
    }


def _fetch_svg(base_url: str, kind: str) -> str:
    url = f"{base_url.rstrip('/')}/dev/iwhalecloud/synapse/platform_stats/badge/{kind}.svg"
    with urlopen(url, timeout=10) as resp:
        return resp.read().decode("utf-8")


def _write_shields_json(path: Path, label: str, value: int, color: str) -> None:
    path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "label": label,
                "message": str(value),
                "color": color if value > 0 else "lightgrey",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync Gitea README platform stat badges from unified service")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_UNIFIED_SERVICE_BASE_URL,
        help=f"SynapseService base URL (default: {DEFAULT_UNIFIED_SERVICE_BASE_URL})",
    )
    args = parser.parse_args()

    try:
        stats = _fetch_stats(args.base_url)
        products_svg = _fetch_svg(args.base_url, "products")
        tickets_svg = _fetch_svg(args.base_url, "tickets")
    except (URLError, TimeoutError, RuntimeError, json.JSONDecodeError, OSError) as exc:
        print(f"sync failed: {exc}", file=sys.stderr)
        return 1

    BADGE_DIR.mkdir(parents=True, exist_ok=True)
    _write_shields_json(
        BADGE_DIR / "platform-stats-products.json",
        "覆盖产品",
        stats["product_count"],
        "green",
    )
    _write_shields_json(
        BADGE_DIR / "platform-stats-tickets.json",
        "处理工单",
        stats["processed_ticket_count"],
        "blue",
    )
    (BADGE_DIR / "platform-stats-products.svg").write_text(products_svg, encoding="utf-8")
    (BADGE_DIR / "platform-stats-tickets.svg").write_text(tickets_svg, encoding="utf-8")
    print(
        f"updated badges: products={stats['product_count']} tickets={stats['processed_ticket_count']}"
    )
    print(f"Gitea raw preview: {GITEA_BADGE_RAW_BASE}/platform-stats-products.svg")
    print("commit docs/badges/ and push to Gitea to refresh README")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
