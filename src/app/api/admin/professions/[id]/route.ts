import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const { id } = await params;
    const profession = await prisma.profession.findUnique({ where: { id } });
    if (!profession) {
      return NextResponse.json({ error: '职业不存在' }, { status: 404 });
    }
    // 将该职业下所有用户的 professionId 置 null
    await prisma.user.updateMany({
      where: { professionId: id },
      data: { professionId: null },
    });
    // 删除职业（级联删除 QuizAssignment）
    await prisma.profession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除职业失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
