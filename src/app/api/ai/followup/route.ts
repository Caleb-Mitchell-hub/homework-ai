import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { callChatStream } from '@/lib/ai/providers';
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

  if (Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory as Message[]) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  messages.push({ role: 'user', content: newQuestion.trim() });

  const apiKey = decryptApiKey(provider.apiKeyCipher);

  // 5. 流式 SSE 响应
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* controller closed */ }
      };

      let fullContent = '';

      try {
        for await (const chunk of callChatStream({
          baseURL: provider.baseURL,
          apiKey,
          model: provider.model,
          messages: messages as any,
          signal: request.signal,
          maxTokens: 1000,
          temperature: 0.5,
        })) {
          if (chunk.done) break;
          fullContent += chunk.delta;
          send({ type: 'delta', content: chunk.delta });
        }

        if (!fullContent.trim()) {
          send({ type: 'error', message: 'AI 返回了空内容，请换个问法重试' });
          return;
        }

        send({ type: 'done', fullContent });

        // 6. 持久化（流完成后异步写入，不影响响应）
        try {
          await prisma.aIFollowUp.createMany({
            data: [
              { userId, questionId, role: 'user', content: newQuestion.trim() },
              { userId, questionId, role: 'assistant', content: fullContent },
            ],
          });
        } catch (e) {
          console.error('[ai/followup] 持久化失败:', e);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err ?? '未知错误');
        console.error('[ai/followup] stream error:', msg);
        send({ type: 'error', message: `AI 调用失败: ${msg.slice(0, 200)}` });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
