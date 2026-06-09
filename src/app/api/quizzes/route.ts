import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PREFIX_PRESET, PRESET_CATEGORIES } from '@/lib/quizCategories';

/** 校验并规范化 categoryId。返回 null 表示"未分类"。 */
function normalizeCategoryId(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // preset:<key> 形式:key 必须在预设列表里
  if (trimmed.startsWith(PREFIX_PRESET)) {
    const key = trimmed.slice(PREFIX_PRESET.length);
    const valid = PRESET_CATEGORIES.some((c) => c.key === key);
    return valid ? trimmed : null;
  }
  // user:<id> 形式:后端不感知 user 侧 localStorage,只要格式合法就放行
  if (trimmed.startsWith('user:')) {
    const id = trimmed.slice(5);
    // id 不长于 64 字符(列宽限制)+ 仅允许字母数字下划线连字符
    if (/^[A-Za-z0-9_-]{1,40}$/.test(id)) return trimmed;
    return null;
  }
  // 兜底:老数据(无前缀)→ 视为 "preset:<原值>" 兜底,合法才放行
  if (/^[a-z0-9_-]{1,40}$/.test(trimmed)) {
    const valid = PRESET_CATEGORIES.some((c) => c.key === trimmed);
    return valid ? `${PREFIX_PRESET}${trimmed}` : null;
  }
  return null;
}

export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const categoryFilter = url.searchParams.get('category');

    // 返回两类题库:
    //  1) 用户自己上传的(userId = current)
    //  2) 所有官方发布的(isOfficial = true,任何用户可见可答)
    // category 过滤(可选):all | 预设 key | user 分类 raw id | "uncat"
    let where: any = {
      OR: [
        { userId: payload.userId },
        { isOfficial: true },
      ],
    };
    if (categoryFilter && categoryFilter !== 'all') {
      if (categoryFilter === 'uncat') {
        where = { AND: [where, { categoryId: null }] };
      } else if (categoryFilter === 'preset') {
        // "preset" 单独不算,前端传具体 key
        return NextResponse.json({ quizzes: [] });
      } else {
        // 兼容前端传来的预设 key(无前缀)或完整 id
        const raw = categoryFilter.includes(':') ? categoryFilter : `${PREFIX_PRESET}${categoryFilter}`;
        where = { AND: [where, { categoryId: raw }] };
      }
    }

    const quizzes = await prisma.quiz.findMany({
      where,
      orderBy: [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
      include: {
        results: {
          where: { userId: payload.userId },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    return NextResponse.json({ quizzes });
  } catch (error) {
    console.error('获取题目列表错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

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

    const { title, questions, fileKey, categoryId } = await request.json();

    if (!title || !questions) {
      return NextResponse.json({ error: '标题和题目不能为空' }, { status: 400 });
    }

    const normalizedCategoryId = normalizeCategoryId(categoryId);

    // 有 fileKey → 先查是否已有同 (userId, fileKey) 的 Quiz
    if (fileKey && typeof fileKey === 'string') {
      const existing = await prisma.quiz.findFirst({
        where: { userId: payload.userId, fileKey },
      });
      if (existing) {
        // 探测现有 draft / submitted 状态(供前端选择层用)
        const [draft, submittedCount] = await Promise.all([
          prisma.quizResult.findFirst({
            where: { userId: payload.userId, quizId: existing.id, status: 'draft' },
            select: { id: true },
          }),
          prisma.quizResult.count({
            where: { userId: payload.userId, quizId: existing.id, status: 'submitted' },
          }),
        ]);
        return NextResponse.json({
          quiz: existing,
          existed: true,
          hasDraft: !!draft,
          draftId: draft?.id ?? null,
          hasSubmitted: submittedCount > 0,
        });
      }
    }

    // 走 create 路径(fileKey 可选存)
    const quiz = await prisma.quiz.create({
      data: {
        title,
        questions: JSON.stringify(questions),
        userId: payload.userId,
        fileKey: fileKey && typeof fileKey === 'string' ? fileKey : null,
        categoryId: normalizedCategoryId,
      },
    });

    return NextResponse.json({ quiz, existed: false });
  } catch (error) {
    console.error('创建题目错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}