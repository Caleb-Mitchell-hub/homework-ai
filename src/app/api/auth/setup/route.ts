import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { PREDEFINED_QUESTIONS } from '@/lib/securityQuestions';

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { securityQuestion, securityAnswer, professionId } = await request.json();

    const data: Record<string, unknown> = {};

    // 处理密保问题
    if (securityQuestion !== undefined || securityAnswer !== undefined) {
      if (!securityQuestion || !securityAnswer) {
        return NextResponse.json({ error: '密保问题和答案需同时提供' }, { status: 400 });
      }
      const validKeys = PREDEFINED_QUESTIONS.map((q) => q.key);
      if (!validKeys.includes(securityQuestion)) {
        return NextResponse.json({ error: '无效的密保问题' }, { status: 400 });
      }
      const answerTrimmed = String(securityAnswer).trim();
      if (answerTrimmed.length < 2) {
        return NextResponse.json({ error: '密保答案至少 2 个字符' }, { status: 400 });
      }
      data.securityQuestion = securityQuestion;
      data.securityAnswerHash = await bcrypt.hash(answerTrimmed.toLowerCase(), 10);
    }

    // 处理职业选择
    if (professionId !== undefined) {
      if (professionId !== null && professionId !== '') {
        const profession = await prisma.profession.findUnique({ where: { id: professionId } });
        if (!profession) {
          return NextResponse.json({ error: '职业不存在' }, { status: 400 });
        }
      }
      data.professionId = professionId || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '没有需要更新的字段' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: payload.userId },
      data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('设置失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
