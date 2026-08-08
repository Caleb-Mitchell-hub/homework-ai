import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromHeaders, verifyAdminToken } from '@/lib/admin-auth';

/**
 * GET /api/admin/credits/user/[id]
 * - 单个用户的积分账户详情
 * - 包含当前余额 + 各类累计 (issued/consumed/signins/AI) + 最近 30 天签到 + 最近 10 条流水
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        occupation: true,
        credits: true,
        isGuest: true,
        disabled: true,
        createdAt: true,
        lastActiveAt: true,
        profession: { select: { name: true } },
      },
    });
    if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    // ── 累计：充值入账/签到入账/AI 消耗/手动调整
    const [issuedSum, consumedSum, signinSum, aiSum, topupSum, adminSum] = await Promise.all([
      prisma.creditLedger.aggregate({ where: { userId: id, delta: { gt: 0 } }, _sum: { delta: true } }),
      prisma.creditLedger.aggregate({ where: { userId: id, delta: { lt: 0 } }, _sum: { delta: true } }),
      prisma.creditLedger.aggregate({
        where: { userId: id, reason: 'daily_signin' },
        _sum: { delta: true },
      }),
      prisma.creditLedger.aggregate({
        where: { userId: id, reason: 'ai_explain' },
        _sum: { delta: true },
      }),
      prisma.creditLedger.aggregate({
        where: { userId: id, reason: 'topup' },
        _sum: { delta: true },
      }),
      prisma.creditLedger.aggregate({
        where: { userId: id, reason: 'admin_adjust' },
        _sum: { delta: true },
      }),
    ]);

    // 最近 10 条流水 + 最近 30 天签到 + AI 解析次数
    const [recentLedger, checkIns30, explanationCount] = await Promise.all([
      prisma.creditLedger.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, delta: true, reason: true, refId: true, balance: true, createdAt: true },
      }),
      prisma.dailyCheckIn.findMany({
        where: { userId: id, checkInDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        orderBy: { checkInDate: 'desc' },
        take: 30,
        select: { id: true, checkInDate: true, credit: true, createdAt: true },
      }),
      prisma.aIExplanation.count({ where: { userId: id } }),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        occupation: user.occupation,
        professionName: user.profession?.name ?? null,
        balance: user.credits,
        disabled: user.disabled,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt,
      },
      stats: {
        totalIssued: issuedSum._sum.delta || 0,
        totalConsumed: consumedSum._sum.delta || 0, // 负数
        fromSignin: signinSum._sum.delta || 0,
        fromTopup: topupSum._sum.delta || 0,
        fromAdminAdjust: adminSum._sum.delta || 0,
        aiConsumed: aiSum._sum.delta || 0, // 负数
        explanationCount,
      },
      recentLedger,
      checkIns30,
    });
  } catch (error) {
    console.error('用户详情失败:', error);
    return NextResponse.json({ error: '用户详情失败' }, { status: 500 });
  }
}
