import { Question } from '@/types';

export interface ResultItemLite {
  questionId: string;
  correct: boolean;
  userAnswer: string;
  autoGraded: boolean;
  /** 人工分数(若已批) */
  manualScore?: number;
}

export type DifficultyKey = '简单' | '中等' | '困难';

export interface ReportStats {
  overview: {
    score: number;
    totalScore: number;
    correctRate: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
  };
  byType: Record<string, { total: number; correct: number; correctRate: number }>;
  byDifficulty: {
    简单?: { total: number; correct: number; correctRate: number };
    中等?: { total: number; correct: number; correctRate: number };
    困难?: { total: number; correct: number; correctRate: number };
    noDifficultyCount: number;
  };
}

export function calcReportStats(input: {
  totalScore: number;
  results: ResultItemLite[];
  questions: Question[];
}): ReportStats {
  // 用 manualScore 时算"全分",否则按 correct 算 1 分
  const correctCount = input.results.filter((r) => {
    if (typeof r.manualScore === 'number') return r.manualScore >= 0.999;
    return r.correct;
  }).length;
  const wrongCount = input.results.filter((r) => {
    if (typeof r.manualScore === 'number') return r.manualScore < 0.999;
    return !r.correct && !!r.userAnswer;
  }).length;
  const unansweredCount = input.results.filter((r) => !r.userAnswer).length;
  // 正确率 = 正确数 / 总题数(未答也算错,直观表达)
  const totalCount = input.results.length;
  const correctRate = totalCount > 0 ? correctCount / totalCount : 0;

  // byType
  const byType: ReportStats['byType'] = {};
  for (const q of input.questions) {
    if (!byType[q.type]) byType[q.type] = { total: 0, correct: 0, correctRate: 0 };
    byType[q.type].total += 1;
    const r = input.results.find((rr) => rr.questionId === q.id);
    if (!r) continue;
    const isCorrect = typeof r.manualScore === 'number' ? r.manualScore >= 0.999 : r.correct;
    if (isCorrect) byType[q.type].correct += 1;
  }
  for (const k of Object.keys(byType)) {
    const t = byType[k];
    t.correctRate = t.total > 0 ? t.correct / t.total : 0;
  }

  // byDifficulty
  const byDifficulty: ReportStats['byDifficulty'] = { noDifficultyCount: 0 };
  for (const q of input.questions) {
    const r = input.results.find((rr) => rr.questionId === q.id);
    const isCorrect = r
      ? typeof r.manualScore === 'number'
        ? r.manualScore >= 0.999
        : r.correct
      : false;
    if (!q.difficulty) {
      byDifficulty.noDifficultyCount += 1;
      continue;
    }
    if (!byDifficulty[q.difficulty]) {
      byDifficulty[q.difficulty] = { total: 0, correct: 0, correctRate: 0 };
    }
    byDifficulty[q.difficulty]!.total += 1;
    if (isCorrect) byDifficulty[q.difficulty]!.correct += 1;
  }
  for (const k of ['简单', '中等', '困难'] as DifficultyKey[]) {
    const v = byDifficulty[k];
    if (v) v.correctRate = v.total > 0 ? v.correct / v.total : 0;
  }

  return {
    overview: {
      score: input.totalScore,
      totalScore: input.questions.length,
      correctRate,
      correctCount,
      wrongCount,
      unansweredCount,
    },
    byType,
    byDifficulty,
  };
}