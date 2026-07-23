import { prisma } from '@/lib/prisma';

const REWARD = 5;

export class AlreadyCheckedInError extends Error {
  constructor() {
    super('今天已签到');
    this.name = 'AlreadyCheckedInError';
  }
}

/**
 * 每日签到 +5 credit。
 *
 * 事务内:
 *   1. INSERT DailyCheckIn (唯一索引 [userId, checkInDate] 防重复)
 *   2. UPDATE User.credits += 5
 *   3. INSERT CreditLedger(daily_signin, +5)
 *
 * 错误:
 *   - Prisma P2002 唯一约束冲突 → AlreadyCheckedInError(已签到)
 *   - 其他错误 → 透传给调用方
 */
export async function checkInToday(userId: string): Promise<{ balance: number; credit: number }> {
  // 用 UTC 日期归零,避免时区干扰
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return prisma.$transaction(async (tx) => {
    // 1) 插入签到记录(唯一索引 [userId, checkInDate] 保护)
    try {
      await tx.dailyCheckIn.create({
        data: { userId, checkInDate: today, credit: REWARD },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new AlreadyCheckedInError();
      throw e;
    }

    // 2) 余额 +5
    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: REWARD } },
      select: { credits: true },
    });

    // 3) 写流水
    await tx.creditLedger.create({
      data: {
        userId,
        delta: REWARD,
        reason: 'daily_signin',
        balance: updated.credits,
      },
    });

    return { balance: updated.credits, credit: REWARD };
  });
}
