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

    const categories = await prisma.resultCategory.findMany({
      where: { userId: payload.userId },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('获取分类列表错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

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

    const { name, parentId } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: '分类名不能为空' }, { status: 400 });
    }

    const maxOrder = await prisma.resultCategory.findFirst({
      where: { userId: payload.userId, parentId: parentId ?? null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const category = await prisma.resultCategory.create({
      data: {
        userId: payload.userId,
        name: name.trim(),
        parentId: parentId ?? null,
        order: (maxOrder?.order ?? -1) + 1,
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error('创建分类错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
