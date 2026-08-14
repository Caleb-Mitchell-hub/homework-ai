import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { verifyAdminToken } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { buildDraftUpsertData } from '@/lib/results-dedup';
import { SUBJECTIVE_TYPES } from '@/lib/score';

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

    // 旧版兼容：quizId 参数 → 返回该题库全部记录（含完整 results，供答题页用）
    if (quizId) {
      const where = { userId: payload.userId, quizId };
      const results = await prisma.quizResult.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        include: {
          quiz: { select: { id: true, title: true } },
        },
      });

      const parsed = results.map((r) => {
        let arr: any[] = [];
        try {
          arr = JSON.parse(r.results || '[]');
        } catch { /* keep [] */ }
        return { ...r, results: arr };
      });

      return NextResponse.json({ results: parsed });
    }

    // 新版：分页 + 搜索 + 筛选 + 排序 + 摘要模式
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const search = searchParams.get('search') || undefined;
    const categoryId = searchParams.get('categoryId') || undefined;
    const statusFilter = searchParams.get('status') || undefined;
    const sort = searchParams.get('sort') || 'recent';
    const sysCategory = searchParams.get('sysCategory') || undefined;

    const where: any = { userId: payload.userId };

    if (statusFilter === 'submitted') {
      where.status = 'submitted';
    } else if (statusFilter === 'draft') {
      where.status = 'draft';
    }

    // 系统分类规则
    if (sysCategory === 'recent') {
      where.status = 'submitted';
      where.submittedAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (sysCategory === 'uncat') {
      where.categoryId = null;
      where.status = 'submitted';
    } else if (sysCategory === 'draft') {
      where.status = 'draft';
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (search) {
      where.name = { contains: search };
    }

    let orderBy: any = { submittedAt: 'desc' };
    if (sort === 'score_desc') {
      orderBy = { score: 'desc' };
    } else if (sort === 'score_asc') {
      orderBy = { score: 'asc' };
    }

    const [rawResults, total] = await Promise.all([
      prisma.quizResult.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          quiz: { select: { id: true, title: true } },
        },
      }),
      prisma.quizResult.count({ where }),
    ]);

    // 构建摘要（解析 results JSON 计数，不返回完整内容）
    const results = rawResults.map((r: any) => {
      let items: any[] = [];
      try {
        items = JSON.parse(r.results || '[]');
      } catch { /* keep [] */ }

      let correctCount = 0;
      let subjectiveScoreSum = 0;
      let subjectiveScoredCount = 0;

      for (const item of items) {
        if (item.correct) correctCount++;
        if (typeof item.interviewScore === 'number') {
          subjectiveScoreSum += item.interviewScore;
          subjectiveScoredCount++;
        }
      }

      const summary = {
        totalQuestions: items.length,
        objectiveCount: (r as any).objectiveCount ?? 0,
        subjectiveCount: (r as any).subjectiveCount ?? 0,
        correctCount,
        subjectiveAvgScore: subjectiveScoredCount > 0
          ? Math.round(subjectiveScoreSum / subjectiveScoredCount)
          : 0,
      };

      const { results: _results, ...rest } = r;
      return { ...rest, summary };
    });

    return NextResponse.json({ results, total, page, pageSize });
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

    // 计算客观题/主观题数量（需要从题库中读取题型）
    let objectiveCount = 0;
    let subjectiveCount = 0;
    try {
      const quiz = await prisma.quiz.findUnique({
        where: { id: quizId },
        select: { questions: true },
      });
      if (quiz) {
        let questions: any[] = [];
        try {
          questions = JSON.parse(quiz.questions || '[]');
        } catch { /* keep [] */ }
        const typeMap = new Map<string, string>();
        for (const q of questions) {
          if (q.id && q.type) typeMap.set(q.id, q.type);
        }
        for (const item of answerResults) {
          const qType = typeMap.get(item.questionId);
          if (qType && SUBJECTIVE_TYPES.has(qType)) {
            subjectiveCount++;
          } else {
            objectiveCount++;
          }
        }
      }
    } catch {
      // 计算失败不阻塞提交
    }

    // 拆分 dedup:
    //  - draft  → 同一份草稿 upsert(同 user+quiz 仅 1 份)
    //  - submitted → 直接 insert 新行,允许 N 份历史;同时给主观题调 AI 拿 aiComment
    //
    //  防抖: submitted 在 30s 内同一 (userId, quizId) 只创建一条,
    //  重复请求直接返回已有记录（防止快速双击产生重复数据）
    let result: any;

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
          objectiveCount,
          subjectiveCount,
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
      // 防抖：3s 内同一 (userId, quizId) 只允许一条 submitted 记录
      // 仅用于防止快速双击，不做内容去重（用户可能在 30 秒内重新答题并提交新内容）
      const recentDedup = await prisma.quizResult.findFirst({
        where: {
          userId: payload.userId,
          quizId,
          status: 'submitted',
          submittedAt: { gte: new Date(Date.now() - 3_000) },
        },
        orderBy: { submittedAt: 'desc' },
      });
      if (recentDedup) {
        return NextResponse.json({ result: safeResult(recentDedup) });
      }

      // submitted: 直接 create 新行(允许 N 份历史)，AI 评分异步进行不阻塞返回
      result = await prisma.quizResult.create({
        data: {
          userId: payload.userId,
          quizId,
          name: name || '未命名',
          score,
          totalScore,
          results: JSON.stringify(answerResults),
          status: 'submitted',
          submittedAt: new Date(),
          objectiveCount,
          subjectiveCount,
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