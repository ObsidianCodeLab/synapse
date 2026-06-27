/** 工作内容卡片可选表情；enjoy_id 为 1-based 序号，与后端保存字段对齐 */
export interface EnjoyEmojiItem {
  /** 序号（1-based，持久化 enjoy_id） */
  id: number;
  key: string;
  label: string;
  emoji: string;
}

export const ENJOY_EMOJI_ITEMS: readonly EnjoyEmojiItem[] = [
  { id: 1, key: 'like', label: '点赞', emoji: '👍' },
  { id: 2, key: 'dislike', label: '点踩', emoji: '👎' },
  { id: 3, key: 'urge', label: '催促', emoji: '⏰' },
  { id: 4, key: 'clap', label: '鼓掌', emoji: '👏' },
  { id: 5, key: 'salute', label: '抱拳', emoji: '🙏' },
  { id: 6, key: 'handshake', label: '握手', emoji: '🤝' },
  { id: 7, key: 'ok', label: 'OK', emoji: '👌' },
  { id: 8, key: 'flower', label: '送花花', emoji: '💐' },
  { id: 9, key: 'cheer', label: '加油干', emoji: '💪' },
  { id: 10, key: 'heart', label: '爱心', emoji: '❤️' },
  { id: 11, key: 'broken_heart', label: '心碎', emoji: '💔' },
  { id: 12, key: 'hundred', label: '100分', emoji: '💯' },
] as const;

/** enjoy_id 顺序对应的表情字符列表（兼容旧用法） */
export const ENJOY_EMOJI_CATALOG: readonly string[] = ENJOY_EMOJI_ITEMS.map((item) => item.emoji);

/** enjoy_id（1-based）→ 表情项 */
export function resolveEnjoyEmojiItem(enjoyId: string | number | null | undefined): EnjoyEmojiItem | undefined {
  const id = Number.parseInt(String(enjoyId ?? '').trim(), 10);
  if (!Number.isFinite(id) || id < 1) return undefined;
  return ENJOY_EMOJI_ITEMS.find((item) => item.id === id);
}

/** enjoy_id（1-based 字符串）→ 表情字符 */
export function enjoyIdToEmoji(enjoyId: string | number | null | undefined): string {
  return resolveEnjoyEmojiItem(enjoyId)?.emoji ?? '❓';
}

/** enjoy_id（1-based 字符串）→ 中文标签 */
export function enjoyIdToLabel(enjoyId: string | number | null | undefined): string {
  return resolveEnjoyEmojiItem(enjoyId)?.label ?? '';
}

/** 表情字符 → enjoy_id（1-based 字符串） */
export function emojiToEnjoyId(emoji: string): string {
  const item = ENJOY_EMOJI_ITEMS.find((entry) => entry.emoji === emoji);
  return item ? String(item.id) : '1';
}

export function isSameEmployeeId(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a ?? '').trim() === String(b ?? '').trim();
}
