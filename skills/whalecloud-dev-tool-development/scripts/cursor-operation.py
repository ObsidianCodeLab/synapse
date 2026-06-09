"""
Cursor Agent CLI 操作脚本

通过 Cursor Agent CLI（`agent`）以 headless 模式执行代码开发任务。
支持首轮开发、纠偏多轮；可选 --continue 续接上一轮 Cursor Agent 会话上下文；
将 stream-json 完整写入日志并摘要输出到 stdout。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator, Callable, Optional

MAX_ASSISTANT_ECHO = 2000
# asyncio StreamReader.readline 默认 64KiB；stream-json 单行（含大段 tool 输出）可能更长
STREAM_JSON_LINE_LIMIT = 16 * 1024 * 1024

FUNC_SOLUTION_REL = Path("synapse_archive") / "需求设计" / "func_solution" / "函数级方案.md"
ACCEPTANCE_REL = Path("synapse_archive") / "需求分析" / "acceptance" / "验收标准.md"


async def _iter_subprocess_lines(
    reader: asyncio.StreamReader,
    *,
    max_line_bytes: int = STREAM_JSON_LINE_LIMIT,
) -> AsyncIterator[str]:
    """按行读取子进程 stdout，避免 readline() 默认 64KiB 上限触发 LimitOverrunError。"""
    buffer = bytearray()
    while True:
        chunk = await reader.read(65536)
        if not chunk:
            if buffer:
                yield buffer.decode(errors="replace")
            return
        buffer.extend(chunk)
        while True:
            newline = buffer.find(b"\n")
            if newline < 0:
                if len(buffer) > max_line_bytes:
                    raise ValueError(
                        f"stream-json 单行超过 {max_line_bytes} 字节"
                        "（多为工具输出过大）；请缩小单次修改范围或提高 STREAM_JSON_LINE_LIMIT"
                    )
                break
            line = buffer[: newline + 1]
            del buffer[: newline + 1]
            yield line.decode(errors="replace")


def find_repo_root_with_synapse_archive(start: Path) -> Optional[Path]:
    """从 code-path 向上查找含 synapse_archive/ 的代码根目录。"""
    current = start.resolve()
    if not current.is_dir():
        current = current.parent
    for candidate in [current, *current.parents]:
        if (candidate / "synapse_archive").is_dir():
            return candidate
    return None


def _is_workdir_archive_doc(path: Path) -> bool:
    """是否为会议室 {WORK_DIR}/archive/需求设计|需求分析 下的文档（Cursor 不可读）。"""
    parts = path.parts
    for i, part in enumerate(parts):
        if part != "archive" or i + 1 >= len(parts):
            continue
        if parts[i + 1] in ("需求设计", "需求分析"):
            return True
    return False


def _sandbox_path_for_code_path(code_path: Path) -> Optional[Path]:
    """若 code_path 落在 work/.../code/ 下，推导对应的 sandbox/ 路径。"""
    parts = code_path.parts
    for i, part in enumerate(parts):
        if part != "code":
            continue
        sandbox = Path(*parts[:i], "sandbox", *parts[i + 1 :])
        return sandbox
    return None


def validate_skill_paths(
    code_path: str,
    doc: Optional[str],
    acceptance_doc: Optional[str],
) -> None:
    """校验 whalecloud-dev-tool-development 技能约定的路径，错误则 SystemExit。"""
    code = Path(code_path).resolve()
    if not code.is_dir():
        raise SystemExit(f"错误：--code-path 不存在或不是目录：{code}")

    sandbox_equiv = _sandbox_path_for_code_path(code)
    if sandbox_equiv is not None:
        hint = f"\n请改用 sandbox 路径，例如：{sandbox_equiv}"
        if sandbox_equiv.is_dir():
            hint += "（该路径已存在）"
        raise SystemExit(
            f"错误：--code-path 不得使用 code/ 只读参考目录：{code}{hint}"
        )

    repo_root = find_repo_root_with_synapse_archive(code)
    if repo_root is None:
        raise SystemExit(
            f"错误：无法从 --code-path 向上定位含 synapse_archive/ 的代码根目录：{code}\n"
            "请确认文档已同步至代码仓 synapse_archive/（见 AGENTS.md §1.2）"
        )

    for label, doc_arg, rel in (
        ("--doc", doc, FUNC_SOLUTION_REL),
        ("--acceptance-doc", acceptance_doc, ACCEPTANCE_REL),
    ):
        if not doc_arg:
            continue
        doc_path = Path(doc_arg).resolve()
        if _is_workdir_archive_doc(doc_path):
            expected = (repo_root / rel).resolve()
            raise SystemExit(
                f"错误：{label} 不得使用会议室 archive/ 下的副本（Cursor 无法读取）：\n"
                f"  错误路径：{doc_path}\n"
                f"  正确路径：{expected}"
            )
        if "synapse_archive" not in doc_path.parts:
            expected = (repo_root / rel).resolve()
            raise SystemExit(
                f"错误：{label} 须位于代码仓 synapse_archive/ 下：\n"
                f"  当前路径：{doc_path}\n"
                f"  期望形如：{expected}"
            )
        if not doc_path.is_file():
            raise SystemExit(f"错误：{label} 文件不存在：{doc_path}")


def _cursor_agent_install_candidates() -> list[Path]:
    try:
        from synapse.rd_meeting.cursor_agent_cli import cursor_agent_install_candidates

        return cursor_agent_install_candidates()
    except ImportError:
        pass
    candidates: list[Path] = []
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA", "").strip()
        if local:
            base = Path(local) / "cursor-agent"
            for name in ("agent.exe", "agent.cmd", "cursor-agent.exe", "cursor-agent.cmd"):
                candidates.append(base / name)
    return candidates


def resolve_agent_executable(agent_path: str) -> str:
    try:
        from synapse.rd_meeting.cursor_agent_cli import resolve_agent_executable as _resolve

        return _resolve(agent_path)
    except ImportError:
        pass
    raw = (agent_path or "agent").strip()
    candidate = Path(raw)
    if candidate.is_file():
        return str(candidate.resolve())
    resolved = shutil.which(raw)
    if resolved:
        return str(Path(resolved).resolve())
    for guess in _cursor_agent_install_candidates():
        if guess.is_file():
            return str(guess.resolve())
    return raw


def format_agent_not_found_error(resolved: str) -> str:
    try:
        from synapse.rd_meeting.cursor_agent_cli import format_agent_not_found_error as _fmt

        return _fmt(resolved)
    except ImportError:
        pass
    return f"未找到 Cursor Agent CLI：{resolved}"


def validate_agent_executable(resolved: str) -> Optional[str]:
    try:
        from synapse.rd_meeting.cursor_agent_cli import validate_agent_executable as _validate

        return _validate(resolved)
    except ImportError:
        pass
    if Path(resolved).is_file():
        return None
    return format_agent_not_found_error(resolved)


def resolve_agent_launch_argv(agent_path: str) -> list[str]:
    try:
        from synapse.rd_meeting.cursor_agent_cli import resolve_agent_launch_argv as _resolve

        return _resolve(agent_path)
    except ImportError:
        pass
    return [resolve_agent_executable(agent_path)]


def is_workspace_trust_error(stderr: str) -> bool:
    try:
        from synapse.rd_meeting.cursor_agent_cli import is_workspace_trust_error as _check

        return _check(stderr)
    except ImportError:
        pass
    return "Workspace Trust Required" in (stderr or "")


def format_workspace_trust_error_hint(workspace: Optional[str] = None) -> str:
    try:
        from synapse.rd_meeting.cursor_agent_cli import format_workspace_trust_error_hint as _fmt

        return _fmt(workspace)
    except ImportError:
        pass
    ws = (workspace or "").strip() or "(workspace)"
    return f"Cursor Agent 工作区未信任：{ws}。请在本机执行 agent login 后，用 --trust --force 试跑一次。"


def format_agent_argv_for_log(argv: list[str], *, prompt_placeholder: str = "<prompt>") -> str:
    """日志用：隐藏末尾 prompt positional，保留实际 flag 顺序。"""
    if not argv:
        return ""
    display = list(argv)
    if display and not display[-1].startswith("-"):
        display[-1] = prompt_placeholder
    return " ".join(part if len(part) <= 120 else f"{part[:117]}..." for part in display)


@dataclass
class ToolEvent:
    tool_type: str
    tool_id: Optional[str] = None
    path: Optional[str] = None
    command: Optional[str] = None
    content: Optional[str] = None


@dataclass
class ProgressEvent:
    timestamp: str
    tool_events: list[ToolEvent] = field(default_factory=list)
    text: Optional[str] = None
    # 思考/推理内容（与 text 互不覆盖；可能同时存在）
    think: Optional[str] = None
    # 事件类型："output"=assistant 文本，"think"=思考块/思考事件，
    # "result"=最终结果摘要，"tool"=工具事件，"other"=兜底
    kind: str = "output"


@dataclass
class CursorResult:
    success: bool
    stdout: str = ""
    stderr: str = ""
    code: Optional[str] = None
    exit_code: Optional[int] = None


def _extract_assistant_text(data: dict) -> Optional[str]:
    """从 stream-json assistant 事件中提取可读文本。

    跳过 ``type`` 为 thinking/reasoning 等的 content block——这些由
    ``_extract_thinking_text`` 单独处理，避免与正式回复文本混淆。
    """
    if data.get("type") != "assistant":
        return None
    if isinstance(data.get("text"), str) and data["text"].strip():
        return data["text"].strip()
    message = data.get("message")
    if not isinstance(message, dict):
        return None
    parts: list[str] = []
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        parts.append(content.strip())
    elif isinstance(content, list):
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type", "")
            if btype in ("thinking", "reasoning", "redacted_thinking"):
                # 思考/推理块由 _extract_thinking_text 单独处理
                continue
            t = block.get("text") or block.get("content")
            if isinstance(t, str) and t.strip():
                parts.append(t.strip())
    return "\n".join(parts) if parts else None


def _extract_thinking_text(data: dict) -> Optional[str]:
    """从 stream-json 事件中提取思考/推理内容。

    支持两类来源：
    1. assistant 事件内 message.content 列表中 ``type == "thinking"`` 的 content block
       （Claude/Anthropic 风格）；
    2. 顶层 ``type == "thinking"`` 事件（自定义流）。
    也兼容 ``reasoning`` / ``reasoning_text`` 等常见别名字段。
    """
    event_type = data.get("type")

    # 顶层 thinking 事件
    if event_type == "thinking":
        for key in ("text", "reasoning", "reasoning_text", "content"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
        message = data.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
            if isinstance(content, list):
                parts: list[str] = []
                for block in content:
                    if isinstance(block, dict):
                        t = block.get("text") or block.get("content")
                        if isinstance(t, str) and t.strip():
                            parts.append(t.strip())
                if parts:
                    return "\n".join(parts)
        return None

    # assistant 事件内的 thinking content block
    if event_type == "assistant":
        # 顶层 thinking 字段
        for key in ("thinking", "reasoning", "reasoning_text"):
            val = data.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
        message = data.get("message")
        if isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, list):
                parts = []
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type", "")
                    if btype in ("thinking", "reasoning", "redacted_thinking"):
                        t = block.get("text") or block.get("content") or block.get("thinking")
                        if isinstance(t, str) and t.strip():
                            parts.append(t.strip())
                if parts:
                    return "\n".join(parts)
    return None


def parse_stream_event(data: dict) -> Optional[ProgressEvent]:
    """将 stream-json 单行事件解析为 ProgressEvent（兼容旧 progress 格式）。"""
    event_type = data.get("type")

    # 顶层 thinking 事件
    if event_type == "thinking":
        think_text = _extract_thinking_text(data)
        if think_text:
            ts = data.get("timestamp_ms")
            return ProgressEvent(
                timestamp=str(ts) if ts is not None else datetime.now().isoformat(),
                think=think_text,
                kind="think",
            )
        return None

    assistant_text = _extract_assistant_text(data)
    if assistant_text:
        think_text = _extract_thinking_text(data)
        ts = data.get("timestamp_ms")
        return ProgressEvent(
            timestamp=str(ts) if ts is not None else datetime.now().isoformat(),
            text=assistant_text,
            think=think_text,
            kind="output",
        )

    # 仅有 thinking，无 assistant text（仅思考，无回复）
    if event_type == "assistant":
        think_text = _extract_thinking_text(data)
        if think_text:
            ts = data.get("timestamp_ms")
            return ProgressEvent(
                timestamp=str(ts) if ts is not None else datetime.now().isoformat(),
                think=think_text,
                kind="think",
            )

    if event_type == "progress":
        tool_events = []
        for tool in data.get("tool_calls", []):
            tool_events.append(
                ToolEvent(
                    tool_type=tool.get("type", "unknown"),
                    tool_id=tool.get("id"),
                    path=tool.get("path"),
                    command=tool.get("command"),
                    content=tool.get("content"),
                )
            )
        return ProgressEvent(
            timestamp=str(data.get("timestamp", datetime.now().isoformat())),
            tool_events=tool_events,
            text=data.get("text"),
        )

    if event_type == "tool_call" and data.get("subtype") == "started":
        tool_call = data.get("tool_call") or {}
        tool_events: list[ToolEvent] = []
        for name, payload in tool_call.items():
            if not isinstance(payload, dict):
                continue
            args = payload.get("args") or {}
            tool_type = name.replace("ToolCall", "").replace("Tool", "") or name
            tool_events.append(
                ToolEvent(
                    tool_type=tool_type,
                    tool_id=data.get("call_id"),
                    path=args.get("path"),
                    command=args.get("command"),
                    content=args.get("contents") or args.get("fileText"),
                )
            )
        if tool_events:
            ts = data.get("timestamp_ms")
            return ProgressEvent(
                timestamp=str(ts) if ts is not None else datetime.now().isoformat(),
                tool_events=tool_events,
            )

    if event_type == "tool_call" and data.get("subtype") == "completed":
        tool_call = data.get("tool_call") or {}
        tool_events = []
        for name in tool_call:
            tool_type = name.replace("ToolCall", "").replace("Tool", "") or name
            tool_events.append(ToolEvent(tool_type=f"{tool_type}:completed", tool_id=data.get("call_id")))
        if tool_events:
            ts = data.get("timestamp_ms")
            return ProgressEvent(
                timestamp=str(ts) if ts is not None else datetime.now().isoformat(),
                tool_events=tool_events,
            )

    if event_type == "result":
        ts = data.get("timestamp_ms")
        subtype = data.get("subtype", "unknown")
        err = data.get("is_error")
        return ProgressEvent(
            timestamp=str(ts) if ts is not None else datetime.now().isoformat(),
            text=f"result:{subtype}" + (" (error)" if err else ""),
            kind="result",
        )

    return None


def parse_progress_line(line: str) -> Optional[ProgressEvent]:
    """解析 stream-json 单行。"""
    line = line.strip()
    if not line:
        return None
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return None
    return parse_stream_event(data)


def build_develop_prompt(
    *,
    code_path: str,
    target: str,
    doc_path: Optional[str] = None,
    acceptance_doc: Optional[str] = None,
    fix_feedback: Optional[str] = None,
    round_num: int = 1,
    continue_session: bool = False,
) -> str:
    """生成首轮或纠偏轮 Cursor Agent prompt。"""
    continue_prefix = (
        "【续接会话】本指令接在上一轮 Cursor Agent 对话之后，请保留此前上下文。\n\n"
        if continue_session
        else ""
    )
    base_rules = """注意：
