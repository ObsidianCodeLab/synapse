"""Analyze rd-expert token attribution from activity.jsonl."""
import json
import re
from collections import defaultdict
from pathlib import Path

ACT = Path(r"c:\Users\jyhk2\.synapse\work\21881451\agents\req_clarify\whalecloud-rd-expert\activity.jsonl")
rows = [json.loads(l) for l in ACT.read_text(encoding="utf-8").splitlines() if l.strip()]

llm = [r for r in rows if r.get("category") == "llm_usage"]
tools = [r for r in rows if r.get("category") == "tool"]
skills = [r for r in rows if r.get("category") == "skill_load"]

print("=== SUMMARY ===")
print(f"LLM calls: {len(llm)}")
print(f"Total input tokens: {sum(r.get('input_tokens',0) or 0 for r in llm):,}")
print(f"Total output tokens: {sum(r.get('output_tokens',0) or 0 for r in llm):,}")
print(f"Peak input: {max((r.get('input_tokens',0) or 0 for r in llm), default=0):,}")
print(f"Output/Input ratio: {sum(r.get('output_tokens',0) or 0 for r in llm) / max(sum(r.get('input_tokens',0) or 0 for r in llm),1) * 100:.2f}%")

# Tool counts
tc: dict[str, int] = defaultdict(int)
preview_chars: dict[str, int] = defaultdict(int)
for t in tools:
    name = t.get("tool_name", "?")
    tc[name] += 1
    preview_chars[name] += len(str(t.get("result_preview") or ""))

print("\n=== TOOLS ===")
for name, cnt in sorted(tc.items(), key=lambda x: -x[1]):
    avg_chars = preview_chars[name] // max(cnt, 1)
    print(f"  {name}: {cnt}x, avg result_preview chars={avg_chars}")

print(f"\n  skill_load (get_skill_info): {len(skills)}x")
skill_chars = sum(len(str(s.get("result_preview") or "")) for s in skills)

# LLM growth phases - every 10 calls
print("\n=== LLM INPUT GROWTH (every 10 calls) ===")
for i in range(0, len(llm), 10):
    chunk = llm[i : i + 10]
    avg = sum(r.get("input_tokens", 0) or 0 for r in chunk) // len(chunk)
    inc = (chunk[-1].get("input_tokens", 0) or 0) - (chunk[0].get("input_tokens", 0) or 0)
    print(
        f"  #{i+1}-{i+len(chunk)}: start={chunk[0].get('input_tokens')} "
        f"end={chunk[-1].get('input_tokens')} avg={avg} delta={inc:+d}"
    )

# Map LLM call to tools since previous LLM
print("\n=== EXAMPLE: ROUNDS WHERE INPUT JUMPS >3K ===")
prev_in = 0
prev_seq = 0
for r in llm:
    inp = r.get("input_tokens", 0) or 0
    seq = r.get("seq", 0)
    if prev_in and inp - prev_in >= 3000:
        between = [
            x
            for x in rows
            if prev_seq < x.get("seq", 0) < seq and x.get("category") == "tool"
        ]
        tool_summary = []
        for b in between:
            rp = str(b.get("result_preview") or "")
            m = re.search(r"原文 (\d+) 字符", rp)
            chars = m.group(1) if m else str(len(rp))
            tool_summary.append(f"{b.get('tool_name')}({chars}ch)")
        print(
            f"  seq {seq}: {prev_in:,} -> {inp:,} (+{inp-prev_in:,}) "
            f"tools: {', '.join(tool_summary[:6])}"
        )
    prev_in = inp
    prev_seq = seq

# Estimate fixed overhead first call
if llm:
    print(f"\n=== FIRST LLM CALL BREAKDOWN (estimate) ===")
    print(f"  First input_tokens: {llm[0].get('input_tokens')} (system+task+empty history)")
    print(f"  system_prompt.txt: ~13276 bytes (~4-5K tokens est.)")

# read_file with 原文 char counts
read_files = [t for t in tools if t.get("tool_name") == "read_file"]
rf_chars = []
for t in read_files:
    rp = str(t.get("result_preview") or "")
    m = re.search(r"原文 (\d+) 字符", rp)
    path = (t.get("tool_input") or {}).get("path", "")
    short = Path(path).name if path else "?"
    if m:
        rf_chars.append((int(m.group(1)), short))
    else:
        rf_chars.append((len(rp), short))

rf_chars.sort(reverse=True)
print(f"\n=== TOP 10 read_file BY SOURCE SIZE (activity preview) ===")
for chars, name in rf_chars[:10]:
    est_tokens = chars // 3  # rough CJK/code
    print(f"  {name}: {chars:,} chars (~{est_tokens:,} tok est.)")

print(f"\nTotal read_file: {len(read_files)}")
print(f"Sum of 原文 chars (where tagged): {sum(c for c,_ in rf_chars if c):,}")
