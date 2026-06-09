import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const professions = await prisma.profession.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { users: true } } },
    });
    return NextResponse.json({
      professions: professions.map((p) => ({
        id: p.id,
        name: p.name,
        userCount: p._count.users,
      })),
    });
  } catch (error) {
    console.error('获取职业列表失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
