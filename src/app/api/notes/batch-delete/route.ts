import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '无效的token' }, { status: 401 });

    const { ids } = await request.json().catch(() => ({}));
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids 不能为空' }, { status: 400 });
    }

    const result = await prisma.note.deleteMany({
      where: { userId: payload.userId, id: { in: ids } },
    });

    return NextResponse.json({ count: result.count });
  } catch (error) {
    console.error('批量删除笔记错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
