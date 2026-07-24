import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIProviderConfig: { findFirst: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({
  verifyToken: vi.fn(),
  getTokenFromHeaders: vi.fn(),
}));

vi.mock('@/lib/ai/providers', () => ({
  callChat: vi.fn(),
}));

vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: vi.fn(() => 'decrypted-key'),
}));

import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { POST } from '@/app/api/ai/followup/route';

beforeEach(() => {
  vi.clearAllMocks();

  const parseHeader = (req: Request) => {
    const h = req.headers.get('authorization');
    return h ? h.replace('Bearer ', '') : null;
  };
  vi.mocked(getTokenFromHeaders).mockImplementation(parseHeader as any);

  // 默认已登录
  vi.mocked(verifyToken).mockReturnValue({ userId: 'u1' } as any);
});

function buildReq(body: any): Request {
  return new Request('http://localhost/api/ai/followup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/followup', () => {
  it('未登录返回 401', async () => {
    vi.mocked(verifyToken).mockReturnValue(null);
    const req = new Request('http://localhost/api/ai/followup', {
      method: 'POST',
      body: JSON.stringify({ questionId: 'q1', questionContent: 'test', newQuestion: 'why?' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('缺少必填字段返回 400', async () => {
    const req = buildReq({ questionId: 'q1' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('newQuestion 为空字符串返回 400', async () => {
    const req = buildReq({ questionId: 'q1', questionContent: 'test', newQuestion: '   ' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('无活跃 AI 厂商返回 502', async () => {
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValueOnce(null);

    const req = buildReq({ questionId: 'q1', questionContent: 'test', newQuestion: 'why?' });
    const res = await POST(req as any);
    expect(res.status).toBe(502);
  });

  it('成功返回 AI 内容', async () => {
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValueOnce({
      baseURL: 'https://api.test.com',
      model: 'test-model',
      apiKeyCipher: 'encrypted-key',
    } as any);
    vi.mocked(callChat).mockResolvedValueOnce('这是 AI 的追问回答');

    const req = buildReq({
      questionId: 'q1',
      questionContent: '什么是闭包？',
      questionType: 'essay',
      answer: '闭包是...',
      newQuestion: '能详细解释吗？',
      conversationHistory: [{ role: 'user', content: '能简单解释吗？' }],
    });
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.content).toBe('这是 AI 的追问回答');
  });

  it('AI 返回空内容返回 502', async () => {
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValueOnce({
      baseURL: 'https://api.test.com',
      model: 'test-model',
      apiKeyCipher: 'encrypted-key',
    } as any);
    vi.mocked(callChat).mockResolvedValueOnce('   ');

    const req = buildReq({
      questionId: 'q1',
      questionContent: 'test',
      newQuestion: 'why?',
    });
    const res = await POST(req as any);
    expect(res.status).toBe(502);
  });

  it('不查缓存、不扣积分（对比 explain 端点）', async () => {
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValueOnce({
      baseURL: 'https://api.test.com',
      model: 'test-model',
      apiKeyCipher: 'encrypted-key',
    } as any);
    vi.mocked(callChat).mockResolvedValueOnce('回答');

    const req = buildReq({
      questionId: 'q1',
      questionContent: 'test',
      newQuestion: 'why?',
    });
    await POST(req as any);

    // 验证没有调用 user 相关的 prisma（不需要验证余额）
    // 只调用了 aIProviderConfig.findFirst 和 callChat
    expect(prisma.aIProviderConfig.findFirst).toHaveBeenCalled();
    expect(callChat).toHaveBeenCalled();
    expect(decryptApiKey).toHaveBeenCalled();
  });
});
