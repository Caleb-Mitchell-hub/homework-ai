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

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        isGuest: true,
        disabled: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    if (user.disabled) {
      return NextResponse.json({ error: '账号已被停用' }, { status: 403 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}