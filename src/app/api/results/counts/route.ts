import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const userId = payload.userId;

    const [total, recent, draft, uncat, userCategories] = await Promise.all([
      prisma.quizResult.count({ where: { userId } }),
      prisma.quizResult.count({
        where: {
          userId,
          status: 'submitted',
          submittedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.quizResult.count({ where: { userId, status: 'draft' } }),
      prisma.quizResult.count({
        where: { userId, categoryId: null, status: 'submitted' },
      }),
      prisma.quizResult.groupBy({
        by: ['categoryId'],
        where: { userId, categoryId: { not: null } },
        _count: { id: true },
      }),
    ]);

    const byUserCategory: Record<string, number> = {};
    for (const group of userCategories) {
      if (group.categoryId) {
        byUserCategory[group.categoryId] = group._count.id;
      }
    }

    return NextResponse.json({
      total,
      recent,
      draft,
      uncat,
      byUserCategory,
    });
  } catch (error) {
    console.error('获取记录计数错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
