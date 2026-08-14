import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildInterviewGradingPrompt, parseScore } from '@/lib/ai/grading-prompt';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { extractJson } from '@/lib/ai/json-extractor';

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
    if (payload.isGuest) {
      return NextResponse.json({ error: '游客暂不支持 AI 评分，请登录后使用' }, { status: 403 });
    }

    updateUserActiveTime(payload.userId);

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
    // 使用 system + user 分离结构，让 AI 更好地针对每道题给出差异化评分
    // temperature 提高到 0.8，避免低温度导致不同题目得分趋同
    // 超时：单题评分最多 90 秒，同时监听客户端断开
    const gradeSignal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(90_000),
    ]);
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
    } catch (jsonErr) {
      console.error('AI 评分 JSON 解析失败，原始长度:', content.length);
      // 降级：尝试用默认值兜底，避免整个评分流程中断
      parsed = { score: 0, strengths: [], weaknesses: ['AI 返回格式异常，请手动评分'], suggestion: '', comment: '' };
    }
    const interviewScore = parseScore(parsed.score);
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
    const isAbort = error instanceof DOMException && error.name === 'AbortError';
    const isTimeout = isAbort && !request.signal.aborted;
    console.error('单题面试评分错误:', isTimeout ? '超时(90s)' : isAbort ? '客户端断开' : error);
    return NextResponse.json(
      { error: isTimeout ? 'AI 评分超时（90秒），请重试' : isAbort ? '请求已取消' : 'AI 评分服务暂时不可用，请稍后重试' },
      { status: isAbort ? 408 : 500 },
    );
  }
}
