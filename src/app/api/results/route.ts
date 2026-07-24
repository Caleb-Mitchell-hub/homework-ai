import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { verifyAdminToken } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { buildDraftUpsertData } from '@/lib/results-dedup';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { buildGradingPrompt } from '@/lib/ai/grading-prompt';

/**
 * 给一道主观题调 AI 拿评语(aiComment)。失败一律降级为 undefined,
 * 不影响结果保存(单题/整体失败均不影响)。
 */
async function gradeOneQuestion(
  q: any,
  userAnswer: string,
  refAnswer: string,
): Promise<string | undefined> {
  try {
    const prompt = buildGradingPrompt({
      questionContent: q.title ?? '',
      questionType: q.type,
      referenceAnswer: refAnswer,
      userAnswer,
      language: q.language,
    });
    const provider = await prisma.aIProviderConfig.findFirst({
      where: { isActive: true },
    });
    if (!provider) return undefined;
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const content = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [{ role: 'system', content: prompt }],
      jsonMode: true,
      maxTokens: 800,
      temperature: 0.4,
    });
    try {
      const parsed = JSON.parse(content);
      return typeof parsed.comment === 'string' ? parsed.comment : undefined;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

/**
 * 解析请求中的 token —— 同时支持普通用户 token 和管理员 token。
 * 两种 token 共享同一个 JWT_SECRET，payload 都含 userId，可统一使用。
 * 用于答题、答题记录等"用户和管理员都能用"的接口。
 */
function resolveAuthPayload(token: string): { userId: string; isAdmin: boolean } | null {
  const user = verifyToken(token);
  if (user) return { userId: user.userId, isAdmin: false };
  const admin = verifyAdminToken(token);
  if (admin) return { userId: admin.userId, isAdmin: true };
  return null;
}

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = resolveAuthPayload(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    await updateUserActiveTime(payload.userId);

    const { searchParams } = new URL(request.url);
    const quizId = searchParams.get('quizId');

    const where = quizId
      ? { userId: payload.userId, quizId }
      : { userId: payload.userId };

    const results = await prisma.quizResult.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // 把 results 字段（数据库存的是 JSON 字符串）解析成对象数组，方便前端直接使用
    const parsed = results.map((r) => {
      let arr: any[] = [];
      try {
        arr = JSON.parse(r.results || '[]');
      } catch {
        arr = [];
      }
      return { ...r, results: arr };
    });

    return NextResponse.json({ results: parsed });
  } catch (error) {
    console.error('获取结果列表错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = resolveAuthPayload(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const {
      quizId,
      name,
      score,
      totalScore,
      results: answerResults,
      status,
      defaultName,
      defaultCategoryId,
    } = await request.json();

    if (!quizId || score === undefined || !answerResults) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 把返回结果中的 results 字符串解析为对象数组
    const safeResult = (r: any) => {
      let arr: any[] = [];
      try {
        arr = JSON.parse(r.results || '[]');
      } catch {
        arr = [];
      }
      return { ...r, results: arr };
    };

    // 拆分 dedup:
    //  - draft  → 同一份草稿 upsert(同 user+quiz 仅 1 份)
    //  - submitted → 直接 insert 新行,允许 N 份历史;同时给主观题调 AI 拿 aiComment
    let result: any;
    let enrichedResults: any[] = answerResults;

    if (status === 'draft') {
      // 草稿 upsert:有则 update / 无则 create
      const existingDraft = await prisma.quizResult.findFirst({
        where: {
          userId: payload.userId,
          quizId,
          status: 'draft',
        },
      });
      const upsert = buildDraftUpsertData(
        {
          userId: payload.userId,
          quizId,
          name: name || '未命名',
          score,
          totalScore,
          results: JSON.stringify(answerResults),
        },
        existingDraft?.id ?? null,
      );
      result =
        upsert.operation === 'update'
          ? await prisma.quizResult.update({
              where: upsert.where,
              data: upsert.data,
            })
          : await prisma.quizResult.create({ data: upsert.data });
    } else {
      // submitted:AI 批阅 + 直接 create 新行(允许 N 份历史)
      const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
      let questions: any[] = [];
      try {
        questions = JSON.parse(quiz?.questions ?? '[]');
      } catch {
        questions = [];
      }

      enrichedResults = await Promise.all(
        (answerResults as any[]).map(async (r: any) => {
          const q = questions.find((qq: any) => qq.id === r.questionId);
          if (!q || !['essay', 'code', 'interview'].includes(q.type)) {
            return r;
          }
          const refAnswer =
            q.type === 'essay' || q.type === 'interview'
              ? q.referenceAnswer ?? ''
              : '';
          const comment = await gradeOneQuestion(q, r.userAnswer ?? '', refAnswer);
          return comment ? { ...r, aiComment: comment } : r;
        }),
      );

      result = await prisma.quizResult.create({
        data: {
          userId: payload.userId,
          quizId,
          name: name || '未命名',
          score,
          totalScore,
          results: JSON.stringify(enrichedResults),
          status: 'submitted',
          submittedAt: new Date(),
        },
      });
    }

    // 回写默认 name / category 到 Quiz(undefined/null/"" 跳过,保留旧值)
    const quizUpdate: Record<string, string> = {};
    if (typeof defaultName === 'string' && defaultName.trim().length > 0) {
      quizUpdate.defaultName = defaultName.trim();
    }
    if (typeof defaultCategoryId === 'string' && defaultCategoryId.length > 0) {
      quizUpdate.defaultCategoryId = defaultCategoryId;
    }
    if (Object.keys(quizUpdate).length > 0) {
      await prisma.quiz.update({
        where: { id: quizId },
        data: quizUpdate,
      });
    }

    return NextResponse.json({ result: safeResult(result) });
  } catch (error) {
    console.error('创建结果错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = resolveAuthPayload(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '缺少记录 id' }, { status: 400 });
    }

    const existing = await prisma.quizResult.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }
    // 越权检查：只能删自己的记录（管理员可以删任意记录）
    if (!payload.isAdmin && existing.userId !== payload.userId) {
      return NextResponse.json({ error: '无权删除' }, { status: 403 });
    }

    await prisma.quizResult.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('删除结果错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}