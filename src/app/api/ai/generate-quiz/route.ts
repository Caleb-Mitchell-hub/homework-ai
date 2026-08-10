import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { verifyAdminToken } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/ai/crypto';
import { callChatStream } from '@/lib/ai/providers';
import {
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
  ALLOWED_GENERATE_TYPES,
} from '@/lib/ai/generate-prompt';
import {
  estimateGenerateCost,
  computeActualCost,
} from '@/lib/credits/generate-cost';
import {
  chargeForGenerate,
  adjustForGenerate,
  InsufficientCreditsForGenerateError,
} from '@/lib/credits/generate';
import { extractJson } from '@/lib/ai/json-extractor';
import {
  normalizeAIOutputToQuestions,
  autoConvertEssayToInterview,
} from '@/lib/ai/normalize';

const MAX_TOPIC_CHARS = 5000;
const MAX_PER_TYPE = 50;
const MAX_TOTAL = 100;

function genId(): string {
  return 'q_' + Math.random().toString(36).slice(2, 12);
}

function validateCounts(counts: unknown): {
  valid: boolean;
  error?: string;
  total: number;
  cleaned: Record<string, number>;
} {
  const cleaned: Record<string, number> = {};
  let total = 0;
  if (!counts || typeof counts !== 'object') {
    return { valid: false, error: 'counts 必须是一个对象', total: 0, cleaned };
  }
  const raw = counts as Record<string, unknown>;
  for (const type of ALLOWED_GENERATE_TYPES) {
    const v = raw[type];
    if (v === undefined || v === null || v === '') {
      cleaned[type] = 0;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return {
        valid: false,
        error: `${type} 数量必须是非负整数`,
        total: 0,
        cleaned,
      };
    }
    const clamped = Math.min(n, MAX_PER_TYPE);
    cleaned[type] = clamped;
    total += clamped;
  }
  if (total === 0) {
    return {
      valid: false,
      error: '至少需要指定一种题型的数量',
      total: 0,
      cleaned,
    };
  }
  if (total > MAX_TOTAL) {
    return {
      valid: false,
      error: `总题目数不能超过 ${MAX_TOTAL} 题`,
      total,
      cleaned,
    };
  }
  return { valid: true, total, cleaned };
}

