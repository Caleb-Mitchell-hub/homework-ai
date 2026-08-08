import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { verifyAdminToken } from '@/lib/admin-auth';

const REWARD = 30;

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
  // 使用 en-CA locale 直接输出 YYYY-MM-DD 格式的北京时间日期，
  // 避免 new Date(string) 解析 locale 字符串在不同 Node 版本/时区下的不确定性
  const beijingDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const today = new Date(`${beijingDateStr}T00:00:00+08:00`);

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
