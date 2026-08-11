import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { refreshPresetCategories } from '@/lib/quizCategories';

const KEY_RE = /^[a-z][a-z0-9_]*$/;

/** GET — 预置分类列表（含每个分类下的题目数量） */
export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const presets = await prisma.presetQuizCategory.findMany({
      orderBy: { order: 'asc' },
    });

    // 统计每个预设分类下的题目数量
    const quizCounts = await prisma.quiz.groupBy({
      by: ['categoryId'],
      _count: { id: true },
    });
    const countMap = new Map(quizCounts.map((g) => [g.categoryId, g._count.id]));

    return NextResponse.json({
      presets: presets.map((p) => ({
        id: p.id,
        key: p.key,
        text: p.text,
        emoji: p.emoji ?? '',
        order: p.order,
        quizCount: countMap.get(`preset:${p.key}`) ?? 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error('获取预置分类列表失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** POST — 新增预置分类 */
export async function POST(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const body = await request.json();
    const key = (body?.key ?? '').trim();
    const text = (body?.text ?? '').trim();
    const emoji = (body?.emoji ?? '').trim().slice(0, 500) || null;
    const order = typeof body?.order === 'number' ? body.order : 0;

    if (!key || !text) {
      return NextResponse.json({ error: '分类标识和名称不能为空' }, { status: 400 });
    }
    if (key.length > 40 || text.length > 40) {
      return NextResponse.json({ error: '分类标识和名称最长 40 个字符' }, { status: 400 });
    }
    if (!KEY_RE.test(key)) {
      return NextResponse.json({ error: '分类标识只能包含小写字母、数字和下划线，且必须以字母开头' }, { status: 400 });
    }

    const exists = await prisma.presetQuizCategory.findUnique({ where: { key } });
    if (exists) {
      return NextResponse.json({ error: '分类标识已存在' }, { status: 409 });
    }

    const preset = await prisma.presetQuizCategory.create({
      data: { key, text, emoji, order },
    });

    await refreshPresetCategories();

    return NextResponse.json({ preset }, { status: 201 });
  } catch (error) {
    console.error('创建预置分类失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
