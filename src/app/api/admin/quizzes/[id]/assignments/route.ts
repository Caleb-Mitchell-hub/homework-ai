import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

// GET: 查询某题库的分配情况 + 所有职业及其用户（供分配弹窗用）
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const { id: quizId } = await params;

    const assignments = await prisma.quizAssignment.findMany({
      where: { quizId },
      select: { professionId: true, userId: true },
    });

    const professions = await prisma.profession.findMany({
      orderBy: { name: 'asc' },
      include: {
        users: {
          select: { id: true, username: true },
          orderBy: { username: 'asc' },
        },
      },
    });

    return NextResponse.json({
      assignments: assignments.map((a) => ({
        professionId: a.professionId,
        userId: a.userId,
      })),
      professions: professions.map((p) => ({
        id: p.id,
        name: p.name,
        users: p.users.map((u) => ({ id: u.id, username: u.username })),
      })),
    });
  } catch (error) {
    console.error('获取分配信息失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// PUT: 全量替换分配（删旧建新）
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const { id: quizId } = await params;
    const { assignments } = await request.json();

    if (!Array.isArray(assignments)) {
      return NextResponse.json({ error: 'assignments 必须为数组' }, { status: 400 });
    }

    // 合并大方向分配：同一 professionId 多条 userId=null 合并为一条
    const merged = new Map<string, Set<string>>();
    for (const a of assignments) {
      const pid = a.professionId;
      if (!pid) continue;
      if (!merged.has(pid)) merged.set(pid, new Set());
      if (a.userId) merged.get(pid)!.add(a.userId);
    }

    // 构建写入数据
    const toCreate: { quizId: string; professionId: string; userId: string | null }[] = [];
    for (const [professionId, userIds] of merged) {
      if (userIds.size === 0) {
        toCreate.push({ quizId, professionId, userId: null });
      } else {
        for (const userId of userIds) {
          toCreate.push({ quizId, professionId, userId });
        }
      }
    }

    // 事务：删旧建新
    await prisma.$transaction(async (tx) => {
      await tx.quizAssignment.deleteMany({ where: { quizId } });
      if (toCreate.length > 0) {
        await tx.quizAssignment.createMany({ data: toCreate });
      }
    });

    return NextResponse.json({ success: true, count: toCreate.length });
  } catch (error) {
    console.error('更新分配失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
