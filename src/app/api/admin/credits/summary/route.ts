import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromHeaders, verifyAdminToken } from '@/lib/admin-auth';

/**
 * GET /api/admin/credits/summary
 * - 全局积分统计 + 30 天趋势（按 reason 分维度）
 */
export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalBalanceResult, // 求和可能返回 null
      totalCreditsIssuedSum,
      totalCreditsConsumedSum,
      totalAccounts,
      zeroBalanceAccounts,
      // 30 天的所有流水,用来画趋势 + 算各 reason 累计
      recentLedger,
    ] = await Promise.all([
      prisma.user.aggregate({ _sum: { credits: true } }),
      prisma.creditLedger.aggregate({
        where: { delta: { gt: 0 } },
        _sum: { delta: true },
      }),
      prisma.creditLedger.aggregate({
        where: { delta: { lt: 0 } },
        _sum: { delta: true },
      }),
      prisma.user.count({ where: { isGuest: false } }),
      prisma.user.count({ where: { credits: 0, isGuest: false } }),
      prisma.creditLedger.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { delta: true, reason: true, createdAt: true },
      }),
    ]);

    // ── 30 天日期轴
    const dateLabels: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dateLabels.push(d.toISOString().slice(0, 10));
    }

    // 按日聚合：每日「入账」（delta > 0）和「消耗」（delta < 0）
    const issuedByDay = new Map<string, number>();
    const consumedByDay = new Map<string, number>();
    let todayIssued = 0;
    let todayConsumed = 0;
    // 按 reason 累计 30 天
    const byReason: Record<string, { delta: number; count: number }> = {};

    for (const row of recentLedger) {
      const date = row.createdAt.toISOString().slice(0, 10);
      if (row.delta > 0) {
        issuedByDay.set(date, (issuedByDay.get(date) || 0) + row.delta);
      } else if (row.delta < 0) {
        consumedByDay.set(date, (consumedByDay.get(date) || 0) + Math.abs(row.delta));
      }
      // 今日
      if (row.createdAt >= todayStart) {
        if (row.delta > 0) todayIssued += row.delta;
        else if (row.delta < 0) todayConsumed += Math.abs(row.delta);
      }
      // 按 reason
      const reason = row.reason as string;
      if (!byReason[reason]) byReason[reason] = { delta: 0, count: 0 };
      byReason[reason].delta += row.delta;
      byReason[reason].count += 1;
    }

    const trend = dateLabels.map((d) => ({
      date: d,
      issued: issuedByDay.get(d) || 0,
      consumed: consumedByDay.get(d) || 0,
    }));

    return NextResponse.json({
      // 总量
      totalBalance: totalBalanceResult._sum.credits || 0,
      totalIssued: totalCreditsIssuedSum._sum.delta || 0,
      totalConsumed: totalCreditsConsumedSum._sum.delta || 0, // 负数
      accounts: totalAccounts,
      zeroBalanceAccounts,
      // 今日
      todayIssued,
      todayConsumed,
      // 趋势
      trend,
      // 各 reason 累计（30 天）
      byReason,
    });
  } catch (error) {
    console.error('积分汇总失败:', error);
    return NextResponse.json({ error: '积分汇总失败' }, { status: 500 });
  }
}
