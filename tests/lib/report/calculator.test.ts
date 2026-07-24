import { describe, it, expect } from 'vitest';
import { calcReportStats } from '@/lib/report/calculator';

describe('calcReportStats', () => {
  it('计算总览:得分、正确率、对/错/未答', () => {
    const stats = calcReportStats({
      totalScore: 10,
      results: [
        { questionId: 'q1', correct: true, userAnswer: 'A', autoGraded: true },
        { questionId: 'q2', correct: true, userAnswer: 'B', autoGraded: true },
        { questionId: 'q3', correct: false, userAnswer: 'X', autoGraded: true },
        { questionId: 'q4', correct: false, userAnswer: '', autoGraded: true },
      ],
      questions: [
        { id: 'q1', type: 'single', difficulty: '简单' },
        { id: 'q2', type: 'multiple', difficulty: '简单' },
        { id: 'q3', type: 'single', difficulty: '中等' },
        { id: 'q4', type: 'single', difficulty: '困难' },
      ] as any,
    });
    expect(stats.overview.score).toBe(10);
    expect(stats.overview.totalScore).toBe(4);
    expect(stats.overview.correctRate).toBeCloseTo(0.5);
    expect(stats.overview.correctCount).toBe(2);
    expect(stats.overview.wrongCount).toBe(1);
    expect(stats.overview.unansweredCount).toBe(1);
  });

  it('按题型分组,含正确率', () => {
    const stats = calcReportStats({
      totalScore: 0,
      results: [
        { questionId: 'q1', correct: true, userAnswer: 'A', autoGraded: true },
        { questionId: 'q2', correct: true, userAnswer: 'B', autoGraded: true },
        { questionId: 'q3', correct: false, userAnswer: 'X', autoGraded: true },
        { questionId: 'q4', correct: true, userAnswer: 'true', autoGraded: true },
      ],
      questions: [
        { id: 'q1', type: 'single' },
        { id: 'q2', type: 'single' },
        { id: 'q3', type: 'single' },
        { id: 'q4', type: 'boolean' },
      ] as any,
    });
    const single = stats.byType['single'];
    expect(single.total).toBe(3);
    expect(single.correct).toBe(2);
    expect(single.correctRate).toBeCloseTo(2 / 3);
    const bool = stats.byType['boolean'];
    expect(bool.total).toBe(1);
    expect(bool.correct).toBe(1);
  });

  it('按难度分组,无难度的不计入', () => {
    const stats = calcReportStats({
      totalScore: 0,
      results: [
        { questionId: 'q1', correct: true, userAnswer: 'A', autoGraded: true },
        { questionId: 'q2', correct: false, userAnswer: 'B', autoGraded: true },
        { questionId: 'q3', correct: true, userAnswer: 'C', autoGraded: true },
      ],
      questions: [
        { id: 'q1', type: 'single', difficulty: '简单' },
        { id: 'q2', type: 'single', difficulty: '中等' },
        { id: 'q3', type: 'single' },
      ] as any,
    });
    expect(stats.byDifficulty['简单']!.total).toBe(1);
    expect(stats.byDifficulty['中等']!.total).toBe(1);
    expect(stats.byDifficulty['困难']).toBeUndefined();
    expect(stats.byDifficulty.noDifficultyCount).toBe(1);
  });

  it('manualScore 视为正确(>=0.999)', () => {
    const stats = calcReportStats({
      totalScore: 0,
      results: [
        { questionId: 'q1', correct: false, userAnswer: '答', autoGraded: false, manualScore: 1 },
        { questionId: 'q2', correct: false, userAnswer: '答', autoGraded: false, manualScore: 0.5 },
      ],
      questions: [
        { id: 'q1', type: 'essay' },
        { id: 'q2', type: 'essay' },
      ] as any,
    });
    expect(stats.overview.correctCount).toBe(1);
    expect(stats.overview.wrongCount).toBe(1);
  });
});