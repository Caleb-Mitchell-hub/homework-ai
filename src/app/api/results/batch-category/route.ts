import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { resultIds, categoryId } = await request.json();

    if (!Array.isArray(resultIds) || resultIds.length === 0) {
      return NextResponse.json({ error: '请提供有效的记录 id 列表' }, { status: 400 });
    }

    const result = await prisma.quizResult.updateMany({
      where: {
        id: { in: resultIds },
        userId: payload.userId,
      },
      data: { categoryId: categoryId ?? null },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (error) {
    console.error('批量归入分类错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
