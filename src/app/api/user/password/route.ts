import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

function isValidPassword(p: string): boolean {
  return typeof p === 'string' && p.length >= 6;
}

export async function PUT(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }
    if (payload.isGuest) {
      return NextResponse.json({ error: '游客账号不支持此操作，请先注册' }, { status: 403 });
    }

    const body = await request.json();
    const { oldPassword, newPassword } = body || {};

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: '请输入当前密码和新密码' }, { status: 400 });
    }
    if (!isValidPassword(newPassword)) {
      return NextResponse.json({ error: '新密码至少需要6个字符' }, { status: 400 });
    }
    if (oldPassword === newPassword) {
      return NextResponse.json({ error: '新密码不能与当前密码相同' }, { status: 400 });
    }

    // 获取当前用户密码哈希与停用状态
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { password: true, disabled: true },
    });
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    if (user.disabled) {
      return NextResponse.json({ error: '账号已被停用' }, { status: 403 });
    }

    // 验证旧密码
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) {
      return NextResponse.json({ error: '当前密码不正确' }, { status: 400 });
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: payload.userId },
      data: { password: hashedPassword },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('修改密码失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