1. 直接修改代码目录中的文件
2. 不要提交代码（不要 git commit）
3. 完成后输出已修改的文件列表及变更摘要
"""
    if fix_feedback:
        parts = [
            f"【第 {round_num} 轮纠偏】",
            "以下项未通过智能体验收检查，请针对性修复：",
            fix_feedback.strip(),
            "",
        ]
        if doc_path:
            parts.append(f"请继续参照函数级方案文档：{doc_path}")
        if acceptance_doc:
            parts.append(f"请继续满足验收标准文档：{acceptance_doc}")
        parts.extend(
            [
                f"代码工作目录：{code_path}",
                f"本轮任务：{target}",
                "",
                base_rules,
            ]
        )
        return continue_prefix + "\n".join(parts)

    parts: list[str] = []
    if doc_path:
        parts.append(f"请阅读函数级方案文档：{doc_path}")
        parts.append("然后根据文档描述的函数实现要求，修改代码目录中的源代码。")
    else:
        parts.append(f"请在代码工作目录 {code_path} 中完成下列开发任务。")
    if acceptance_doc:
        parts.append(f"同时阅读并对照验收标准文档：{acceptance_doc}")
    parts.extend(["", f"任务目标：{target}", "", base_rules])
    return continue_prefix + "\n".join(parts)


class CursorCLI:
    """Cursor Agent CLI 客户端（https://cursor.com/docs/cli）。"""

    def __init__(
        self,
        agent_path: Optional[str] = None,
        cursor_path: Optional[str] = None,
        worktree: Optional[str] = None,
        workspace: Optional[str] = None,
        timeout: int = 600,
        model: Optional[str] = "composer-2.5",
        continue_session: bool = False,
    ):
        self.agent_path = resolve_agent_executable(agent_path or cursor_path or "agent")
        code_dir = workspace or worktree
        self.workspace = Path(code_dir).resolve() if code_dir else None
        self.timeout = timeout
        self.model = model
        self.continue_session = continue_session

    def build_argv(self, prompt: str, *, use_yolo: bool = False) -> list[str]:
        """构造 agent argv：所有 flag 在前，prompt 作为末尾 positional（官方推荐）。"""
        argv = list(resolve_agent_launch_argv(self.agent_path))
        argv.append("-p")
        argv.extend(["--output-format", "stream-json"])
        if self.workspace:
            argv.extend(["--workspace", str(self.workspace)])
        argv.extend(["--force", "--trust", "--approve-mcps"])
        if use_yolo:
            argv.append("--yolo")
        model = (self.model or "").strip()
        if model and model.lower() != "auto":
            argv.extend(["--model", model])
        if self.continue_session:
            argv.append("--continue")
        argv.append(prompt)
        return argv

    async def _run_agent_once(
        self,
        argv: list[str],
        on_progress: Optional[Callable[[ProgressEvent], None]] = None,
        on_stream_line: Optional[Callable[[str], None]] = None,
    ) -> CursorResult:
        try:
            process = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self.workspace) if self.workspace else None,
                limit=STREAM_JSON_LINE_LIMIT,
            )
        except FileNotFoundError:
            detail = format_agent_not_found_error(self.agent_path)
            if on_stream_line:
                for line in detail.splitlines():
                    on_stream_line(f"[stderr] {line}")
            return CursorResult(success=False, stderr=detail, exit_code=127)

        stdout_chunks: list[str] = []
        stderr_chunks: list[str] = []

        async def _drain_stderr() -> None:
            assert process.stderr is not None
            while True:
                chunk = await process.stderr.read(65536)
                if not chunk:
                    break
                text = chunk.decode(errors="replace")
                stderr_chunks.append(text)
                if on_stream_line:
                    for line in text.splitlines():
                        on_stream_line(f"[stderr] {line}")

        async def _read_stdout() -> None:
            assert process.stdout is not None
            try:
                async for text in _iter_subprocess_lines(process.stdout):
                    stdout_chunks.append(text)
                    if on_stream_line:
                        on_stream_line(text.rstrip("\n\r"))
                    if on_progress:
                        progress = parse_progress_line(text)
                        if progress:
                            on_progress(progress)
            except ValueError as exc:
                stderr_chunks.append(str(exc))
                if on_stream_line:
                    on_stream_line(f"[stderr] {exc}")

        try:
            await asyncio.wait_for(
                asyncio.gather(_read_stdout(), _drain_stderr(), process.wait()),
                timeout=self.timeout,
            )
        except asyncio.LimitOverrunError as exc:
            process.kill()
            await process.wait()
            detail = (
                "读取 Cursor CLI stream-json 失败：单行输出超过 asyncio 缓冲上限。"
                " 已切换为大缓冲读取；若仍出现请缩小单次工具输出。"
                f" ({exc})"
            )
            return CursorResult(
                success=False,
                stdout="".join(stdout_chunks),
                stderr="".join(stderr_chunks) + f"\n{detail}",
                exit_code=-1,
            )
        except TimeoutError:
            process.kill()
            await process.wait()
            return CursorResult(
                success=False,
                stdout="".join(stdout_chunks),
                stderr="".join(stderr_chunks) + f"\n超时（{self.timeout}s）",
                exit_code=-1,
            )

        stdout = "".join(stdout_chunks)
        stderr = "".join(stderr_chunks)
        exit_code = process.returncode if process.returncode is not None else 0

        success = exit_code == 0
        if stdout:
            for line in reversed(stdout.splitlines()):
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "result":
                    success = event.get("subtype") == "success" and not event.get("is_error")
                    break

        return CursorResult(
            success=success,
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
        )

    async def agent_stream(
        self,
        prompt: str,
        on_progress: Optional[Callable[[ProgressEvent], None]] = None,
        on_stream_line: Optional[Callable[[str], None]] = None,
    ) -> CursorResult:
        agent_err = validate_agent_executable(self.agent_path)
        if agent_err:
            if on_stream_line:
                for line in agent_err.splitlines():
                    on_stream_line(f"[stderr] {line}")
            return CursorResult(success=False, stderr=agent_err, exit_code=127)

        argv = self.build_argv(prompt)
        result = await self._run_agent_once(argv, on_progress, on_stream_line)
        if result.success or not is_workspace_trust_error(result.stderr):
            return result

        if on_stream_line:
            on_stream_line("[stderr] 检测到工作区信任失败，使用 --yolo 重试一次…")
        retry_argv = self.build_argv(prompt, use_yolo=True)
        retry = await self._run_agent_once(retry_argv, on_progress, on_stream_line)
        if retry.success or not is_workspace_trust_error(retry.stderr):
            return retry

        ws = str(self.workspace) if self.workspace else None
        hint = format_workspace_trust_error_hint(ws)
        merged_stderr = f"{result.stderr.strip()}\n\n{hint}".strip()
        return CursorResult(
            success=False,
            stdout=retry.stdout or result.stdout,
            stderr=merged_stderr,
            exit_code=retry.exit_code if retry.exit_code is not None else result.exit_code,
        )

    async def agent(self, prompt: str) -> CursorResult:
        return await self.agent_stream(prompt)


