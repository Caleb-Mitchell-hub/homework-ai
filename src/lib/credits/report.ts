import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { buildReportPrompt, WrongQuestion } from '@/lib/ai/report-prompt';

export const REPORT_COST = 5;

export class InsufficientCreditsForReportError extends Error {
  constructor(public required: number, public balance: number) {
    super('积分不足');
  }
}

export interface GenerateReportResult {
  content: { knowledgePoints: { tag: string; relatedQuestions: number[] }[]; advice: string; generatedAt?: string };
  cached: boolean;
  newBalance: number;
  costCredit: number;
}

/**
 * 生成(或复用)报告
 * - 缓存命中 → 直接返回,不再扣分
 * - 缓存未命中 → 扣 REPORT_COST 积分,调 AI,写 AIReport,失败回滚
 */
export async function generateReport(opts: {
  userId: string;
  resultId: string;
  quizTitle: string;
  score: number;
  totalScore: number;
  byType: Record<string, { total: number; correct: number; correctRate: number }>;
  byDifficulty: Record<string, { total: number; correct: number; correctRate: number }>;
  wrongQuestions: WrongQuestion[];
  difficultyProfile?: string;
}): Promise<GenerateReportResult> {
  // 1) 缓存命中?
  const existing = await prisma.aIReport.findUnique({
    where: { resultId: opts.resultId },
  });
  if (existing) {
    return {
      content: JSON.parse(existing.content),
      cached: true,
      newBalance: 0,
      costCredit: 0,
    };
  }

  // 2) 查积分
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { credits: true },
  });
  if (!user || user.credits < REPORT_COST) {
    throw new InsufficientCreditsForReportError(REPORT_COST, user?.credits ?? 0);
  }

  // 3) 扣分(事务)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: opts.userId },
      data: { credits: { decrement: REPORT_COST } },
    });
    await tx.creditLedger.create({
      data: {
        userId: opts.userId,
        delta: -REPORT_COST,
        reason: 'ai_report',
        refId: opts.resultId,
        balance: user.credits - REPORT_COST,
      },
    });
  });

  // 4) 调 AI
  let content: { knowledgePoints: any[]; advice: string };
  try {
    const provider = await prisma.aIProviderConfig.findFirst({
      where: { isActive: true },
    });
    if (!provider) throw new Error('没有激活的 AI 厂商');
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const prompt = buildReportPrompt({
      quizTitle: opts.quizTitle,
      score: opts.score,
      totalScore: opts.totalScore,
      byType: opts.byType,
      byDifficulty: opts.byDifficulty,
      wrongQuestions: opts.wrongQuestions,
      difficultyProfile: opts.difficultyProfile,
    });
    const raw = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [{ role: 'system', content: prompt }],
      jsonMode: true,
      maxTokens: 2000,
      temperature: 0.5,
    });
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.advice !== 'string' ||
      !Array.isArray(parsed.knowledgePoints)
    ) {
      throw new Error('AI 返回格式不正确');
    }
    content = parsed;
  } catch (e) {
    // 5) 失败回滚
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: opts.userId },
        data: { credits: { increment: REPORT_COST } },
      });
      await tx.creditLedger.create({
        data: {
          userId: opts.userId,
          delta: REPORT_COST,
          reason: 'refund',
          refId: opts.resultId,
          balance: user.credits,
        },
      });
    });
    throw e;
  }

  // 6) 写缓存
  await prisma.aIReport.create({
    data: {
      resultId: opts.resultId,
      userId: opts.userId,
      content: JSON.stringify({
        ...content,
        generatedAt: new Date().toISOString(),
      }),
      costCredit: REPORT_COST,
    },
  });

  return {
    content,
    cached: false,
    newBalance: user.credits - REPORT_COST,
    costCredit: REPORT_COST,
  };
}