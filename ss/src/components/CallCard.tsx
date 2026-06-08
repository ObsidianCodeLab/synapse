import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DebugCallEntry } from "../lib/types";
import { extractTextFromContent, getResponsePayload } from "../lib/extractSummary";

interface CallCardProps {
  entry: DebugCallEntry;
  selected: boolean;
  onSelect: () => void;
}

export function CallCard({ entry, selected, onSelect }: CallCardProps) {
  const response = getResponsePayload(entry);
  const text = extractTextFromContent(response?.content);

  return (
    <article
      className={`call-card ${selected ? "call-card--selected" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <time className="call-card__time">{entry.displayTime}</time>

      <div className="call-card__body">
        {!entry.hasResponse ? (
          <p className="call-card__empty">（无响应文件）</p>
        ) : text ? (
          <div className="markdown-body call-card__markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        ) : (
          <p className="call-card__empty">（无文本输出）</p>
        )}
      </div>
    </article>
  );
}
