import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromHeaders, verifyAdminToken } from '@/lib/admin-auth';

/**
 * GET /api/admin/credits/ledger
 * Query: ?page=1&pageSize=20&reason=ai_explain&userId=xxx&from=2026-07-01&to=2026-07-24&keyword=xxx
 * - 分页流水列表
 * - 可按 reason / userId / 日期范围 / 关键字筛选
 */
export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 20)));
    const reason = url.searchParams.get('reason') || '';
    const userId = url.searchParams.get('userId') || '';
    const from = url.searchParams.get('from') || '';
    const to = url.searchParams.get('to') || '';
    const keyword = url.searchParams.get('keyword') || '';

    const where: any = {};
    if (reason) where.reason = reason;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        where.createdAt.lte = t;
      }
    }
    if (keyword) {
      where.user = {
        OR: [
          { username: { contains: keyword } },
          { occupation: { contains: keyword } },
        ],
      };
    }

    const [total, list, summary] = await Promise.all([
      prisma.creditLedger.count({ where }),
      prisma.creditLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              occupation: true,
              profession: { select: { name: true } },
            },
          },
        },
      }),
      prisma.creditLedger.aggregate({
        where,
        _sum: { delta: true },
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      totalDelta: summary._sum.delta || 0,
      list: list.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.user.username,
        occupation: r.user.occupation,
        professionName: r.user.profession?.name ?? null,
        delta: r.delta,
        reason: r.reason,
        refId: r.refId,
        balance: r.balance,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('流水列表失败:', error);
    return NextResponse.json({ error: '流水列表失败' }, { status: 500 });
  }
}
