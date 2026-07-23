import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { verifyAdminToken } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { pickRecordToUpdate } from '@/lib/results-dedup';

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

    // 探测当前 (user, quiz) 下的所有记录(草稿 + 已提交)
    // —— 一份题库对一个用户只保留一条,旧版本只看 draft 导致
    // 提交过的题库再次提交时无 draft → 直接 create → N 条记录。
    const existingList = await prisma.quizResult.findMany({
      where: {
        userId: payload.userId,
        quizId,
      },
    });

    const decision = pickRecordToUpdate(existingList);

    // 清掉重复的旧记录(每个 user+quiz 仅留最新一条,顺手清理历史脏数据)
    if (decision && decision.drop.length > 0) {
      await prisma.quizResult.deleteMany({
        where: { id: { in: decision.drop.map((r) => r.id) } },
      });
    }

    let result: any;

    if (decision) {
      // 更新保留的那条(草稿升级为已提交 / 暂存 / 重新提交 都走这里)
      result = await prisma.quizResult.update({
        where: { id: decision.keep.id },
        data: {
          name: name || decision.keep.name,
          score,
          totalScore,
          results: JSON.stringify(answerResults),
          status: status || decision.keep.status,
          // 提交时刷新 submittedAt,纯暂存保持原值
          ...(status === 'submitted' ? { submittedAt: new Date() } : {}),
        },
      });
    } else {
      // 首次创建
      result = await prisma.quizResult.create({
        data: {
          quizId,
          userId: payload.userId,
          name: name || '未命名',
          score,
          totalScore,
          results: JSON.stringify(answerResults),
          status: status || 'submitted',
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