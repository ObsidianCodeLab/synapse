"""Dump flight results for scope 21881451."""
import json
import re
from pathlib import Path

WORK = Path(r"c:\Users\jyhk2\.synapse\work\21881451")
OUT = Path(r"d:\github\openakita_jyhk\dev\flight_result_21881451.txt")


def get_assets(data: dict) -> dict:
    ctx = data.get("context") or {}
    assets = ctx.get("code_commit_assets")
    if assets and assets.get("tasks"):
        return assets
    return assets or {}


def parse_row(tr_html: str) -> dict | None:
    cells = re.findall(r"<td[^>]*>(.*?)</td>", tr_html, re.I | re.S)
    if len(cells) < 2:
        return None
    clean = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
    clean = [c.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&") for c in clean]
    has_ccn = 'class="ccn"' in tr_html
    return {
        "ncss": clean[0] if len(clean) > 0 else "",
        "ccn": clean[1] if len(clean) > 1 else "",
        "function": clean[2] if len(clean) > 2 else "",
        "marked_ccn": has_ccn,
    }


def main():
    pipeline = json.loads((WORK / "meeting_pipeline.json").read_text(encoding="utf-8"))
    assets = get_assets(pipeline)
    lines: list[str] = []

    flight = assets.get("flight") or {}
    lines.append("=" * 72)
    lines.append("试飞总体")
    lines.append("=" * 72)
    lines.append(f"status: {flight.get('status')}")
    lines.append(f"error:  {flight.get('error')}")

    for task in assets.get("tasks") or []:
        if not isinstance(task, dict):
            continue
        task_no = task.get("task_no") or task.get("taskNo") or "?"
        lines.append("")
        lines.append("=" * 72)
        lines.append(f"子单 {task_no} | commit={task.get('status')}")
        lines.append("=" * 72)

        fl = task.get("flight") or {}
        fd = fl.get("data") or {}
        lines.append(f"flight.status: {fl.get('status')}")
        lines.append(f"flight.error:  {fl.get('error')}")
        lines.append(f"taskId: {fd.get('taskId')}")
        lines.append(f"构建状态: {fd.get('ciFlowInstRunStateDesc') or fd.get('ciFlowInstRunState')}")
        lines.append(f"开始: {fd.get('ciFlowInstBeginDate')}")
        lines.append(f"结束: {fd.get('ciFlowInstEndDate')}")

        br = fd.get("buildResult") or []
        lines.append(f"buildResult 条目数: {len(br)}")
        lines.append("")

        for i, item in enumerate(br, 1):
            if not isinstance(item, dict):
                continue
            rt = item.get("resultType") or item.get("nodeName") or "检查项"
            rm = str(item.get("resultMsg") or "")
            lines.append("-" * 72)
            lines.append(f"[{i}] resultType: {rt}")
            lines.append(f"    resultMsg 长度: {len(rm)} 字符")
            lines.append(f"    runResult: {item.get('runResult', '')}")
            lines.append("")

            if "<table" not in rm.lower():
                preview = rm[:2000].replace("\n", " ")
                lines.append("    (非 HTML，原文预览)")
                lines.append(f"    {preview}")
                continue

            # HTML stats
            all_rows = list(re.finditer(r"<tr[^>]*>(.*?)</tr>", rm, re.I | re.S))
            marked = []
            unmarked = []
            for m in all_rows:
                tr = m.group(0)
                if "<td" not in tr.lower():
                    continue
                row = parse_row(tr)
                if not row:
                    continue
                if row["marked_ccn"]:
                    marked.append(row)
                else:
                    unmarked.append(row)

            lines.append(f"    HTML 表格: 数据行 {len(marked) + len(unmarked)}")
            lines.append(f"      - 带 class=ccn 标红: {len(marked)}")
            lines.append(f"      - 无标红: {len(unmarked)}")
            if marked:
                ccns = [int(r["ccn"]) for r in marked if str(r["ccn"]).isdigit()]
                if ccns:
                    lines.append(f"      - CCN 范围: {min(ccns)} ~ {max(ccns)}")
                    lines.append(f"      - CCN>15: {sum(1 for v in ccns if v > 15)}")
                    lines.append(f"      - CCN<=15: {sum(1 for v in ccns if v <= 15)}")

            lines.append("")
            lines.append("    【标红行 TOP 30（按 CCN 降序）】")
            for r in sorted(marked, key=lambda x: int(x["ccn"]) if str(x["ccn"]).isdigit() else 0, reverse=True)[:30]:
                fn = r["function"][:130]
                lines.append(f"      CCN={r['ccn']:>3} NCSS={r['ncss']:>4} | {fn}")

            if len(marked) > 30:
                lines.append(f"      ... 共 {len(marked)} 条标红行")

            if unmarked:
                lines.append("")
                lines.append("    【未标红行 样例（最多 5 条）】")
                for r in unmarked[:5]:
                    fn = r["function"][:130]
                    lines.append(f"      CCN={r['ccn']:>3} NCSS={r['ncss']:>4} | {fn}")

            # raw HTML head
            lines.append("")
            lines.append("    【HTML 开头 800 字符】")
            lines.append(rm[:800])

    # archive md
    md_path = WORK / "archive" / "开发中" / "exception_check" / "试飞结果.md"
    if md_path.exists():
        lines.append("")
        lines.append("=" * 72)
        lines.append("归档 试飞结果.md（完整，注意 resultMsg 可能被截断）")
        lines.append("=" * 72)
        lines.append(md_path.read_text(encoding="utf-8"))

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"written: {OUT}")
    print(f"lines: {len(lines)}")


def dump_commit_related():
    """Append commit-related violation rows."""
    pipeline = json.loads((WORK / "meeting_pipeline.json").read_text(encoding="utf-8"))
    assets = get_assets(pipeline)
    br = (
        (((assets.get("tasks") or [{}])[0].get("flight") or {}).get("data") or {}).get(
            "buildResult"
        )
        or []
    )
    if not br:
        return
    item = br[0]
    rm = str(item.get("resultMsg") or "")
    extra: list[str] = [
        "",
        "=" * 72,
        "buildResult 原始字段",
        "=" * 72,
        json.dumps({k: (v if k != "resultMsg" else f"<html {len(str(v))} chars>") for k, v in item.items()}, ensure_ascii=False, indent=2),
        "",
        "=" * 72,
        "本次 commit 相关函数（ZmdbReadOraLog / LoadTableGroup / BackupInfo 等）",
        "=" * 72,
    ]
    keys = ["ZmdbReadOraLog", "LoadTableGroup", "BackupInfo", "test_scheduled", "ZmdbConfig.cpp"]
    for m in re.finditer(r"<tr[^>]*>(.*?)</tr>", rm, re.I | re.S):
        tr = m.group(0)
        if "<td" not in tr.lower():
            continue
        if not any(k in tr for k in keys):
            continue
        row = parse_row(tr)
        if not row:
            continue
        fn = row["function"][:140]
        extra.append(
            f"  CCN={row['ccn']:>3} NCSS={row['ncss']:>4} marked={row['marked_ccn']} | {fn}"
        )
    with OUT.open("a", encoding="utf-8") as f:
        f.write("\n".join(extra) + "\n")


if __name__ == "__main__":
    main()
    dump_commit_related()
