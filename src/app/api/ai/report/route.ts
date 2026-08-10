import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { callChatStream } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { extractJson } from '@/lib/ai/json-extractor';
import { buildReportPrompt } from '@/lib/ai/report-prompt';

export const REPORT_COST = 5;

/** GET /api/ai/report?resultId=xxx — 仅查询缓存报告，不触发 AI 生成、不扣积分 */
export async function GET(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const resultId = request.nextUrl.searchParams.get('resultId');
  if (!resultId) {
    return NextResponse.json({ error: '缺少 resultId' }, { status: 400 });
  }

  const result = await prisma.quizResult.findUnique({ where: { id: resultId } });
  if (!result || result.userId !== payload.userId) {
    return NextResponse.json({ error: '结果不存在' }, { status: 404 });
  }

  const existing = await prisma.aIReport.findUnique({ where: { resultId } });
  if (existing) {
    return NextResponse.json({
      cached: true,
      content: JSON.parse(existing.content),
    });
  }
  return NextResponse.json({ cached: false });
}

/** POST /api/ai/report — SSE 流式生成 AI 报告（5 积分/次） */
export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.resultId) {
    return NextResponse.json({ error: '缺少 resultId' }, { status: 400 });
  }

  const result = await prisma.quizResult.findUnique({
    where: { id: body.resultId },
  });
  if (!result || result.userId !== payload.userId) {
    return NextResponse.json({ error: '结果不存在' }, { status: 404 });
  }

  // 1) 缓存命中 → 直接返回 JSON（无需流式）
  const existing = await prisma.aIReport.findUnique({
    where: { resultId: result.id },
  });
  if (existing) {
    return NextResponse.json({
      content: JSON.parse(existing.content),
      cached: true,
    });
  }

  // 2) 计算统计数据
  const quiz = await prisma.quiz.findUnique({ where: { id: result.quizId } });
  const questions = JSON.parse(quiz?.questions ?? '[]');
  const items = JSON.parse(result.results || '[]');
  const byType: Record<string, { total: number; correct: number; correctRate: number }> = {};
  const byDifficulty: Record<string, { total: number; correct: number; correctRate: number }> = {};
  const wrongQuestions: any[] = [];
  let noDiffCount = 0;

  items.forEach((r: any, i: number) => {
    const q = questions.find((qq: any) => qq.id === r.questionId);
    if (!q) return;
    if (!byType[q.type]) byType[q.type] = { total: 0, correct: 0, correctRate: 0 };
    byType[q.type].total += 1;
    if (r.correct) byType[q.type].correct += 1;
    const diff = q.difficulty as string | undefined;
    if (diff && (diff === '简单' || diff === '中等' || diff === '困难')) {
      if (!byDifficulty[diff]) byDifficulty[diff] = { total: 0, correct: 0, correctRate: 0 };
      byDifficulty[diff].total += 1;
      if (r.correct) byDifficulty[diff].correct += 1;
    } else {
      noDiffCount++;
    }
    if (!r.correct && r.userAnswer) {
      wrongQuestions.push({
        index: i + 1,
        title: q.title,
        type: q.type,
        difficulty: diff,
        userAnswer: r.userAnswer,
        correctAnswer: r.correctAnswer ?? '',
      });
    }
  });
  for (const k of Object.keys(byType)) {
    const t = byType[k];
    t.correctRate = t.total > 0 ? t.correct / t.total : 0;
  }
  for (const k of Object.keys(byDifficulty)) {
    const t = byDifficulty[k];
    t.correctRate = t.total > 0 ? t.correct / t.total : 0;
  }

  const diffProfileParts: string[] = [];
  for (const d of ['简单', '中等', '困难'] as const) {
    const v = byDifficulty[d];
    if (v) diffProfileParts.push(`${d}题正确率 ${Math.round(v.correctRate * 100)}% (${v.correct}/${v.total})`);
  }
  if (noDiffCount > 0) diffProfileParts.push(`${noDiffCount} 题无难度标记`);
  const difficultyProfile = diffProfileParts.join('; ') || undefined;

  // 3) 查积分 + 扣积分
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { credits: true },
  });
  if (!user || user.credits < REPORT_COST) {
    return NextResponse.json(
      { error: '积分不足', required: REPORT_COST, balance: user?.credits ?? 0 },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: payload.userId },
      data: { credits: { decrement: REPORT_COST } },
    });
    await tx.creditLedger.create({
      data: {
        userId: payload.userId,
        delta: -REPORT_COST,
        reason: 'ai_report',
        refId: result.id,
        balance: user.credits - REPORT_COST,
      },
    });
  });

  // 4) 查 AI 厂商
  const provider = await prisma.aIProviderConfig.findFirst({
    where: { isActive: true },
  });
  if (!provider) {
    // 退款
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: payload.userId }, data: { credits: { increment: REPORT_COST } } });
      await tx.creditLedger.create({ data: { userId: payload.userId, delta: REPORT_COST, reason: 'refund', refId: result.id, balance: user.credits } });
    });
    return NextResponse.json({ error: '没有激活的 AI 服务商' }, { status: 500 });
  }

  const apiKey = decryptApiKey(provider.apiKeyCipher);
  const prompt = buildReportPrompt({
    quizTitle: quiz?.title ?? '',
    score: result.score,
    totalScore: result.totalScore,
    byType,
    byDifficulty,
    wrongQuestions,
    difficultyProfile,
  });

  console.log('[report] 开始流式生成报告, provider:', provider.baseURL, 'model:', provider.model);

  // 5) SSE 流
  const timeoutSignal = AbortSignal.timeout(300_000);
  const combinedSignal = AbortSignal.any([request.signal, timeoutSignal]);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let aborted = false;
      let fullContent = '';

      const send = (data: object) => {
        if (aborted || combinedSignal.aborted) { aborted = true; throw new Error('aborted'); }
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { aborted = true; throw new Error('aborted'); }
      };

      try {
        send({ type: 'progress', stage: 'analyzing', message: '正在分析答题数据…', progress: 10 });

        send({ type: 'progress', stage: 'generating', message: 'AI 正在生成报告…', progress: 20 });

        // 流式调用 AI
        const generator = callChatStream({
          baseURL: provider.baseURL,
          apiKey,
          model: provider.model,
          messages: [{ role: 'system', content: prompt }],
          jsonMode: true,
          maxTokens: 4096,
          temperature: 0.5,
          signal: combinedSignal,
        });

        for await (const chunk of generator) {
          if (combinedSignal.aborted) throw new Error('aborted');
          if (chunk.delta) {
            fullContent += chunk.delta;
            send({ type: 'delta', text: chunk.delta });
          }
        }

        send({ type: 'progress', stage: 'parsing', message: '正在整理报告…', progress: 90 });

        console.log('[report] AI 返回 %d 字符，开始解析', fullContent.length);

        // 解析 JSON
        let parsed: { knowledgePoints?: any[]; advice?: string };
        try {
          parsed = extractJson<{ knowledgePoints?: any[]; advice?: string }>(fullContent);
        } catch {
          console.error('[report] JSON 解析失败');
          // 退款
          await prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: payload.userId }, data: { credits: { increment: REPORT_COST } } });
            await tx.creditLedger.create({ data: { userId: payload.userId, delta: REPORT_COST, reason: 'refund', refId: result.id, balance: user.credits } });
          });
          send({ type: 'error', message: 'AI 返回格式异常，积分已退还，请重试', code: 'PARSE_FAILED' });
          return;
        }

        if (!parsed || typeof parsed.advice !== 'string' || !Array.isArray(parsed.knowledgePoints)) {
          console.error('[report] AI 返回结构不匹配: keys=%s', parsed ? Object.keys(parsed).join(',') : 'null');
          // 退款
          await prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: payload.userId }, data: { credits: { increment: REPORT_COST } } });
            await tx.creditLedger.create({ data: { userId: payload.userId, delta: REPORT_COST, reason: 'refund', refId: result.id, balance: user.credits } });
          });
          send({ type: 'error', message: `AI 返回格式不正确（缺少必要字段），积分已退还`, code: 'FORMAT_ERROR' });
          return;
        }

        const content = { knowledgePoints: parsed.knowledgePoints, advice: parsed.advice };

        // 写缓存
        await prisma.aIReport.create({
          data: {
            resultId: result.id,
            userId: payload.userId,
            content: JSON.stringify({ ...content, generatedAt: new Date().toISOString() }),
            costCredit: REPORT_COST,
          },
        });

        const newBalance = user.credits - REPORT_COST;

        console.log('[report] 报告生成成功');

        send({
          type: 'complete',
          content,
          newBalance,
          costCredit: REPORT_COST,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'aborted') {
          console.log('[report] 客户端断开或超时');
        } else {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('[report] 生成失败:', errorMsg);
          // 退款
          try {
            await prisma.$transaction(async (tx) => {
              await tx.user.update({ where: { id: payload.userId }, data: { credits: { increment: REPORT_COST } } });
              await tx.creditLedger.create({ data: { userId: payload.userId, delta: REPORT_COST, reason: 'refund', refId: result.id, balance: user.credits } });
            });
          } catch (refundErr) {
            console.error('[report] 退款失败:', refundErr);
          }
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'error', message: '生成失败: ' + errorMsg, code: 'UNKNOWN' })}\n\n`)); } catch {}
        }
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
