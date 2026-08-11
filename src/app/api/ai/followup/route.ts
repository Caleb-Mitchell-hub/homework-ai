import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { callChatStream } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { buildFollowUpPrompt } from '@/lib/ai/followup-prompt';

const RETRY_MAX = 2;

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
  if (payload?.isGuest) {
    return NextResponse.json({ error: '游客暂不支持 AI 追问，请登录后使用' }, { status: 403 });
  }

  updateUserActiveTime(userId);

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
      let lastErr: unknown;

      // 带重试的流式调用（最多 RETRY_MAX+1 次尝试）
      for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
        if (attempt > 0) {
          fullContent = '';
          // 通知前端正在重试
          send({ type: 'retry', message: `第 ${attempt} 次尝试失败，正在重试...` });
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }

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

          if (fullContent.trim()) break; // 成功，退出重试循环
          lastErr = new Error('AI 返回了空内容');
        } catch (err) {
          lastErr = err;
          if (attempt < RETRY_MAX) {
            console.warn(`[ai/followup] 第 ${attempt + 1} 次尝试失败，${500 * (attempt + 1)}ms 后重试:`, err);
            continue;
          }
        }
      }

      if (!fullContent.trim()) {
        const msg = lastErr instanceof Error ? (lastErr as Error).message : String(lastErr ?? '未知错误');
        console.error('[ai/followup] 全部重试耗尽:', msg);
        send({ type: 'error', message: `AI 调用失败(已重试 ${RETRY_MAX} 次): ${msg.slice(0, 200)}` });
        return;
      }

      send({ type: 'done', fullContent });

      // 持久化（流完成后异步写入，不影响响应）
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

      try { controller.close(); } catch {}
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
