import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import bcrypt from 'bcryptjs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const payload = verifyAdminToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const { newPassword } = await request.json();

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: '密码至少 6 位' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    if (target.isGuest) {
      return NextResponse.json({ error: '游客账号不支持重置密码' }, { status: 400 });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id },
      data: { password: hashed },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('重置密码失败:', error);
    return NextResponse.json({ error: '重置密码失败' }, { status: 500 });
  }
}
