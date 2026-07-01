import type { ModelTokenUsageItem } from '@rd-view/types';

/** 模型分级默认定价（元/百万 Token，与 LLM pricing_tiers / pricing.py 口径一致） */
export const MODEL_UNIT_PRICE_BY_TIER = {
  high: 20,
  mid: 4,
  low: 0.1,
} as const;

/** 模型名 → 分级定价静态表（接口不再返回 model_price；子串模糊匹配，从 low 档起优先） */
export const MODEL_UNIT_PRICE_CATALOG = {
  /** 高级模型 · ¥20/百万Token */
  high: [
    'opus',
    'gpt-4',
    'o1',
    'o3',
    'glm-5',
  ],
  /** 中级模型 · ¥4/百万Token */
  mid: [
    'sonnet',
    'Qwen3.5',
    'gpt-4o-mini',
    'deepseek-v3',
    'deepseek-v4',
    'glm-4',
    'minimax',
    'composer',
  ],
  /** 低级模型 · ¥0.1/百万Token */
  low: [
    'qwen-turbo',
    'qwen2.5',
    'glm-3',
    'gpt-3.5',
    'local'
  ],
} as const;

const MODEL_PRICE_LOOKUP: Array<{ unitPrice: number; keys: readonly string[] }> = [
  { unitPrice: MODEL_UNIT_PRICE_BY_TIER.high, keys: MODEL_UNIT_PRICE_CATALOG.high },
  { unitPrice: MODEL_UNIT_PRICE_BY_TIER.mid, keys: MODEL_UNIT_PRICE_CATALOG.mid },
  { unitPrice: MODEL_UNIT_PRICE_BY_TIER.low, keys: MODEL_UNIT_PRICE_CATALOG.low },
];

/** 匹配顺序：low → mid → high，避免本地改名模型同时命中多档时取到过高定价 */
const MODEL_PRICE_LOOKUP_LOW_FIRST = [...MODEL_PRICE_LOOKUP].reverse();

function findLongestFuzzyKeyMatch(candidate: string, keys: readonly string[]): string | null {
  let matchedKey: string | null = null;
  for (const key of keys) {
    const keyLc = key.toLowerCase();
    if (!candidate.includes(keyLc)) continue;
    if (matchedKey === null || keyLc.length > matchedKey.length) {
      matchedKey = keyLc;
    }
  }
  return matchedKey;
}

function modelPricingCandidates(model: string): string[] {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return [];

  const candidates = [normalized];
  for (const sep of ['/', ':'] as const) {
    if (!normalized.includes(sep)) continue;
    const base = normalized.split(sep).filter(Boolean).pop();
    if (base && !candidates.includes(base)) {
      candidates.push(base);
    }
  }
  return candidates;
}

/** 按 model 名称解析单价（元/百万 Token）：先精确匹配，再子串模糊匹配（low → mid → high） */
export function resolveModelUnitPrice(model: string): number {
  const candidates = modelPricingCandidates(model);
  if (candidates.length === 0) return 0;

  for (const candidate of candidates) {
    for (const { unitPrice, keys } of MODEL_PRICE_LOOKUP_LOW_FIRST) {
      for (const key of keys) {
        if (candidate === key.toLowerCase()) return unitPrice;
      }
    }
  }

  for (const candidate of candidates) {
    for (const { unitPrice, keys } of MODEL_PRICE_LOOKUP_LOW_FIRST) {
      if (findLongestFuzzyKeyMatch(candidate, keys) !== null) {
        return unitPrice;
      }
    }
  }

  return 0;
}

/** 实际成本 = 使用量 / 1_000_000 × 定价（元/百万Token） */
export function calcModelTokenCost(tokens: number, unitPrice: number): number {
  return Math.round((tokens / 1_000_000) * unitPrice * 100) / 100;
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
  return `¥${unitPrice.toFixed(3)}/百万Token`;
}

export function formatCostYuan(cost: number): string {
  return `¥${cost.toFixed(2)}`;
}
