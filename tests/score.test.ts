// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SUBJECTIVE_TYPES, isSubjective, recalcTotalScore } from '@/lib/score';

describe('SUBJECTIVE_TYPES', () => {
  it('interview / essay / code 均判定为主观题', () => {
    expect(isSubjective('interview')).toBe(true);
    expect(isSubjective('essay')).toBe(true);
    expect(isSubjective('code')).toBe(true);
  });

  it('客观题与未知类型不判为主观题', () => {
    expect(isSubjective('single')).toBe(false);
    expect(isSubjective('multiple')).toBe(false);
    expect(isSubjective('boolean')).toBe(false);
    expect(isSubjective('fill')).toBe(false);
    expect(isSubjective('')).toBe(false);
    expect(SUBJECTIVE_TYPES.has(undefined as any)).toBe(false);
  });
});

describe('recalcTotalScore', () => {
  it('空数组返回 0', () => {
    expect(recalcTotalScore([])).toBe(0);
  });

  it('主观题按 interviewScore(0-100)/100 折算并四舍五入', () => {
    const items = [
      { interviewScore: 70 },
      { interviewScore: 85 },
      { interviewScore: 66 },
    ];
    // (70 + 85 + 66) / 100 = 2.21 → 2
    expect(recalcTotalScore(items)).toBe(2);
  });

  it('客观题 correct=true 记 1 分', () => {
    const items = [
      { correct: true },
      { correct: false },
      { correct: true },
    ];
    expect(recalcTotalScore(items)).toBe(2);
  });

  it('manualScore 优先于 interviewScore 和 correct', () => {
    const items = [
      { manualScore: 0.5, interviewScore: 90, correct: true },
      { interviewScore: 80, correct: true },
      { correct: true },
    ];
    // 0.5 + 0.8 + 1 = 2.3 → 2
    expect(recalcTotalScore(items)).toBe(2);
  });

  it('全主观题试卷总分不再恒为 0（回归场景）', () => {
    // 14 道 essay + 1 道 code，AI 已评 interviewScore
    const items = Array.from({ length: 15 }, (_, i) => ({ interviewScore: 60 + i }));
    // 平均约 67 → 总分约 10.05 → 10
    const total = recalcTotalScore(items);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(15);
  });
});
