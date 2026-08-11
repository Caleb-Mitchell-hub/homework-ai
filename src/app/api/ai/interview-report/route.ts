import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { INTERVIEW_REPORT_COST } from '@/lib/credits/interview-report';
import { buildInterviewGradingPrompt } from '@/lib/ai/grading-prompt';
import { buildInterviewReportPrompt } from '@/lib/ai/interview-report-prompt';
import type { InterviewScoreResult } from '@/lib/ai/grading-prompt';
import type { InterviewQuestionResult } from '@/lib/ai/interview-report-prompt';
import { callChat, callChatStream } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { extractJson } from '@/lib/ai/json-extractor';

/**
 * 对单道面试题进行 AI 打分（0-100）。
 * 用于报告生成前的补评——如果提交时打分失败，这里兜底。
 */
async function gradeOnTheFly(q: any, userAnswer: string, signal?: AbortSignal): Promise<InterviewScoreResult | null> {
  try {
    const prompt = buildInterviewGradingPrompt({
      questionContent: q.title ?? '',
      questionType: 'interview',
      referenceAnswer: q.referenceAnswer ?? '',
      userAnswer,
      language: q.language,
    });
    const provider = await prisma.aIProviderConfig.findFirst({
      where: { isActive: true },
    });
    if (!provider) return null;
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const gradeSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
      : AbortSignal.timeout(60_000);
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
      maxTokens: 3000,
      temperature: 0.8,
      signal: gradeSignal,
    });
    let parsed: { score?: number; strengths?: string[]; weaknesses?: string[]; suggestion?: string; comment?: string };
    try {
      parsed = extractJson<{ score?: number; strengths?: string[]; weaknesses?: string[]; suggestion?: string; comment?: string }>(content);
    } catch {
      console.error('gradeOnTheFly JSON 解析失败，原始长度:', content.length, '前200字符:', content.slice(0, 200));
      return null;
    }
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

  // ---- 3. 缓存命中 → 直接返回 JSON ----
  const existingReport = await prisma.aIReport.findUnique({ where: { resultId } });
  if (existingReport) {
    try {
      const cached = JSON.parse(existingReport.content);
      return NextResponse.json({ content: cached, cached: true, newBalance: null, costCredit: 0 });
    } catch {
      console.warn('面试报告缓存 JSON 解析失败，将重新生成');
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
        // ---- 6a. 面试题评分阶段 ----
        const interviewResults: InterviewQuestionResult[] = [];
        let needsRegrade = false;
        let ungradedCount = 0;

        // 先统计需要评分的题目数
        for (let i = 0; i < resultItems.length; i++) {
          const item = resultItems[i];
          const q = questions.find((qq: any) => qq.id === item.questionId);
          if (!q || (q.type !== 'interview' && q.type !== 'essay')) continue;
          if (typeof item.interviewScore !== 'number') ungradedCount++;
        }

        let gradedSoFar = 0;
        for (let i = 0; i < resultItems.length; i++) {
          if (combinedSignal.aborted) throw new Error('aborted');
          const item = resultItems[i];
          const q = questions.find((qq: any) => qq.id === item.questionId);
          if (!q || (q.type !== 'interview' && q.type !== 'essay')) continue;

          let score: number | undefined = item.interviewScore;
          let strengths: string[] = item.interviewFeedback?.strengths || [];
          let weaknesses: string[] = item.interviewFeedback?.weaknesses || [];
          let suggestion: string = item.interviewFeedback?.suggestion || '';

          if (typeof score !== 'number') {
            gradedSoFar++;
            send({
              type: 'progress',
              stage: 'grading',
              message: `正在 AI 评分 (${gradedSoFar}/${ungradedCount})…`,
              progress: Math.round(10 + (gradedSoFar / Math.max(ungradedCount, 1)) * 30),
            });

            const grading = await gradeOnTheFly(q, item.userAnswer || '', request.signal);
            if (grading) {
              score = grading.score;
              strengths = grading.strengths;
              weaknesses = grading.weaknesses;
              suggestion = grading.suggestion;
              needsRegrade = true;
            } else {
              score = 0;
              strengths = [];
              weaknesses = ['AI 评分服务不可用，暂无法评分'];
              suggestion = '请稍后重试或联系管理员检查 AI 服务配置';
            }
          }

          interviewResults.push({
            index: i + 1,
            title: q.title || '',
            type: q.type || 'interview',
            difficulty: q.difficulty,
            userAnswer: item.userAnswer || '',
            referenceAnswer: q.referenceAnswer || '',
            score,
            strengths,
            weaknesses,
            suggestion,
          });
        }

        if (interviewResults.length === 0) {
          await refund();
          send({ type: 'error', message: '该答题记录中没有面试题/简答题', code: 'NO_INTERVIEW' });
          return;
        }

        // 回写评分结果
        if (needsRegrade) {
          try {
            const updatedItems = resultItems.map((item: any) => {
              const graded = interviewResults.find(
                (ir) => ir.index === resultItems.indexOf(item) + 1
              );
              if (graded && typeof item.interviewScore !== 'number') {
                return {
                  ...item,
                  interviewScore: graded.score,
                  interviewFeedback: {
                    strengths: graded.strengths,
                    weaknesses: graded.weaknesses,
                    suggestion: graded.suggestion,
                  },
                };
              }
              return item;
            });
            await prisma.quizResult.update({
              where: { id: resultId },
              data: { results: JSON.stringify(updatedItems) },
            });
          } catch { /* 回写失败不影响报告生成 */ }
        }

        // ---- 6b. 获取 AI 厂商 + 构建报告 prompt ----
        const provider = await prisma.aIProviderConfig.findFirst({
          where: { isActive: true },
        });
        if (!provider) {
          await refund();
          send({ type: 'error', message: '没有可用的 AI 服务商，请联系管理员配置', code: 'NO_PROVIDER' });
          return;
        }

        const totalScore = interviewResults.reduce((sum, q) => sum + q.score, 0);
        const maxScore = interviewResults.length * 100;
        const reportPrompt = buildInterviewReportPrompt({
          quizTitle: result.quiz?.title || '面试答题',
          totalScore,
          maxScore,
          questions: interviewResults,
        });

        const apiKey = decryptApiKey(provider.apiKeyCipher);

        send({
          type: 'progress',
          stage: 'generating',
          message: 'AI 正在生成深度分析报告…',
          progress: 45,
        });

        console.log('[interview-report] 开始流式生成, provider:', provider.baseURL, 'model:', provider.model);

        // ---- 6c. 流式调用 AI 生成报告 ----
        let fullContent = '';
        const generator = callChatStream({
          baseURL: provider.baseURL,
          apiKey,
          model: provider.model,
          messages: [
            { role: 'system', content: '你是一位资深面试官和技术导师。请严格按照 JSON 格式输出面试表现深度分析报告。' },
            { role: 'user', content: reportPrompt },
          ],
          jsonMode: false,
          maxTokens: 8000,
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
          message: '正在整理分析报告…',
          progress: 90,
        });

        console.log('[interview-report] AI 返回 %d 字符，开始解析', fullContent.length);

        // ---- 6d. 解析 JSON ----
        let parsedReport: {
          overallScore?: number;
          overallComment?: string;
          masteredAreas?: { area: string; detail: string }[];
          weakAreas?: { area: string; detail: string; suggestion: string }[];
          improvementPlan?: string;
        };
        try {
          parsedReport = extractJson(fullContent);
        } catch {
          console.error('[interview-report] JSON 解析失败');
          await refund();
          send({ type: 'error', message: 'AI 返回格式异常，积分已退还，请重试', code: 'PARSE_FAILED' });
          return;
        }

        const content = {
          overallScore: typeof parsedReport.overallScore === 'number' ? Math.round(Math.max(0, Math.min(100, parsedReport.overallScore))) : overallRate(),
          overallComment: typeof parsedReport.overallComment === 'string' ? parsedReport.overallComment : '',
          masteredAreas: Array.isArray(parsedReport.masteredAreas) ? parsedReport.masteredAreas : [],
          weakAreas: Array.isArray(parsedReport.weakAreas) ? parsedReport.weakAreas : [],
          improvementPlan: typeof parsedReport.improvementPlan === 'string' ? parsedReport.improvementPlan : '',
        };

        function overallRate(): number {
          return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
        }

        // ---- 6e. 写缓存 + 发送完成事件 ----
        try {
          await prisma.aIReport.create({
            data: {
              resultId,
              userId: payload.userId,
              content: JSON.stringify({ ...content, generatedAt: new Date().toISOString() }),
              costCredit: INTERVIEW_REPORT_COST,
            },
          });
        } catch (saveErr: any) {
          if (saveErr?.code !== 'P2002') {
            console.error('保存面试报告缓存失败:', saveErr);
          }
        }

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
