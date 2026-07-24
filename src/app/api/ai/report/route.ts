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

  // 计算 byType + wrongQuestions
  const quiz = await prisma.quiz.findUnique({ where: { id: result.quizId } });
  const questions = JSON.parse(quiz?.questions ?? '[]');
  const items = JSON.parse(result.results || '[]');
  const byType: Record<string, { total: number; correct: number; correctRate: number }> = {};
  const wrongQuestions: any[] = [];
  items.forEach((r: any, i: number) => {
    const q = questions.find((qq: any) => qq.id === r.questionId);
    if (!q) return;
    if (!byType[q.type]) byType[q.type] = { total: 0, correct: 0, correctRate: 0 };
    byType[q.type].total += 1;
    if (r.correct) byType[q.type].correct += 1;
    if (!r.correct && r.userAnswer) {
      wrongQuestions.push({
        index: i + 1,
        title: q.title,
        type: q.type,
        userAnswer: r.userAnswer,
        correctAnswer: r.correctAnswer ?? '',
      });
    }
  });
  for (const k of Object.keys(byType)) {
    const t = byType[k];
    t.correctRate = t.total > 0 ? t.correct / t.total : 0;
  }

  try {
    const gen = await generateReport({
      userId: payload.userId,
      resultId: result.id,
      quizTitle: quiz?.title ?? '',
      score: result.score,
      totalScore: result.totalScore,
      byType,
      wrongQuestions,
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