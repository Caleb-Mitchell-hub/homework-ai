import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    dailyCheckIn: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/auth', () => ({
  getTokenFromHeaders: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock('@/lib/admin-auth', () => ({
  getTokenFromHeaders: vi.fn(),
  verifyAdminToken: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { verifyAdminToken, getTokenFromHeaders as getAdminTokenFromHeaders } from '@/lib/admin-auth';
import { GET } from '@/app/api/user/credits/route';

beforeEach(() => {
  vi.clearAllMocks();
  // 让 getTokenFromHeaders 真的从 Authorization header 解析(而不是返回 undefined)
  const parseHeader = (req: Request) => {
    const h = req.headers.get('authorization');
    return h ? h.replace('Bearer ', '') : null;
  };
  vi.mocked(getTokenFromHeaders).mockImplementation(parseHeader as any);
  vi.mocked(getAdminTokenFromHeaders).mockImplementation(parseHeader as any);
  // 默认非管理员
  vi.mocked(verifyAdminToken).mockReturnValue(null);
});

describe('GET /api/user/credits', () => {
  it('已登录用户: 返回余额 + 未签到状态', async () => {
    vi.mocked(verifyToken).mockReturnValue({ userId: 'u1' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ credits: 50 } as any);
    vi.mocked(prisma.dailyCheckIn.findFirst).mockResolvedValue(null);

    const req = new Request('http://localhost/api/user/credits', {
      headers: { Authorization: 'Bearer t' },
    });
    const res = await GET(req as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ balance: 50, checkedIn: false, checkInReward: 5 });
  });

  it('今日已签到: checkedIn=true', async () => {
    vi.mocked(verifyToken).mockReturnValue({ userId: 'u1' } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ credits: 100 } as any);
    vi.mocked(prisma.dailyCheckIn.findFirst).mockResolvedValue({ id: 'c1' } as any);

    const req = new Request('http://localhost/api/user/credits', {
      headers: { Authorization: 'Bearer t' },
    });
    const res = await GET(req as any);
    const data = await res.json();
    expect(data.checkedIn).toBe(true);
  });

  it('未登录: 401', async () => {
    vi.mocked(verifyToken).mockReturnValue(null);
    vi.mocked(verifyAdminToken).mockReturnValue(null);
    const req = new Request('http://localhost/api/user/credits');
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it('admin token: 返回 balance=0 (管理员本期不参与积分)', async () => {
    vi.mocked(verifyAdminToken).mockReturnValue({ adminId: 'a1' } as any);
    const req = new Request('http://localhost/api/user/credits', {
      headers: { Authorization: 'Bearer admin-tok' },
    });
    const res = await GET(req as any);
    const data = await res.json();
    expect(data).toEqual({ balance: 0, checkedIn: false, checkInReward: 5 });
  });
});
