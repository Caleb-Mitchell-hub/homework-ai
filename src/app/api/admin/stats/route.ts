import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  }

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [totalUsers, registeredUsers, guestUsers, onlineUsers, totalQuizzes, officialQuizzes] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isGuest: false } }),
      prisma.user.count({ where: { isGuest: true } }),
      prisma.user.count({
        where: {
          lastActiveAt: { gte: fiveMinutesAgo },
        },
      }),
      prisma.quiz.count(),
      prisma.quiz.count({ where: { isOfficial: true } }),
    ]);

    return NextResponse.json({
      totalUsers,
      registeredUsers,
      guestUsers,
      onlineUsers,
      totalQuizzes,
      officialQuizzes,
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    return NextResponse.json({ error: '获取统计数据失败' }, { status: 500 });
  }
}
