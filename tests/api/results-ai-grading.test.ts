import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    quizResult: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    quiz: { update: vi.fn(), findUnique: vi.fn() },
    aIProviderConfig: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/auth', () => ({
  verifyToken: vi.fn(),
  verifyAdminToken: vi.fn(),
  getTokenFromHeaders: vi.fn(),
  updateUserActiveTime: vi.fn(),
}));
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminToken: vi.fn(() => null),
  getTokenFromHeaders: vi.fn(() => null),
}));
vi.mock('@/lib/ai/providers', () => ({ callChat: vi.fn() }));
vi.mock('@/lib/ai/crypto', () => ({ decryptApiKey: vi.fn(() => 'k') }));

import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { callChat } from '@/lib/ai/providers';
import { POST } from '@/app/api/results/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTokenFromHeaders).mockImplementation((req: any) => {
    const h = req.headers.get('authorization');
    return h ? h.replace('Bearer ', '') : null;
  });
  vi.mocked(verifyToken).mockReturnValue({ userId: 'u1' } as any);
});

function buildReq(body: any): Request {
  return new Request('http://localhost/api/results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/results - draft 拆分', () => {
  it('draft 状态:查现有 draft,有则 update', async () => {
    vi.mocked(prisma.quizResult.findFirst).mockResolvedValueOnce({
      id: 'draft1',
      userId: 'u1',
      quizId: 'q1',
    } as any);
    vi.mocked(prisma.quizResult.update).mockResolvedValueOnce({
      id: 'draft1',
      results: '[]',
    } as any);

    const req = buildReq({
      quizId: 'q1',
      name: '草稿',
      score: 0,
      totalScore: 3,
      results: [],
      status: 'draft',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(prisma.quizResult.update).toHaveBeenCalled();
    expect(prisma.quizResult.create).not.toHaveBeenCalled();
  });

  it('draft 状态:无现有 draft 时 create 新行', async () => {
    vi.mocked(prisma.quizResult.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.quizResult.create).mockResolvedValueOnce({
      id: 'r-new',
      results: '[]',
    } as any);

    const req = buildReq({
      quizId: 'q1',
      name: '草稿',
      score: 0,
      totalScore: 3,
      results: [],
      status: 'draft',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(prisma.quizResult.create).toHaveBeenCalled();
    expect(prisma.quizResult.update).not.toHaveBeenCalled();
  });

  it('submitted 状态:不查 draft,直接 create 新行(允许 N 份历史)', async () => {
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.quizResult.create).mockResolvedValueOnce({
      id: 'r-new',
      results: '[]',
    } as any);

    const req = buildReq({
      quizId: 'q1',
      name: '提交1',
      score: 2,
      totalScore: 3,
      results: [
        { questionId: 'q1', correct: true, userAnswer: 'A', autoGraded: true },
      ],
      status: 'submitted',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    expect(prisma.quizResult.create).toHaveBeenCalled();
    expect(prisma.quizResult.update).not.toHaveBeenCalled();
  });

  it('submitted 状态 + 主观题:调 AI 拿 aiComment 写回 results', async () => {
    vi.mocked(prisma.quiz.findUnique).mockResolvedValueOnce({
      questions: JSON.stringify([
        {
          id: 'q1',
          type: 'essay',
          title: '什么是闭包？',
          referenceAnswer: '闭包是函数与其词法环境的组合。',
        },
      ]),
    } as any);
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValueOnce({
      baseURL: 'https://x',
      model: 'm',
      apiKeyCipher: 'c',
    } as any);
    vi.mocked(callChat).mockResolvedValueOnce(
      JSON.stringify({ comment: '不错的回答' }),
    );
    vi.mocked(prisma.quizResult.create).mockResolvedValueOnce({
      id: 'r1',
      results: '[]',
    } as any);

    const req = buildReq({
      quizId: 'q1',
      name: '提交',
      score: 0,
      totalScore: 2,
      results: [
        { questionId: 'q1', correct: false, userAnswer: '答1', autoGraded: false },
      ],
      status: 'submitted',
    });
    await POST(req as any);
    // create 调用的 results 字符串应含 aiComment
    const createArg = vi.mocked(prisma.quizResult.create).mock.calls[0][0];
    const parsed = JSON.parse(createArg.data.results);
    expect(parsed[0].aiComment).toBe('不错的回答');
  });

  it('AI 失败时 aiComment 不写入但不阻塞', async () => {
    vi.mocked(prisma.quiz.findUnique).mockResolvedValueOnce({
      questions: JSON.stringify([
        {
          id: 'q1',
          type: 'essay',
          title: '什么是闭包？',
          referenceAnswer: '参考',
        },
      ]),
    } as any);
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValueOnce({
      baseURL: 'https://x',
      model: 'm',
      apiKeyCipher: 'c',
    } as any);
    vi.mocked(callChat).mockRejectedValueOnce(new Error('AI 挂'));
    vi.mocked(prisma.quizResult.create).mockResolvedValueOnce({
      id: 'r1',
      results: '[]',
    } as any);

    const req = buildReq({
      quizId: 'q1',
      name: '提交',
      score: 0,
      totalScore: 1,
      results: [
        { questionId: 'q1', correct: false, userAnswer: '答1', autoGraded: false },
      ],
      status: 'submitted',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const createArg = vi.mocked(prisma.quizResult.create).mock.calls[0][0];
    const parsed = JSON.parse(createArg.data.results);
    expect(parsed[0].aiComment).toBeUndefined();
  });
});