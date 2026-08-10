import { Question } from '@/types';

export interface ResultItemLite {
  questionId: string;
  correct: boolean;
  userAnswer: string;
  autoGraded: boolean;
  /** 人工分数(若已批) */
  manualScore?: number;
  /** AI 面试评分 0-100（主观题专用） */
  interviewScore?: number;
}

export type DifficultyKey = '简单' | '中等' | '困难';

/** 主观题类型：无客观正确答案，需要 AI 评分或人工批改 */
const SUBJECTIVE_TYPES: Set<string> = new Set(['interview', 'essay']);

export interface ReportStats {
  overview: {
    score: number;
    totalScore: number;
    /** 客观题正确率（0-1），主观题 quiz 为 null */
    correctRate: number | null;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    /** 总题数 */
    totalQuestions: number;
    /** 客观题数量 */
    objectiveCount: number;
    /** 主观题数量 */
    subjectiveCount: number;
  };
  byType: Record<string, {
    total: number;
    correct: number;
    correctRate: number;
    /** 是否为主观题型（无客观正确率） */
    isSubjective?: boolean;
    /** 主观题已评分数 */
    gradedCount?: number;
    /** 主观题平均分 */
    averageScore?: number;
  }>;
  byDifficulty: {
    简单?: { total: number; correct: number; correctRate: number };
    中等?: { total: number; correct: number; correctRate: number };
    困难?: { total: number; correct: number; correctRate: number };
    noDifficultyCount: number;
  };
  /** 主观题 AI 评分统计（仅当有主观题时存在） */
  subjective?: {
    gradedCount: number;
    totalCount: number;
    averageScore: number;
    distribution: {
      excellent: number;   // ≥80
      good: number;         // 60-79
      needsWork: number;    // <60
      ungraded: number;     // 未评分
    };
  };
}

export function calcReportStats(input: {
  totalScore: number;
  maxTotalScore: number;
  results: ResultItemLite[];
  questions: Question[];
}): ReportStats {
  const qMap = new Map(input.questions.map((q) => [q.id, q]));

  // --- 拆分客观/主观 ---
  const objectiveResults: { r: ResultItemLite; q: Question }[] = [];
  const subjectiveResults: { r: ResultItemLite; q: Question }[] = [];

  for (const r of input.results) {
    const q = qMap.get(r.questionId);
    if (!q) continue;
    if (SUBJECTIVE_TYPES.has(q.type)) {
      subjectiveResults.push({ r, q });
    } else {
      objectiveResults.push({ r, q });
    }
  }

  // --- 客观题统计 ---
  const correctCount = objectiveResults.filter(({ r }) => {
    if (typeof r.manualScore === 'number') return r.manualScore >= 0.999;
    return r.correct;
  }).length;
  const wrongCount = objectiveResults.filter(({ r }) => {
    if (typeof r.manualScore === 'number') return r.manualScore < 0.999;
    return !r.correct && !!r.userAnswer;
  }).length;
  const unansweredCount = objectiveResults.filter(({ r }) => !r.userAnswer).length;
  const objTotal = objectiveResults.length;
  const correctRate: number | null = objTotal > 0 ? correctCount / objTotal : null;

  // --- 主观题统计 ---
  const subjTotal = subjectiveResults.length;
  let subjective: ReportStats['subjective'] | undefined;
  if (subjTotal > 0) {
    const scored = subjectiveResults.filter(({ r }) => typeof r.interviewScore === 'number');
    const gradedCount = scored.length;
    const ungraded = subjTotal - gradedCount;
    const sum = scored.reduce((acc, { r }) => acc + (r.interviewScore ?? 0), 0);
    const averageScore = gradedCount > 0 ? Math.round(sum / gradedCount) : 0;
    const distribution = {
      excellent: scored.filter(({ r }) => (r.interviewScore ?? 0) >= 80).length,
      good: scored.filter(({ r }) => {
        const s = r.interviewScore ?? 0;
        return s >= 60 && s < 80;
      }).length,
      needsWork: scored.filter(({ r }) => (r.interviewScore ?? 0) < 60 && typeof r.interviewScore === 'number').length,
      ungraded,
    };
    subjective = { gradedCount, totalCount: subjTotal, averageScore, distribution };
  }

  // --- byType ---
  const byType: ReportStats['byType'] = {};
  for (const q of input.questions) {
    if (!byType[q.type]) {
      byType[q.type] = { total: 0, correct: 0, correctRate: 0 };
      if (SUBJECTIVE_TYPES.has(q.type)) {
        byType[q.type].isSubjective = true;
        byType[q.type].gradedCount = 0;
        byType[q.type].averageScore = 0;
      }
    }
    byType[q.type].total += 1;
    const r = input.results.find((rr) => rr.questionId === q.id);
    if (!r) continue;

    if (SUBJECTIVE_TYPES.has(q.type)) {
      // 主观题型：不统计 correct/correctRate，用 interviewScore
      if (typeof r.interviewScore === 'number') {
        byType[q.type].gradedCount = (byType[q.type].gradedCount ?? 0) + 1;
        byType[q.type].averageScore = (byType[q.type].averageScore ?? 0) + r.interviewScore;
      }
    } else {
      const isCorrect = typeof r.manualScore === 'number' ? r.manualScore >= 0.999 : r.correct;
      if (isCorrect) byType[q.type].correct += 1;
    }
  }
  // 计算 correctRate（客观题）和 averageScore（主观题）
  for (const k of Object.keys(byType)) {
    const t = byType[k];
    if (t.isSubjective) {
      // 主观题：用 averageScore
      if (t.gradedCount && t.gradedCount > 0 && t.averageScore) {
        t.averageScore = Math.round(t.averageScore / t.gradedCount);
      }
      // correctRate 不适用，保持 0
    } else {
      t.correctRate = t.total > 0 ? t.correct / t.total : 0;
    }
  }

  // --- byDifficulty（仅客观题） ---
  const byDifficulty: ReportStats['byDifficulty'] = { noDifficultyCount: 0 };
  for (const { q, r } of objectiveResults) {
    const isCorrect = typeof r.manualScore === 'number' ? r.manualScore >= 0.999 : r.correct;
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
  // 主观题也计入 noDifficultyCount（不在客观题维度中显示）
  for (const { q } of subjectiveResults) {
    if (!q.difficulty) byDifficulty.noDifficultyCount += 1;
  }
  for (const k of ['简单', '中等', '困难'] as DifficultyKey[]) {
    const v = byDifficulty[k];
    if (v) v.correctRate = v.total > 0 ? v.correct / v.total : 0;
  }

  return {
    overview: {
      score: input.totalScore,
      totalScore: input.maxTotalScore,
      correctRate,
      correctCount,
      wrongCount,
      unansweredCount,
      totalQuestions: input.questions.length,
      objectiveCount: objTotal,
      subjectiveCount: subjTotal,
    },
    byType,
    byDifficulty,
    subjective,
  };
}