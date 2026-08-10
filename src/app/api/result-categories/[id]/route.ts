import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
    const existing = await prisma.resultCategory.findUnique({ where: { id } });
    if (!existing || existing.userId !== payload.userId) {
      return NextResponse.json({ error: '分类不存在或无权操作' }, { status: 404 });
    }

    const { name, parentId } = await request.json();
    const data: any = {};
    if (name !== undefined) data.name = name.trim();
    if (parentId !== undefined) data.parentId = parentId;

    const category = await prisma.resultCategory.update({
      where: { id },
      data,
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error('更新分类错误:', error);
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
    const existing = await prisma.resultCategory.findUnique({ where: { id } });
    if (!existing || existing.userId !== payload.userId) {
      return NextResponse.json({ error: '分类不存在或无权操作' }, { status: 404 });
    }

    // 递归收集所有子分类 id
    async function collectDescendantIds(parentId: string): Promise<string[]> {
      const children = await prisma.resultCategory.findMany({
        where: { parentId },
        select: { id: true },
      });
      const ids: string[] = [];
      for (const c of children) {
        ids.push(c.id);
        ids.push(...(await collectDescendantIds(c.id)));
      }
      return ids;
    }
    const toDelete = [id, ...(await collectDescendantIds(id))];

    // 将受影响记录的分类重置为 null
    await prisma.quizResult.updateMany({
      where: { categoryId: { in: toDelete } },
      data: { categoryId: null },
    });

    const result = await prisma.resultCategory.deleteMany({
      where: { id: { in: toDelete } },
    });

    return NextResponse.json({ ok: true, deletedCount: result.count });
  } catch (error) {
    console.error('删除分类错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
