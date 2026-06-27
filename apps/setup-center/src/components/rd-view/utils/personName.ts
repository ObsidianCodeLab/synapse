/** 人员姓名展示：默认取末 2 字，悬停显示全名 */
export function formatPersonDisplayName(name: string): string {
  const text = String(name ?? '').trim();
  if (!text) return '—';
  const chars = [...text];
  if (chars.length <= 2) return text;
  return chars.slice(-2).join('');
}

export function personNameTitle(fullName: string, displayName?: string): string | undefined {
  const full = String(fullName ?? '').trim();
  if (!full) return undefined;
  const short = displayName ?? formatPersonDisplayName(full);
  return full !== short ? full : undefined;
}
