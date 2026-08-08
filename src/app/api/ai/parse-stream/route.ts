import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseMarkdown } from '@/lib/parser';
import { aiParseQuestionsStream } from '@/lib/ai/parser';
import { normalizeAIOutputToQuestions } from '@/lib/ai/normalize';
import { getSession } from '@/lib/sessionStore';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { aiRateLimiter } from '@/lib/ai/rate-limit';

const MAX_TEXT_CHARS = 60_000;
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function genId(): string {
  return 'q_' + Math.random().toString(36).slice(2, 10);
}

function resolveUserId(req: NextRequest): string | null {
  const token = getTokenFromHeaders(req);
  if (!token) return null;
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
  const mode: 'local' | 'ai' = body?.mode === 'ai' ? 'ai' : 'local';
  const providerId: string | undefined = body?.providerId;
  if (!text.trim()) {
    return NextResponse.json({ error: 'text 为空' }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let aborted = false;
      const send = (data: object) => {
        if (aborted || req.signal.aborted) {
          aborted = true;
          throw new Error('aborted');
        }
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          aborted = true;
          throw new Error('aborted');
        }
      };

      try {
        send({ progress: 5, message: '正在准备...' });

        if (mode === 'local') {
          // 本地解析是同步的,合并步骤减少不必要的网络往返
          let localText = text;
          if (localText.length > MAX_TEXT_CHARS) {
            send({ progress: 40, message: `文本超过 ${MAX_TEXT_CHARS} 字符,已截断` });
            localText = localText.slice(0, MAX_TEXT_CHARS);
          }
          const raw = parseMarkdown(localText);
          if (req.signal.aborted) throw new Error('aborted');
          const questions = normalizeAIOutputToQuestions(raw, genId);
          send({ progress: 100, message: `解析完成，共 ${questions.length} 题`, questions });
        } else {
          // 选 provider: 指定 id > 激活
          let provider;
          if (providerId) {
            provider = await prisma.aIProviderConfig.findUnique({ where: { id: providerId } });
          } else {
            provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
          }
          if (!provider) {
            send({ progress: 0, message: '未配置 AI 厂商', error: '未配置 AI 厂商' });
            return;
          }
          if (req.signal.aborted) throw new Error('aborted');
          // 真实进度:流式消费 AI 输出,逐 chunk 上报字符进度
          for await (const evt of aiParseQuestionsStream({
            text,
            provider,
            signal: req.signal,
          })) {
            if (req.signal.aborted) throw new Error('aborted');
            if (evt.type === 'progress') {
              send({ progress: evt.data.progress, message: evt.data.message });
            } else if (evt.type === 'delta') {
              // 逐字流式输出原始 AI 文本到前端
              send({ type: 'delta', content: evt.content });
            } else if (evt.type === 'error') {
              send({ progress: 0, message: evt.error, error: evt.error });
              return;
            } else if (evt.type === 'complete') {
              send({ progress: 100, message: '解析完成', questions: evt.questions });
              return;
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'aborted') {
          // 客户端断开,静默关闭,不发送错误事件
        } else {
          const rawMsg = err instanceof Error ? err.message : String(err ?? '解析失败');
          const userMsg = `解析失败: ${rawMsg.slice(0, 200)}`;
          try {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ progress: 0, message: userMsg, error: userMsg })}\n\n`));
          } catch {
            // controller may already be closed
          }
        }
      } finally {
        try { controller.close(); } catch {
          // already closed
        }
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
