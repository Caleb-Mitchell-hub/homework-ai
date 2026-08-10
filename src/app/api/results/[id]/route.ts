import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    await updateUserActiveTime(payload.userId);
    const { id } = await params;

    const result = await prisma.quizResult.findUnique({
      where: { id },
      include: {
        quiz: { select: { id: true, title: true, questions: true } },
      },
    });

    if (!result) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    if (result.userId !== payload.userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    let parsedResults: any[] = [];
    try {
      parsedResults = JSON.parse(result.results || '[]');
    } catch { /* keep [] */ }

    return NextResponse.json({
      result: {
        ...result,
        results: parsedResults,
      },
    });
  } catch (error) {
    console.error('获取记录详情错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { id } = await params;
    const { categoryId } = await request.json();

    const existing = await prisma.quizResult.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }
    if (existing.userId !== payload.userId) {
      return NextResponse.json({ error: '无权修改' }, { status: 403 });
    }

    await prisma.quizResult.update({
      where: { id },
      data: { categoryId: categoryId ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('修改记录分类错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
