import type { DemandEnjoyComment } from '@rd-view/types';
import { isSameEmployeeId } from '@rd-view/utils/enjoyEmojiCatalog';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapDemandEnjoyCommentItem(item: Record<string, unknown>): DemandEnjoyComment | null {
  const assigneeId = String(item.assignee_id ?? '').trim();
  const enjoyId = String(item.enjoy_id ?? '').trim();
  if (!assigneeId || !enjoyId) return null;

  return {
    assignee: String(item.assignee ?? '').trim(),
    assigneeId,
    enjoyId,
  };
}

/** 解析 `feedback_type` JSON 串或数组 → 表情评论列表 */
export function parseDemandEnjoyFeedback(raw: unknown): DemandEnjoyComment[] {
  if (raw == null || raw === '') return [];

  if (Array.isArray(raw)) {
    return raw
      .filter(isRecord)
      .map((item) => mapDemandEnjoyCommentItem(item))
      .filter((item): item is DemandEnjoyComment => item != null);
  }

  const text = String(raw).trim();
  if (!text || text === '[]') return [];

  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecord)
      .map((item) => mapDemandEnjoyCommentItem(item))
      .filter((item): item is DemandEnjoyComment => item != null);
  } catch {
    return [];
  }
}

/** 表情评论列表 → 后端 `feedback_type` JSON 串 */
export function serializeDemandEnjoyFeedback(comments: DemandEnjoyComment[]): string {
  const wire = comments.map((item) => ({
    assignee: item.assignee,
    assignee_id: item.assigneeId,
    enjoy_id: item.enjoyId,
  }));
  return JSON.stringify(wire);
}

/** 合并当前用户表情：存在则替换，不存在则追加（仅改本人） */
export function mergeOwnEnjoyComment(
  base: DemandEnjoyComment[],
  enjoyId: string,
  currentEmployeeId: string,
  currentUserName: string,
): DemandEnjoyComment[] {
  const next = [...base];
  const idx = next.findIndex((item) => isSameEmployeeId(item.assigneeId, currentEmployeeId));
  const entry: DemandEnjoyComment = {
    assignee: currentUserName,
    assigneeId: currentEmployeeId,
    enjoyId,
  };
  if (idx >= 0) {
    next[idx] = entry;
  } else {
    next.push(entry);
  }
  return next;
}
