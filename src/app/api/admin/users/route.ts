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
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const type = (searchParams.get('type') || 'all').toLowerCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '100') || 100, 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0') || 0, 0);

    const where: any = {};
    if (q) where.username = { contains: q };
    if (type === 'guest') where.isGuest = true;
    else if (type === 'registered') where.isGuest = false;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          admin: { select: { id: true } },
          _count: { select: { quizzes: true, results: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        isGuest: u.isGuest,
        disabled: u.disabled,
        isAdmin: !!u.admin,
        lastActiveAt: u.lastActiveAt,
        createdAt: u.createdAt,
        quizCount: u._count.quizzes,
        resultCount: u._count.results,
      })),
      total,
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
  }
}
