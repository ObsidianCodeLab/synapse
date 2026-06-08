import type { ReactNode } from "react";
import { isValidElement } from "react";

/**
 * react-markdown / MD 预览里 fenced code 的 children 常为 string、string[] 或嵌套 React 元素。
 * 禁止对数组用 String(children)，否则会变成 "a,b" 破坏换行与 Mermaid 语法。
 */
export function reactMarkdownCodeChildrenToText(children: ReactNode): string {
  if (children == null || children === false) return "";
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) {
    return children.map((c) => reactMarkdownCodeChildrenToText(c as ReactNode)).join("");
  }
  if (isValidElement(children)) {
    const ch = (children.props as { children?: ReactNode })?.children;
    return reactMarkdownCodeChildrenToText(ch);
  }
  return "";
}

/**
 * 去掉 BOM、统一换行、去掉文首空行；可选去掉首行「源码：」类前缀（大模型/导出常见）。
 */
export function normalizeMermaidSource(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  s = s.replace(/^\u200B+/, "").trim();
  s = s.replace(/^\s*\n+/, "");

  const lines = s.split("\n");
  if (lines.length > 0) {
    const first = lines[0];
    const stripped = first.replace(
      /^\s*(源码|源代碼|原始碼|源代码|Source code|Source)[:：]\s*/i,
      "",
    );
    if (stripped !== first) {
      lines[0] = stripped;
      while (lines.length && lines[0].trim() === "") lines.shift();
      s = lines.join("\n");
    }
  }

  return s.trim();
}
