/** 从 Rust 下载日志中解析最近一次百分比，例如 `(45.0%)`。 */
export function parseCursorAgentInstallPercent(log: string): number | null {
  const matches = [...log.matchAll(/\((\d+(?:\.\d+)?)%\)/g)];
  if (matches.length === 0) return null;
  const raw = matches[matches.length - 1]?.[1];
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}
