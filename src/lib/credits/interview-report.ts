import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { extractJson } from '@/lib/ai/json-extractor';
import { buildInterviewReportPrompt } from '@/lib/ai/interview-report-prompt';
import type { InterviewQuestionResult } from '@/lib/ai/interview-report-prompt';

export const INTERVIEW_REPORT_COST = 100;

export class InsufficientCreditsForInterviewReportError extends Error {
  public required: number;
  public balance: number;
  constructor(required: number, balance: number) {
    super(`积分不足：需要 ${required} 积分，当前 ${balance} 积分`);
    this.name = 'InsufficientCreditsForInterviewReportError';
    this.required = required;
    this.balance = balance;
  }
}

export interface InterviewReportResult {
  overallScore: number;
  overallComment: string;
  masteredAreas: { area: string; detail: string }[];
  weakAreas: { area: string; detail: string; suggestion: string }[];
  improvementPlan: string;
}

export async function generateInterviewReport(
  userId: string,
  quizTitle: string,
  questions: InterviewQuestionResult[],
  difficultyProfile?: string,
  signal?: AbortSignal,
): Promise<{ content: InterviewReportResult; cached: boolean; newBalance: number; costCredit: number }> {
  const totalScore = questions.reduce((sum, q) => sum + q.score, 0);
  const maxScore = questions.length * 100;

  // 缓存检查由调用方（API route）在调用前完成，本函数仅负责扣积分 + 生成报告

  // 检查积分
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  if (!user) throw new Error('用户不存在');
  if (user.credits < INTERVIEW_REPORT_COST) {
    throw new InsufficientCreditsForInterviewReportError(INTERVIEW_REPORT_COST, user.credits);
  }

  // 事务内扣积分
  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: INTERVIEW_REPORT_COST } },
      select: { credits: true },
    }),
    prisma.creditLedger.create({
      data: {
        userId,
        delta: -INTERVIEW_REPORT_COST,
        reason: 'ai_interview_report',
        balance: user.credits - INTERVIEW_REPORT_COST,
      },
    }),
  ]);

  // 调 AI 生成报告
  try {
    const provider = await prisma.aIProviderConfig.findFirst({
      where: { isActive: true },
    });
    if (!provider) {
      // 回滚积分
      await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { credits: { increment: INTERVIEW_REPORT_COST } } }),
        prisma.creditLedger.create({
          data: {
            userId,
            delta: INTERVIEW_REPORT_COST,
            reason: 'refund',
            refId: 'ai_interview_report_refund',
            balance: user.credits,
          },
        }),
      ]);
      throw new Error('没有可用的 AI 服务商');
    }

    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const prompt = buildInterviewReportPrompt({
      quizTitle,
      totalScore,
      maxScore,
      questions,
      difficultyProfile,
    });

    // 面试报告最多 120 秒，同时监听调用方传入的 signal
    const reportSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000);
    const content = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [
        { role: 'system', content: '你是一位资深面试官和技术导师。请严格按照 JSON 格式输出面试表现深度分析报告。' },
        { role: 'user', content: prompt },
      ],
      jsonMode: true,
      maxTokens: 8000,
      temperature: 0.7,
      signal: reportSignal,
    });

    let parsed: InterviewReportResult;
    try {
      parsed = extractJson<InterviewReportResult>(content);
    } catch (jsonErr: any) {
      console.error('面试报告 JSON 解析失败，原始长度:', content.length, '前200字符:', content.slice(0, 200));
      throw new Error(`AI 返回格式异常：${jsonErr?.message || '无法解析'}`);
    }

    return {
      content: parsed,
      cached: false,
      newBalance: updatedUser.credits,
      costCredit: INTERVIEW_REPORT_COST,
    };
  } catch (error) {
    // 失败回滚积分
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { credits: { increment: INTERVIEW_REPORT_COST } } }),
      prisma.creditLedger.create({
        data: {
          userId,
          delta: INTERVIEW_REPORT_COST,
          reason: 'refund',
          refId: 'ai_interview_report_refund',
          balance: user.credits,
        },
      }),
    ]);
    throw error;
  }
}
