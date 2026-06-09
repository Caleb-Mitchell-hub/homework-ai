import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

export async function PATCH(
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
    const { disabled } = await request.json();

    if (typeof disabled !== 'boolean') {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    if (id === payload.userId) {
      return NextResponse.json({ error: '不能停用自己' }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      include: { admin: true },
    });
    if (!target) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    if (target.admin) {
      return NextResponse.json({ error: '不能停用管理员' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { disabled },
      select: { id: true, disabled: true },
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (error) {
    console.error('切换用户状态失败:', error);
    return NextResponse.json({ error: '切换用户状态失败' }, { status: 500 });
  }
}
