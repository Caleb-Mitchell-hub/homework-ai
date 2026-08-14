import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '无效的token' }, { status: 401 });

    await updateUserActiveTime(payload.userId);
    const { id } = await params;

    const result = await prisma.quizResult.findUnique({
      where: { id },
      include: { quiz: { select: { id: true, title: true, questions: true } } },
    });
    if (!result) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    if (result.userId !== payload.userId) return NextResponse.json({ error: '无权访问' }, { status: 403 });

    let items: any[] = [];
    try { items = JSON.parse(result.results || '[]'); } catch { /* keep [] */ }
    let questions: any[] = [];
    try { questions = JSON.parse(result.quiz?.questions || '[]'); } catch { /* keep [] */ }

    const questionIds = questions.map((q: any) => q.id);

    const [explanations, followups, notes, report] = await Promise.all([
      prisma.aIExplanation.findMany({ where: { userId: payload.userId, questionId: { in: questionIds } } }),
      prisma.aIFollowUp.findMany({ where: { userId: payload.userId, questionId: { in: questionIds } }, orderBy: { createdAt: 'asc' } }),
      prisma.note.findMany({ where: { userId: payload.userId, OR: [{ resultId: id }, { quizId: result.quizId }] } }),
      prisma.aIReport.findUnique({ where: { resultId: id } }),
    ]);

    const explanationsByQ: Record<string, { content: string; createdAt: string }[]> = {};
    for (const e of explanations) {
      (explanationsByQ[e.questionId] ||= []).push({ content: e.content, createdAt: e.createdAt.toISOString() });
    }
    const followupsByQ: Record<string, { role: string; content: string; createdAt: string }[]> = {};
    for (const f of followups) {
      (followupsByQ[f.questionId] ||= []).push({ role: f.role, content: f.content, createdAt: f.createdAt.toISOString() });
    }

    let reportContent: any = null;
    if (report) {
      try { reportContent = JSON.parse(report.content); } catch { reportContent = null; }
    }

    return NextResponse.json({
      result: { id: result.id, name: result.name, score: result.score, totalScore: result.totalScore, status: result.status, submittedAt: result.submittedAt, items },
      quiz: { id: result.quizId, title: result.quiz?.title || '', questions },
      explanations: explanationsByQ,
      followups: followupsByQ,
      notes,
      report: reportContent,
    });
  } catch (error) {
    console.error('导出聚合错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
