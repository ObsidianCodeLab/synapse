import type { ModelTokenUsageItem } from '@rd-view/types';

/** 模型分级默认定价（元/千 Token） */
export const MODEL_UNIT_PRICE_BY_TIER = {
  high: 20,
  mid: 4,
  low: 0.1,
} as const;

/** 模型名 → 分级定价静态表（接口不再返回 model_price） */
export const MODEL_UNIT_PRICE_CATALOG = {
  /** 高级模型 · ¥20/千Token */
  high: [
    'claude-opus-4',
    'claude-opus',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'o1-preview',
    'o1',
    'o3-mini',
    'o3',
    'deepseek-r1',
    'qwen-max',
    'glm-4-plus',
  ],
  /** 中级模型 · ¥4/千Token */
  mid: [
    'claude-sonnet-4',
    'claude-3-5-sonnet',
    'claude-sonnet',
    'gpt-4o-mini',
    'deepseek-v3',
    'deepseek-chat',
    'deepseek-v4-pro',
    'qwen-plus',
    'qwen2.5-72b',
    'glm-4',
    'glm-4-air',
  ],
  /** 低级模型 · ¥0.1/千Token */
  low: [
    'qwen-turbo',
    'qwen2.5-7b',
    'qwen2.5-14b',
    'glm-3-turbo',
    'glm-3',
    'gpt-3.5-turbo',
    'gpt-3.5',
    'deepseek-v2-lite',
    'deepseek-lite',
  ],
} as const;

const MODEL_PRICE_LOOKUP: Array<{ unitPrice: number; keys: readonly string[] }> = [
  { unitPrice: MODEL_UNIT_PRICE_BY_TIER.high, keys: MODEL_UNIT_PRICE_CATALOG.high },
  { unitPrice: MODEL_UNIT_PRICE_BY_TIER.mid, keys: MODEL_UNIT_PRICE_CATALOG.mid },
  { unitPrice: MODEL_UNIT_PRICE_BY_TIER.low, keys: MODEL_UNIT_PRICE_CATALOG.low },
];

/** 按 model 名称解析单价（元/千 Token）；未命中返回 0 */
export function resolveModelUnitPrice(model: string): number {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return 0;

  for (const { unitPrice, keys } of MODEL_PRICE_LOOKUP) {
    for (const key of keys) {
      if (normalized === key) return unitPrice;
    }
  }

  let matchedPrice = 0;
  let matchedKeyLength = 0;
  for (const { unitPrice, keys } of MODEL_PRICE_LOOKUP) {
    for (const key of keys) {
      if (normalized.includes(key) && key.length > matchedKeyLength) {
        matchedKeyLength = key.length;
        matchedPrice = unitPrice;
      }
    }
  }

  return matchedPrice;
}

/** 实际成本 = 使用量 / 1000 × 定价（元/千Token） */
export function calcModelTokenCost(tokens: number, unitPrice: number): number {
  return Math.round((tokens / 1000) * unitPrice * 100) / 100;
}

export function calcTotalTokens(items: ModelTokenUsageItem[]): number {
  return items.reduce((sum, item) => sum + item.tokens, 0);
}

export function formatTotalTokens(tokens: number): string {
  if (tokens >= 10000) {
    return `${(tokens / 10000).toFixed(1)}万`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return String(tokens);
}

export function formatTokenTick(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return `${(value / 1000).toFixed(0)}k`;
}

export function formatUnitPrice(unitPrice: number): string {
  return `¥${unitPrice.toFixed(3)}/千Token`;
}

export function formatCostYuan(cost: number): string {
  return `¥${cost.toFixed(2)}`;
}
