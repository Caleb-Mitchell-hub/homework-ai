import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/ai/crypto';
import { callChatStream } from '@/lib/ai/providers';
import { buildParseFixSystemPrompt } from '@/lib/ai/parse-fix-prompt';
import { normalizeAIOutputToQuestions, autoConvertEssayToInterview } from '@/lib/ai/normalize';
import { extractJson } from '@/lib/ai/json-extractor';
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

interface FixRequestBody {
  originalText: string;
  currentQuestions: unknown[];
  userFeedback: string;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}

export async function POST(req: NextRequest) {
  const userKey = resolveUserId(req);
  if (!userKey) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  if (!aiRateLimiter.check(userKey, RATE_MAX, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: '请求过于频繁，请稍后再试' }, { status: 429 });
  }

  const body: FixRequestBody = await req.json().catch(() => ({} as FixRequestBody));
  const originalText: string = (body?.originalText ?? '').slice(0, MAX_TEXT_CHARS);
  const currentQuestions: unknown[] = body?.currentQuestions ?? [];
  const userFeedback: string = (body?.userFeedback ?? '').trim();
  const conversationHistory = body?.conversationHistory ?? [];

  if (!originalText.trim()) {
    return NextResponse.json({ error: '原始文本不能为空' }, { status: 400 });
  }
  if (currentQuestions.length === 0) {
    return NextResponse.json({ error: '当前题目集不能为空' }, { status: 400 });
  }
  if (!userFeedback) {
    return NextResponse.json({ error: '修正反馈不能为空' }, { status: 400 });
  }

  // 查 AI 厂商
  const provider = await prisma.aIProviderConfig.findFirst({
    where: { isActive: true },
  });
  if (!provider) {
    return NextResponse.json(
      { error: '没有可用的 AI 服务商，请联系管理员配置' },
      { status: 500 },
    );
  }

  // 首轮传入原始文本，后续轮次省略以节省 prompt token（约减少 50-80% 系统提示词大小）
  const isFirstRound = conversationHistory.length === 0;
  const systemPrompt = buildParseFixSystemPrompt({
    originalText: isFirstRound ? originalText : undefined,
    currentQuestions,
  });
  console.log(
    '[parse-fix] 系统提示词构建完成, isFirstRound=%s, promptLen=%d',
    isFirstRound,
    systemPrompt.length,
  );

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
        send({
          type: 'progress',
          stage: 'generating',
          message: 'AI 正在分析反馈并修正题目…',
          progress: 10,
        });

        // 构建对话消息：系统提示词 + 历史对话 + 当前反馈
        const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
          { role: 'system', content: systemPrompt },
        ];
        for (const msg of conversationHistory) {
          messages.push({ role: msg.role, content: msg.content });
        }
        messages.push({ role: 'user', content: userFeedback });

        const apiKey = decryptApiKey(provider.apiKeyCipher);

        console.log(
          '[parse-fix] 开始修正, provider: %s, model: %s, historyLen: %d, feedbackLen: %d',
          provider.baseURL,
          provider.model,
          conversationHistory.length,
          userFeedback.length,
        );

        // 流式调用 AI
        let fullContent = '';
        const tStreamStart = Date.now();
        const generator = callChatStream({
          baseURL: provider.baseURL,
          apiKey,
          model: provider.model,
          messages,
          jsonMode: false,
          maxTokens: 4096,
          temperature: 0.7,
          signal: req.signal,
        });

        for await (const chunk of generator) {
          if (req.signal.aborted) throw new Error('aborted');
          if (chunk.delta) {
            fullContent += chunk.delta;
            send({ type: 'delta', text: chunk.delta });
          }
        }

        send({
          type: 'progress',
          stage: 'parsing',
          message: '正在解析修正后的题目…',
          progress: 85,
        });

        console.log('[parse-fix] AI 返回 %d 字符，AI流式耗时=%dms，开始解析', fullContent.length, Date.now() - tStreamStart);

        // 提取 JSON 并解析题目
        const tParseStart = Date.now();
        let parsed: { questions?: unknown[] };
        try {
          parsed = extractJson<{ questions?: unknown[] }>(fullContent);
        } catch {
          console.error('[parse-fix] JSON 解析失败');
          send({
            type: 'error',
            message: 'AI 返回格式异常，请重试',
            code: 'PARSE_FAILED',
          });
          return;
        }

        if (
          !parsed.questions ||
          !Array.isArray(parsed.questions) ||
          parsed.questions.length === 0
        ) {
          console.error('[parse-fix] AI 未生成有效题目');
          send({
            type: 'error',
            message: 'AI 未生成有效题目，请修改反馈后重试',
            code: 'EMPTY_RESULT',
          });
          return;
        }

        console.log('[parse-fix] 解析到 %d 题, JSON解析耗时=%dms', parsed.questions.length, Date.now() - tParseStart);

        const questions = autoConvertEssayToInterview(
          normalizeAIOutputToQuestions(parsed.questions as Record<string, any>[], genId),
        );

        send({
          type: 'complete',
          questions,
          questionCount: questions.length,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'aborted') {
          console.log('[parse-fix] 客户端断开');
        } else {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('[parse-fix] 生成失败:', errorMsg);
          try {
            controller.enqueue(
              enc.encode(
                `data: ${JSON.stringify({ type: 'error', message: '修正失败: ' + errorMsg, code: 'UNKNOWN' })}\n\n`,
              ),
            );
          } catch {}
        }
      } finally {
        try {
          controller.close();
        } catch {}
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
