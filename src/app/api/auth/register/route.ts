import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { PREDEFINED_QUESTIONS } from '@/lib/securityQuestions';

export async function POST(request: Request) {
  try {
    const { username, password, securityQuestion, securityAnswer, professionId } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名和密码不能为空' }, { status: 400 });
    }

    if (username.length < 3 || username.length > 20) {
      return NextResponse.json({ error: '用户名长度需在3-20个字符之间' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '密码长度至少6个字符' }, { status: 400 });
    }

    // 密保问题可选：用户注册后可单独设置
    let hashedAnswer: string | null = null;
    let finalSecurityQuestion: string | null = null;
    if (securityQuestion || securityAnswer) {
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
      hashedAnswer = await bcrypt.hash(answerTrimmed.toLowerCase(), 10);
      finalSecurityQuestion = securityQuestion;
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        isGuest: false,
        securityQuestion: finalSecurityQuestion,
        securityAnswerHash: hashedAnswer,
        professionId: professionId || null,
      },
    });

    return NextResponse.json({
      id: user.id,
      username: user.username,
      isGuest: user.isGuest,
    });
  } catch (error) {
    console.error('注册错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}