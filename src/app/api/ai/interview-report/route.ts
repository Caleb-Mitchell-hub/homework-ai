import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateInterviewReport, InsufficientCreditsForInterviewReportError } from '@/lib/credits/interview-report';
import { buildInterviewGradingPrompt } from '@/lib/ai/grading-prompt';
import type { InterviewScoreResult } from '@/lib/ai/grading-prompt';
import type { InterviewQuestionResult } from '@/lib/ai/interview-report-prompt';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';

/**
 * 对单道面试题进行 AI 打分（0-100）。
 * 用于报告生成前的补评——如果提交时打分失败，这里兜底。
 */
async function gradeOnTheFly(q: any, userAnswer: string): Promise<InterviewScoreResult | null> {
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
    const content = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [{ role: 'system', content: prompt }],
      jsonMode: true,
      maxTokens: 1200,
      temperature: 0.4,
    });
    const parsed = JSON.parse(content);
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

/** POST /api/ai/interview-report — 生成面试题深度分析报告（100积分/次） */
export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }
    await updateUserActiveTime(payload.userId);

    const { resultId } = await request.json();
    if (!resultId || typeof resultId !== 'string') {
      return NextResponse.json({ error: '缺少 resultId' }, { status: 400 });
    }

    // 获取答题结果
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

    // 解析结果数据
    let resultItems: any[] = [];
    try {
      resultItems = JSON.parse(result.results || '[]');
    } catch {
      return NextResponse.json({ error: '答题数据解析失败' }, { status: 500 });
    }

    // 解析题目
    let questions: any[] = [];
    try {
      questions = JSON.parse(result.quiz?.questions || '[]');
    } catch {
      questions = [];
    }

    // 处理面试题 + 简答题（兼容旧数据中 essay 类型）
    const interviewQuestions = questions.filter((q: any) => q.type === 'interview' || q.type === 'essay');
    if (interviewQuestions.length === 0) {
      return NextResponse.json({ error: '该测验中没有面试题/简答题' }, { status: 400 });
    }

    // 提取面试题结果，缺少评分的即时补评
    const interviewResults: InterviewQuestionResult[] = [];
    let needsRegrade = false;

    for (let i = 0; i < resultItems.length; i++) {
      const item = resultItems[i];
      const q = questions.find((qq: any) => qq.id === item.questionId);
      if (!q || (q.type !== 'interview' && q.type !== 'essay')) continue;

      let score: number | undefined = item.interviewScore;
      let strengths: string[] = item.interviewFeedback?.strengths || [];
      let weaknesses: string[] = item.interviewFeedback?.weaknesses || [];
      let suggestion: string = item.interviewFeedback?.suggestion || '';

      // 缺少评分 → 即时补评
      if (typeof score !== 'number') {
        const grading = await gradeOnTheFly(q, item.userAnswer || '');
        if (grading) {
          score = grading.score;
          strengths = grading.strengths;
          weaknesses = grading.weaknesses;
          suggestion = grading.suggestion;
          needsRegrade = true;
        } else {
          // AI 不可用，给默认 0 分
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
      return NextResponse.json({ error: '该答题记录中没有面试题/简答题' }, { status: 400 });
    }

    // 如果补评了，回写到数据库，下次直接复用
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
      } catch {
        // 回写失败不影响报告生成
      }
    }

    const report = await generateInterviewReport(
      payload.userId,
      result.quiz?.title || '面试答题',
      interviewResults,
    );

    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof InsufficientCreditsForInterviewReportError) {
      return NextResponse.json(
        { error: error.message, required: error.required, balance: error.balance },
        { status: 400 },
      );
    }
    console.error('生成面试报告错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '服务器错误' },
      { status: 500 },
    );
  }
}
