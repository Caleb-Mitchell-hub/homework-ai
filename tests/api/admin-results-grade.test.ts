import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    quizResult: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminToken: vi.fn(),
  getTokenFromHeaders: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { POST } from '@/app/api/admin/results/[id]/grade/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTokenFromHeaders).mockImplementation((req: any) => {
    const h = req.headers.get('authorization');
    return h ? h.replace('Bearer ', '') : null;
  });
  vi.mocked(verifyAdminToken).mockReturnValue({ userId: 'admin1' } as any);
});

function buildReq(body: any): Request {
  return new Request('http://localhost/api/admin/results/r1/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/results/[id]/grade', () => {
  it('非 admin token 返回 403', async () => {
    vi.mocked(verifyAdminToken).mockReturnValue(null);
    const req = new Request('http://localhost/api/admin/results/r1/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-token' },
      body: JSON.stringify({ questionId: 'q1', manualScore: 0.8 }),
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(403);
  });

  it('结果不存在返回 404', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValueOnce(null);
    const req = buildReq({ questionId: 'q1', manualScore: 0.8 });
    const res = await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(404);
  });

  it('manualScore 超 [0,1] 范围 clamp', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValueOnce({
      id: 'r1',
      results: JSON.stringify([{ questionId: 'q1', userAnswer: 'a', correct: false, autoGraded: false }]),
      score: 0,
      totalScore: 1,
    } as any);
    vi.mocked(prisma.quizResult.update).mockResolvedValueOnce({} as any);

    const req = buildReq({ questionId: 'q1', manualScore: 1.5, manualComment: 'good' });
    await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });

    expect(prisma.quizResult.update).toHaveBeenCalled();
    const updateArg = vi.mocked(prisma.quizResult.update).mock.calls[0][0] as any;
    const parsed = JSON.parse(updateArg.data.results);
    expect(parsed[0].manualScore).toBe(1);
    expect(parsed[0].manualComment).toBe('good');
  });

  it('写入 manualScore 后总分被重算', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValueOnce({
      id: 'r1',
      results: JSON.stringify([
        { questionId: 'q1', userAnswer: 'a', correct: true, autoGraded: true },
        { questionId: 'q2', userAnswer: 'b', correct: true, autoGraded: true },
        { questionId: 'q3', userAnswer: 'c', correct: true, autoGraded: true },
        { questionId: 'q4', userAnswer: 'd', correct: true, autoGraded: true },
        { questionId: 'q5', userAnswer: 'e', correct: true, autoGraded: true },
        { questionId: 'q6', userAnswer: 'essay answer', correct: false, autoGraded: false },
      ]),
      score: 5,
      totalScore: 6,
    } as any);
    vi.mocked(prisma.quizResult.update).mockResolvedValueOnce({} as any);

    const req = buildReq({ questionId: 'q6', manualScore: 0.8, manualComment: 'good' });
    await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });

    const updateArg = vi.mocked(prisma.quizResult.update).mock.calls[0][0] as any;
    expect(updateArg.data.score).toBe(5.8);
    expect(updateArg.data.totalScore).toBe(6);
  });

  it('manualScore=null 表示清空', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValueOnce({
      id: 'r1',
      results: JSON.stringify([
        { questionId: 'q1', userAnswer: 'a', correct: false, autoGraded: false, manualScore: 0.5 },
      ]),
      score: 0.5,
      totalScore: 1,
    } as any);
    vi.mocked(prisma.quizResult.update).mockResolvedValueOnce({} as any);

    const req = buildReq({ questionId: 'q1', manualScore: null });
    await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });

    const updateArg = vi.mocked(prisma.quizResult.update).mock.calls[0][0] as any;
    const parsed = JSON.parse(updateArg.data.results);
    expect(parsed[0].manualScore).toBeUndefined();
    expect(updateArg.data.score).toBe(0);
  });
});