import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const professions = await prisma.profession.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, assignments: true } } },
    });
    return NextResponse.json({
      professions: professions.map((p) => ({
        id: p.id,
        name: p.name,
        userCount: p._count.users,
        assignmentCount: p._count.assignments,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error('获取职业列表失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const { name } = await request.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: '职业名称不能为空' }, { status: 400 });
    }
    const trimmed = name.trim();
    if (trimmed.length > 20) {
      return NextResponse.json({ error: '职业名称最长 20 个字符' }, { status: 400 });
    }
    const exists = await prisma.profession.findUnique({ where: { name: trimmed } });
    if (exists) {
      return NextResponse.json({ error: '职业名称已存在' }, { status: 409 });
    }
    const profession = await prisma.profession.create({ data: { name: trimmed } });
    return NextResponse.json({ profession }, { status: 201 });
  } catch (error) {
    console.error('创建职业失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
