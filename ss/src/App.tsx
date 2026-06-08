import { useCallback, useState } from "react";
import { DetailPanel } from "./components/DetailPanel";
import { FileDropZone } from "./components/FileDropZone";
import { TimelineList } from "./components/TimelineList";
import { parseDebugFiles } from "./lib/parseDebugFiles";
import type { DebugCallEntry } from "./lib/types";

export default function App() {
  const [entries, setEntries] = useState<DebugCallEntry[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedEntry =
    entries.find((e) => e.id === selectedId) ?? null;

  const handleFiles = useCallback(async (files: File[]) => {
    setLoading(true);
    try {
      const result = await parseDebugFiles(files);
      setEntries(result.entries);
      setErrors(result.errors);
      setSelectedId((prev) => {
        if (prev && result.entries.some((e) => e.id === prev)) return prev;
        return result.entries[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearAll = () => {
    setEntries([]);
    setErrors([]);
    setSelectedId(null);
  };

  return (
    <div className={`app ${selectedEntry ? "app--with-detail" : ""}`}>
      <header className="app-header">
        <h1 className="app-header__title">LLM Debug 时间线</h1>
        <p className="app-header__desc">
          列表仅显示时间与模型输出；点击条目查看系统提示词与请求内容
        </p>
      </header>

      {errors.length > 0 && (
        <div className="error-banner" role="alert">
          <strong>部分文件未能解析：</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <FileDropZone
        onFiles={handleFiles}
        fileCount={entries.length}
        loading={loading}
      />

      {entries.length > 0 && (
        <div className="toolbar">
          <button type="button" className="btn btn--ghost" onClick={clearAll}>
            清空
          </button>
        </div>
      )}

      <main className="app-main">
        <div className="app-main__timeline">
          <TimelineList
            entries={entries}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        {selectedEntry && (
          <DetailPanel
            entry={selectedEntry}
            onClose={() => setSelectedId(null)}
          />
        )}
      </main>
    </div>
  );
}
