import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
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

    // 更新最近活跃时间（每次页面加载/刷新都会调用此接口）
    updateUserActiveTime(payload.userId);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        isGuest: true,
        disabled: true,
        createdAt: true,
        professionId: true,
        occupation: true,
        securityQuestion: true,
        profession: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    if (user.disabled) {
      return NextResponse.json({ error: '账号已被停用' }, { status: 403 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        isGuest: user.isGuest,
        disabled: user.disabled,
        createdAt: user.createdAt,
        professionId: user.professionId ?? null,
        professionName: user.profession?.name ?? null,
        occupation: user.occupation ?? null,
        securityQuestion: user.securityQuestion ?? null,
      },
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}