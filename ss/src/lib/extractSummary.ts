import type { ContentBlock, DebugCallEntry, LlmResponsePayload } from "./types";

/**
 * 剥离 text 块内嵌的思考内容（与 synapse response_handler.strip_thinking_tags 对齐）
 */
/** 思考块开闭标签（含 MiniMax 等开闭名不一致的写法） */
const THINKING_BLOCK_RES: RegExp[] = [
  /<thinking>[\s\S]*?<\/thinking>\s*/gi,
  /<think>[\s\S]*?<\/redacted_thinking>\s*/gi,
  // MiniMax：开 <think> 闭 </redacted_think>
  /<think>[\s\S]*?<\/think>\s*/gi,
  /<thinking>[\s\S]*?<\/think>\s*/gi,
  /<think>[\s\S]*?<\/thinking>\s*/gi,
];

export function stripThinkingTags(text: string): string {
  if (!text) return text;

  let cleaned = text;

  for (const re of THINKING_BLOCK_RES) {
    cleaned = cleaned.replace(re, "");
  }

  cleaned = cleaned.replace(
    /<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>\s*/gi,
    "",
  );
  cleaned = cleaned.replace(
    /<<\|tool_calls_section_begin\|>>[\s\S]*?<<\|tool_calls_section_end\|>>\s*/g,
    "",
  );
  cleaned = cleaned.replace(/<invoke\s[^>]*>[\s\S]*?<\/invoke>\s*/gi, "");

  cleaned = cleaned.replace(/<\/thinking>\s*/gi, "");
  cleaned = cleaned.replace(/<\/think>\s*/gi, "");
  cleaned = cleaned.replace(/<\/redacted_thinking>\s*/gi, "");
  cleaned = cleaned.replace(/<\/minimax:tool_call>\s*/gi, "");
  cleaned = cleaned.replace(/<<\|tool_calls_section_begin\|>>[\s\S]*$/g, "");
  cleaned = cleaned.replace(/<\?xml[^>]*\?>\s*/g, "");

  // 仅剥离未闭合的思考开标签到首个 think 闭合标签（避免误删其后正文）
  cleaned = cleaned.replace(
    /<(?:redacted_)?thinking>[\s\S]*?<\/(?:redacted_)?think(?:ing)?>\s*/gi,
    "",
  );

  return cleaned.trim();
}

export function extractTextFromContent(
  content: ContentBlock[] | undefined,
): string {
  if (!content?.length) return "";
  return content
    .filter((b) => b.type !== "thinking" && b.type === "text" && b.text)
    .map((b) => stripThinkingTags(b.text!))
    .filter((t) => t.length > 0)
    .join("\n\n");
}

export function extractToolUses(
  content: ContentBlock[] | undefined,
): { name: string; id?: string }[] {
  if (!content?.length) return [];
  return content
    .filter((b) => b.type === "tool_use" && b.name)
    .map((b) => ({ name: b.name!, id: b.id }));
}

export function extractThinkingSummary(
  content: ContentBlock[] | undefined,
): { count: number; totalChars: number; preview: string } | null {
  if (!content?.length) return null;
  const blocks = content.filter((b) => b.type === "thinking" && b.thinking);
  if (!blocks.length) return null;
  const combined = blocks.map((b) => b.thinking!).join("\n");
  const preview =
    combined.length > 120 ? `${combined.slice(0, 120)}…` : combined;
  return {
    count: blocks.length,
    totalChars: combined.length,
    preview,
  };
}

export function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function extractLastUserPreview(
  messages: unknown[] | undefined,
  maxLen = 120,
): string {
  if (!messages?.length) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.role !== "user") continue;
    const text = messageContentToString(msg.content);
    if (text) return truncate(text, maxLen);
  }
  return "";
}

function messageContentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") return b.text;
      if (typeof b.text === "string") return b.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function getResponsePayload(
  entry: DebugCallEntry,
): LlmResponsePayload | undefined {
  return entry.response?.llm_response;
}

export function getUsageLabel(entry: DebugCallEntry): string | null {
  const u = getResponsePayload(entry)?.usage;
  if (!u) return null;
  const inp = u.input_tokens ?? 0;
  const out = u.output_tokens ?? 0;
  if (!inp && !out) return null;
  return `in ${inp} / out ${out}`;
}

export function entryStatusLabel(entry: DebugCallEntry): string | null {
  if (!entry.hasResponse) return "仅有请求";
  if (!entry.hasRequest) return "仅有响应";
  return null;
}
