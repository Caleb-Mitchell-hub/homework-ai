import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromHeaders } from '@/lib/admin-auth';
import { verifyAdminToken } from '@/lib/admin-auth';
import { getSession } from '@/lib/sessionStore';
import { aiParseQuestions } from '@/lib/ai/parser';
import { aiRateLimiter } from '@/lib/ai/rate-limit';

const MAX_TEXT_CHARS = 60_000;
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function resolveUserId(req: NextRequest): string | null {
  const token = getTokenFromHeaders(req);
  if (!token) return null;
  // 优先 admin
  const admin = verifyAdminToken(token);
  if (admin) return `admin:${admin.adminId}`;
  const user = getSession<{ userId: string; type?: string }>(token);
  if (user?.userId) return `user:${user.userId}`;
  return null;
}

export async function POST(req: NextRequest) {
  const userKey = resolveUserId(req);
  if (!userKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!aiRateLimiter.check(userKey, RATE_MAX, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: '请求过于频繁,请稍后再试' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const text: string = body?.text ?? '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'text 为空' }, { status: 400 });
  }

  // 选 provider: 指定 id > 激活
  let provider;
  if (body?.providerId) {
    provider = await prisma.aIProviderConfig.findUnique({ where: { id: body.providerId } });
  } else {
    provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
  }
  if (!provider) {
    return NextResponse.json({ error: '未配置 AI 厂商' }, { status: 503 });
  }

  const warning = text.length > MAX_TEXT_CHARS
    ? `文本超过 ${MAX_TEXT_CHARS} 字符,已截断`
    : undefined;

  try {
    const questions = await aiParseQuestions({ text, provider });
    return NextResponse.json({ questions, warning });
  } catch (err: any) {
    return NextResponse.json(
      { error: `AI 解析失败: ${String(err?.message ?? err).slice(0, 200)}` },
      { status: 502 }
    );
  }
}
