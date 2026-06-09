/**
 * POST /api/auth/forgot-password
 *
 * 忘记密码三步流程(单 endpoint,通过 step 区分):
 *   1) step = "get_question"  入参 { username }  → { questionText }
 *      - 用户不存在时返回相同 404 文案,避免用户名枚举
 *   2) step = "verify_answer" 入参 { username, answer } → { resetToken }
 *      - resetToken 是短期(10 分钟)session id,只能用于步骤 3
 *   3) step = "reset_password" 入参 { resetToken, newPassword } → { success: true }
 *      - 验证 resetToken + 改密 + 销毁该 resetToken
 *
 * 答案在存储/比对前做 .trim().toLowerCase() 标准化,与注册时一致。
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createSession, getSession, destroySession } from '@/lib/sessionStore';
import { getQuestionText } from '@/lib/securityQuestions';

const RESET_TTL_MS = 10 * 60 * 1000; // 10 分钟

interface ResetSession {
  userId: string;
  purpose: 'password-reset';
}

function isValidPassword(p: string): boolean {
  return typeof p === 'string' && p.length >= 6;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const step = String(body.step ?? '');

  try {
    // ===================== 步骤 1: 获取密保问题 =====================
    if (step === 'get_question') {
      const username = String(body.username ?? '').trim();
      if (!username) {
        return NextResponse.json({ error: '请输入用户名' }, { status: 400 });
      }
      const user = await prisma.user.findUnique({
        where: { username },
        select: { securityQuestion: true, isGuest: true },
      });
      // 游客 / 未设置密保的用户都不允许忘记密码
      if (!user || user.isGuest || !user.securityQuestion) {
        return NextResponse.json({ error: '该账号未设置密保,无法找回密码' }, { status: 404 });
      }
      return NextResponse.json({
        questionKey: user.securityQuestion,
        questionText: getQuestionText(user.securityQuestion),
      });
    }

    // ===================== 步骤 2: 验证密保答案 =====================
    if (step === 'verify_answer') {
      const username = String(body.username ?? '').trim();
      const answer = String(body.answer ?? '').trim().toLowerCase();
      if (!username || !answer) {
        return NextResponse.json({ error: '请输入用户名和密保答案' }, { status: 400 });
      }
      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true, securityAnswerHash: true, isGuest: true },
      });
      if (!user || user.isGuest || !user.securityAnswerHash) {
        return NextResponse.json({ error: '密保答案错误' }, { status: 401 });
      }
      const ok = await bcrypt.compare(answer, user.securityAnswerHash);
      if (!ok) {
        return NextResponse.json({ error: '密保答案错误' }, { status: 401 });
      }
      const resetToken = createSession<ResetSession>(
        { userId: user.id, purpose: 'password-reset' },
        RESET_TTL_MS
      );
      return NextResponse.json({ resetToken });
    }

    // ===================== 步骤 3: 重置密码 =====================
    if (step === 'reset_password') {
      const resetToken = String(body.resetToken ?? '');
      const newPassword = String(body.newPassword ?? '');
      if (!resetToken) {
        return NextResponse.json({ error: '校验已过期,请重新开始' }, { status: 401 });
      }
      if (!isValidPassword(newPassword)) {
        return NextResponse.json({ error: '新密码至少 6 个字符' }, { status: 400 });
      }
      const session = getSession<ResetSession>(resetToken);
      if (!session || session.purpose !== 'password-reset') {
        return NextResponse.json({ error: '校验已过期,请重新开始' }, { status: 401 });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: session.userId },
        data: { password: hashedPassword },
      });
      // 销毁 resetToken,防止复用
      destroySession(resetToken);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '无效的步骤' }, { status: 400 });
  } catch (error) {
    console.error('忘记密码错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
