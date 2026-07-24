import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

interface ResultItem {
  questionId: string;
  correct: boolean;
  correctAnswer?: string;
  userAnswer: string;
  autoGraded: boolean;
  aiComment?: string;
  manualScore?: number;
  manualComment?: string;
  manualGradedBy?: string;
  manualGradedAt?: string;
}

function clampScore(n: any): number | undefined {
  if (n === null || n === undefined) return undefined;
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.max(0, Math.min(1, v));
}

function recalcTotalScore(items: ResultItem[]): number {
  let s = 0;
  for (const it of items) {
    if (typeof it.manualScore === 'number') s += it.manualScore;
    else if (it.correct) s += 1;
  }
  return s;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyAdminToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: '需要管理员登录' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !body.questionId) {
    return NextResponse.json({ error: '缺少 questionId' }, { status: 400 });
  }

  const existing = await prisma.quizResult.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '结果不存在' }, { status: 404 });
  }

  let items: ResultItem[];
  try {
    items = JSON.parse(existing.results || '[]');
  } catch {
    items = [];
  }
  const idx = items.findIndex((it) => it.questionId === body.questionId);
  if (idx === -1) {
    return NextResponse.json({ error: '题目不存在' }, { status: 404 });
  }

  const next: ResultItem = { ...items[idx] };
  if (body.manualScore === null) {
    // 清空
    delete next.manualScore;
    delete next.manualGradedBy;
    delete next.manualGradedAt;
    if (body.manualComment === null) delete next.manualComment;
  } else {
    const score = clampScore(body.manualScore);
    if (score === undefined) {
      return NextResponse.json({ error: 'manualScore 格式错误' }, { status: 400 });
    }
    next.manualScore = score;
    next.manualGradedBy = payload.userId;
    next.manualGradedAt = new Date().toISOString();
    if (typeof body.manualComment === 'string') {
      next.manualComment = body.manualComment;
    }
  }
  items[idx] = next;
  const newTotal = recalcTotalScore(items);

  const updated = await prisma.quizResult.update({
    where: { id },
    data: {
      results: JSON.stringify(items),
      score: newTotal,
      totalScore: existing.totalScore,
    },
  });

  return NextResponse.json({ result: updated });
}