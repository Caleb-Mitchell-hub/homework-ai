import { describe, it, expect } from 'vitest';
import { buildReportPrompt } from '@/lib/ai/report-prompt';

describe('buildReportPrompt', () => {
  it('包含分数、总览、错题列表', () => {
    const p = buildReportPrompt({
      quizTitle: '前端小测',
      score: 8,
      totalScore: 10,
      byType: { single: { total: 3, correct: 2, correctRate: 0.67 } },
      byDifficulty: { 中等: { total: 3, correct: 2, correctRate: 0.67 } },
      wrongQuestions: [
        { index: 3, title: '什么是闭包', type: 'essay', userAnswer: '...', correctAnswer: '...' },
      ],
    });
    expect(p).toContain('前端小测');
    expect(p).toContain('8');
    expect(p).toContain('闭包');
    expect(p).toContain('essay');
  });

  it('包含输出 JSON 约束', () => {
    const p = buildReportPrompt({
      quizTitle: 't',
      score: 0,
      totalScore: 1,
      byType: {},
      byDifficulty: {},
      wrongQuestions: [],
    });
    expect(p).toContain('knowledgePoints');
    expect(p).toContain('advice');
  });

  it('空错题列表时仍能生成合理 prompt', () => {
    const p = buildReportPrompt({
      quizTitle: '满分卷',
      score: 10,
      totalScore: 10,
      byType: {},
      byDifficulty: {},
      wrongQuestions: [],
    });
    expect(p).toContain('满分卷');
    expect(p).toContain('10');
    expect(p).toContain('下一步');
  });
});