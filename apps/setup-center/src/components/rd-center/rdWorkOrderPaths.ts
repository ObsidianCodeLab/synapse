/** 与后端 `rd_terminal::transcripts::sanitize_work_order_segment` 对齐（路径段）。 */
const MAX_LEN = 120;

export function sanitizeWorkOrderSegment(raw: string): string {
  const t = (raw || "").trim() || "default";
  const base = t.split(/[/\\]/).pop() || t;
  let out = "";
  for (const c of base) {
    if (/^[a-zA-Z0-9_-]$/.test(c)) out += c;
    else if (/\s/.test(c)) {
      if (!out.endsWith("_")) out += "_";
    } else if (!/[\u0000-\u001f]/.test(c)) out += "_";
  }
  let s = out.replace(/^_+|_+$/g, "");
  if (!s || s === "." || s === "..") s = "default";
  if (s.length > MAX_LEN) s = s.slice(0, MAX_LEN);
  return s;
}

export function rdSessionNameForWorkOrderId(workOrderId: string): string {
  return `synapse-work-${sanitizeWorkOrderSegment(workOrderId)}`;
}

export function rdProjectPathForWorkOrder(homeDir: string, workOrderId: string): string {
  const seg = sanitizeWorkOrderSegment(workOrderId);
  const sep = homeDir.includes("\\") ? "\\" : "/";
  return `${homeDir}${sep}.synapse${sep}work${sep}${seg}`;
}
