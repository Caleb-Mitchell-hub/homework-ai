import { describe, it, expect } from 'vitest';
import { buildGradingPrompt } from '@/lib/ai/grading-prompt';

describe('buildGradingPrompt', () => {
  it('包含题目内容、题型、参考答案', () => {
    const p = buildGradingPrompt({
      questionContent: '请解释闭包',
      questionType: 'essay',
      referenceAnswer: '闭包是指...',
      userAnswer: '闭包是函数',
    });
    expect(p).toContain('请解释闭包');
    expect(p).toContain('essay');
    expect(p).toContain('闭包是指...');
    expect(p).toContain('闭包是函数');
  });

  it('包含输出 JSON 格式约束', () => {
    const p = buildGradingPrompt({
      questionContent: 'test',
      questionType: 'essay',
      referenceAnswer: 'r',
      userAnswer: 'u',
    });
    expect(p).toContain('JSON');
    expect(p).toContain('comment');
  });

  it('代码题时包含代码相关引导', () => {
    const p = buildGradingPrompt({
      questionContent: '实现两数之和',
      questionType: 'code',
      referenceAnswer: 'def add(a,b): return a+b',
      userAnswer: 'def add(a,b): pass',
      language: 'python',
    });
    expect(p).toContain('python');
    expect(p).toContain('代码');
  });

  it('面试题时引导关注要点', () => {
    const p = buildGradingPrompt({
      questionContent: '自我介绍',
      questionType: 'interview',
      referenceAnswer: '建议突出技术栈',
      userAnswer: '你好,我是张三',
    });
    expect(p).toContain('面试');
    expect(p).toContain('要点');
  });
});