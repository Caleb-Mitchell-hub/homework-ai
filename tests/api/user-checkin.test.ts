import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { dailyCheckIn: { create: vi.fn() }, user: { update: vi.fn() }, creditLedger: { create: vi.fn() } },
}));
vi.mock('@/lib/credits/checkin', () => ({
  checkInToday: vi.fn(),
  AlreadyCheckedInError: class AlreadyCheckedInError extends Error { constructor() { super('今天已签到'); this.name = 'AlreadyCheckedInError'; } },
}));
vi.mock('@/lib/auth', () => ({
  getTokenFromHeaders: vi.fn(),
  verifyToken: vi.fn(),
}));

import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { checkInToday, AlreadyCheckedInError } from '@/lib/credits/checkin';
import { POST } from '@/app/api/user/checkin/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockReturnValue({ userId: 'u1' } as any);
  // 让 getTokenFromHeaders 返回任意 token,使 verifyToken 真正被调用
  vi.mocked(getTokenFromHeaders).mockReturnValue('any-token' as any);
});

describe('POST /api/user/checkin', () => {
  it('首次签到: 200 + { ok: true, balance, credit: 30 }', async () => {
    vi.mocked(checkInToday).mockResolvedValue({ balance: 80, credit: 30 });
    const req = new Request('http://localhost/api/user/checkin', { method: 'POST' });
    const res = await POST(req as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true, balance: 80, credit: 30 });
    expect(checkInToday).toHaveBeenCalledWith('u1');
  });

  it('已签到: 409 + { error: 今天已签到 }', async () => {
    vi.mocked(checkInToday).mockRejectedValue(new AlreadyCheckedInError());
    const req = new Request('http://localhost/api/user/checkin', { method: 'POST' });
    const res = await POST(req as any);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('今天已签到');
  });

  it('未登录: 401', async () => {
    vi.mocked(verifyToken).mockReturnValue(null);
    const req = new Request('http://localhost/api/user/checkin', { method: 'POST' });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('其他错误: 500', async () => {
    vi.mocked(checkInToday).mockRejectedValue(new Error('DB error'));
    const req = new Request('http://localhost/api/user/checkin', { method: 'POST' });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });
});
