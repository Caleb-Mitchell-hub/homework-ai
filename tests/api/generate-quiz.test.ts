import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks ----

const txMock = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  creditLedger: { create: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIProviderConfig: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    creditLedger: { create: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(txMock)),
  },
}));

vi.mock('@/lib/auth', () => ({
  getTokenFromHeaders: vi.fn(),
  verifyToken: vi.fn(),
}));

vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: vi.fn(() => 'plain-key'),
}));

vi.mock('@/lib/ai/providers', () => ({
  callChatStream: vi.fn(),
}));

// We need the route handler — import after mocks
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import type { NextRequest } from 'next/server';

// Helper: create a minimal NextRequest-like object
function mockReq(body: unknown): NextRequest {
  return {
    json: () => Promise.resolve(body),
    signal: { aborted: false } as AbortSignal,
    headers: new Headers(),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/ai/generate-quiz — 参数校验', () => {
  it('未登录返回 401', async () => {
    vi.mocked(getTokenFromHeaders).mockReturnValue(null);

    const { POST } = await import(
      '@/app/api/ai/generate-quiz/route'
    );
    const res = await POST(mockReq({ topic: 'test', counts: { single: 1 } }));
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe('未登录');
  });

  it('游客返回 403', async () => {
    vi.mocked(getTokenFromHeaders).mockReturnValue('token');
    vi.mocked(verifyToken).mockReturnValue({
      userId: 'u1',
      isGuest: true,
    } as any);

    const { POST } = await import(
      '@/app/api/ai/generate-quiz/route'
    );
    const res = await POST(mockReq({ topic: 'test', counts: { single: 1 } }));
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toContain('游客');
  });

  it('topic 为空返回 400', async () => {
    vi.mocked(getTokenFromHeaders).mockReturnValue('token');
    vi.mocked(verifyToken).mockReturnValue({
      userId: 'u1',
      isGuest: false,
    } as any);

    const { POST } = await import(
      '@/app/api/ai/generate-quiz/route'
    );
    const res = await POST(mockReq({ topic: '   ', counts: { single: 1 } }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('主题');
  });

  it('所有题型为0返回 400', async () => {
    vi.mocked(getTokenFromHeaders).mockReturnValue('token');
    vi.mocked(verifyToken).mockReturnValue({
      userId: 'u1',
      isGuest: false,
    } as any);

    const { POST } = await import(
      '@/app/api/ai/generate-quiz/route'
    );
    const res = await POST(
      mockReq({ topic: 'topic', counts: { single: 0, multiple: 0 } }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('题型');
  });

  it('counts 中包含 code 类型会被忽略(不对 code 计数)', async () => {
    vi.mocked(getTokenFromHeaders).mockReturnValue('token');
    vi.mocked(verifyToken).mockReturnValue({
      userId: 'u1',
      isGuest: false,
    } as any);
    // code 在 validateCounts 中不会被遍历(不在 ALLOWED_GENERATE_TYPES 中)
    // 所以传 {code: 10, single: 0} 等价于全0 → 返回400
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValue(null);

    const { POST } = await import(
      '@/app/api/ai/generate-quiz/route'
    );
    const res = await POST(
      mockReq({ topic: 't', counts: { code: 10, single: 0 } }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/generate-quiz — 厂商/积分校验', () => {
  it('无 active provider 返回 500', async () => {
    vi.mocked(getTokenFromHeaders).mockReturnValue('token');
    vi.mocked(verifyToken).mockReturnValue({
      userId: 'u1',
      isGuest: false,
    } as any);
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValue(null);

    const { POST } = await import(
      '@/app/api/ai/generate-quiz/route'
    );
    const res = await POST(
      mockReq({ topic: 'test', counts: { single: 2 } }),
    );
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.error).toContain('AI 服务商');
  });

  it('积分不足返回 400 + required/balance 字段', async () => {
    vi.mocked(getTokenFromHeaders).mockReturnValue('token');
    vi.mocked(verifyToken).mockReturnValue({
      userId: 'u1',
      isGuest: false,
    } as any);
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValue({
      id: 'p1',
      baseURL: 'https://x',
      apiKeyCipher: 'c',
      model: 'gpt-4',
      isActive: true,
    } as any);
    // 余额不足
    txMock.user.findUnique.mockResolvedValue({ credits: 1 });

    const { POST } = await import(
      '@/app/api/ai/generate-quiz/route'
    );
    const res = await POST(
      mockReq({ topic: 'test', counts: { single: 5 } }),
    );
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('积分不足');
    expect(data.required).toBeGreaterThan(0);
    expect(data.balance).toBe(1);
  });
});
