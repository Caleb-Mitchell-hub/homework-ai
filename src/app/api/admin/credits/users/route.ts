import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromHeaders, verifyAdminToken } from '@/lib/admin-auth';

/**
 * GET /api/admin/credits/users
 * Query: ?page=1&pageSize=20&sort=balance_desc&keyword=
 * - 用户积分排名列表
 * - 可按余额排序、按 username/occupation 搜索
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
    const sort = url.searchParams.get('sort') || 'balance_desc'; // balance_desc | balance_asc | consumed_desc
    const keyword = url.searchParams.get('keyword') || '';

    const where: any = { isGuest: false };
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { occupation: { contains: keyword } },
        { profession: { is: { name: { contains: keyword } } } },
      ];
    }

    let orderBy: any = { credits: 'desc' };
    if (sort === 'balance_asc') orderBy = { credits: 'asc' };
    // 其它排序（consumed_desc）在后面 SQL 拼到 subquery；这里只支持 balance 方向

    const [total, list] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
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
          _count: { select: { creditLogs: true, explanations: true, checkIns: true } },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      list: list.map((u) => ({
        id: u.id,
        username: u.username,
        occupation: u.occupation,
        professionName: u.profession?.name ?? null,
        balance: u.credits,
        disabled: u.disabled,
        createdAt: u.createdAt,
        lastActiveAt: u.lastActiveAt,
        ledgerCount: u._count.creditLogs,
        explanationCount: u._count.explanations,
        checkInCount: u._count.checkIns,
      })),
    });
  } catch (error) {
    console.error('用户积分列表失败:', error);
    return NextResponse.json({ error: '用户积分列表失败' }, { status: 500 });
  }
}
