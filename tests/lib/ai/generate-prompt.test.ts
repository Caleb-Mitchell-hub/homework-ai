import { describe, it, expect } from 'vitest';
import {
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
  ALLOWED_GENERATE_TYPES,
} from '@/lib/ai/generate-prompt';

describe('ALLOWED_GENERATE_TYPES', () => {
  it('包含 6 种题型, 不含 code', () => {
    expect(ALLOWED_GENERATE_TYPES).toEqual([
      'single',
      'multiple',
      'boolean',
      'fill',
      'essay',
      'interview',
    ]);
    expect(ALLOWED_GENERATE_TYPES).not.toContain('code');
  });
});

describe('buildGenerateSystemPrompt', () => {
  it('包含题型名称', () => {
    const p = buildGenerateSystemPrompt();
    expect(p).toContain('单选题');
    expect(p).toContain('多选题');
    expect(p).toContain('判断题');
    expect(p).toContain('填空题');
    expect(p).toContain('简答题');
    expect(p).toContain('面试题');
  });

  it('包含 JSON 输出格式', () => {
    const p = buildGenerateSystemPrompt();
    expect(p).toContain('JSON');
    expect(p).toContain('"questions"');
  });

  it('包含质量要求', () => {
    const p = buildGenerateSystemPrompt();
    expect(p).toContain('难度');
  });
});

describe('buildGenerateUserPrompt', () => {
  it('包含主题内容', () => {
    const p = buildGenerateUserPrompt('计算机网络', {
      single: 2,
      multiple: 0,
      boolean: 0,
      fill: 0,
      essay: 0,
      interview: 0,
    });
    expect(p).toContain('计算机网络');
  });

  it('包含题型和数量', () => {
    const p = buildGenerateUserPrompt('测试', {
      single: 3,
      multiple: 0,
      boolean: 0,
      fill: 0,
      essay: 0,
      interview: 0,
    });
    expect(p).toContain('单选题');
    expect(p).toContain('3 题');
    expect(p).toContain('共计 3 题');
  });

  it('数量为0的题型不出现在生成指令中', () => {
    const p = buildGenerateUserPrompt('主题', {
      single: 1,
      multiple: 0,
      boolean: 0,
      fill: 0,
      essay: 0,
      interview: 0,
    });
    // 生成指令中只列出了单选题
    expect(p).toContain('- 单选题：1 题');
    // 不会列出其他题型(它们只出现在"不要生成"中)
    expect(p).not.toMatch(/^- (多选题|判断题|填空题|简答题|面试题)/m);
  });

  it('包含不要生成的题型提示', () => {
    const p = buildGenerateUserPrompt('主题', {
      single: 3,
      multiple: 0,
      boolean: 0,
      fill: 0,
      essay: 0,
      interview: 0,
    });
    expect(p).toContain('不要生成');
    expect(p).toContain('多选题');
  });

  it('全部有值时不出不要生成', () => {
    const p = buildGenerateUserPrompt('主题', {
      single: 1,
      multiple: 1,
      boolean: 1,
      fill: 1,
      essay: 1,
      interview: 1,
    });
    expect(p).not.toContain('不要生成');
  });

  it('总数为各题型之和', () => {
    const p = buildGenerateUserPrompt('主题', {
      single: 1,
      multiple: 2,
      boolean: 3,
      fill: 4,
      essay: 5,
      interview: 6,
    });
    expect(p).toContain('共计 21 题');
  });
});
