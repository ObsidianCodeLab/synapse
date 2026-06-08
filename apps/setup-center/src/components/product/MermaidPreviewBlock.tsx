import React, { useEffect, useId, useRef } from "react";

import { normalizeMermaidSource } from "./markdownCodeChildren";

export type MermaidPreviewBlockProps = {
  /** Mermaid 源码（含 ``` 内文本，不含围栏） */
  source: string;
  /** 与详情页 data-theme 一致，用于选择 mermaid 主题 */
  isDark: boolean;
};

/**
 * 在 Markdown 预览中将 ```mermaid 块渲染为 SVG（与 @uiw/react-md-editor 的 code 覆盖配合使用）。
 */
export function MermaidPreviewBlock({ source, isDark }: MermaidPreviewBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = normalizeMermaidSource(source.replace(/\n$/, ""));
    if (!chart) return;

    let cancelled = false;
    el.innerHTML =
      '<span class="text-xs text-muted-foreground animate-pulse">Mermaid…</span>';

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        
        // 自定义主题变量，参考截图风格优化配色
        const themeVariables = isDark
          ? {
              primaryColor: "rgba(32, 43, 34, 0.8)", // 深绿色背景 (节点)
              primaryBorderColor: "#33a06f", // 亮绿色边框 (节点)
              primaryTextColor: "#e2e8f0", // 浅灰文本
              lineColor: "#64748b", // 连接线颜色
              clusterBkg: "rgba(30, 30, 30, 0.4)", // subgraph 背景 (深灰/透明)
              clusterBorder: "#475569", // subgraph 边框
              nodeBorder: "#33a06f", // 统一节点边框
              textColor: "#e2e8f0",
              mainBkg: "transparent",
              edgeLabelBackground: "#1e293b", // 连线标签背景
              fontSize: "13px",
            }
          : {
              primaryColor: "rgba(240, 253, 244, 0.8)", // 浅绿背景
              primaryBorderColor: "#22c55e", // 绿色边框
              primaryTextColor: "#0f172a", // 深色文本
              lineColor: "#94a3b8", // 连接线
              clusterBkg: "rgba(248, 250, 252, 0.6)", // subgraph 浅灰透明背景
              clusterBorder: "#cbd5e1", // subgraph 边框
              nodeBorder: "#22c55e",
              textColor: "#0f172a",
              mainBkg: "transparent",
              edgeLabelBackground: "#f1f5f9",
              fontSize: "13px",
            };

        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables,
          securityLevel: "loose",
          fontFamily: "ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'",
        });
        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 11)}`;
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled && containerRef.current === el) {
          el.innerHTML = svg;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled && containerRef.current === el) {
          el.innerHTML = "";
          const pre = document.createElement("pre");
          pre.className =
            "m-0 whitespace-pre-wrap break-words rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive";
          pre.textContent = msg;
          el.appendChild(pre);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, isDark, reactId]);

  return (
    <div
      ref={containerRef}
      className="my-4 w-full min-w-0 overflow-x-auto rounded-md border border-border bg-muted/20 px-3 py-4 text-center [&_svg]:max-w-none [&_svg]:inline-block"
    />
  );
}
