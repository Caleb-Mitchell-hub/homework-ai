import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { buildFollowUpPrompt } from '@/lib/ai/followup-prompt';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  // 1. 鉴权
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  // 2. 解析请求体
  const body = await request.json().catch(() => null);
  const {
    questionId,
    questionContent,
    questionType,
    answer,
    aiExplanation,
    conversationHistory,
    newQuestion,
  } = body || {};

  if (!questionId || !questionContent || !newQuestion?.trim()) {
    return NextResponse.json(
      { error: 'questionId、questionContent 和 newQuestion 必填' },
      { status: 400 },
    );
  }

  // 3. 获取活跃的 AI 厂商
  const provider = await prisma.aIProviderConfig.findFirst({
    where: { isActive: true },
  });
  if (!provider) {
    return NextResponse.json({ error: '未配置 AI 厂商' }, { status: 502 });
  }

  // 4. 拼装 messages
  const systemPrompt = buildFollowUpPrompt({
    questionContent,
    questionType: questionType || 'unknown',
    answer,
    aiExplanation,
  });

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // 追加对话历史
  if (Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory as Message[]) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // 当前追问
  messages.push({ role: 'user', content: newQuestion.trim() });

  // 5. 调 AI（不扣积分、不写缓存）
  try {
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const content = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: messages as any,
      signal: request.signal,
      maxTokens: 1000,
      temperature: 0.5,
    });

    if (!content?.trim()) {
      return NextResponse.json(
        { error: 'AI 返回了空内容，请换个问法重试' },
        { status: 502 },
      );
    }

    return NextResponse.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai/followup] error:', msg);
    return NextResponse.json(
      { error: `AI 调用失败: ${msg.slice(0, 200)}` },
      { status: 502 },
    );
  }
}
