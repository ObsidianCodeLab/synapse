import type {
  DebugCallEntry,
  LoadedDebugFile,
  ParseResult,
  ParsedFileName,
  RequestDebugJson,
  ResponseDebugJson,
} from "./types";

const FILE_RE = /^llm_(request|response)_(\d{8}_\d{6})_([0-9a-f]{8})\.json$/i;

export function parseFileName(fileName: string): ParsedFileName | null {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const m = base.match(FILE_RE);
  if (!m) return null;
  return {
    kind: m[1].toLowerCase() as "request" | "response",
    fileTimestamp: m[2],
    requestId: m[3].toLowerCase(),
  };
}

function fileTimestampToIso(fileTs: string): string {
  const [date, time] = fileTs.split("_");
  if (!date || !time || date.length !== 8 || time.length !== 6) {
    return new Date(0).toISOString();
  }
  const y = date.slice(0, 4);
  const mo = date.slice(4, 6);
  const d = date.slice(6, 8);
  const h = time.slice(0, 2);
  const mi = time.slice(2, 4);
  const s = time.slice(4, 6);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function pickTimestamp(
  jsonTs: string | undefined,
  fileTs: string,
): string {
  if (jsonTs) {
    const d = new Date(jsonTs);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fileTimestampToIso(fileTs);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file, "UTF-8");
  });
}

export async function loadDebugFiles(files: File[]): Promise<{
  loaded: LoadedDebugFile[];
  errors: string[];
}> {
  const loaded: LoadedDebugFile[] = [];
  const errors: string[] = [];

  await Promise.all(
    files.map(async (file) => {
      const parsed = parseFileName(file.name);
      if (!parsed) {
        errors.push(`${file.name}：文件名不符合 llm_request_* / llm_response_* 格式`);
        return;
      }
      try {
        const text = await readFileAsText(file);
        const raw = JSON.parse(text) as RequestDebugJson | ResponseDebugJson;
        const jsonTs = raw.timestamp;
        loaded.push({
          fileName: file.name,
          kind: parsed.kind,
          requestId: parsed.requestId,
          fileTimestamp: parsed.fileTimestamp,
          timestamp: pickTimestamp(jsonTs, parsed.fileTimestamp),
          raw,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${file.name}：${msg}`);
      }
    }),
  );

  return { loaded, errors };
}

function mergeLoadedFiles(loaded: LoadedDebugFile[]): DebugCallEntry[] {
  const byId = new Map<string, DebugCallEntry>();

  for (const f of loaded) {
    let entry = byId.get(f.requestId);
    if (!entry) {
      entry = {
        id: f.requestId,
        requestId: f.requestId,
        sortTimestamp: f.timestamp,
        displayTime: "",
        caller: "",
        hasRequest: false,
        hasResponse: false,
      };
      byId.set(f.requestId, entry);
    }

    if (f.kind === "request") {
      entry.hasRequest = true;
      entry.request = f.raw as RequestDebugJson;
      entry.requestFileName = f.fileName;
      if (!entry.hasResponse) {
        entry.sortTimestamp = f.timestamp;
      }
      if (!entry.caller && f.raw.caller) {
        entry.caller = f.raw.caller;
      }
    } else {
      entry.hasResponse = true;
      entry.response = f.raw as ResponseDebugJson;
      entry.responseFileName = f.fileName;
      entry.sortTimestamp = f.timestamp;
      if (f.raw.caller) {
        entry.caller = f.raw.caller;
      } else if (
        !entry.caller &&
        (f.raw as ResponseDebugJson).request_id
      ) {
        entry.caller = "";
      }
    }
  }

  const entries = Array.from(byId.values());
  for (const e of entries) {
    if (e.hasResponse && e.response?.timestamp) {
      e.sortTimestamp = pickTimestamp(
        e.response.timestamp,
        e.responseFileName
          ? (parseFileName(e.responseFileName)?.fileTimestamp ?? "")
          : "",
      );
    } else if (e.hasRequest && e.request?.timestamp) {
      e.sortTimestamp = pickTimestamp(
        e.request.timestamp,
        e.requestFileName
          ? (parseFileName(e.requestFileName)?.fileTimestamp ?? "")
          : "",
      );
    }
    if (!e.caller) {
      e.caller =
        e.response?.caller ?? e.request?.caller ?? "unknown";
    }
    e.displayTime = formatDisplayTime(e.sortTimestamp);
  }

  entries.sort((a, b) => a.sortTimestamp.localeCompare(b.sortTimestamp));
  return entries;
}

export function formatDisplayTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export async function parseDebugFiles(files: File[]): Promise<ParseResult> {
  const { loaded, errors } = await loadDebugFiles(files);
  const entries = mergeLoadedFiles(loaded);
  return { entries, errors };
}
