"""
Cursor Agent CLI 安装/登录诊断 — 复现任务执行节点前置检查。

用途：
- 验证本机 agent 是否可被 Synapse 后端识别（与 task_exec 使用同一套 check_cursor_agent_cli）
- 对比桌面端（Tauri）与 synapse serve 后端的环境差异（backend_mismatch 常见根因）
- 输出 agent status / whoami 原始结果，便于排查「已点登录但仍显示未登录」

运行：
    python scripts/cursor_agent_cli_diag.py
    python scripts/cursor_agent_cli_diag.py --api http://127.0.0.1:16185
    python scripts/cursor_agent_cli_diag.py --login   # 交互：启动 agent login（需浏览器 OAuth）
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (OSError, ValueError):
        pass

from synapse.rd_meeting.cursor_agent_cli import (
    check_cursor_agent_cli,
    cursor_agent_install_candidates,
    detect_cursor_agent_version_dir_issue,
    ensure_cursor_agent_windows_layout,
    format_argv_as_shell,
    resolve_agent_executable,
    resolve_agent_launch_argv,
    validate_agent_executable,
)


def _section(title: str) -> None:
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}", flush=True)


def _run_cmd(argv: list[str], *, timeout: int = 30) -> dict[str, Any]:
    """执行子进程并返回结构化结果（诊断用，不抛异常）。"""
    try:
        proc = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        return {
            "argv": argv,
            "shell": format_argv_as_shell(argv),
            "exit_code": proc.returncode,
            "stdout": (proc.stdout or "").strip(),
            "stderr": (proc.stderr or "").strip(),
            "ok": proc.returncode == 0,
        }
    except subprocess.TimeoutExpired:
        return {"argv": argv, "shell": format_argv_as_shell(argv), "error": "timeout"}
    except OSError as exc:
        return {"argv": argv, "shell": format_argv_as_shell(argv), "error": str(exc)}


def _safe_text(text: str) -> str:
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    return text.encode(enc, errors="replace").decode(enc, errors="replace")


def _print_cmd_result(label: str, result: dict[str, Any]) -> None:
    print(f"\n[{label}]", flush=True)
    print(f"  cmd: {result.get('shell') or result.get('argv')}", flush=True)
    if "error" in result:
        print(f"  error: {result['error']}", flush=True)
        return
    print(f"  exit: {result.get('exit_code')}", flush=True)
    if result.get("stdout"):
        out = _safe_text(str(result["stdout"]).replace("\n", "\n    "))
        print(f"  stdout:\n    {out}", flush=True)
    if result.get("stderr"):
        err = _safe_text(str(result["stderr"]).replace("\n", "\n    "))
        print(f"  stderr:\n    {err}", flush=True)


def _print_env_snapshot() -> None:
    keys = [
        "PATH",
        "LOCALAPPDATA",
        "HOME",
        "USERPROFILE",
        "CURSOR_API_KEY",
        "CURSOR_AGENT_PATH",
        "SYNAPSE_CURSOR_AGENT_PATH",
    ]
    _section("环境变量")
    for key in keys:
        val = os.environ.get(key)
        if not val:
            continue
        if key == "PATH":
            parts = val.split(os.pathsep)
            cursor_bits = [p for p in parts if "cursor" in p.lower()]
            print(f"  PATH (含 cursor 的条目): {cursor_bits or '(无)'}", flush=True)
            print(f"  PATH 条目数: {len(parts)}", flush=True)
        elif key == "CURSOR_API_KEY":
            print(f"  {key}: {'*' * min(8, len(val))} (已设置，长度 {len(val)})", flush=True)
        else:
            print(f"  {key}: {val}", flush=True)
    for key in keys:
        if os.environ.get(key):
            continue
        if key in ("CURSOR_API_KEY", "CURSOR_AGENT_PATH", "SYNAPSE_CURSOR_AGENT_PATH"):
            print(f"  {key}: (未设置)", flush=True)


def _print_install_candidates(resolved: str) -> None:
    _section("安装路径探测")
    which_agent = shutil.which("agent")
    print(f"  shutil.which('agent'): {which_agent or '(未找到)'}", flush=True)
    print(f"  resolve_agent_executable(): {resolved}", flush=True)
    print(f"  文件存在: {Path(resolved).is_file()}", flush=True)

    candidates = cursor_agent_install_candidates()
    existing = [str(p) for p in candidates if p.is_file()]
    print(f"  常见安装候选 ({len(candidates)} 个，存在 {len(existing)} 个):", flush=True)
    for path in existing[:8]:
        mark = " <-- 当前解析" if str(Path(path).resolve()) == str(Path(resolved).resolve()) else ""
        print(f"    - {path}{mark}", flush=True)
    if len(existing) > 8:
        print(f"    ... 另有 {len(existing) - 8} 个", flush=True)

    launch_argv = resolve_agent_launch_argv()
    print(f"  resolve_agent_launch_argv(): {format_argv_as_shell(launch_argv)}", flush=True)


def _print_windows_layout() -> None:
    if sys.platform != "win32":
        return
    _section("Windows 版本目录布局")
    layout = ensure_cursor_agent_windows_layout()
    issue = detect_cursor_agent_version_dir_issue()
    print(f"  ensure_cursor_agent_windows_layout: {json.dumps(layout, ensure_ascii=False)}", flush=True)
    print(f"  detect_cursor_agent_version_dir_issue: {json.dumps(issue, ensure_ascii=False)}", flush=True)


def _print_raw_agent_probes(resolved: str) -> None:
    _section("agent 原始命令探测")
    err = validate_agent_executable(resolved)
    if err:
        print(f"  跳过：{err.splitlines()[0]}", flush=True)
        return

    for subcmd in ("--version", "status", "whoami"):
        _print_cmd_result(subcmd, _run_cmd([resolved, subcmd]))

    shell_agent = shutil.which("agent")
    if shell_agent and str(Path(shell_agent).resolve()) != str(Path(resolved).resolve()):
        _section("PATH 中 agent 与解析路径不一致")
        print(f"  PATH agent: {shell_agent}", flush=True)
        print(f"  解析路径:   {resolved}", flush=True)
        for subcmd in ("status", "whoami"):
            _print_cmd_result(f"PATH agent {subcmd}", _run_cmd(["agent", subcmd]))


def _print_check_result(status: dict[str, Any]) -> None:
    _section("check_cursor_agent_cli() — 与 task_exec 相同")
    print(json.dumps(status, ensure_ascii=False, indent=2), flush=True)

    installed = bool(status.get("installed"))
    logged_in = bool(status.get("logged_in"))
    ready = bool(status.get("ready"))

    if not installed:
        task_status = "agent_cli_missing"
    elif not logged_in:
        task_status = "agent_cli_login_required"
    else:
        task_status = "(通过前置检查，可进入任务执行)"

    print(f"\n  任务执行节点预判 status: {task_status}", flush=True)


def _fetch_api_status(api_base: str) -> dict[str, Any] | None:
    url = f"{api_base.rstrip('/')}/api/dev/cursor-agent-cli/status"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"  API 请求失败: {exc}", flush=True)
        return None
    if body.get("errorcode") != 0:
        print(f"  API 返回错误: {body.get('message')}", flush=True)
        return None
    return body.get("data")


def _print_api_compare(api_base: str, local: dict[str, Any]) -> None:
    _section(f"Synapse 后端 API 对比 ({api_base})")
    remote = _fetch_api_status(api_base)
    if remote is None:
        print("  提示: 若 synapse serve 未运行，可执行 synapse serve 后加 --api 重试", flush=True)
        return

    print("  后端返回:", flush=True)
    print(json.dumps(remote, ensure_ascii=False, indent=2), flush=True)

    local_ready = bool(local.get("ready"))
    remote_ready = bool(remote.get("ready"))
    local_installed = bool(local.get("installed"))
    remote_installed = bool(remote.get("installed"))

    if local_ready and not remote_ready:
        print(
            "\n  ⚠ backend_mismatch: 本脚本进程已就绪，但 synapse serve 进程未识别 agent。"
            "\n    常见原因: 后端在 agent 安装/登录前启动，或后端 PATH 与当前终端不同。"
            "\n    处理: 重启 synapse serve（或 synapse 桌面版），再点「重新检测」。",
            flush=True,
        )
    elif remote_installed and not remote_ready:
        print(
            "\n  ⚠ 后端已检测到 agent 但未登录 — 任务执行会停在 agent_cli_login_required。"
            "\n    处理: 在本机终端执行 agent login，或在 Synapse 桌面版点「登录 Cursor 账号」。",
            flush=True,
        )
    elif not remote_installed:
        print(
            "\n  ⚠ 后端未找到 agent — 任务执行会停在 agent_cli_missing。",
            flush=True,
        )
    elif remote_ready:
        print("\n  ✓ 后端 ready=true，任务执行前置检查应可通过。", flush=True)

    if local_installed != remote_installed or local_ready != remote_ready:
        print(
            f"\n  对比: local(installed={local_installed}, ready={local_ready})"
            f" vs remote(installed={remote_installed}, ready={remote_ready})",
            flush=True,
        )


def _print_troubleshooting(status: dict[str, Any]) -> None:
    _section("排查建议")
    if status.get("ready"):
        print("  当前环境已通过检测，若 UI 仍提示未登录，优先检查 backend_mismatch（重启 synapse serve）。", flush=True)
        return

    if not status.get("installed"):
        if sys.platform == "win32":
            print("  1. 安装: irm 'https://cursor.com/install?win32=true' | iex", flush=True)
        else:
            print("  1. 安装: curl https://cursor.com/install -fsS | bash", flush=True)
        print("  2. 新开终端验证: agent --version", flush=True)
        print("  3. 或设置 CURSOR_AGENT_PATH 指向 agent.exe 完整路径", flush=True)
        return

    print("  agent 已安装但未 ready，重点排查登录:", flush=True)
    print("  1. 终端执行: agent login  （需在浏览器完成 OAuth）", flush=True)
    print("  2. 验证: agent status 或 agent whoami 应返回账号信息", flush=True)
    print("  3. 若 status 仍显示 not logged in:", flush=True)
    print("     - 关闭代理/VPN 后重试 login", flush=True)
    print("     - 检查系统浏览器能否打开 cursor.com", flush=True)
    print("     - 可改用 CURSOR_API_KEY（Cursor 设置 → API Keys）", flush=True)
    if sys.platform == "win32":
        layout = status.get("layout_repair") or {}
        if layout.get("needed") and not layout.get("agent_version_ok"):
            print("  4. Windows 版本目录可能损坏，本脚本已尝试 junction 修复；仍失败请重装 agent", flush=True)


def _interactive_login(resolved: str) -> None:
    _section("交互登录 (agent login)")
    err = validate_agent_executable(resolved)
    if err:
        print(err, flush=True)
        return
    print("  将启动 agent login，请在浏览器中完成授权…", flush=True)
    result = _run_cmd([resolved, "login"], timeout=300)
    _print_cmd_result("agent login", result)
    after = check_cursor_agent_cli()
    print(f"\n  登录后 check: ready={after.get('ready')} auth_message={after.get('auth_message')}", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Cursor Agent CLI 安装/登录诊断（任务执行前置）")
    parser.add_argument(
        "--api",
        default=os.environ.get("SYNAPSE_API_BASE", "http://127.0.0.1:16185"),
        help="Synapse API 地址，用于对比后端检测结果（默认 127.0.0.1:16185）",
    )
    parser.add_argument(
        "--login",
        action="store_true",
        help="安装检测通过后，交互执行 agent login",
    )
    parser.add_argument(
        "--no-api",
        action="store_true",
        help="跳过 Synapse API 对比",
    )
    args = parser.parse_args()

    print("Cursor Agent CLI 诊断 — 任务执行前置检查", flush=True)
    print(f"Python: {sys.executable}", flush=True)
    print(f"Platform: {sys.platform}", flush=True)
    print(f"CWD: {os.getcwd()}", flush=True)

    _print_env_snapshot()

    resolved = resolve_agent_executable()
    _print_install_candidates(resolved)
    _print_windows_layout()
    _print_raw_agent_probes(resolved)

    status = check_cursor_agent_cli()
    _print_check_result(status)

    if not args.no_api:
        _print_api_compare(args.api, status)

    _print_troubleshooting(status)

    if args.login:
        _interactive_login(resolved)

    return 0 if status.get("ready") else 1


if __name__ == "__main__":
    raise SystemExit(main())