export async function POST(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  // 优先用用户 token，其次用管理员 token
  let userId: string;
  const userPayload = verifyToken(token);
  if (userPayload) {
    if (userPayload.isGuest) {
      return NextResponse.json(
        { error: '游客暂不支持 AI 生成题库，请登录后使用' },
        { status: 403 },
      );
    }
    userId = userPayload.userId;
  } else {
    const adminPayload = verifyAdminToken(token);
    if (!adminPayload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }
    userId = adminPayload.userId;
  }

  const body = await req.json().catch(() => null);
  const topic: string = (body?.topic ?? '').trim().slice(0, MAX_TOPIC_CHARS);
  if (!topic) {
    return NextResponse.json({ error: '主题/内容不能为空' }, { status: 400 });
  }

  const {
    valid,
    error: countError,
    total,
    cleaned,
  } = validateCounts(body?.counts);
  if (!valid) {
    return NextResponse.json({ error: countError }, { status: 400 });
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

  // 预估积分 + 扣费
  const estimatedCost = estimateGenerateCost(cleaned!);
  try {
    await chargeForGenerate(userId, estimatedCost);
  } catch (err) {
    if (err instanceof InsufficientCreditsForGenerateError) {
      return NextResponse.json(
        {
          error: `积分不足：需要 ${err.required} 积分，当前 ${err.balance} 积分`,
          required: err.required,
          balance: err.balance,
        },
        { status: 400 },
      );
    }
    throw err;
  }

  // SSE 流
  const systemPrompt = buildGenerateSystemPrompt();
  const userPrompt = buildGenerateUserPrompt(topic, cleaned!);
  const fullPrompt = systemPrompt + '\n\n' + userPrompt;
  const apiKey = decryptApiKey(provider.apiKeyCipher);

  console.log('[generate-quiz] 开始生成, provider:', provider.baseURL, 'model:', provider.model, 'topic:', topic.slice(0, 80));

  // 合并超时信号：5分钟 + 客户端断开
  const timeoutMs = 300_000; // 5 分钟
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = AbortSignal.any([req.signal, timeoutSignal]);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let aborted = false;
      let fullContent = '';

      const send = (data: object) => {
        if (aborted || combinedSignal.aborted) {
          aborted = true;
          throw new Error('aborted');
        }
        try {
          controller.enqueue(
            enc.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          aborted = true;
          throw new Error('aborted');
        }
      };

      try {
        send({
          type: 'progress',
          stage: 'prompt',
          message: '正在构建提示词…',
          progress: 10,
        });

        console.log('[generate-quiz] 提示词长度: system=%d user=%d', systemPrompt.length, userPrompt.length);

        send({
          type: 'progress',
          stage: 'generating',
          message: 'AI 正在生成题目…',
          progress: 20,
        });

        console.log('[generate-quiz] 开始调用 AI…');

        // 流式调用 AI（不开启 jsonMode，让模型自由输出。
        // extractJson 有 5 种回退策略，能处理 markdown 代码块、截断、引号等问题）
        const generator = callChatStream({
          baseURL: provider.baseURL,
          apiKey,
          model: provider.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          jsonMode: false,
          maxTokens: 8192,
          temperature: 0.7,
          signal: combinedSignal,
        });

        for await (const chunk of generator) {
          if (combinedSignal.aborted) throw new Error('aborted');
          if (chunk.delta) {
            fullContent += chunk.delta;
            send({ type: 'delta', text: chunk.delta });
          }
        }

        send({
          type: 'progress',
          stage: 'parsing',
          message: '正在解析题目格式…',
          progress: 85,
        });

        console.log('[generate-quiz] AI 返回 %d 字符，开始解析', fullContent.length);

        // 解析 JSON
        let parsed: { questions?: any[] };
        try {
          parsed = extractJson<{ questions?: any[] }>(fullContent);
        } catch {
          console.error('[generate-quiz] JSON 解析失败');
          // JSON 解析失败 → 退款
          await adjustForGenerate(userId, estimatedCost);
          send({
            type: 'error',
            message: 'AI 返回格式异常，积分已退还，请重试',
            code: 'PARSE_FAILED',
          });
          return;
        }

        if (
          !parsed.questions ||
          !Array.isArray(parsed.questions) ||
          parsed.questions.length === 0
        ) {
          console.error('[generate-quiz] AI 未生成有效题目');
          await adjustForGenerate(userId, estimatedCost);
          send({
            type: 'error',
            message:
              'AI 未生成有效题目，积分已退还，请修改提示词后重试',
            code: 'EMPTY_RESULT',
          });
          return;
        }

        console.log('[generate-quiz] 解析到 %d 题', parsed.questions.length);

        // 标准化题目
        const questions = autoConvertEssayToInterview(
          normalizeAIOutputToQuestions(parsed.questions, genId),
        );

        // 计算实际积分消耗 + 调整差额
        const actualCost = computeActualCost(
          fullPrompt.length,
          fullContent.length,
        );
        const diff = estimatedCost - actualCost;
        if (diff !== 0) {
          console.log('[generate-quiz] 积分调整: 预估=%d 实际=%d 差额=%d', estimatedCost, actualCost, diff);
          await adjustForGenerate(userId, diff);
        }

        // 校验题型数量偏差
        let warning: string | undefined;
        if (
          questions.length < total! * 0.8 ||
          questions.length > total! * 1.2
        ) {
          warning = `AI 生成了 ${questions.length} 题（期望 ${total} 题），数量有偏差，请检查题目内容`;
        }

        console.log('[generate-quiz] 完成: %d 题, 积分消耗=%d', questions.length, estimatedCost - diff);

        send({
          type: 'complete',
          questions,
          usage: {
            estimatedCost,
            actualCost: estimatedCost - diff,
            questionCount: questions.length,
          },
          warning,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'aborted') {
          console.log('[generate-quiz] 客户端断开或超时，已接收 %d 字符', fullContent.length);
          // 超时/断开也退款（用户未拿到完整结果）
          try {
            await adjustForGenerate(userId, estimatedCost);
            console.log('[generate-quiz] 已退款 %d 积分（超时/断开）', estimatedCost);
          } catch (refundErr) {
            console.error('[generate-quiz] 退款失败:', refundErr);
          }
        } else {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('[generate-quiz] 生成失败:', errorMsg, 'provider:', provider.baseURL);
          // 异常 → 退款
          try {
            await adjustForGenerate(userId, estimatedCost);
            console.log('[generate-quiz] 已退款 %d 积分', estimatedCost);
          } catch (refundErr) {
            console.error('[generate-quiz] 退款失败:', refundErr);
          }
          try {
            controller.enqueue(
              enc.encode(
                `data: ${JSON.stringify({ type: 'error', message: '生成失败: ' + errorMsg, code: 'UNKNOWN' })}\n\n`,
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
