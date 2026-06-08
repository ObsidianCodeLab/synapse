export interface FormattedMessage {
  role: string;
  text: string;
  isMultimodal: boolean;
}

export function formatMessages(messages: unknown[] | undefined): FormattedMessage[] {
  if (!messages?.length) return [];
  return messages.map((raw) => {
    const msg = raw as Record<string, unknown>;
    const role = String(msg.role ?? "unknown");
    const content = msg.content;
    if (typeof content === "string") {
      return { role, text: content, isMultimodal: false };
    }
    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const block of content) {
        if (typeof block === "string") {
          parts.push(block);
          continue;
        }
        const b = block as Record<string, unknown>;
        const type = String(b.type ?? "");
        if (type === "text" && typeof b.text === "string") {
          parts.push(b.text);
        } else if (type === "tool_use") {
          parts.push(
            `[tool_use] ${b.name ?? "?"} ${JSON.stringify(b.input ?? {}, null, 0)}`,
          );
        } else if (type === "tool_result") {
          parts.push(`[tool_result] ${String(b.content ?? b.tool_use_id ?? "")}`);
        } else if (type === "image" || type === "image_url") {
          parts.push(`[${type}]`);
        } else {
          parts.push(JSON.stringify(block, null, 2));
        }
      }
      return {
        role,
        text: parts.join("\n\n"),
        isMultimodal: parts.some((p) => p.startsWith("[image")),
      };
    }
    if (content != null) {
      return {
        role,
        text: JSON.stringify(content, null, 2),
        isMultimodal: false,
      };
    }
    return { role, text: "", isMultimodal: false };
  });
}

export function formatToolNames(tools: unknown[] | undefined): string[] {
  if (!tools?.length) return [];
  return tools.map((t) => {
    if (typeof t === "object" && t !== null && "name" in t) {
      return String((t as { name: string }).name);
    }
    return String(t);
  });
}

export function stringifyJson(value: unknown, indent = 2): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return String(value);
  }
}
