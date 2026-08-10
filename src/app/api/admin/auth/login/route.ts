import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { generateAdminToken } from '@/lib/admin-auth';
import { getClientIP, recordLoginLog } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    const ip = getClientIP(request);
    const userAgent = request.headers.get('user-agent');

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    const admin = await prisma.admin.findFirst({
      where: {
        user: {
          username,
        },
      },
      include: {
        user: true,
      },
    });

    if (!admin) {
      return NextResponse.json({ error: '管理员账号不存在' }, { status: 401 });
    }

    const validPassword = await bcrypt.compare(password, admin.user.password);
    if (!validPassword) {
      await recordLoginLog(admin.userId, ip, userAgent, false);
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }

    const token = generateAdminToken({
      adminId: admin.id,
      userId: admin.userId,
      username: admin.user.username,
    });

    // 记录管理员登录成功日志
    await recordLoginLog(admin.userId, ip, userAgent, true);

    return NextResponse.json({
      token,
      admin: {
        id: admin.id,
        username: admin.user.username,
      },
    });
  } catch (error) {
    console.error('管理员登录错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
