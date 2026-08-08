import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jsonFixed } from '@/lib/db-date';

/** GET /api/notes/[id] — 获取单条笔记 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '无效的token' }, { status: 401 });

    const { id } = await params;
    const note = await prisma.note.findUnique({ where: { id } });
    if (!note) return NextResponse.json({ error: '笔记不存在' }, { status: 404 });
    if (note.userId !== payload.userId)
      return NextResponse.json({ error: '无权访问' }, { status: 403 });

    return jsonFixed(note);
  } catch (error) {
    console.error('获取笔记错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** PUT /api/notes/[id] — 更新笔记 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '无效的token' }, { status: 401 });
    await updateUserActiveTime(payload.userId);

    const { id } = await params;
    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: '笔记不存在' }, { status: 404 });
    if (existing.userId !== payload.userId)
      return NextResponse.json({ error: '无权修改' }, { status: 403 });

    const { title, content, type, questionId, quizId, resultId, source } = await request.json();

    const note = await prisma.note.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: title.slice(0, 200) } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(questionId !== undefined ? { questionId } : {}),
        ...(quizId !== undefined ? { quizId } : {}),
        ...(resultId !== undefined ? { resultId } : {}),
        ...(source !== undefined ? { source } : {}),
      },
    });

    return jsonFixed(note);
  } catch (error) {
    console.error('更新笔记错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** DELETE /api/notes/[id] — 删除笔记 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '无效的token' }, { status: 401 });

    const { id } = await params;
    const existing = await prisma.note.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: '笔记不存在' }, { status: 404 });
    if (existing.userId !== payload.userId)
      return NextResponse.json({ error: '无权删除' }, { status: 403 });

    await prisma.note.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('删除笔记错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
