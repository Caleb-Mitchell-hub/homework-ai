import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseMarkdown } from '@/lib/parser';
import { aiParseQuestions } from '@/lib/ai/parser';
import { normalizeAIOutputToQuestions } from '@/lib/ai/normalize';
import { getSession } from '@/lib/sessionStore';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { aiRateLimiter } from '@/lib/ai/rate-limit';

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
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!aiRateLimiter.check(userKey, RATE_MAX, RATE_WINDOW_MS)) {
    return new Response(JSON.stringify({ error: '请求过于频繁' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => null);
  const text: string = body?.text ?? '';
  const mode: 'local' | 'ai' = body?.mode === 'ai' ? 'ai' : 'local';
  if (!text.trim()) {
    return new Response(JSON.stringify({ error: 'text 为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller may be closed by client
        }
      };

      try {
        send({ progress: 5, message: '正在准备...' });

        if (mode === 'local') {
          send({ progress: 30, message: '正在解析 Markdown...' });
          await new Promise((r) => setTimeout(r, 50));
          const raw = parseMarkdown(text);
          send({ progress: 85, message: '规范化题目...' });
          await new Promise((r) => setTimeout(r, 50));
          const questions = normalizeAIOutputToQuestions(raw, genId);
          send({ progress: 100, message: '解析完成', questions });
        } else {
          const provider = await prisma.aIProviderConfig.findFirst({
            where: { isActive: true },
          });
          if (!provider) {
            send({ progress: 0, message: '未配置 AI 厂商', error: '未配置 AI 厂商' });
            return;
          }
          send({ progress: 30, message: '调用 AI 厂商...' });
          send({ progress: 60, message: '等待 AI 响应(通常 10-30 秒)...' });
          const raw = await aiParseQuestions({ text, provider });
          send({ progress: 90, message: '规范化题目...' });
          const questions = normalizeAIOutputToQuestions(raw, genId);
          send({ progress: 100, message: '解析完成', questions });
        }
      } catch (err: any) {
        send({ progress: 0, message: err?.message ?? '解析失败', error: err?.message ?? '解析失败' });
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