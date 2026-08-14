import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { INTERVIEW_REPORT_COST } from '@/lib/credits/interview-report';
import { buildInterviewGradingPrompt } from '@/lib/ai/grading-prompt';
import { buildMasteryAnalysisPrompt, buildImprovementAdvicePrompt } from '@/lib/ai/interview-report-prompt';
import type { InterviewScoreResult } from '@/lib/ai/grading-prompt';
import type { InterviewQuestionResult } from '@/lib/ai/interview-report-prompt';
import { callChat, callChatStream } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { extractJson } from '@/lib/ai/json-extractor';

/**
 * 对单道面试题进行 AI 打分（0-100）。
 * 用于报告生成前的补评——如果提交时打分失败，这里兜底。
 * @param provider 预取的 AI 厂商配置（避免 N 次并行查库）
 */
async function gradeOnTheFly(
  q: any,
  userAnswer: string,
  provider: { baseURL: string; apiKeyCipher: string; model: string },
  signal?: AbortSignal,
): Promise<InterviewScoreResult | null> {
  try {
    const prompt = buildInterviewGradingPrompt({
      questionContent: q.title ?? '',
      questionType: 'interview',
      referenceAnswer: q.referenceAnswer ?? '',
      userAnswer,
      language: q.language,
    });
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const gradeSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000);

    const tCallStart = Date.now();
    const content = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [
        {
          role: 'system',
          content:
            '你是一位资深面试官，请根据学生的回答与参考答案的匹配程度，给出 0-100 分的评分。你的评分需要严格区分不同回答的质量差异，不能对所有题目给出相同或相近的分数。请严格按 JSON 格式输出。',
        },
        { role: 'user', content: prompt },
      ],
      jsonMode: true,
      maxTokens: 800,
      temperature: 0.6,
      signal: gradeSignal,
    });
    const tCallMs = Date.now() - tCallStart;

    const tParseStart = Date.now();
    let parsed: { score?: number; strengths?: string[]; weaknesses?: string[]; suggestion?: string; comment?: string };
    try {
      parsed = extractJson<{ score?: number; strengths?: string[]; weaknesses?: string[]; suggestion?: string; comment?: string }>(content);
    } catch {
      console.error('[perf] gradeOnTheFly 解析失败 | callChat耗时=%dms | 返回长度=%d | 前200字符: %s', tCallMs, content.length, content.slice(0, 200));
      return null;
    }
    const tParseMs = Date.now() - tParseStart;
    console.log('[perf] gradeOnTheFly 单题评分 | callChat=%dms | extractJson=%dms | 返回长度=%d', tCallMs, tParseMs, content.length);
    const score = typeof parsed.score === 'number' ? Math.round(Math.max(0, Math.min(100, parsed.score))) : 0;
    return {
      score,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s: any) => typeof s === 'string') : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.filter((s: any) => typeof s === 'string') : [],
      suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : '',
      comment: typeof parsed.comment === 'string' ? parsed.comment : '',
    };
  } catch {
    return null;
  }
}

