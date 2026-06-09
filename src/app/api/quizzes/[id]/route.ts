import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PREFIX_PRESET, PRESET_CATEGORIES } from '@/lib/quizCategories';

function normalizeCategoryId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw === '') return null;
  if (typeof raw !== 'string') return undefined as any;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(PREFIX_PRESET)) {
    const key = trimmed.slice(PREFIX_PRESET.length);
    return PRESET_CATEGORIES.some((c) => c.key === key) ? trimmed : undefined as any;
  }
  if (trimmed.startsWith('user:')) {
    const id = trimmed.slice(5);
    return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? trimmed : undefined as any;
  }
  if (/^[a-z0-9_-]{1,40}$/.test(trimmed)) {
    return PRESET_CATEGORIES.some((c) => c.key === trimmed) ? `${PREFIX_PRESET}${trimmed}` : undefined as any;
  }
  return undefined as any;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    // 管理员或自己创建的可查看
    const admin = await prisma.admin.findFirst({
      where: { userId: payload.userId },
    });
    const isAdmin = !!admin;

    const quiz = await prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      return NextResponse.json({ error: '题目不存在' }, { status: 404 });
    }

    if (!isAdmin && quiz.userId !== payload.userId && !quiz.isOfficial) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    return NextResponse.json({
      quiz: {
        ...quiz,
        questions: JSON.parse(quiz.questions || '[]'),
      },
    });
  } catch (error) {
    console.error('获取题目详情错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { id } = await params;
    const { title, categoryId } = await request.json();

    const data: Record<string, unknown> = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
      }
      data.title = title.trim();
    }
    // categoryId 可选:不传则不改;显式 null/'' 视为清空
    if (categoryId !== undefined) {
      const normalized = normalizeCategoryId(categoryId);
      if (normalized === undefined) {
        return NextResponse.json({ error: '无效的题库分类' }, { status: 400 });
      }
      data.categoryId = normalized;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '没有需要修改的字段' }, { status: 400 });
    }

    // 检查是否为管理员
    const admin = await prisma.admin.findFirst({
      where: { userId: payload.userId },
    });
    const isAdmin = !!admin;

    // 查找题库
    const quiz = await prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      return NextResponse.json({ error: '题目不存在' }, { status: 404 });
    }

    // 权限检查:管理员可改所有,普通用户只能改自己创建的非官方题库
    if (!isAdmin) {
      if (quiz.userId !== payload.userId) {
        return NextResponse.json({ error: '无权修改' }, { status: 403 });
      }
      if (quiz.isOfficial) {
        return NextResponse.json({ error: '官方题库只有管理员可修改' }, { status: 403 });
      }
    }

    const updated = await prisma.quiz.update({
      where: { id },
      data,
    });

    return NextResponse.json({ quiz: updated });
  } catch (error) {
    console.error('更新题目错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { id } = await params;

    // 检查是否为管理员
    const admin = await prisma.admin.findFirst({
      where: { userId: payload.userId },
    });
    const isAdmin = !!admin;

    // 查找题库
    const quiz = await prisma.quiz.findUnique({
      where: { id },
    });

    if (!quiz) {
      return NextResponse.json({ error: '题目不存在' }, { status: 404 });
    }

    // 权限检查：管理员可删所有，普通用户只能删自己创建的非官方题库
    if (!isAdmin) {
      if (quiz.userId !== payload.userId) {
        return NextResponse.json({ error: '无权删除' }, { status: 403 });
      }
      if (quiz.isOfficial) {
        return NextResponse.json({ error: '官方题库只有管理员可删除' }, { status: 403 });
      }
    }

    await prisma.quiz.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除题目错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
