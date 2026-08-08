import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { PREDEFINED_QUESTIONS } from '@/lib/securityQuestions';

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
    const { securityQuestion, securityAnswer } = body || {};

    if (!securityQuestion || !securityAnswer) {
      return NextResponse.json({ error: '密保问题和答案不能为空' }, { status: 400 });
    }

    const validKeys = PREDEFINED_QUESTIONS.map((q) => q.key);
    if (!validKeys.includes(securityQuestion)) {
      return NextResponse.json({ error: '无效的密保问题' }, { status: 400 });
    }

    const answerTrimmed = String(securityAnswer).trim();
    if (answerTrimmed.length < 2) {
      return NextResponse.json({ error: '密保答案至少2个字符' }, { status: 400 });
    }

    const securityAnswerHash = await bcrypt.hash(answerTrimmed.toLowerCase(), 10);

    await prisma.user.update({
      where: { id: payload.userId },
      data: { securityQuestion, securityAnswerHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('设置密保失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
