import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/** 获取当前用户的所有自建分类 */
export async function GET(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const categories = await prisma.quizCategory.findMany({
    where: { userId },
    orderBy: { order: 'asc' },
    select: { id: true, name: true, order: true },
  });

  return NextResponse.json({ categories });
}

/** 创建新的自建分类（同用户内名称唯一） */
export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = (body?.name ?? '').trim();
  if (!name || name.length > 40) {
    return NextResponse.json({ error: '分类名长度须在 1-40 字符以内' }, { status: 400 });
  }

  // 检查名称唯一性
  const existing = await prisma.quizCategory.findUnique({
    where: { userId_name: { userId, name } },
  });
  if (existing) {
    return NextResponse.json({ error: '同名分类已存在' }, { status: 409 });
  }

  // 取当前最大 order
  const max = await prisma.quizCategory.aggregate({
    where: { userId },
    _max: { order: true },
  });
  const nextOrder = (max._max.order ?? -1) + 1;

  const cat = await prisma.quizCategory.create({
    data: { userId, name, order: nextOrder },
    select: { id: true, name: true, order: true },
  });

  return NextResponse.json({ category: cat }, { status: 201 });
}
