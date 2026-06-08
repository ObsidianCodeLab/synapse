import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentBlock, DebugCallEntry } from "../lib/types";
import { extractTextFromContent, stripThinkingTags } from "../lib/extractSummary";
import { formatMessages, formatToolNames, stringifyJson } from "../lib/formatMessages";

interface DetailPanelProps {
  entry: DebugCallEntry | null;
  onClose: () => void;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="detail-section">
      <button
        type="button"
        className="detail-section__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="detail-section__chevron">{open ? "▼" : "▶"}</span>
        {title}
      </button>
      {open && <div className="detail-section__body">{children}</div>}
    </section>
  );
}

function ResponseBlocksView({ blocks }: { blocks: ContentBlock[] }) {
  const visible = blocks.filter((b) => b.type !== "thinking");
  return (
    <div className="content-blocks">
      {visible.map((block, i) => {
        if (block.type === "text" && block.text) {
          const visible = stripThinkingTags(block.text);
          if (!visible) return null;
          return (
            <div key={i} className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{visible}</ReactMarkdown>
            </div>
          );
        }
        if (block.type === "tool_use") {
          let inputPretty = block.input ?? "";
          try {
            const parsed = JSON.parse(block.input ?? "{}");
            inputPretty = JSON.stringify(parsed, null, 2);
          } catch {
            /* keep raw */
          }
          return (
            <div key={i} className="tool-block">
              <div className="tool-block__head">
                <span className="tool-chip">{block.name}</span>
                {block.id && <code className="tool-block__id">{block.id}</code>}
              </div>
              <pre className="detail-pre">{inputPretty}</pre>
            </div>
          );
        }
        if (block.type === "thinking") {
          return null;
        }
        return (
          <pre key={i} className="detail-pre">
            {stringifyJson(block)}
          </pre>
        );
      })}
    </div>
  );
}

export function DetailPanel({ entry, onClose }: DetailPanelProps) {
  if (!entry) return null;

  const req = entry.request?.llm_request;
  const res = entry.response?.llm_response;
  const messages = formatMessages(req?.messages);
  const toolNames = formatToolNames(req?.tools);

  const copyPayload = () => {
    const payload = {
      requestId: entry.requestId,
      request: entry.request,
      response: entry.response,
    };
    void navigator.clipboard.writeText(stringifyJson(payload));
  };

  return (
    <aside className="detail-panel" role="dialog" aria-label="调用详情">
      <header className="detail-panel__head">
        <div>
          <h2 className="detail-panel__title">调用详情</h2>
          <p className="detail-panel__sub">
            {entry.displayTime} · #{entry.requestId}
          </p>
        </div>
        <div className="detail-panel__actions">
          <button type="button" className="btn btn--ghost" onClick={copyPayload}>
            复制 JSON
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
      </header>

      <div className="detail-panel__scroll">
        {entry.hasRequest && (
          <CollapsibleSection
            title={
              req?.system
                ? `系统提示词（${req.system.length} 字）`
                : "系统提示词"
            }
            defaultOpen
          >
            {req?.system ? (
              <pre className="detail-pre detail-pre--system">{req.system}</pre>
            ) : (
              <p className="detail-muted">无 system 字段</p>
            )}
          </CollapsibleSection>
        )}

        {entry.hasRequest && messages.length > 0 && (
          <CollapsibleSection title="请求内容" defaultOpen>
            <div className="message-list">
              {messages.map((m, i) => (
                <div key={i} className={`message-bubble message-bubble--${m.role}`}>
                  <span className="message-bubble__role">{m.role}</span>
                  <pre className="message-bubble__text">{m.text || "（空）"}</pre>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {entry.hasRequest && !messages.length && (
          <CollapsibleSection title="请求内容" defaultOpen>
            <p className="detail-muted">无 messages 字段</p>
          </CollapsibleSection>
        )}

        {entry.hasResponse && res?.content && (
          <CollapsibleSection title="大模型输出" defaultOpen>
            <ResponseBlocksView blocks={res.content} />
            {!extractTextFromContent(res.content) && (
              <p className="detail-muted">无 text 类型输出块</p>
            )}
          </CollapsibleSection>
        )}

        <CollapsibleSection title="概览">
          <dl className="detail-dl">
            <dt>caller</dt>
            <dd>{entry.caller}</dd>
            <dt>请求文件</dt>
            <dd>{entry.requestFileName ?? "—"}</dd>
            <dt>响应文件</dt>
            <dd>{entry.responseFileName ?? "—"}</dd>
            <dt>模型</dt>
            <dd>{res?.model ?? "—"}</dd>
            <dt>停止原因</dt>
            <dd>{res?.stop_reason ?? "—"}</dd>
            <dt>Token</dt>
            <dd>
              {res?.usage
                ? `输入 ${res.usage.input_tokens ?? 0} / 输出 ${res.usage.output_tokens ?? 0}`
                : "—"}
            </dd>
          </dl>
          {entry.request?.stats && (
            <>
              <h4 className="detail-h4">请求统计</h4>
              <pre className="detail-pre detail-pre--compact">
                {stringifyJson(entry.request.stats)}
              </pre>
            </>
          )}
          {(entry.request?.context || entry.response?.context) && (
            <>
              <h4 className="detail-h4">Context</h4>
              <pre className="detail-pre detail-pre--compact">
                {stringifyJson(entry.request?.context ?? entry.response?.context)}
              </pre>
            </>
          )}
        </CollapsibleSection>

        {entry.hasRequest && toolNames.length > 0 && (
          <CollapsibleSection title={`工具定义（${toolNames.length}）`}>
            <ul className="tool-name-list">
              {toolNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <details className="detail-details">
              <summary>完整 tools JSON</summary>
              <pre className="detail-pre">{stringifyJson(req?.tools)}</pre>
            </details>
          </CollapsibleSection>
        )}

        <CollapsibleSection title="原始 JSON">
          <pre className="detail-pre detail-pre--raw">
            {stringifyJson({
              request: entry.request,
              response: entry.response,
            })}
          </pre>
        </CollapsibleSection>
      </div>
    </aside>
  );
}
