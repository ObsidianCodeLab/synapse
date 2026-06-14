"""
Microcompact — 请求前轻量上下文清理

零 LLM 调用成本的上下文瘦身策略，在发送 API 请求前执行:
1. 过期工具结果清空（按时间阈值）
2. 大工具结果替换为摘要预览
3. 旧 thinking 块移除
4. 旧 tool_use 参数裁剪

参考 Claude Code 的 microcompact 策略。
"""

from __future__ import annotations

import logging
import hashlib
import time

logger = logging.getLogger(__name__)

TOOL_RESULT_EXPIRY_SECONDS = 600  # 10 分钟
LARGE_RESULT_PREVIEW_CHARS = 500
LARGE_RESULT_THRESHOLD_CHARS = 8000

# 代码类工具结果（read_file / run_shell grep 等）专用阈值：更激进压缩
# 读码场景下单次结果通常 5k-50k chars，但后续轮次无需保留原始文本
CODE_TOOL_NAMES = frozenset({"read_file", "run_shell"})
CODE_TOOL_THRESHOLD_CHARS = 2000   # 超过 2000 chars 就压缩
CODE_TOOL_PREVIEW_CHARS = 300      # 只保留前 300 chars 预览


def microcompact(
    messages: list[dict],
    *,
    tool_result_expiry_s: float = TOOL_RESULT_EXPIRY_SECONDS,
    large_result_threshold: int = LARGE_RESULT_THRESHOLD_CHARS,
    preview_chars: int = LARGE_RESULT_PREVIEW_CHARS,
    current_time: float | None = None,
) -> list[dict]:
    """对消息列表执行轻量清理。

    注意：这是浅拷贝操作，会修改传入的消息列表。
    调用方应在需要时提前深拷贝。

    Args:
        messages: 消息列表
        tool_result_expiry_s: 工具结果过期秒数
        large_result_threshold: 大结果阈值字符数
        preview_chars: 预览保留字符数
        current_time: 当前时间（测试用）

    Returns:
        清理后的消息列表（原地修改）
    """
    now = current_time or time.time()
    cleaned = 0
    total_messages = len(messages)
    seen_cache_refs: set[str] = set()
    seen_tool_fingerprints: dict[str, int] = {}

    # 预建 tool_use_id → tool_name 映射（用于 Anthropic 格式的 tool_result block）
    tool_id_to_name: dict[str, str] = {}
    for msg in messages:
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                tid = block.get("id", "")
                tname = block.get("name", "")
                if tid and tname:
                    tool_id_to_name[tid] = tname

    for i, msg in enumerate(messages):
        # Only process messages not in the last 3 (keep recent context intact)
        is_recent = i >= total_messages - 3

        # --- OpenAI 格式：role=tool，content 是字符串 ---
        if msg.get("role") == "tool" and not is_recent:
            result_content = msg.get("content", "")
            if isinstance(result_content, str) and len(result_content) > 0:
                tool_name = msg.get("name", "") or ""
                # fingerprint 去重
                if result_content:
                    fp = hashlib.md5(result_content[:4000].encode("utf-8", errors="ignore")).hexdigest()[:12]
                    semantic_key = f"{tool_name}:{fp}"
                    previous = seen_tool_fingerprints.get(semantic_key, 0)
                    if previous >= 1:
                        msg["content"] = (
                            f"[tool result merged] 重复/相似的 {tool_name or 'tool'} 结果已合并；fingerprint={fp}。"
                        )
                        cleaned += 1
                        continue
                    seen_tool_fingerprints[semantic_key] = previous + 1
                # 代码工具激进压缩
                if tool_name in CODE_TOOL_NAMES and len(result_content) > CODE_TOOL_THRESHOLD_CHARS:
                    msg["content"] = (
                        f"{result_content[:CODE_TOOL_PREVIEW_CHARS]}\n\n"
                        f"... [{len(result_content)} chars, {tool_name} result compressed by microcompact]"
                    )
                    cleaned += 1
                    continue
                # 通用大结果截断
                if len(result_content) > large_result_threshold:
                    msg["content"] = (
                        f"{result_content[:preview_chars]}\n\n"
                        f"... [{len(result_content)} chars total, truncated by microcompact]"
                    )
                    cleaned += 1
            continue  # OpenAI role=tool 消息不再走 block 循环

        content = msg.get("content")
        if not isinstance(content, list):
            continue

        for block in content:
            if not isinstance(block, dict):
                continue

            block_type = block.get("type", "")

            if block_type == "tool_result" and not is_recent:
                result_content = block.get("content", "")
                cache_key = str(block.get("cache_key", "") or "")
                if not cache_key and isinstance(result_content, str) and result_content.startswith("[系统缓存:"):
                    cache_key = result_content.split("]", 1)[0]
                if cache_key:
                    if cache_key in seen_cache_refs:
                        block["content"] = f"[cached tool result duplicate merged: {cache_key}]"
                        cleaned += 1
                        continue
                    seen_cache_refs.add(cache_key)

                tool_use_id = str(block.get("tool_use_id", "") or "")
                tool_name = tool_id_to_name.get(tool_use_id, "") or str(block.get("tool_name", "") or "")
                if isinstance(result_content, str) and result_content:
                    fp = hashlib.md5(result_content[:4000].encode("utf-8", errors="ignore")).hexdigest()[:12]
                    semantic_key = f"{tool_name}:{fp}"
                    previous = seen_tool_fingerprints.get(semantic_key, 0)
                    if previous >= 1:
                        block["content"] = (
                            f"[tool result merged] 重复/相似的 {tool_name or 'tool'} 结果已合并；"
                            f"保留最近结果，历史副本 fingerprint={fp}。"
                        )
                        cleaned += 1
                        continue
                    seen_tool_fingerprints[semantic_key] = previous + 1

            # 1. Clear expired tool results (except recent ones)
            if block_type == "tool_result" and not is_recent:
                ts = block.get("_timestamp", 0)
                if ts > 0 and (now - ts) > tool_result_expiry_s:
                    original_content = block.get("content", "")
                    if isinstance(original_content, str) and len(original_content) > 100:
                        block["content"] = "[expired tool result]"
                        cleaned += 1

            # 2a. Code tool results — aggressively compress at lower threshold
            if block_type == "tool_result" and not is_recent:
                tool_use_id_2a = str(block.get("tool_use_id", "") or "")
                tool_name = tool_id_to_name.get(tool_use_id_2a, "") or str(block.get("tool_name", "") or "")
                result_content = block.get("content", "")
                if (
                    tool_name in CODE_TOOL_NAMES
                    and isinstance(result_content, str)
                    and len(result_content) > CODE_TOOL_THRESHOLD_CHARS
                ):
                    preview = result_content[:CODE_TOOL_PREVIEW_CHARS]
                    total = len(result_content)
                    block["content"] = (
                        f"{preview}\n\n... [{total} chars, {tool_name} result compressed by microcompact]"
                    )
                    cleaned += 1

            # 2b. Truncate large tool results to preview (generic)
            if block_type == "tool_result" and not is_recent:
                result_content = block.get("content", "")
                if isinstance(result_content, str) and len(result_content) > large_result_threshold:
                    preview = result_content[:preview_chars]
                    total = len(result_content)
                    block["content"] = (
                        f"{preview}\n\n... [{total} chars total, truncated by microcompact]"
                    )
                    cleaned += 1

            # 3. Remove old thinking blocks (except last 2 messages)
            if block_type in ("thinking", "redacted_thinking") and not is_recent:
                if len(block.get("thinking", "")) > 200:
                    block["thinking"] = "[thinking removed by microcompact]"
                    cleaned += 1

    if cleaned > 0:
        logger.debug("microcompact: cleaned %d blocks in %d messages", cleaned, total_messages)

    return messages


