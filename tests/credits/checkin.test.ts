import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma.$transaction: invoke callback with a tx object that delegates to the same mocks
const txMock = {
  dailyCheckIn: { create: vi.fn() },
  user: { update: vi.fn() },
  creditLedger: { create: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyCheckIn: { create: vi.fn() },
    user: { update: vi.fn() },
    creditLedger: { create: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(txMock)),
  },
}));

import { prisma } from '@/lib/prisma';
import { checkInToday, AlreadyCheckedInError } from '@/lib/credits/checkin';

beforeEach(() => {
  vi.clearAllMocks();
  // 重置 $transaction 默认 mock
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(txMock));
  txMock.dailyCheckIn.create.mockReset();
  txMock.user.update.mockReset();
  txMock.creditLedger.create.mockReset();
});

describe('checkInToday', () => {
  it('首次签到返回余额=55, credit=5', async () => {
    txMock.dailyCheckIn.create.mockResolvedValue({});
    txMock.user.update.mockReturnValue({ credits: 55 });
    txMock.creditLedger.create.mockResolvedValue({});

    const result = await checkInToday('u1');
    expect(result).toEqual({ balance: 55, credit: 5 });
    expect(txMock.dailyCheckIn.create).toHaveBeenCalledTimes(1);
    expect(txMock.user.update).toHaveBeenCalledTimes(1);
    expect(txMock.creditLedger.create).toHaveBeenCalledTimes(1);
  });

  it('同日重复签到(唯一索引冲突 P2002)抛 AlreadyCheckedInError,不写流水', async () => {
    const err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    txMock.dailyCheckIn.create.mockRejectedValue(err);

    await expect(checkInToday('u1')).rejects.toBeInstanceOf(AlreadyCheckedInError);
    expect(txMock.user.update).not.toHaveBeenCalled();
    expect(txMock.creditLedger.create).not.toHaveBeenCalled();
  });

  it('写 ledger 时 delta=+5, reason=daily_signin, balance=新余额', async () => {
    txMock.dailyCheckIn.create.mockResolvedValue({});
    txMock.user.update.mockReturnValue({ credits: 100 });
    txMock.creditLedger.create.mockResolvedValue({});

    await checkInToday('u1');
    expect(txMock.creditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          delta: 5,
          reason: 'daily_signin',
          balance: 100,
        }),
      })
    );
  });

  it('user.update 使用 credits increment 5', async () => {
    txMock.dailyCheckIn.create.mockResolvedValue({});
    txMock.user.update.mockReturnValue({ credits: 55 });
    txMock.creditLedger.create.mockResolvedValue({});

    await checkInToday('u1');
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { credits: { increment: 5 } },
      })
    );
  });
});