async def develop_code(
    doc_path: str,
    worktree: str,
    target: str = "根据函数级方案实现代码修改",
    acceptance_doc: Optional[str] = None,
    fix_feedback: Optional[str] = None,
    round_num: int = 1,
    timeout: int = 600,
    continue_session: bool = False,
    on_progress: Optional[Callable[[ProgressEvent], None]] = None,
    on_stream_line: Optional[Callable[[str], None]] = None,
) -> CursorResult:
    cursor = CursorCLI(
        workspace=worktree,
        timeout=timeout,
        continue_session=continue_session,
    )
    prompt = build_develop_prompt(
        code_path=worktree,
        target=target,
        doc_path=doc_path,
        acceptance_doc=acceptance_doc,
        fix_feedback=fix_feedback,
        round_num=round_num,
        continue_session=continue_session,
    )
    return await cursor.agent_stream(prompt, on_progress, on_stream_line)


class FileProgressLogger:
    """进度与 Cursor CLI 原始输出日志记录器。

    日志默认以 **追加** 模式打开，便于多轮开发（首轮 + 多次纠偏）共用同一份
    日志文件（如 ``development.log``）。若需从空白文件开始，先手动删除该文件。
    """

    def __init__(self, log_path: str, *, stream_to_stdout: bool = True):
        self.log_path = Path(log_path)
        self.stream_to_stdout = stream_to_stdout
        self.log_file = None

    def __enter__(self):
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        # 多轮开发共用同一日志：追加模式，避免覆盖前轮内容
        self.log_file = open(self.log_path, "a", encoding="utf-8")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.log_file:
            self.log_file.close()

    def log(self, message: str, *, echo: bool = True):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] {message}"
        self.log_file.write(line + "\n")
        self.log_file.flush()
        if echo and self.stream_to_stdout:
            print(line, flush=True)

    def log_stream_line(self, raw_line: str, *, kind: str = "raw"):
        """写入 Cursor CLI 原始流式行（含时间戳与标签，便于按时间轴对照）。

        Parameters
        ----------
        raw_line : str
            原始单行内容（已去掉调用方添加的 ``[stderr]`` 前缀）。
        kind : str
            ``"raw"`` —— 来自 agent stdout 的 stream-json 行（标记为 ``[raw]``）；
            ``"stderr"`` —— 来自 agent stderr 的诊断行（标记为 ``[stderr]``）。
        空行直接忽略。
        """
        if not raw_line.strip():
            return
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        label = "raw" if kind == "raw" else "stderr"
        self.log_file.write(f"[{timestamp}] [{label}] {raw_line}\n")
        self.log_file.flush()

    def log_progress(self, progress: ProgressEvent, *, echo: bool = True):
        # 思考/推理内容（独立行，标签 [cursor-think]）
        if progress.think:
            self.log(f"[cursor-think] {progress.think[:MAX_ASSISTANT_ECHO]}", echo=echo)
        # 主输出（标签 [cursor-output]）；tool/result 事件此字段通常为空
        if progress.text:
            if progress.kind == "result":
                self.log(f"[cursor-output] {progress.text}", echo=echo)
            else:
                self.log(f"[cursor-output] {progress.text[:MAX_ASSISTANT_ECHO]}", echo=echo)
        for tool in progress.tool_events:
            if tool.path:
                self.log(f"[tool] {tool.tool_type} {tool.path}", echo=echo)
            elif tool.command:
                cmd = tool.command[:500] + ("..." if len(tool.command) > 500 else "")
                self.log(f"[tool] {tool.tool_type} {cmd}", echo=echo)
            else:
                self.log(f"[tool] {tool.tool_type}", echo=echo)

    def make_stream_handler(self) -> Callable[[str], None]:
        def on_stream_line(line: str) -> None:
            # 调用方已在 stderr 行前加 ``[stderr]`` 前缀；先剥离再由
            # log_stream_line 重新统一加 ``[时间戳] [stderr]`` 标签。
            if line.startswith("[stderr]"):
                body = line[len("[stderr]"):].lstrip()
                self.log_stream_line(body, kind="stderr")
                if self.stream_to_stdout:
                    print(line, flush=True)
            else:
                self.log_stream_line(line, kind="raw")

        return on_stream_line


