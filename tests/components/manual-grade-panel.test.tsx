// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import ManualGradePanel from '@/components/ManualGradePanel';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

describe('ManualGradePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 admin 已登录
    localStorage.setItem('adminToken', 'admin-t');
  });

  it('未批阅时显示折叠面板入口', () => {
    render(
      <ManualGradePanel
        resultId="r1"
        questionId="q1"
        item={{ questionId: 'q1', userAnswer: 'u', correct: false, autoGraded: false }}
      />,
    );
    expect(screen.getByText(/人工批阅/)).toBeTruthy();
  });

  it('展开后可见分数输入和评语框', () => {
    const { container } = render(
      <ManualGradePanel
        resultId="r1"
        questionId="q1"
        item={{ questionId: 'q1', userAnswer: 'u', correct: false, autoGraded: false }}
      />,
    );
    const expandBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === '展开评分',
    ) as HTMLButtonElement;
    expect(expandBtn).toBeTruthy();
    fireEvent.click(expandBtn);
    expect(container.querySelector('input[placeholder*="分数"]')).toBeTruthy();
    expect(container.querySelector('textarea[placeholder*="评语"]')).toBeTruthy();
  });

  it('已批阅时显示分数 + 评语 + 修改按钮', () => {
    const { container } = render(
      <ManualGradePanel
        resultId="r1"
        questionId="q1"
        item={{
          questionId: 'q1',
          userAnswer: 'u',
          correct: false,
          autoGraded: false,
          manualScore: 0.8,
          manualComment: 'good',
          manualGradedBy: 'admin1',
          manualGradedAt: '2026-07-24T01:00:00Z',
        }}
      />,
    );
    // happy-dom 把中文文本拆成多个 span,改用 container.textContent 检测
    expect(container.textContent).toContain('0.8');
    expect(container.textContent).toContain('good');
    expect(container.textContent).toContain('修改');
  });

  it('非 admin 时不显示入口', () => {
    localStorage.removeItem('adminToken');
    const { container } = render(
      <ManualGradePanel
        resultId="r1"
        questionId="q1"
        item={{ questionId: 'q1', userAnswer: 'u', correct: false, autoGraded: false }}
      />,
    );
    expect(container.innerHTML).toBe('');
  });
});