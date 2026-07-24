// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportView from '@/components/ReportView';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

const mockStats = {
  overview: { score: 5, totalScore: 10, correctRate: 0.5, correctCount: 5, wrongCount: 4, unansweredCount: 1 },
  byType: { single: { total: 5, correct: 3, correctRate: 0.6 } },
  byDifficulty: { noDifficultyCount: 0 },
};

describe('ReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无 AI 报告时显示「AI 生成报告」按钮', () => {
    const { container } = render(
      <ReportView resultId="r1" stats={mockStats} quizTitle="测试" />,
    );
    expect(container.textContent).toContain('AI 生成报告');
  });

  it('有 initialReport 时显示 advice + knowledgePoints', () => {
    const { container } = render(
      <ReportView
        resultId="r1"
        stats={mockStats}
        quizTitle="测试"
        initialReport={{
          knowledgePoints: [{ tag: '闭包', relatedQuestions: [1] }],
          advice: '学学闭包',
        }}
      />,
    );
    expect(container.textContent).toContain('闭包');
    expect(container.textContent).toContain('学学闭包');
  });

  it('显示总览数据', () => {
    const { container } = render(
      <ReportView resultId="r1" stats={mockStats} quizTitle="测试" />,
    );
    expect(container.textContent).toContain('5');
    expect(container.textContent).toContain('10');
    expect(container.textContent).toContain('50%');
  });
});