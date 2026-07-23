import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    return NextResponse.json({ error: '充值金额无效 (1 - 100000)' }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
      select: { credits: true },
    });
    const ledger = await tx.creditLedger.create({
      data: {
        userId,
        delta: amount,
        reason: 'topup',
        balance: user.credits,
        refId: `topup-${Date.now()}`,
      },
    });
    return { balance: user.credits, ledgerId: ledger.id };
  });

  return NextResponse.json({
    orderId: updated.ledgerId,
    status: 'pending',
    balance: updated.balance,
    message: '支付未对接,已由运营手工加积分',
  });
}