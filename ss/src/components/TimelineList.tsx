import type { DebugCallEntry } from "../lib/types";
import { CallCard } from "./CallCard";

interface TimelineListProps {
  entries: DebugCallEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TimelineList({ entries, selectedId, onSelect }: TimelineListProps) {
  if (!entries.length) {
    return (
      <div className="timeline-empty">
        <p>尚未加载记录。请选择 JSON 文件。</p>
      </div>
    );
  }

  return (
    <ol className="timeline-list">
      {entries.map((entry) => (
        <li key={entry.id} className="timeline-list__item">
          <CallCard
            entry={entry}
            selected={selectedId === entry.id}
            onSelect={() => onSelect(entry.id)}
          />
        </li>
      ))}
    </ol>
  );
}
