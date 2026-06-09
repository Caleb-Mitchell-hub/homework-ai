import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }
    const { professionId } = await request.json();
    // professionId 可为 null（取消职业选择）
    if (professionId !== null && professionId !== undefined) {
      const profession = await prisma.profession.findUnique({ where: { id: professionId } });
      if (!profession) {
        return NextResponse.json({ error: '职业不存在' }, { status: 400 });
      }
    }
    await prisma.user.update({
      where: { id: payload.userId },
      data: { professionId: professionId ?? null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新职业失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
