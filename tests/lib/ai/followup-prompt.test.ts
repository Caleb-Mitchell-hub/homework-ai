import { describe, it, expect } from 'vitest';
import { buildFollowUpPrompt } from '@/lib/ai/followup-prompt';

describe('buildFollowUpPrompt', () => {
  it('包含题目内容、类型', () => {
    const p = buildFollowUpPrompt({
      questionContent: '什么是闭包？',
      questionType: 'essay',
    });
    expect(p).toContain('什么是闭包？');
    expect(p).toContain('essay');
  });

  it('包含答案（提供时）', () => {
    const p = buildFollowUpPrompt({
      questionContent: '1+1=?',
      questionType: 'fill',
      answer: '2',
    });
    expect(p).toContain('2');
  });

  it('包含 AI 解析（提供时）', () => {
    const p = buildFollowUpPrompt({
      questionContent: 'test',
      questionType: 'single',
      aiExplanation: '这是解析内容',
    });
    expect(p).toContain('这是解析内容');
  });

  it('不包含答案字段（未提供时）', () => {
    const p = buildFollowUpPrompt({
      questionContent: 'test',
      questionType: 'boolean',
    });
    expect(p).not.toContain('正确答案');
  });

  it('包含引导语', () => {
    const p = buildFollowUpPrompt({
      questionContent: 'test',
      questionType: 'single',
    });
    expect(p).toContain('辅导老师');
    expect(p).toContain('markdown');
  });
});
