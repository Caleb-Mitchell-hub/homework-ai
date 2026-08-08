import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { explainQuestion, InsufficientCreditsError } from '@/lib/credits/explain';

export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { questionId, content, type, userAnswer, correctAnswer, options } = body || {};
  if (!questionId || !content) {
    return NextResponse.json({ error: 'questionId 和 content 必填' }, { status: 400 });
  }

  try {
    const result = await explainQuestion({
      userId,
      questionId,
      questionContent: content,
      questionType: type,
      userAnswer,
      correctAnswer,
      options,
      signal: request.signal,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: '积分不足', required: err.required, balance: err.balance },
        { status: 400 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai/explain] error:', msg);
    return NextResponse.json({ error: `解析失败: ${msg.slice(0, 200)}` }, { status: 502 });
  }
}