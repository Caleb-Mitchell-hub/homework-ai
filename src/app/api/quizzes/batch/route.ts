import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { verifyAdminToken } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';

function resolveAuthPayload(token: string): { userId: string; isAdmin: boolean } | null {
  const user = verifyToken(token);
  if (user) return { userId: user.userId, isAdmin: false };
  const admin = verifyAdminToken(token);
  if (admin) return { userId: admin.userId, isAdmin: true };
  return null;
}

/**
 * POST /api/quizzes/batch
 * Body: { ids: string[] }
 * 返回指定 id 的题库完整数据(含 questions),仅限自己的题库或管理员。
 */
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

    await updateUserActiveTime(payload.userId);

    const { ids, include } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '请提供要导出的题库 id 列表' }, { status: 400 });
    }

    // 限制一次最多导出 50 个题库
    if (ids.length > 50) {
      return NextResponse.json({ error: '单次最多导出 50 个题库' }, { status: 400 });
    }

    const includeOpts = (include || {}) as {
      aiExplanation?: boolean;
      followUp?: boolean;
      report?: boolean;
    };

    const quizzes = await prisma.quiz.findMany({
      where: {
        id: { in: ids },
        ...(payload.isAdmin ? {} : { userId: payload.userId }),
      },
    });

    // 解析 questions JSON 字符串
    const parsed = quizzes.map((q) => {
      let questions: any[] = [];
      try {
        questions = JSON.parse(q.questions || '[]');
      } catch {
        questions = [];
      }
      return {
        id: q.id,
        title: q.title,
        categoryId: q.categoryId,
        timeLimit: q.timeLimit,
        createdAt: q.createdAt,
        questions,
      };
    });

    // 按需查询关联数据
    let explanationsMap: Record<string, any[]> = {};
    let followupsMap: Record<string, any[]> = {};
    let reportsMap: Record<string, any> = {};

    if (includeOpts.aiExplanation) {
      const questionIds = parsed.flatMap((q) => q.questions.map((qq: any) => qq.id));
      const explanations = await prisma.aIExplanation.findMany({
        where: { userId: payload.userId, questionId: { in: questionIds } },
        select: { questionId: true, content: true, createdAt: true },
      });
      for (const e of explanations) {
        if (!explanationsMap[e.questionId]) explanationsMap[e.questionId] = [];
        explanationsMap[e.questionId].push(e);
      }
    }

    if (includeOpts.followUp) {
      const questionIds = parsed.flatMap((q) => q.questions.map((qq: any) => qq.id));
      const followups = await prisma.aIFollowUp.findMany({
        where: { userId: payload.userId, questionId: { in: questionIds } },
        orderBy: { createdAt: 'asc' },
        select: { questionId: true, role: true, content: true, createdAt: true },
      });
      for (const f of followups) {
        if (!followupsMap[f.questionId]) followupsMap[f.questionId] = [];
        followupsMap[f.questionId].push(f);
      }
    }

    if (includeOpts.report) {
      const results = await prisma.quizResult.findMany({
        where: { quizId: { in: ids }, userId: payload.userId, status: 'submitted' },
        orderBy: { submittedAt: 'desc' },
        select: { quizId: true, id: true },
      });
      // 每个 quiz 取最新的 result
      const latestByQuiz: Record<string, string> = {};
      for (const r of results) {
        if (!latestByQuiz[r.quizId]) latestByQuiz[r.quizId] = r.id;
      }
      const resultIds = Object.values(latestByQuiz);
      if (resultIds.length > 0) {
        const reports = await prisma.aIReport.findMany({
          where: { resultId: { in: resultIds } },
          select: { resultId: true, content: true },
        });
        // map back to quizId
        for (const r of reports) {
          const quizId = Object.entries(latestByQuiz).find(([, rid]) => rid === r.resultId)?.[0];
          if (quizId) reportsMap[quizId] = r;
        }
      }
    }

    return NextResponse.json({
      quizzes: parsed.map((q) => ({
        ...q,
        explanations: explanationsMap,
        followups: followupsMap,
        report: reportsMap[q.id] ? JSON.parse(reportsMap[q.id].content) : undefined,
      })),
    });
  } catch (error) {
    console.error('批量获取题库错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
