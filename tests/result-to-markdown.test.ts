// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resultToMarkdown, ALL_SECTIONS } from '@/lib/result-to-markdown';

const questions = [
  { id: 'q1', type: 'single', title: '1+1=?', options: ['1', '2'], difficulty: '简单', correctAnswer: 'B', referenceAnswer: '', answer: '' },
] as any;

const items = [
  { questionId: 'q1', correct: true, correctAnswer: 'B', userAnswer: 'B', autoGraded: true },
] as any;

describe('resultToMarkdown', () => {
  it('包含标题、得分与用户答案', () => {
    const md = resultToMarkdown({
      result: { name: '测试记录', score: 5, totalScore: 5, submittedAt: new Date('2026-08-14').toISOString(), items },
      quiz: { title: '测试题库', questions },
      explanations: {}, followups: {}, notes: [], report: null,
      sections: ALL_SECTIONS,
    });
    expect(md).toContain('# 测试记录');
    expect(md).toContain('5/5');
    expect(md).toContain('你的答案');
    expect(md).toContain('B');
  });

  it('sections 关闭后不输出对应块', () => {
    const md = resultToMarkdown({
      result: { name: 'r', score: 0, totalScore: 5, submittedAt: '', items },
      quiz: { title: 't', questions },
      explanations: {}, followups: {}, notes: [], report: null,
      sections: { question: true, userAnswer: false, correctAnswer: false, aiScore: false, aiExplain: false, notes: false, followups: false, report: false },
    });
    expect(md).not.toContain('你的答案');
    expect(md).toContain('1+1=?');
  });

  it('question 关闭后题干不输出', () => {
    const md = resultToMarkdown({
      result: { name: 'r', score: 0, totalScore: 5, submittedAt: '', items },
      quiz: { title: 't', questions },
      explanations: {}, followups: {}, notes: [], report: null,
      sections: { question: false, userAnswer: true, correctAnswer: true, aiScore: true, aiExplain: true, notes: true, followups: true, report: true },
    });
    expect(md).not.toContain('1+1=?');
    expect(md).not.toContain('### 选项');
  });
});
