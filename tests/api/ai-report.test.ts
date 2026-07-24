import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    quizResult: { findUnique: vi.fn() },
    quiz: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    aIReport: { findUnique: vi.fn(), create: vi.fn() },
    aIProviderConfig: { findFirst: vi.fn() },
    $transaction: vi.fn((fn: any) => fn({})),
  },
}));
vi.mock('@/lib/auth', () => ({
  verifyToken: vi.fn(),
  getTokenFromHeaders: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { POST } from '@/app/api/ai/report/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTokenFromHeaders).mockImplementation((req: any) => {
    const h = req.headers.get('authorization');
    return h ? h.replace('Bearer ', '') : null;
  });
  vi.mocked(verifyToken).mockReturnValue({ userId: 'u1' } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ credits: 100 } as any);
});

function buildReq(body: any): Request {
  return new Request('http://localhost/api/ai/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/report', () => {
  it('未登录返回 401', async () => {
    vi.mocked(verifyToken).mockReturnValue(null);
    const req = new Request('http://localhost/api/ai/report', {
      method: 'POST',
      body: JSON.stringify({ resultId: 'r1' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('缺 resultId 返回 400', async () => {
    const req = buildReq({});
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('非本人结果返回 404', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValueOnce({
      id: 'r1',
      userId: 'other',
      quizId: 'q1',
      results: '[]',
    } as any);
    const req = buildReq({ resultId: 'r1' });
    const res = await POST(req as any);
    expect(res.status).toBe(404);
  });

  it('积分不足返回 400', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ credits: 0 } as any);
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      quizId: 'q1',
      score: 0,
      totalScore: 10,
      results: '[]',
    } as any);
    vi.mocked(prisma.quiz.findUnique).mockResolvedValue({
      questions: '[]',
    } as any);
    const req = buildReq({ resultId: 'r1' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.required).toBe(5);
    expect(data.balance).toBe(0);
  });

  it('缓存命中直接返回,不再扣分', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValue({
      id: 'r1',
      userId: 'u1',
      quizId: 'q1',
      score: 5,
      totalScore: 10,
      results: '[]',
    } as any);
    vi.mocked(prisma.quiz.findUnique).mockResolvedValue({
      questions: '[]',
    } as any);
    vi.mocked(prisma.aIReport.findUnique).mockResolvedValue({
      content: JSON.stringify({
        knowledgePoints: [{ tag: 'a', relatedQuestions: [1] }],
        advice: 'hi',
      }),
    } as any);
    const req = buildReq({ resultId: 'r1' });
    const res = await POST(req as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.cached).toBe(true);
    expect(data.costCredit).toBe(0);
  });
});