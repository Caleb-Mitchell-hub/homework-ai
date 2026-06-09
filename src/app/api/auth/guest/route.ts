import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateToken } from '@/lib/auth';

export async function POST() {
  try {
    const guestId = 'guest_' + Date.now();
    const guestUsername = '游客_' + Math.random().toString(36).substring(2, 8);

    const user = await prisma.user.create({
      data: {
        id: guestId,
        username: guestUsername,
        password: '', // 游客不需要密码
        isGuest: true,
      },
    });

    const token = generateToken({
      userId: user.id,
      username: user.username,
      isGuest: user.isGuest,
    });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isGuest: user.isGuest,
      },
    });
  } catch (error) {
    // 如果游客已存在，直接返回
    try {
      const existingGuest = await prisma.user.findFirst({
        where: { isGuest: true },
        orderBy: { createdAt: 'desc' },
      });

      if (existingGuest) {
        const token = generateToken({
          userId: existingGuest.id,
          username: existingGuest.username,
          isGuest: existingGuest.isGuest,
        });

        return NextResponse.json({
          token,
          user: {
            id: existingGuest.id,
            username: existingGuest.username,
            isGuest: existingGuest.isGuest,
          },
        });
      }
    } catch {}

    console.error('游客登录错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}