// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseScore } from '@/lib/ai/grading-prompt';

describe('parseScore', () => {
  it('number 直接取整并夹紧到 0-100', () => {
    expect(parseScore(85)).toBe(85);
    expect(parseScore(85.6)).toBe(86);
    expect(parseScore(-10)).toBe(0);
    expect(parseScore(150)).toBe(100);
  });

  it('数字字符串可解析', () => {
    expect(parseScore('85')).toBe(85);
    expect(parseScore('85.6')).toBe(86);
  });

  it('带单位/分数格式可解析', () => {
    expect(parseScore('85分')).toBe(85);
    expect(parseScore('85/100')).toBe(85);
  });

  it('非法输入返回 0', () => {
    expect(parseScore('无')).toBe(0);
    expect(parseScore(undefined)).toBe(0);
    expect(parseScore(null)).toBe(0);
    expect(parseScore(NaN)).toBe(0);
  });
});
