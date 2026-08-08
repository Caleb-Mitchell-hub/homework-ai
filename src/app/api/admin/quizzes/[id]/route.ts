import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { autoConvertEssayToInterview } from '@/lib/ai/normalize';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const quiz = await prisma.quiz.findUnique({
      where: { id },
      include: {
        user: { select: { username: true } },
      },
    });

    if (!quiz) {
      return NextResponse.json({ error: '题库不存在' }, { status: 404 });
    }

    return NextResponse.json({
      quiz: {
        ...quiz,
        questions: JSON.parse(quiz.questions || '[]'),
      },
    });
  } catch (error) {
    console.error('获取题库失败:', error);
    return NextResponse.json({ error: '获取题库失败' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  }

  try {
    const { id } = await params;
    let { title, questions } = await request.json();

    // 全部 essay → 自动转换为 interview
    questions = autoConvertEssayToInterview(questions);

    const quiz = await prisma.quiz.update({
      where: { id },
      data: {
        title,
        questions: JSON.stringify(questions),
      },
    });

    return NextResponse.json({ quiz });
  } catch (error) {
    console.error('更新题库失败:', error);
    return NextResponse.json({ error: '更新题库失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  }

  try {
    const { id } = await params;
    await prisma.quiz.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('删除题库失败:', error);
    return NextResponse.json({ error: '删除题库失败' }, { status: 500 });
  }
}
