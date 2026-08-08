import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromHeaders, verifyAdminToken } from '@/lib/admin-auth';

/**
 * POST /api/admin/credits/user/[id]/adjust
 * Body: { delta: number, note?: string }
 * - 管理员手动加减积分,写入 ledger (reason='admin_adjust')
 * - 不允许把余额减成负数
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const delta = Number(body?.delta);
    const note = typeof body?.note === 'string' ? body.note.slice(0, 200) : '';

    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: '请输入非零的调整数值' }, { status: 400 });
    }
    if (Math.abs(delta) > 100000) {
      return NextResponse.json({ error: '单次调整不能超过 100000' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { credits: true } });
      if (!user) throw new Error('用户不存在');
      const next = user.credits + delta;
      if (next < 0) throw new Error(`操作后余额不能为负(当前 ${user.credits},调整 ${delta})`);
      const updated = await tx.user.update({
        where: { id },
        data: { credits: next },
        select: { credits: true },
      });
      const refId = note ? `note:${note}` : `admin:${payload.userId}`;
      await tx.creditLedger.create({
        data: {
          userId: id,
          delta,
          reason: 'admin_adjust',
          refId,
          balance: updated.credits,
        },
      });
      return updated.credits;
    });

    return NextResponse.json({ success: true, balance: result, delta });
  } catch (error: any) {
    console.error('手动调整积分失败:', error);
    return NextResponse.json(
      { error: error?.message || '手动调整积分失败' },
      { status: 400 }
    );
  }
}
