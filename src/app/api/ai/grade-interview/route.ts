import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildInterviewGradingPrompt } from '@/lib/ai/grading-prompt';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';

/** POST /api/ai/grade-interview — 对单道面试题进行 AI 打分（0-100），并回写结果 */
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

    const { resultId, questionId } = await request.json();
    if (!resultId || !questionId) {
      return NextResponse.json({ error: '缺少 resultId 或 questionId' }, { status: 400 });
    }

    // 获取答题记录
    const result = await prisma.quizResult.findUnique({
      where: { id: resultId },
      include: { quiz: { select: { questions: true } } },
    });
    if (!result || result.userId !== payload.userId) {
      return NextResponse.json({ error: '答题记录不存在' }, { status: 404 });
    }

    // 解析数据
    let questions: any[] = [];
    try { questions = JSON.parse(result.quiz?.questions || '[]'); } catch { questions = []; }
    let items: any[] = [];
    try { items = JSON.parse(result.results || '[]'); } catch { items = []; }

    const q = questions.find((qq: any) => qq.id === questionId);
    if (!q || (q.type !== 'interview' && q.type !== 'essay')) {
      return NextResponse.json({ error: '该题目不是面试题/简答题' }, { status: 400 });
    }

    const item = items.find((it: any) => it.questionId === questionId);
    if (!item) {
      return NextResponse.json({ error: '未找到该题的答题记录' }, { status: 400 });
    }

    // 调用 AI 打分
    const provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
    if (!provider) {
      return NextResponse.json({ error: '没有可用的 AI 服务商，请联系管理员配置' }, { status: 500 });
    }

    const prompt = buildInterviewGradingPrompt({
      questionContent: q.title ?? '',
      questionType: 'interview',
      referenceAnswer: q.referenceAnswer ?? '',
      userAnswer: item.userAnswer || '',
      language: q.language,
    });

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
    const score = typeof parsed.score === 'number'
      ? Math.round(Math.max(0, Math.min(100, parsed.score)))
      : 0;
    const interviewScore = score;
    const interviewFeedback = {
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((s: any) => typeof s === 'string') : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.filter((s: any) => typeof s === 'string') : [],
      suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion : '',
    };

    // 回写到数据库
    const updatedItems = items.map((it: any) =>
      it.questionId === questionId
        ? { ...it, interviewScore, interviewFeedback, aiComment: parsed.comment || '' }
        : it
    );
    await prisma.quizResult.update({
      where: { id: resultId },
      data: { results: JSON.stringify(updatedItems) },
    });

    return NextResponse.json({ interviewScore, interviewFeedback });
  } catch (error) {
    console.error('单题面试评分错误:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI 评分失败' },
      { status: 500 },
    );
  }
}
