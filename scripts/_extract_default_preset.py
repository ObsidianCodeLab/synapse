import subprocess
from pathlib import Path

text = subprocess.check_output(
    ["git", "show", "fe511de0:src/synapse/agents/presets.py"],
    encoding="utf-8",
)
needle = '        id="default",'
start = text.find("    AgentProfile(\n" + needle)
if start < 0:
    start = text.find('AgentProfile(\n        id="default"')
end = text.find("\n    ),\n", start) + len("\n    ),\n")
Path("scripts/_default_preset_snippet.txt").write_text(text[start:end], encoding="utf-8")
