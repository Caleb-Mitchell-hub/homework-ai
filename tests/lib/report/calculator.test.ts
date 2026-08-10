import { describe, it, expect } from 'vitest';
import { calcReportStats } from '@/lib/report/calculator';

describe('calcReportStats', () => {
  it('计算总览:得分、正确率、对/错/未答（客观题）', () => {
    const stats = calcReportStats({
      totalScore: 3,
      maxTotalScore: 10,
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
    expect(stats.overview.score).toBe(3);
    expect(stats.overview.totalScore).toBe(10);
    expect(stats.overview.correctRate).toBeCloseTo(0.5);
    expect(stats.overview.correctCount).toBe(2);
    expect(stats.overview.wrongCount).toBe(1);
    expect(stats.overview.unansweredCount).toBe(1);
    expect(stats.overview.totalQuestions).toBe(4);
    expect(stats.overview.objectiveCount).toBe(4);
    expect(stats.overview.subjectiveCount).toBe(0);
  });

  it('按题型分组,含正确率', () => {
    const stats = calcReportStats({
      totalScore: 0,
      maxTotalScore: 4,
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
      maxTotalScore: 3,
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

  it('主观题(essay/interview)不计入客观统计, 计入 subjective', () => {
    const stats = calcReportStats({
      totalScore: 0,
      maxTotalScore: 2,
      results: [
        { questionId: 'q1', correct: false, userAnswer: '答得很好', autoGraded: false, interviewScore: 85 },
        { questionId: 'q2', correct: false, userAnswer: '一般', autoGraded: false, interviewScore: 55 },
      ],
      questions: [
        { id: 'q1', type: 'essay' },
        { id: 'q2', type: 'essay' },
      ] as any,
    });
    // 主观题不计入 objective 统计
    expect(stats.overview.correctCount).toBe(0);
    expect(stats.overview.wrongCount).toBe(0);
    expect(stats.overview.correctRate).toBeNull();
    expect(stats.overview.subjectiveCount).toBe(2);
    expect(stats.overview.objectiveCount).toBe(0);
    // 主观题统计
    expect(stats.subjective).toBeDefined();
    expect(stats.subjective!.gradedCount).toBe(2);
    expect(stats.subjective!.totalCount).toBe(2);
    expect(stats.subjective!.averageScore).toBe(70);
    expect(stats.subjective!.distribution.excellent).toBe(1);
    expect(stats.subjective!.distribution.good).toBe(0);
    expect(stats.subjective!.distribution.needsWork).toBe(1);
    // byType 对主观题
    expect(stats.byType['essay'].isSubjective).toBe(true);
    expect(stats.byType['essay'].gradedCount).toBe(2);
    expect(stats.byType['essay'].averageScore).toBe(70);
  });

  it('主观题未评分时显示未评分状态', () => {
    const stats = calcReportStats({
      totalScore: 0,
      maxTotalScore: 1,
      results: [
        { questionId: 'q1', correct: false, userAnswer: '答了但未评分', autoGraded: false },
      ],
      questions: [
        { id: 'q1', type: 'interview' },
      ] as any,
    });
    expect(stats.subjective!.gradedCount).toBe(0);
    expect(stats.subjective!.totalCount).toBe(1);
    expect(stats.subjective!.averageScore).toBe(0);
    expect(stats.subjective!.distribution.ungraded).toBe(1);
    expect(stats.byType['interview'].gradedCount).toBe(0);
  });
});