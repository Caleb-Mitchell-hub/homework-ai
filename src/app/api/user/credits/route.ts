import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { verifyAdminToken } from '@/lib/admin-auth';

const REWARD = 5;

export async function GET(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const admin = token ? verifyAdminToken(token) : null;
  const userPayload = token ? verifyToken(token) : null;

  // 未登录
  if (!admin && !userPayload?.userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  // 管理员: 本期不支持积分(暂返回 balance=0)
  if (admin) {
    return NextResponse.json({ balance: 0, checkedIn: false, checkInReward: REWARD });
  }

  const userId = userPayload!.userId;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [user, todayCheckIn] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }),
    prisma.dailyCheckIn.findFirst({
      where: { userId, checkInDate: today },
      select: { id: true },
    }),
  ]);

  return NextResponse.json({
    balance: user?.credits ?? 0,
    checkedIn: !!todayCheckIn,
    checkInReward: REWARD,
  });
}
