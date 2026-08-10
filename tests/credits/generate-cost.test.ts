import { describe, it, expect } from 'vitest';
import {
  estimateGenerateCost,
  computeActualCost,
  GENERATE_UNIT_PRICES,
} from '@/lib/credits/generate-cost';

describe('GENERATE_UNIT_PRICES', () => {
  it('仅包含 ALLOWED_GENERATE_TYPES 的6种题型', () => {
    const keys = Object.keys(GENERATE_UNIT_PRICES).sort();
    expect(keys).toEqual([
      'boolean',
      'essay',
      'fill',
      'interview',
      'multiple',
      'single',
    ]);
  });

  it('代码题不在此列', () => {
    expect(GENERATE_UNIT_PRICES.code).toBeUndefined();
  });
});

describe('estimateGenerateCost', () => {
  it('全0返回0', () => {
    expect(
      estimateGenerateCost({
        single: 0,
        multiple: 0,
        boolean: 0,
        fill: 0,
        essay: 0,
        interview: 0,
      }),
    ).toBe(0);
  });

  it('单选题 5 题 = 10 积分', () => {
    expect(estimateGenerateCost({ single: 5 })).toBe(10);
  });

  it('单选题2 + 多选题2 + 判断题1 + 填空题3 + 简答题5 + 面试题8 = 2*2+2*2+1*1+3*3+5*5+8*8 = 101', () => {
    expect(
      estimateGenerateCost({
        single: 2,
        multiple: 2,
        boolean: 1,
        fill: 3,
        essay: 5,
        interview: 8,
      }),
    ).toBe(2 * 2 + 2 * 2 + 1 * 1 + 3 * 3 + 5 * 5 + 8 * 8);
  });

  it('未传入的 type 视为0', () => {
    expect(estimateGenerateCost({ single: 3 })).toBe(6);
  });

  it('count 为 null/undefined 忽略', () => {
    expect(estimateGenerateCost({ single: 3, boolean: null as any })).toBe(6);
  });
});

describe('computeActualCost', () => {
  it('0 字符返回 1(保底)', () => {
    expect(computeActualCost(0, 0)).toBe(1);
  });

  it('prompt 350字符 + 输出 700字符 = 1050/3.5 = 300 token / 100 = 3 积分', () => {
    expect(computeActualCost(350, 700)).toBe(3);
  });

  it('2 字符 = 1 token(向上取整) / 100 = 1(保底)', () => {
    expect(computeActualCost(1, 1)).toBe(1);
  });
});
