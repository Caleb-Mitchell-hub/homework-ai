import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { refreshPresetCategories } from '@/lib/quizCategories';

/** PATCH — 编辑预置分类 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.presetQuizCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '分类不存在' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.text !== undefined) {
      const text = (body.text ?? '').trim();
      if (!text) return NextResponse.json({ error: '分类名称不能为空' }, { status: 400 });
      if (text.length > 40) return NextResponse.json({ error: '分类名称最长 40 个字符' }, { status: 400 });
      data.text = text;
    }
    if (body.emoji !== undefined) {
      data.emoji = (body.emoji ?? '').trim().slice(0, 10) || null;
    }
    if (body.order !== undefined) {
      const order = Number(body.order);
      if (!Number.isFinite(order) || order < 0) {
        return NextResponse.json({ error: '排序序号必须是非负整数' }, { status: 400 });
      }
      data.order = order;
    }

    const preset = await prisma.presetQuizCategory.update({
      where: { id },
      data,
    });

    await refreshPresetCategories();

    return NextResponse.json({ preset });
  } catch (error) {
    console.error('编辑预置分类失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** DELETE — 删除预置分类（不影响已有题库的 categoryId） */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const { id } = await params;

    const existing = await prisma.presetQuizCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '分类不存在' }, { status: 404 });
    }

    await prisma.presetQuizCategory.delete({ where: { id } });

    await refreshPresetCategories();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除预置分类失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
