import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { QUESTION_EXPLAIN_PROMPT } from '@/lib/ai/explain-prompt';
import { getExplainCost } from './explain-cost';

export class InsufficientCreditsError extends Error {
  constructor(public required: number, public balance: number) {
    super(`积分不足: 需要 ${required}, 当前 ${balance}`);
    this.name = 'InsufficientCreditsError';
  }
}

async function getBalance(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });
  return u?.credits ?? 0;
}

/**
 * 单题 AI 解析:
 * 1. 查缓存 (同 userId+questionId 已存在 → 免费返回)
 * 2. 事务内: 校验余额 → 扣费 → 写 CreditLedger
 * 3. 调 AI callChat (失败时回滚积分 + 写 refund 流水)
 * 4. 写 AIExplanation 缓存(content)
 * 5. 返回 { content, cached, newBalance, costCredit }
 *
 * 并发安全:
 *  - 事务保证余额检查 + 扣费原子性
 *  - AI 失败自动回滚
 *  - 同题同用户缓存命中不计费
 */
export async function explainQuestion(opts: {
  userId: string;
  questionId: string;
  questionContent: string;
  questionType?: string;
  signal?: AbortSignal;
}): Promise<{ content: string; cached: boolean; newBalance: number; costCredit: number }> {
  // 1. 缓存查询
  const cached = await prisma.aIExplanation.findFirst({
    where: { userId: opts.userId, questionId: opts.questionId },
    orderBy: { createdAt: 'desc' },
  });
  if (cached) {
    return {
      content: cached.content,
      cached: true,
      newBalance: await getBalance(opts.userId),
      costCredit: 0,
    };
  }

  // 2. 计算价格
  const cost = getExplainCost(inferDifficulty(opts.questionContent));

  // 3. 事务扣费
  const newBalance = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: opts.userId },
      select: { credits: true },
    });
    if (!user || user.credits < cost) {
      throw new InsufficientCreditsError(cost, user?.credits ?? 0);
    }
    const updated = await tx.user.update({
      where: { id: opts.userId },
      data: { credits: { decrement: cost } },
      select: { credits: true },
    });
    await tx.creditLedger.create({
      data: {
        userId: opts.userId,
        delta: -cost,
        reason: 'ai_explain',
        balance: updated.credits,
        refId: opts.questionId,
      },
    });
    return updated.credits;
  });

  // 4. 调 AI (失败时回滚)
  try {
    const provider = await prisma.aIProviderConfig.findFirst({
      where: { isActive: true },
    });
    if (!provider) throw new Error('未配置 AI 厂商');
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const content = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [
        { role: 'system', content: QUESTION_EXPLAIN_PROMPT },
        { role: 'user', content: opts.questionContent },
      ],
      signal: opts.signal,
      maxTokens: 1500,
      temperature: 0.4,
    });

    // 5. 写缓存
    await prisma.aIExplanation.create({
      data: {
        userId: opts.userId,
        questionId: opts.questionId,
        costCredit: cost,
        content,
      },
    });

    return { content, cached: false, newBalance, costCredit: cost };
  } catch (err) {
    // 6. AI 失败: 回滚积分
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: opts.userId },
        data: { credits: { increment: cost } },
        select: { credits: true },
      });
      await tx.creditLedger.create({
        data: {
          userId: opts.userId,
          delta: cost,
          reason: 'refund',
          balance: updated.credits,
          refId: opts.questionId,
        },
      });
    });
    throw err;
  }
}

/**
 * 启发式从题目文本推断难度(本期不传显式 difficulty 字段的兜底):
 * - 含代码/算法关键字 → 困难
 * - 其他 → 中等
 */
function inferDifficulty(text: string): '简单' | '中等' | '困难' {
  if (/代码|编程|算法|实现|function|def |class /.test(text)) return '困难';
  return '中等';
}
