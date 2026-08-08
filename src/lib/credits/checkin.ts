import { prisma } from '@/lib/prisma';

const REWARD = 30;

export class AlreadyCheckedInError extends Error {
  constructor() {
    super('今天已签到');
    this.name = 'AlreadyCheckedInError';
  }
}

/**
 * 每日签到 +30 credit。
 *
 * 事务内:
 *   1. INSERT DailyCheckIn (唯一索引 [userId, checkInDate] 防重复)
 *   2. UPDATE User.credits += 30
 *   3. INSERT CreditLedger(daily_signin, +30)
 *
 * 错误:
 *   - Prisma P2002 唯一约束冲突 → AlreadyCheckedInError(已签到)
 *   - 其他错误 → 透传给调用方
 */
export async function checkInToday(userId: string): Promise<{ balance: number; credit: number }> {
  // 使用 en-CA locale 直接输出 YYYY-MM-DD 格式的北京时间日期，
  // 避免 new Date(string) 解析 locale 字符串在不同 Node 版本/时区下的不确定性
  const beijingDateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const today = new Date(`${beijingDateStr}T00:00:00+08:00`);

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

    // 2) 余额 +30
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
