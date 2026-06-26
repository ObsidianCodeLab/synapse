import type { OrderSatisfactionDetailItem } from '@rd-view/types';

/** 满意度得分（5 分制）= 点赞数 / 已评价工单数 × 5（未评价不参与计分） */
export function calcOrderSatisfactionScore(items: OrderSatisfactionDetailItem[]): number {
  const rated = items.filter((item) => item.liked != null);
  if (rated.length === 0) return 0;
  const likeCount = rated.filter((item) => item.liked === true).length;
  return Math.round((likeCount / rated.length) * 50) / 10;
}

export function formatOrderSatisfactionScore(score: number): string {
  return `${score.toFixed(1)}/5.0`;
}
