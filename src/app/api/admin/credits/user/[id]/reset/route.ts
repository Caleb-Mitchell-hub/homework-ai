import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromHeaders, verifyAdminToken } from '@/lib/admin-auth';

type Action = 'checkin' | 'explanations' | 'all';

/**
 * POST /api/admin/credits/user/[id]/reset
 * Body: { action: 'checkin' | 'explanations' | 'all' }
 *
 *  - checkin: 删除 DailyCheckIn 记录
 *  - explanations: 删除 AIExplanation 记录
 *  - all: 上面两个 + 清零 User.credits 并写一条 ledger
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
    const action = (body?.action || '') as Action;
    if (!['checkin', 'explanations', 'all'].includes(action)) {
      return NextResponse.json({ error: '无效的 action' }, { status: 400 });
    }

    let deletedCheckIns = 0;
    let deletedExplanations = 0;
    let clearedBalance = false;

    const result = await prisma.$transaction(async (tx) => {
      if (action === 'checkin' || action === 'all') {
        const d = await tx.dailyCheckIn.deleteMany({ where: { userId: id } });
        deletedCheckIns = d.count;
      }
      if (action === 'explanations' || action === 'all') {
        const d = await tx.aIExplanation.deleteMany({ where: { userId: id } });
        deletedExplanations = d.count;
      }
      if (action === 'all') {
        const u = await tx.user.update({
          where: { id },
          data: { credits: 0 },
          select: { credits: true },
        });
        await tx.creditLedger.create({
          data: {
            userId: id,
            delta: -u.credits, // delta = -原余额
            reason: 'admin_adjust',
            refId: `admin_reset:${payload.userId}`,
            balance: 0,
          },
        });
        clearedBalance = true;
      }
      return { deletedCheckIns, deletedExplanations, clearedBalance };
    });

    return NextResponse.json({
      success: true,
      ...result,
      message:
        action === 'checkin'
          ? `已删除 ${result.deletedCheckIns} 条签到记录`
          : action === 'explanations'
          ? `已删除 ${result.deletedExplanations} 条 AI 解析`
          : `已重置账户(签到 ${result.deletedCheckIns}, AI ${result.deletedExplanations}, 余额→0)`,
    });
  } catch (error: any) {
    console.error('重置失败:', error);
    return NextResponse.json(
      { error: error?.message || '重置失败' },
      { status: 500 }
    );
  }
}