def _validate_args(args: argparse.Namespace) -> str:
    if not args.target and not args.fix_feedback:
        raise SystemExit("错误：首轮须指定 --target；纠偏轮须指定 --fix-feedback（可同时带 --target）")
    return args.target or "按纠偏说明修复代码，直至满足验收与函数级方案"


async def main() -> int:
    parser = argparse.ArgumentParser(description="Cursor Agent CLI 操作工具")
    parser.add_argument("--code-path", required=True, help="代码工作目录（映射为 agent --workspace）")
    parser.add_argument("--target", default=None, help="开发/纠偏任务描述（纠偏轮可与 --fix-feedback 联用）")
    parser.add_argument(
        "--doc",
        default=None,
        help="函数级方案：{REPO_ROOT}/synapse_archive/需求设计/func_solution/函数级方案.md（禁止 WORK_DIR/archive/）",
    )
    parser.add_argument(
        "--acceptance-doc",
        default=None,
        help="验收标准：{REPO_ROOT}/synapse_archive/需求分析/acceptance/验收标准.md（禁止 WORK_DIR/archive/）",
    )
    parser.add_argument("--fix-feedback", default=None, help="校验未通过项全文（纠偏轮必填）")
    parser.add_argument("--round", type=int, default=1, help="轮次号，写入日志（默认 1）")
    parser.add_argument(
        "--continue",
        dest="continue_session",
        action="store_true",
        help="续接上一轮 Cursor Agent 会话（传给 agent --continue，继承对话上下文）",
    )
    parser.add_argument("--log", required=True, help="日志输出文件路径（含完整 stream-json）")
    parser.add_argument(
        "--no-echo-stream",
        action="store_true",
        help="不向 stdout 打印摘要进度（仍写入 --log）",
    )
    parser.add_argument("--timeout", type=int, default=600, help="超时时间（秒）")
    parser.add_argument(
        "--model",
        default="composer-2.5",
        help="模型 ID，原样传给 agent --model",
    )
    parser.add_argument(
        "--agent-path",
        default="agent",
        help="Cursor Agent CLI 可执行文件",
    )

    args = parser.parse_args()
    validate_skill_paths(args.code_path, args.doc, args.acceptance_doc)
    target = _validate_args(args)

    cursor = CursorCLI(
        agent_path=args.agent_path,
        workspace=args.code_path,
        timeout=args.timeout,
        model=args.model,
        continue_session=args.continue_session,
    )

    prompt = build_develop_prompt(
        code_path=args.code_path,
        target=target,
        doc_path=args.doc,
        acceptance_doc=args.acceptance_doc,
        fix_feedback=args.fix_feedback,
        round_num=args.round,
        continue_session=args.continue_session,
    )

    echo = not args.no_echo_stream
    agent_err = validate_agent_executable(cursor.agent_path)
    if agent_err:
        Path(args.log).parent.mkdir(parents=True, exist_ok=True)
        with FileProgressLogger(args.log, stream_to_stdout=echo) as logger:
            logger.log(agent_err, echo=echo)
        print(f"SYNAPSE_CURSOR_LOG={args.log}", flush=True)
        print(f"SYNAPSE_CURSOR_ROUND={args.round}", flush=True)
        print(f"SYNAPSE_CURSOR_CONTINUE={1 if args.continue_session else 0}", flush=True)
        print("SYNAPSE_CURSOR_SUCCESS=0", flush=True)
        print(f"执行失败：{agent_err.splitlines()[0]}", flush=True)
        return 1

    with FileProgressLogger(args.log, stream_to_stdout=echo) as logger:
        logger.log(f"=== 第 {args.round} 轮 Cursor 开发 ===", echo=echo)
        logger.log(f"代码目录: {args.code_path}", echo=echo)
        if args.doc:
            logger.log(f"函数级方案: {args.doc}", echo=echo)
        if args.acceptance_doc:
            logger.log(f"验收标准: {args.acceptance_doc}", echo=echo)
        if args.fix_feedback:
            logger.log("模式: 纠偏轮", echo=echo)
        if args.continue_session:
            logger.log("会话: --continue（续接上一轮 Cursor Agent）", echo=echo)
        preview_argv = cursor.build_argv(prompt)
        logger.log(
            f"命令: {format_agent_argv_for_log(preview_argv)}",
            echo=echo,
        )
        logger.log(f"日志文件: {args.log}", echo=echo)
        logger.log("--- Cursor CLI stream-json 开始 ---", echo=False)

        def on_progress(progress: ProgressEvent) -> None:
            logger.log_progress(progress, echo=echo)

        result = await cursor.agent_stream(
            prompt,
            on_progress=on_progress,
            on_stream_line=logger.make_stream_handler(),
        )

        logger.log("--- Cursor CLI stream-json 结束 ---", echo=False)
        if result.success:
            logger.log("任务执行成功", echo=echo)
        else:
            detail = result.stderr.strip() or result.stdout.strip() or f"exit_code={result.exit_code}"
            logger.log(f"任务执行失败: {detail[:2000]}", echo=echo)

    print(f"SYNAPSE_CURSOR_LOG={args.log}", flush=True)
    print(f"SYNAPSE_CURSOR_ROUND={args.round}", flush=True)
    print(f"SYNAPSE_CURSOR_CONTINUE={1 if args.continue_session else 0}", flush=True)
    print(f"SYNAPSE_CURSOR_SUCCESS={1 if result.success else 0}", flush=True)
    print(f"执行完成，完整 CLI 输出见日志: {args.log}", flush=True)
    return 0 if result.success else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
