import { prisma } from '@/lib/prisma';

export class InsufficientCreditsForGenerateError extends Error {
  constructor(
    public required: number,
    public balance: number,
  ) {
    super(`积分不足: 需要 ${required}, 当前 ${balance}`);
    this.name = 'InsufficientCreditsForGenerateError';
  }
}

/**
 * 事务扣费（预估积分）。返回扣费后的余额。
 * 余额不足时抛出 InsufficientCreditsForGenerateError。
 */
export async function chargeForGenerate(
  userId: string,
  estimatedCost: number,
  refId?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    if (!user || user.credits < estimatedCost) {
      throw new InsufficientCreditsForGenerateError(estimatedCost, user?.credits ?? 0);
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { decrement: estimatedCost } },
      select: { credits: true },
    });
    await tx.creditLedger.create({
      data: {
        userId,
        delta: -estimatedCost,
        reason: 'ai_generate_quiz',
        balance: updated.credits,
        refId: refId ?? null,
      },
    });
    return updated.credits;
  });
}

/**
 * 退款 / 补扣差额（正数=退款回账户，负数=补扣）。
 * 返回操作后的余额。
 */
export async function adjustForGenerate(
  userId: string,
  delta: number,
  refId?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: delta } },
      select: { credits: true },
    });
    await tx.creditLedger.create({
      data: {
        userId,
        delta,
        reason: 'refund',
        balance: updated.credits,
        refId: refId ?? null,
      },
    });
    return updated.credits;
  });
}
