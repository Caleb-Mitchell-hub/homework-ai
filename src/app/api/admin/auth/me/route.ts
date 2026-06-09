import { NextResponse } from 'next/server';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  }

  const admin = await prisma.admin.findUnique({
    where: { id: payload.adminId },
    include: { user: true },
  });

  if (!admin) {
    return NextResponse.json({ error: '管理员不存在' }, { status: 404 });
  }

  return NextResponse.json({
    admin: {
      id: admin.id,
      username: admin.user.username,
    },
  });
}
