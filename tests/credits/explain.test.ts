import { describe, it, expect, vi, beforeEach } from 'vitest';

// 共用 txMock
const txMock = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  creditLedger: { create: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIExplanation: { findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    creditLedger: { create: vi.fn() },
    aIProviderConfig: { findFirst: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(txMock)),
  },
}));
vi.mock('@/lib/ai/providers', () => ({
  callChat: vi.fn(),
}));
vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: vi.fn(() => 'plain-api-key'),
}));

import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { explainQuestion, InsufficientCreditsError } from '@/lib/credits/explain';

beforeEach(() => {
  vi.clearAllMocks();
  // 重置 $transaction 调用 txMock
  vi.mocked(prisma.$transaction).mockImplementation((fn: any) => fn(txMock));
  // 重置 txMock 上的 fn
  txMock.user.findUnique.mockReset();
  txMock.user.update.mockReset();
  txMock.creditLedger.create.mockReset();
  txMock.user.update.mockReturnValue({ credits: 95 });
});

const baseArgs = {
  userId: 'u1',
  questionId: 'q1',
  questionContent: '1+1=?',
  questionType: 'single',
};

describe('explainQuestion - 缓存命中', () => {
  it('已存在 AIExplanation: 直接返回, 不调 AI, costCredit=0', async () => {
    vi.mocked(prisma.aIExplanation.findFirst).mockResolvedValue({
      content: 'cached answer',
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ credits: 100 } as any);

    const result = await explainQuestion(baseArgs);
    expect(result.cached).toBe(true);
    expect(result.content).toBe('cached answer');
    expect(result.costCredit).toBe(0);
    expect(callChat).not.toHaveBeenCalled();
    expect(prisma.aIExplanation.create).not.toHaveBeenCalled();
  });
});

describe('explainQuestion - 余额不足', () => {
  it('credits=2 时 throw InsufficientCreditsError', async () => {
    vi.mocked(prisma.aIExplanation.findFirst).mockResolvedValue(null);
    txMock.user.findUnique.mockResolvedValue({ credits: 2 });

    await expect(explainQuestion(baseArgs)).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(callChat).not.toHaveBeenCalled();
  });
});

describe('explainQuestion - 成功路径', () => {
  it('完整流程: 扣费 -> 调 AI -> 缓存结果, 返回 {cached:false, costCredit:5}', async () => {
    vi.mocked(prisma.aIExplanation.findFirst).mockResolvedValue(null);
    txMock.user.findUnique.mockResolvedValue({ credits: 100 });
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValue({
      id: 'p1', baseURL: 'https://x', apiKeyCipher: 'c', model: 'glm-5',
    } as any);
    vi.mocked(callChat).mockResolvedValue('AI 解析内容');
    vi.mocked(prisma.aIExplanation.create).mockResolvedValue({} as any);

    const result = await explainQuestion(baseArgs);
    expect(result.cached).toBe(false);
    expect(result.content).toBe('AI 解析内容');
    expect(result.costCredit).toBe(5);
    expect(result.newBalance).toBe(95);
    expect(callChat).toHaveBeenCalledTimes(1);
    expect(prisma.aIExplanation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          questionId: 'q1',
          costCredit: 5,
          content: 'AI 解析内容',
        }),
      })
    );
  });

  it('写 ledger 时 delta=-5, reason=ai_explain, balance=95', async () => {
    vi.mocked(prisma.aIExplanation.findFirst).mockResolvedValue(null);
    txMock.user.findUnique.mockResolvedValue({ credits: 100 });
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValue({
      id: 'p1', baseURL: 'https://x', apiKeyCipher: 'c', model: 'glm-5',
    } as any);
    vi.mocked(callChat).mockResolvedValue('AI 解析');
    vi.mocked(prisma.aIExplanation.create).mockResolvedValue({} as any);

    await explainQuestion(baseArgs);
    expect(txMock.creditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          delta: -5,
          reason: 'ai_explain',
          balance: 95,
          refId: 'q1',
        }),
      })
    );
  });
});

describe('explainQuestion - AI 失败回滚', () => {
  it('callChat 抛错时回滚积分 + 写 refund 流水', async () => {
    vi.mocked(prisma.aIExplanation.findFirst).mockResolvedValue(null);
    txMock.user.findUnique.mockResolvedValue({ credits: 100 });
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValue({
      id: 'p1', baseURL: 'https://x', apiKeyCipher: 'c', model: 'glm-5',
    } as any);
    vi.mocked(callChat).mockRejectedValue(new Error('AI 报错'));

    // 第二次调用 $transaction 是回滚,返回 refund 后的余额
    let callCount = 0;
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      callCount++;
      if (callCount === 1) {
        // 第一次:扣费事务 - txMock 返回扣费后余额
        return fn(txMock);
      } else {
        // 第二次:回滚事务 - 返回 refund 后余额
        const refundTx = {
          user: { update: vi.fn().mockReturnValue({ credits: 100 }) },
          creditLedger: { create: vi.fn() },
        };
        return fn(refundTx);
      }
    });

    await expect(explainQuestion(baseArgs)).rejects.toThrow('AI 报错');
  });
});
