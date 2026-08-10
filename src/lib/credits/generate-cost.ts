const CHARS_PER_TOKEN = 3.5;
const TOKENS_PER_CREDIT = 100;

/** 每题型单价（积分/题） */
export const GENERATE_UNIT_PRICES: Record<string, number> = {
  single: 2,
  multiple: 2,
  boolean: 1,
  fill: 3,
  essay: 5,
  interview: 8,
};

/** 按题型数量计算预估积分 */
export function estimateGenerateCost(counts: Record<string, number>): number {
  let total = 0;
  for (const [type, count] of Object.entries(counts)) {
    const unit = GENERATE_UNIT_PRICES[type];
    if (unit && typeof count === 'number' && count > 0) {
      total += unit * count;
    }
  }
  return total;
}

/** 按字符数估算 token 消耗，并换算为积分（ceil） */
export function computeActualCost(promptChars: number, contentChars: number): number {
  const estimatedTokens =
    Math.ceil(promptChars / CHARS_PER_TOKEN) + Math.ceil(contentChars / CHARS_PER_TOKEN);
  return Math.max(1, Math.ceil(estimatedTokens / TOKENS_PER_CREDIT));
}