def snip_old_segments(
    messages: list[dict],
    *,
    max_groups: int = 50,
    snip_count: int = 5,
) -> tuple[list[dict], int]:
    """直接丢弃最早的 N 组对话段（History Snip）。

    零 LLM 调用成本，适用于超长对话的快速上下文释放。
    通过 user/assistant 消息对分组，移除最早的 N 组。

    Args:
        messages: 消息列表
        max_groups: 当组数超过此值时触发裁剪
        snip_count: 每次裁剪的组数

    Returns:
        (裁剪后的消息列表, 被移除的消息数量)
    """
    groups = _group_messages(messages)
    if len(groups) <= max_groups:
        return messages, 0

    to_snip = min(snip_count, len(groups) - 1)  # Keep at least 1 group
    snipped_msgs = 0
    for i in range(to_snip):
        snipped_msgs += len(groups[i])

    boundary_marker = {
        "role": "user",
        "content": f"[HISTORY_SNIP: removed {snipped_msgs} messages from {to_snip} conversation turns]",
        "_internal": False,
    }

    remaining = [boundary_marker]
    for group in groups[to_snip:]:
        remaining.extend(group)

    logger.info(
        "history_snip: removed %d messages (%d groups), %d remaining",
        snipped_msgs,
        to_snip,
        len(remaining),
    )
    return remaining, snipped_msgs


def _group_messages(messages: list[dict]) -> list[list[dict]]:
    """将消息按 user→assistant 对话轮次分组。

    每组以 user 消息开始，包含紧随的 assistant 消息和相关 tool_result。
    """
    groups: list[list[dict]] = []
    current: list[dict] = []

    for msg in messages:
        role = msg.get("role", "")
        if role == "user" and current:
            groups.append(current)
            current = []
        current.append(msg)

    if current:
        groups.append(current)

    return groups