/** POST /api/ai/interview-report — SSE 流式生成面试题深度分析报告（100积分/次） */
export async function POST(request: Request) {
  // ---- 1. 鉴权 ----
  const token = getTokenFromHeaders(request);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: '无效的token' }, { status: 401 });
  }
  await updateUserActiveTime(payload.userId);

  const body = await request.json().catch(() => null);
  const resultId: string | undefined = body?.resultId;
  const force: boolean = !!body?.force;
  if (!resultId || typeof resultId !== 'string') {
    return NextResponse.json({ error: '缺少 resultId' }, { status: 400 });
  }

  // ---- 2. 获取答题结果 ----
  const result = await prisma.quizResult.findUnique({
    where: { id: resultId },
    include: { quiz: { select: { title: true, questions: true } } },
  });
  if (!result) {
    return NextResponse.json({ error: '答题结果不存在' }, { status: 404 });
  }
  if (result.userId !== payload.userId) {
    return NextResponse.json({ error: '无权访问' }, { status: 403 });
  }

  // ---- 3. 缓存命中 → 直接返回 JSON（force 时跳过） ----
  if (!force) {
    const existingReport = await prisma.aIReport.findUnique({ where: { resultId } });
    if (existingReport) {
      try {
        const cached = JSON.parse(existingReport.content);
        return NextResponse.json({ content: cached, cached: true, newBalance: null, costCredit: 0 });
      } catch {
        console.warn('面试报告缓存 JSON 解析失败，将重新生成');
      }
    }
  }

  // ---- 4. 解析数据和题目 ----
  let resultItems: any[] = [];
  try { resultItems = JSON.parse(result.results || '[]'); } catch {
    return NextResponse.json({ error: '答题数据解析失败' }, { status: 500 });
  }
  let questions: any[] = [];
  try { questions = JSON.parse(result.quiz?.questions || '[]'); } catch { questions = []; }

  const interviewQuestions = questions.filter((q: any) => q.type === 'interview' || q.type === 'essay');
  if (interviewQuestions.length === 0) {
    return NextResponse.json({ error: '该测验中没有面试题/简答题' }, { status: 400 });
  }

  // ---- 5. 积分检查 + 扣费（在流式开始前完成） ----
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { credits: true },
  });
  if (!user || user.credits < INTERVIEW_REPORT_COST) {
    return NextResponse.json(
      { error: `积分不足：需要 ${INTERVIEW_REPORT_COST} 积分，当前 ${user?.credits ?? 0} 积分`, required: INTERVIEW_REPORT_COST, balance: user?.credits ?? 0 },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: payload.userId },
      data: { credits: { decrement: INTERVIEW_REPORT_COST } },
    });
    await tx.creditLedger.create({
      data: {
        userId: payload.userId,
        delta: -INTERVIEW_REPORT_COST,
        reason: 'ai_interview_report',
        balance: user.credits - INTERVIEW_REPORT_COST,
      },
    });
  });

  // ---- 6. SSE 流 ----
  const timeoutSignal = AbortSignal.timeout(300_000);
  const combinedSignal = AbortSignal.any([request.signal, timeoutSignal]);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let aborted = false;

      const send = (data: object) => {
        if (aborted || combinedSignal.aborted) { aborted = true; throw new Error('aborted'); }
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { aborted = true; throw new Error('aborted'); }
      };

      // 退款函数
      const refund = async () => {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: payload.userId }, data: { credits: { increment: INTERVIEW_REPORT_COST } } });
            await tx.creditLedger.create({ data: { userId: payload.userId, delta: INTERVIEW_REPORT_COST, reason: 'refund', refId: resultId, balance: user.credits } });
          });
        } catch (refundErr) {
          console.error('面试报告退款失败:', refundErr);
        }
      };

      try {
        // ---- 6a. 面试题评分阶段（并行打分） ----
        interface GradingSlot {
          index: number;
          item: any;
          q: any;
          score: number;
          strengths: string[];
          weaknesses: string[];
          suggestion: string;
          needsGrading: boolean;
        }
        const slots: GradingSlot[] = [];
        const toGrade: { slot: GradingSlot; q: any; answer: string }[] = [];

        for (let i = 0; i < resultItems.length; i++) {
          if (combinedSignal.aborted) throw new Error('aborted');
          const item = resultItems[i];
          const q = questions.find((qq: any) => qq.id === item.questionId);
          if (!q || (q.type !== 'interview' && q.type !== 'essay')) continue;

          const slot: GradingSlot = {
            index: i + 1,
            item,
            q,
            score: item.interviewScore,
            strengths: item.interviewFeedback?.strengths || [],
            weaknesses: item.interviewFeedback?.weaknesses || [],
            suggestion: item.interviewFeedback?.suggestion || '',
            needsGrading: typeof item.interviewScore !== 'number',
          };

          if (slot.needsGrading) {
            toGrade.push({ slot, q, answer: item.userAnswer || '' });
          }

          slots.push(slot);
        }

        if (slots.length === 0) {
          await refund();
          send({ type: 'error', message: '该答题记录中没有面试题/简答题', code: 'NO_INTERVIEW' });
          return;
        }

        // ---- 预取 AI 厂商（只查一次，避免 N+1 并行查库） ----
        const provider = await prisma.aIProviderConfig.findFirst({
          where: { isActive: true },
        });
        if (!provider) {
          send({ type: 'error', message: '没有可用的 AI 服务商，请联系管理员配置', code: 'NO_PROVIDER' });
          return;
        }
        const providerInfo = { baseURL: provider.baseURL, apiKeyCipher: provider.apiKeyCipher, model: provider.model };

        // 并行打分：N 道题同时发起 AI 调用，只需等最慢的一道
        if (toGrade.length > 0) {
          const gradingStart = Date.now();
          send({
            type: 'progress',
            stage: 'grading',
            message: `正在 AI 评分 (0/${toGrade.length})…`,
            progress: 10,
          });

          let completed = 0;
          const gradePromises = toGrade.map(({ slot, q, answer }) =>
            gradeOnTheFly(q, answer, providerInfo, request.signal)
              .then(grading => {
                completed++;
                send({
                  type: 'progress',
                  stage: 'grading',
                  message: `正在 AI 评分 (${completed}/${toGrade.length})…`,
                  progress: Math.round(10 + (completed / toGrade.length) * 30),
                });
                if (grading) {
                  slot.score = grading.score;
                  slot.strengths = grading.strengths;
                  slot.weaknesses = grading.weaknesses;
                  slot.suggestion = grading.suggestion;
                } else {
                  slot.score = 0;
                  slot.strengths = [];
                  slot.weaknesses = ['AI 评分服务不可用，暂无法评分'];
                  slot.suggestion = '请稍后重试或联系管理员检查 AI 服务配置';
                }
              })
              .catch(() => {
                completed++;
                slot.score = 0;
                slot.strengths = [];
                slot.weaknesses = ['AI 评分超时，请手动评分'];
                slot.suggestion = '';
              })
          );

          await Promise.all(gradePromises);

          console.log('[interview-report][perf] 评分阶段耗时:', Date.now() - gradingStart, 'ms', `(${toGrade.length} 题并行)`);

          if (combinedSignal.aborted) throw new Error('aborted');

          send({
            type: 'progress',
            stage: 'grading',
            message: `评分完成 (${toGrade.length}/${toGrade.length})`,
            progress: 40,
          });
        }

        // 构建 interviewResults（保持题号顺序）
        const needsRegrade = toGrade.length > 0;
        const interviewResults: InterviewQuestionResult[] = slots.map(slot => ({
          index: slot.index,
          title: slot.q.title || '',
          type: slot.q.type || 'interview',
          difficulty: slot.q.difficulty,
          userAnswer: slot.item.userAnswer || '',
          referenceAnswer: slot.q.referenceAnswer || '',
          score: slot.score,
          strengths: slot.strengths,
          weaknesses: slot.weaknesses,
          suggestion: slot.suggestion,
        }));

        // 回写评分结果（fire-and-forget，不阻塞报告生成）
        if (needsRegrade) {
          const updatedItems = resultItems.map((item: any, idx: number) => {
            const s = slots.find(sl => sl.index === idx + 1);
            if (s && s.needsGrading) {
              return {
                ...item,
                interviewScore: s.score,
                interviewFeedback: {
                  strengths: s.strengths,
                  weaknesses: s.weaknesses,
                  suggestion: s.suggestion,
                },
              };
            }
            return item;
          });
          // 不 await，后台异步写入，失败不影响报告生成
          prisma.quizResult.update({
            where: { id: resultId },
            data: { results: JSON.stringify(updatedItems) },
          }).catch((e) => { /* 回写失败不影响报告生成 */ });
        }

        // ---- 6b. 构建报告 prompt（复用预取的 provider） ----
        const totalScore = interviewResults.reduce((sum, q) => sum + q.score, 0);
        const maxScore = interviewResults.length * 100;
        const overallScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
        const apiKey = decryptApiKey(provider.apiKeyCipher);

        const tAfterGrading = Date.now();

        send({
          type: 'progress',
          stage: 'generating',
          message: 'AI 正在生成深度分析报告…',
          progress: 45,
        });

        console.log('[interview-report] 开始并行生成报告, provider:', provider.baseURL, 'model:', provider.model);

        // ---- 6c. 并行调用 AI 生成报告（子任务A非流式 + 子任务B流式，同时发起） ----
        const reportGenStart = Date.now();

        const masteryPrompt = buildMasteryAnalysisPrompt({
          quizTitle: result.quiz?.title || '面试答题',
          totalScore,
          maxScore,
          questions: interviewResults,
        });
        const advicePrompt = buildImprovementAdvicePrompt({
          quizTitle: result.quiz?.title || '面试答题',
          totalScore,
          maxScore,
          questions: interviewResults,
        });

        // 子任务A：非流式 (jsonMode，快速返回结构化 JSON)
        const masteryPromise = callChat({
          baseURL: provider.baseURL,
          apiKey,
          model: provider.model,
          messages: [
            { role: 'system', content: '你是一位资深面试官，请严格按 JSON 格式输出。' },
            { role: 'user', content: masteryPrompt },
          ],
          jsonMode: true,
          maxTokens: 1500,
          temperature: 0.6,
          signal: combinedSignal,
        }).catch((err) => {
          console.error('[interview-report] 子任务A (掌握/薄弱分析) 失败:', err instanceof Error ? err.message : String(err));
          return null;
        });

        // 子任务B：流式 — jsonMode:false 确保逐字推送，delta 实时转发给前端
        const adviceStreamGen = callChatStream({
          baseURL: provider.baseURL,
          apiKey,
          model: provider.model,
          messages: [
            { role: 'system', content: '你是一位资深技术导师，请按指定格式输出 Markdown 报告。' },
            { role: 'user', content: advicePrompt },
          ],
          jsonMode: false,
          maxTokens: 2500,
          temperature: 0.7,
          signal: combinedSignal,
        });

        const [masteryResult, adviceResult] = await Promise.all([
          masteryPromise,
          (async () => {
            let fullText = '';
            try {
              for await (const chunk of adviceStreamGen) {
                if (combinedSignal.aborted) throw new Error('aborted');
                if (chunk.delta) {
                  fullText += chunk.delta;
                  send({ type: 'delta', text: chunk.delta });
                }
              }
              return fullText;
            } catch (err) {
              console.error('[interview-report] 子任务B (评价+提升计划) 流式失败:', err instanceof Error ? err.message : String(err));
              return null;
            }
          })(),
        ]);

        console.log('[interview-report][perf] 报告生成耗时:', Date.now() - reportGenStart, 'ms', '(子任务A非流式 + 子任务B流式并行)');

        if (combinedSignal.aborted) throw new Error('aborted');

        send({
          type: 'progress',
          stage: 'parsing',
          message: '正在整理分析报告…',
          progress: 90,
        });

        // ---- 6d. 分别解析两个子任务的结果（各自容错，互不影响） ----
        const tParse6dStart = Date.now();
        let masteredAreas: { area: string; detail: string }[] = [];
        let weakAreas: { area: string; detail: string; suggestion: string }[] = [];
        let overallComment = '';
        let improvementPlan = '';

        if (masteryResult) {
          const tMasteryParse = Date.now();
          try {
            const masteryParsed = extractJson<{ masteredAreas?: { area: string; detail: string }[]; weakAreas?: { area: string; detail: string; suggestion: string }[] }>(masteryResult);
            masteredAreas = Array.isArray(masteryParsed.masteredAreas) ? masteryParsed.masteredAreas : [];
            weakAreas = Array.isArray(masteryParsed.weakAreas) ? masteryParsed.weakAreas : [];
            console.log('[perf] 子任务A extractJson 耗时=%dms | 返回长度=%d | masteredAreas=%d weakAreas=%d', Date.now() - tMasteryParse, masteryResult.length, masteredAreas.length, weakAreas.length);
          } catch (parseErr) {
            console.error('[interview-report] 子任务A JSON 解析失败 | 耗时=%dms | 返回长度=%d | err=%s', Date.now() - tMasteryParse, masteryResult.length, parseErr instanceof Error ? parseErr.message : String(parseErr));
          }
        }

        if (adviceResult && typeof adviceResult === 'string') {
          const tAdviceParse = Date.now();
          // 子任务B 输出纯 Markdown，按 ## 🎯 优先级排序 分割 overallComment / improvementPlan
          const splitMarker = '## 🎯 优先级排序';
          const splitIdx = adviceResult.indexOf(splitMarker);
          if (splitIdx >= 0) {
            overallComment = adviceResult.slice(0, splitIdx).trim();
            improvementPlan = adviceResult.slice(splitIdx).trim();
          } else {
            // 回退：找不到分隔标记时整体作为 overallComment
            overallComment = adviceResult.trim();
            console.warn('[interview-report] 子任务B 未找到分隔标记 "%s"，整体归入 overallComment', splitMarker);
          }
          console.log('[perf] 子任务B markdown分割 耗时=%dms | 返回长度=%d | overallComment=%d字 improvementPlan=%d字', Date.now() - tAdviceParse, adviceResult.length, overallComment.length, improvementPlan.length);
        }

        console.log('[perf] 6d 解析阶段总耗时=%dms', Date.now() - tParse6dStart);

        // 两个子任务都失败才退款
        if (!masteryResult && !adviceResult) {
          console.error('[interview-report] 两个子任务均失败');
          await refund();
          send({ type: 'error', message: 'AI 服务暂时不可用，积分已退还，请重试', code: 'AI_FAILED' });
          return;
        }

        const content = {
          overallScore,
          overallComment,
          masteredAreas,
          weakAreas,
          improvementPlan,
        };

        // ---- 6e. 写缓存 + 发送完成事件 ----
        await prisma.aIReport.upsert({
          where: { resultId },
          update: {
            userId: payload.userId,
            content: JSON.stringify({ ...content, generatedAt: new Date().toISOString() }),
            costCredit: INTERVIEW_REPORT_COST,
          },
          create: {
            resultId,
            userId: payload.userId,
            content: JSON.stringify({ ...content, generatedAt: new Date().toISOString() }),
            costCredit: INTERVIEW_REPORT_COST,
          },
        });

        const newBalance = user.credits - INTERVIEW_REPORT_COST;

        console.log('[interview-report] 报告生成成功');

        send({
          type: 'complete',
          content,
          newBalance,
          costCredit: INTERVIEW_REPORT_COST,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'aborted') {
          console.log('[interview-report] 客户端断开或超时');
          await refund();
        } else {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error('[interview-report] 生成失败:', errorMsg);
          await refund();
          try { controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'error', message: '生成失败: ' + errorMsg.slice(0, 200), code: 'UNKNOWN' })}\n\n`)); } catch {}
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
