"""Compare LoadTableGroup row vs other rows in Lizard HTML."""
import json
import re
from pathlib import Path

WORK = Path(r"c:\Users\jyhk2\.synapse\work\21881451")
OUT = Path(r"d:\github\openakita_jyhk\dev\flight_result_loadtablegroup_diff.txt")


def get_html() -> str:
    data = json.loads((WORK / "meeting_pipeline.json").read_text(encoding="utf-8"))
    assets = (data.get("context") or {}).get("code_commit_assets") or {}
    br = (
        (((assets.get("tasks") or [{}])[0].get("flight") or {}).get("data") or {}).get(
            "buildResult"
        )
        or []
    )
    return str(br[0].get("resultMsg") or "")


def main():
    rm = get_html()
    lines: list[str] = []

    # Search for patterns unique to remediation items
    patterns = [
        "LoadTableGroup",
        "↗",
        "&#8599;",
        "&#8593;",
        "↑",
        "->",
        "→",
        "delta",
        "increase",
        "新增",
        "整改",
        "超标",
        "37",
        "46",
        "background",
        "color:red",
        "class=",
    ]
    lines.append("=" * 72)
    lines.append("Pattern counts in full HTML")
    lines.append("=" * 72)
    for p in patterns:
        lines.append(f"  {p!r}: {rm.count(p)}")

    # Find LoadTableGroup row raw HTML
    lines.append("")
    lines.append("=" * 72)
    lines.append("LoadTableGroup row (raw HTML)")
    lines.append("=" * 72)
    for m in re.finditer(r"<tr[^>]*>.*?LoadTableGroup.*?</tr>", rm, re.I | re.S):
        lines.append(m.group(0))
        lines.append("")

    # Compare row structures
    rows: list[dict] = []
    for m in re.finditer(r"<tr[^>]*>(.*?)</tr>", rm, re.I | re.S):
        tr = m.group(0)
        inner = m.group(1)
        if "<td" not in tr.lower():
            continue
        cells_raw = re.findall(r"(<td[^>]*>.*?</td>)", inner, re.I | re.S)
        cells_text = [
            re.sub(r"<[^>]+>", "", c).strip().replace("&lt;", "<").replace("&gt;", ">")
            for c in cells_raw
        ]
        if len(cells_text) < 3:
            continue
        rows.append(
            {
                "tr": tr,
                "cells_raw": cells_raw,
                "ncss": cells_text[0],
                "ccn": cells_text[1],
                "fn": cells_text[2][:100],
                "has_ccn_class": 'class="ccn"' in tr,
                "has_arrow": any(x in tr for x in ("↗", "&#8599;", "↑", "→", "->")),
                "td_attrs": [re.match(r"<td([^>]*)>", c, re.I).group(1) if re.match(r"<td([^>]*)>", c, re.I) else "" for c in cells_raw],
            }
        )

    target = [r for r in rows if "LoadTableGroup" in r["tr"]]
    start_rows = [r for r in rows if "ZmdbReadOraLog::Start" in r["tr"]]
    sample_others = [r for r in rows if "LoadTableGroup" not in r["tr"]][:3]

    lines.append("=" * 72)
    lines.append("LoadTableGroup parsed")
    lines.append("=" * 72)
    for r in target:
        lines.append(f"  NCSS={r['ncss']} CCN={r['ccn']}")
        lines.append(f"  has_ccn_class={r['has_ccn_class']} has_arrow={r['has_arrow']}")
        lines.append(f"  td_attrs={r['td_attrs']}")
        lines.append(f"  fn={r['fn']}")
        lines.append(f"  CCN cell raw: {r['cells_raw'][1][:200]}")

    lines.append("")
    lines.append("=" * 72)
    lines.append("ZmdbReadOraLog::Start (also in commit, CCN=32)")
    lines.append("=" * 72)
    for r in start_rows:
        lines.append(f"  NCSS={r['ncss']} CCN={r['ccn']}")
        lines.append(f"  has_ccn_class={r['has_ccn_class']} has_arrow={r['has_arrow']}")
        lines.append(f"  CCN cell raw: {r['cells_raw'][1][:200]}")

    lines.append("")
    lines.append("=" * 72)
    lines.append("Sample other rows")
    lines.append("=" * 72)
    for r in sample_others:
        lines.append(f"  CCN={r['ccn']} arrow={r['has_arrow']} | {r['fn']}")

    # Rows with arrow or special CCN format
    arrow_rows = [r for r in rows if r["has_arrow"] or re.search(r"\d+\s*[↗↑→]", r["ccn"])]
    lines.append("")
    lines.append("=" * 72)
    lines.append(f"Rows with arrow in CCN or tr ({len(arrow_rows)})")
    lines.append("=" * 72)
    for r in arrow_rows[:20]:
        lines.append(f"  CCN={r['ccn']} | {r['fn']}")

    # CCN cell text patterns
    ccn_texts = set(r["ccn"] for r in rows)
    non_numeric = [c for c in ccn_texts if not c.isdigit()]
    lines.append("")
    lines.append("=" * 72)
    lines.append(f"Non-numeric CCN cell values ({len(non_numeric)})")
    lines.append("=" * 72)
    for c in sorted(non_numeric)[:30]:
        lines.append(f"  {c!r}")

    # Search entire HTML for LoadTableGroup context (wider window)
    idx = rm.find("LoadTableGroup")
    if idx >= 0:
        lines.append("")
        lines.append("=" * 72)
        lines.append("Context around LoadTableGroup (±500 chars)")
        lines.append("=" * 72)
        lines.append(rm[max(0, idx - 500) : idx + 500])

    # Check if there's another build result source with different structure
    lines.append("")
    lines.append("=" * 72)
    lines.append("All tables/sections in HTML")
    lines.append("=" * 72)
    for m in re.finditer(r"<h[12][^>]*>(.*?)</h[12]>", rm, re.I | re.S):
        t = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        if t:
            lines.append(f"  H: {t}")
    for m in re.finditer(r"<table([^>]*)>", rm, re.I):
        lines.append(f"  TABLE: {m.group(1)[:100]}")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"written {OUT}")


if __name__ == "__main__":
    main()
