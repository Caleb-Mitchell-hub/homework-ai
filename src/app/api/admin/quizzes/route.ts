import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { normalizeQuestions } from '@/lib/question-normalize';

export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  }

  try {
    const quizzes = await prisma.quiz.findMany({
      include: {
        user: { select: { username: true, isGuest: true } },
        _count: { select: { results: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      quizzes: quizzes.map((q) => ({
        id: q.id,
        title: q.title,
        isOfficial: q.isOfficial,
        creator: q.user.username,
        isGuestCreator: q.user.isGuest,
        resultCount: q._count.results,
        createdAt: q.createdAt,
      })),
    });
  } catch (error) {
    console.error('获取题库失败:', error);
    return NextResponse.json({ error: '获取题库失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  }

  try {
    const { title, questions, isOfficial, timeLimit } = await request.json();

    if (!title || !questions) {
      return NextResponse.json({ error: '标题和题目不能为空' }, { status: 400 });
    }

    // 归一化: admin 手动格式(content/judge/analysis/score) + parser 全局格式(title/boolean) → 统一存全局格式
    const normalized = normalizeQuestions(questions);
    if (normalized.length === 0) {
      return NextResponse.json({ error: '没有可保存的有效题目' }, { status: 400 });
    }

    const quiz = await prisma.quiz.create({
      data: {
        title,
        questions: JSON.stringify(normalized),
        userId: payload.userId,
        isOfficial: isOfficial !== false,
        timeLimit: typeof timeLimit === 'number' && timeLimit > 0 ? timeLimit : 0,
      },
    });

    return NextResponse.json({ quiz });
  } catch (error) {
    console.error('创建题库失败:', error);
    return NextResponse.json({ error: '创建题库失败' }, { status: 500 });
  }
}
