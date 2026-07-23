import { describe, it, expect } from 'vitest';
import { getExplainCost, EXPLAIN_COST_DEFAULT } from '@/lib/credits/explain-cost';

describe('getExplainCost', () => {
  it('简单 = 3', () => { expect(getExplainCost('简单')).toBe(3); });
  it('中等 = 5', () => { expect(getExplainCost('中等')).toBe(5); });
  it('困难 = 10', () => { expect(getExplainCost('困难')).toBe(10); });
  it('undefined -> 默认 5', () => { expect(getExplainCost(undefined)).toBe(EXPLAIN_COST_DEFAULT); });
  it('null -> 默认 5', () => { expect(getExplainCost(null)).toBe(EXPLAIN_COST_DEFAULT); });
  it('未知难度 -> 默认 5', () => { expect(getExplainCost('超难')).toBe(EXPLAIN_COST_DEFAULT); });
});