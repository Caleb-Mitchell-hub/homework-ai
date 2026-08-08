import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jsonFixed } from '@/lib/db-date';

/** GET /api/notes — 获取笔记列表，支持按 type/questionId/quizId/resultId 筛选 */
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
    await updateUserActiveTime(payload.userId);

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || undefined;
    const questionId = url.searchParams.get('questionId') || undefined;
    const quizId = url.searchParams.get('quizId') || undefined;
    const resultId = url.searchParams.get('resultId') || undefined;

    const where: any = { userId: payload.userId };
    if (type) where.type = type;
    if (questionId) where.questionId = questionId;
    if (quizId) where.quizId = quizId;
    if (resultId) where.resultId = resultId;

    const notes = await prisma.note.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    return jsonFixed(notes);
  } catch (error) {
    console.error('获取笔记列表错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** POST /api/notes — 创建笔记 */
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
    await updateUserActiveTime(payload.userId);

    const { type, questionId, quizId, resultId, title, content, source } = await request.json();

    if (!type || !title || !content) {
      return NextResponse.json({ error: 'type、title、content 为必填项' }, { status: 400 });
    }

    if (!['question', 'answer', 'ai_output'].includes(type)) {
      return NextResponse.json({ error: 'type 只能是 question、answer 或 ai_output' }, { status: 400 });
    }

    const note = await prisma.note.create({
      data: {
        userId: payload.userId,
        type,
        questionId: questionId || null,
        quizId: quizId || null,
        resultId: resultId || null,
        title: title.slice(0, 200),
        content,
        source: source || 'manual',
      },
    });

    return jsonFixed(note);
  } catch (error) {
    console.error('创建笔记错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
