import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

/** 删除用户自建分类 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const { id } = await params;

  // 仅允许删除自己的分类
  const cat = await prisma.quizCategory.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!cat) {
    return NextResponse.json({ error: '分类不存在' }, { status: 404 });
  }
  if (cat.userId !== userId) {
    return NextResponse.json({ error: '无权操作' }, { status: 403 });
  }

  await prisma.quizCategory.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
