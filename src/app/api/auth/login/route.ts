import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { generateToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    if (user.isGuest) {
      return NextResponse.json({ error: '游客账号不支持登录' }, { status: 401 });
    }

    if (user.disabled) {
      return NextResponse.json({ error: '账号已被停用，请联系管理员' }, { status: 403 });
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      isGuest: user.isGuest,
    });

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        isGuest: user.isGuest,
      },
    });
  } catch (error) {
    console.error('登录错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}