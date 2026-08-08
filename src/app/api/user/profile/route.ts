import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function isValidUsername(u: string): boolean {
  return typeof u === 'string' && u.length >= 3 && u.length <= 20;
}

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
    if (payload.isGuest) {
      return NextResponse.json({ error: '游客账号不支持此操作，请先注册' }, { status: 403 });
    }

    // 检查账号是否被停用
    const currentUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { disabled: true },
    });
    if (!currentUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    if (currentUser.disabled) {
      return NextResponse.json({ error: '账号已被停用' }, { status: 403 });
    }

    const body = await request.json();
    const { username, occupation } = body || {};

    if (!username && occupation === undefined) {
      return NextResponse.json({ error: '请至少提供用户名或职业' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    // 用户名校验
    if (username !== undefined) {
      if (!isValidUsername(username)) {
        return NextResponse.json({ error: '用户名长度需在3-20个字符之间' }, { status: 400 });
      }
      // 唯一性查重（排除自身）
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== payload.userId) {
        return NextResponse.json({ error: '用户名已被占用' }, { status: 409 });
      }
      data.username = username;
    }

    // 职业
    if (occupation !== undefined) {
      const occ = typeof occupation === 'string' ? occupation.trim() : '';
      if (occ.length > 50) {
        return NextResponse.json({ error: '职业名称不能超过50个字符' }, { status: 400 });
      }
      data.occupation = occ || null;
    }

    const user = await prisma.user.update({
      where: { id: payload.userId },
      data,
      select: { id: true, username: true, occupation: true },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error('修改个人信息失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
