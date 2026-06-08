import { useCallback, useRef, useState } from "react";

interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  fileCount: number;
  loading: boolean;
}

export function FileDropZone({ onFiles, fileCount, loading }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      const jsonFiles = Array.from(list).filter(
        (f) => f.name.endsWith(".json") || f.type === "application/json",
      );
      if (jsonFiles.length) onFiles(jsonFiles);
    },
    [onFiles],
  );

  return (
    <div
      className={`drop-zone ${dragOver ? "drop-zone--active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        multiple
        className="drop-zone__input"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <p className="drop-zone__title">选择或拖入 LLM Debug JSON</p>
      <p className="drop-zone__hint">
        支持多选 <code>llm_request_*.json</code> 与 <code>llm_response_*.json</code>
      </p>
      <button
        type="button"
        className="btn btn--primary"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        {loading ? "解析中…" : "选择文件"}
      </button>
      {fileCount > 0 && (
        <p className="drop-zone__meta">已加载 {fileCount} 条时间线记录</p>
      )}
    </div>
  );
}
