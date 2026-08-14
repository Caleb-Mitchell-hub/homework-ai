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
const RETRY_MAX = 2;

function buildExplainMessage(opts: {
  questionContent: string;
  questionType?: string;
  userAnswer?: string;
  correctAnswer?: string;
  options?: string[];
}): string {
  const parts: string[] = [];
  parts.push(`【题目】${opts.questionContent}`);
  if (opts.options && opts.options.length > 0) {
    parts.push(`【选项】${opts.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')}`);
  }
  if (opts.correctAnswer) {
    parts.push(`【正确答案】${opts.correctAnswer}`);
  }
  if (opts.userAnswer) {
    parts.push(`【学生作答】${opts.userAnswer}`);
  }
  parts.push(`【题目类型】${opts.questionType || '未知'}`);
  return parts.join('\n\n');
}

export async function explainQuestion(opts: {
  userId: string;
  questionId: string;
  questionContent: string;
  questionType?: string;
  userAnswer?: string;
  correctAnswer?: string;
  options?: string[];
  signal?: AbortSignal;
  force?: boolean;
}): Promise<{ content: string; cached: boolean; newBalance: number; costCredit: number }> {
  // 1. 缓存查询 — 按 (userId, questionId, userAnswer) 精确匹配
  //    userAnswer 不同 = 不同的解析需求，必须重新生成，不能复用旧缓存
  //    force=true 时跳过缓存，强制重新生成
  const userAnswer = opts.userAnswer || '';
  if (!opts.force) {
    const cached = await prisma.aIExplanation.findFirst({
      where: { userId: opts.userId, questionId: opts.questionId, userAnswer },
      orderBy: { createdAt: 'desc' },
    });
    if (cached) {
      // 防御:旧缓存可能存了空内容（AI 返回空 → 缓存了空）,删掉重来
      if (!cached.content?.trim()) {
        await prisma.aIExplanation.delete({ where: { id: cached.id } });
      } else {
        return {
          content: cached.content,
          cached: true,
          newBalance: await getBalance(opts.userId),
          costCredit: 0,
        };
      }
    }
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

  // 4. 调 AI (带重试, 失败时回滚)
  const userMessage = buildExplainMessage({
    questionContent: opts.questionContent,
    questionType: opts.questionType,
    userAnswer: opts.userAnswer,
    correctAnswer: opts.correctAnswer,
    options: opts.options,
  });

  let content: string | undefined;
  let lastErr: unknown;
  try {
    const provider = await prisma.aIProviderConfig.findFirst({
      where: { isActive: true },
    });
    if (!provider) throw new Error('未配置 AI 厂商');
    const apiKey = decryptApiKey(provider.apiKeyCipher);

    for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
      try {
        content = await callChat({
          baseURL: provider.baseURL,
          apiKey,
          model: provider.model,
          messages: [
            { role: 'system', content: QUESTION_EXPLAIN_PROMPT },
            { role: 'user', content: userMessage },
          ],
          signal: opts.signal,
          maxTokens: 1500,
          temperature: 0.4,
        });
        if (content?.trim()) break; // 成功,跳出重试循环
        lastErr = new Error('AI 返回了空内容');
      } catch (err) {
        lastErr = err;
        if (attempt < RETRY_MAX) {
          // 短暂等待后重试
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }

    // AI 返回空内容:不做缓存,直接退款
    if (!content?.trim()) {
      throw lastErr ?? new Error('AI 返回了空内容,请检查厂商配置或模型是否支持文本输出');
    }

    // 5. 写缓存（含 userAnswer，确保不同答案不会复用缓存）
    //    force 时先删除旧的 (userId, questionId, userAnswer) 记录，避免残留多份缓存
    if (opts.force) {
      await prisma.aIExplanation.deleteMany({
        where: { userId: opts.userId, questionId: opts.questionId, userAnswer },
      });
    }

    await prisma.aIExplanation.create({
      data: {
        userId: opts.userId,
        questionId: opts.questionId,
        userAnswer,
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
