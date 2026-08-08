import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import {
  generateReport,
  REPORT_COST,
  InsufficientCreditsForReportError,
} from '@/lib/credits/report';

export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.resultId) {
    return NextResponse.json({ error: '缺少 resultId' }, { status: 400 });
  }

  const result = await prisma.quizResult.findUnique({
    where: { id: body.resultId },
  });
  if (!result || result.userId !== payload.userId) {
    return NextResponse.json({ error: '结果不存在' }, { status: 404 });
  }

  // 计算 byType + byDifficulty + wrongQuestions
  const quiz = await prisma.quiz.findUnique({ where: { id: result.quizId } });
  const questions = JSON.parse(quiz?.questions ?? '[]');
  const items = JSON.parse(result.results || '[]');
  const byType: Record<string, { total: number; correct: number; correctRate: number }> = {};
  const byDifficulty: Record<string, { total: number; correct: number; correctRate: number }> = {};
  const wrongQuestions: any[] = [];
  let noDiffCount = 0;
  items.forEach((r: any, i: number) => {
    const q = questions.find((qq: any) => qq.id === r.questionId);
    if (!q) return;
    // byType
    if (!byType[q.type]) byType[q.type] = { total: 0, correct: 0, correctRate: 0 };
    byType[q.type].total += 1;
    if (r.correct) byType[q.type].correct += 1;
    // byDifficulty
    const diff = q.difficulty as string | undefined;
    if (diff && (diff === '简单' || diff === '中等' || diff === '困难')) {
      if (!byDifficulty[diff]) byDifficulty[diff] = { total: 0, correct: 0, correctRate: 0 };
      byDifficulty[diff].total += 1;
      if (r.correct) byDifficulty[diff].correct += 1;
    } else {
      noDiffCount++;
    }
    // wrongQuestions
    if (!r.correct && r.userAnswer) {
      wrongQuestions.push({
        index: i + 1,
        title: q.title,
        type: q.type,
        difficulty: diff,
        userAnswer: r.userAnswer,
        correctAnswer: r.correctAnswer ?? '',
      });
    }
  });
  for (const k of Object.keys(byType)) {
    const t = byType[k];
    t.correctRate = t.total > 0 ? t.correct / t.total : 0;
  }
  for (const k of Object.keys(byDifficulty)) {
    const t = byDifficulty[k];
    t.correctRate = t.total > 0 ? t.correct / t.total : 0;
  }

  // 构建难度分布概览
  const diffProfileParts: string[] = [];
  for (const d of ['简单', '中等', '困难'] as const) {
    const v = byDifficulty[d];
    if (v) diffProfileParts.push(`${d}题正确率 ${Math.round(v.correctRate * 100)}% (${v.correct}/${v.total})`);
  }
  if (noDiffCount > 0) diffProfileParts.push(`${noDiffCount} 题无难度标记`);
  const difficultyProfile = diffProfileParts.join('; ') || undefined;

  try {
    const gen = await generateReport({
      userId: payload.userId,
      resultId: result.id,
      quizTitle: quiz?.title ?? '',
      score: result.score,
      totalScore: result.totalScore,
      byType,
      byDifficulty,
      wrongQuestions,
      difficultyProfile,
    });
    return NextResponse.json({
      content: gen.content,
      cached: gen.cached,
      newBalance: gen.newBalance,
      costCredit: gen.costCredit,
    });
  } catch (e: any) {
    if (e instanceof InsufficientCreditsForReportError) {
      return NextResponse.json(
        { error: '积分不足', required: REPORT_COST, balance: e.balance },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: e?.message ?? '生成失败' },
      { status: 502 },
    );
  }
}