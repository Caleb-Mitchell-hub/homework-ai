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
    const now = new Date();

    // ── 基础计数 ──
    const [
      totalUsers,
      registeredUsers,
      guestUsers,
      onlineUsers,
      totalQuizzes,
      officialQuizzes,
      // 订阅用户: 已注册 + 未被停用
      subscribedUsers,
      // 停用用户
      disabledUsers,
      // 管理员数
      adminCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isGuest: false } }),
      prisma.user.count({ where: { isGuest: true } }),
      prisma.user.count({ where: { lastActiveAt: { gte: fiveMinutesAgo } } }),
      prisma.quiz.count(),
      prisma.quiz.count({ where: { isOfficial: true } }),
      prisma.user.count({ where: { isGuest: false, disabled: false } }),
      prisma.user.count({ where: { disabled: true } }),
      prisma.admin.count(),
    ]);

    // ── 职业分布统计（从 User.occupation 字段聚合）──
    const occupationRows = await prisma.user.groupBy({
      by: ['occupation'],
      where: { occupation: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    const occupations = occupationRows.map((r) => ({
      name: r.occupation!,
      count: r._count.id,
    }));

    // ── 专业分布统计（从 Profession 模型聚合）──
    const professionRows = await prisma.profession.findMany({
      include: {
        _count: { select: { users: true, assignments: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const professions = professionRows.map((p) => ({
      id: p.id,
      name: p.name,
      userCount: p._count.users,
      assignmentCount: p._count.assignments,
    }));

    // ── 权限统计 ──
    const permissions = {
      admins: adminCount,
      regularUsers: registeredUsers - adminCount,
      guests: guestUsers,
    };

    // ── 30 天趋势数据 ──
    const days = 30;
    const trendStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [recentUsers, recentQuizzes, recentResults] = await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: trendStart } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.quiz.findMany({
        where: { createdAt: { gte: trendStart } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.quizResult.findMany({
        where: { submittedAt: { gte: trendStart } },
        select: { submittedAt: true },
        orderBy: { submittedAt: 'asc' },
      }),
    ]);

    // 生成最近 30 天的日期列表并分组计数
    const dateLabels: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dateLabels.push(d.toISOString().slice(0, 10));
    }

    function groupByDate<T extends { createdAt?: Date; submittedAt?: Date }>(
      rows: T[],
      dateField: 'createdAt' | 'submittedAt',
      labels: string[]
    ): number[] {
      const map = new Map<string, number>();
      for (const r of rows) {
        const d = (r[dateField] as Date).toISOString().slice(0, 10);
        map.set(d, (map.get(d) || 0) + 1);
      }
      return labels.map((l) => map.get(l) || 0);
    }

    const userTrend = dateLabels.map((date, i) => ({
      date,
      count: groupByDate(recentUsers, 'createdAt', dateLabels)[i],
    }));
    const quizTrend = dateLabels.map((date, i) => ({
      date,
      count: groupByDate(recentQuizzes, 'createdAt', dateLabels)[i],
    }));
    const resultTrend = dateLabels.map((date, i) => ({
      date,
      count: groupByDate(recentResults, 'submittedAt', dateLabels)[i],
    }));

    // ── 环比（月环比：当前月 vs 上月）──
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      currMonthUsers,
      prevMonthUsers,
      currMonthQuizzes,
      prevMonthQuizzes,
      currMonthResults,
      prevMonthResults,
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: currentMonthStart, lte: now } } }),
      prisma.user.count({
        where: { createdAt: { gte: previousMonthStart, lte: previousMonthEnd } },
      }),
      prisma.quiz.count({ where: { createdAt: { gte: currentMonthStart, lte: now } } }),
      prisma.quiz.count({
        where: { createdAt: { gte: previousMonthStart, lte: previousMonthEnd } },
      }),
      prisma.quizResult.count({ where: { submittedAt: { gte: currentMonthStart, lte: now } } }),
      prisma.quizResult.count({
        where: { submittedAt: { gte: previousMonthStart, lte: previousMonthEnd } },
      }),
    ]);

    function growth(curr: number, prev: number): number | null {
      if (prev === 0) return curr > 0 ? null : 0; // null = 无法计算(上月为0)
      return Math.round(((curr - prev) / prev) * 10000) / 100; // 百分比, 保留两位
    }

    const momComparison = {
      currentMonth: { users: currMonthUsers, quizzes: currMonthQuizzes, results: currMonthResults },
      previousMonth: { users: prevMonthUsers, quizzes: prevMonthQuizzes, results: prevMonthResults },
      growth: {
        users: growth(currMonthUsers, prevMonthUsers),
        quizzes: growth(currMonthQuizzes, prevMonthQuizzes),
        results: growth(currMonthResults, prevMonthResults),
      },
    };

    // ── 今日概览 ──
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [todayNewUsers, todayNewQuizzes, todayResults] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.quiz.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.quizResult.count({ where: { submittedAt: { gte: todayStart } } }),
    ]);

    return NextResponse.json({
      // 基础
      totalUsers,
      registeredUsers,
      guestUsers,
      onlineUsers,
      totalQuizzes,
      officialQuizzes,
      // 订阅 & 停用
      subscribedUsers,
      disabledUsers,
      // 今日
      todayNewUsers,
      todayNewQuizzes,
      todayResults,
      // 职业分布
      occupations,
      // 专业分布
      professions,
      // 权限分布
      permissions,
      // 30 天趋势
      userTrend,
      quizTrend,
      resultTrend,
      // 环比
      momComparison,
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    return NextResponse.json({ error: '获取统计数据失败' }, { status: 500 });
  }
}
