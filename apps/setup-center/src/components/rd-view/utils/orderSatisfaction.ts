import type { OrderSatisfactionDetailItem } from '@rd-view/types';

/** 满意度得分（5 分制）= 满意工单数 / 已完成工单数 × 5（未评价与满意合并计分） */
export function calcOrderSatisfactionScore(items: OrderSatisfactionDetailItem[]): number {
  if (items.length === 0) return 0;
  const satisfiedCount = items.filter((item) => item.liked !== false).length;
  return Math.round((satisfiedCount / items.length) * 50) / 10;
}

export function formatOrderSatisfactionScore(score: number): string {
  return `${score.toFixed(1)}/5.0`;
}
