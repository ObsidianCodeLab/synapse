"""Check all buildResult copies in pipeline for different content."""
import json
from pathlib import Path

WORK = Path(r"c:\Users\jyhk2\.synapse\work\21881451")
data = json.loads((WORK / "meeting_pipeline.json").read_text(encoding="utf-8"))


def walk(obj, path=""):
    if isinstance(obj, dict):
        br = obj.get("buildResult")
        if isinstance(br, list) and br:
            for i, item in enumerate(br):
                if not isinstance(item, dict):
                    continue
                rt = item.get("resultType") or item.get("nodeName")
                rm = str(item.get("resultMsg") or item.get("attachmentDesc") or "")
                print(f"{path}.buildResult[{i}] type={rt} len={len(rm)} keys={list(item.keys())}")
                if "LoadTableGroup" in rm:
                    idx = rm.find("LoadTableGroup")
                    print(f"  LoadTableGroup context: {rm[idx-80:idx+120]}")
                if "37" in rm and "46" in rm and "LoadTableGroup" in rm:
                    print("  HAS 37 and 46 near LoadTableGroup")
                if "↗" in rm or "8599" in rm:
                    print("  HAS arrow")
        for k, v in obj.items():
            walk(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk(v, f"{path}[{i}]")


walk(data)
