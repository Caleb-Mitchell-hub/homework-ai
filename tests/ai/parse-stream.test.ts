import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIProviderConfig: {
      findFirst: vi.fn(),
    },
  },
}));
vi.mock('@/lib/parser', () => ({
  parseMarkdown: vi.fn(),
}));
vi.mock('@/lib/ai/parser', () => ({
  aiParseQuestions: vi.fn(),
}));
vi.mock('@/lib/ai/normalize', () => ({
  normalizeAIOutputToQuestions: vi.fn((arr) => arr),
}));
vi.mock('@/lib/sessionStore', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminToken: vi.fn(),
  getTokenFromHeaders: vi.fn(),
}));
vi.mock('@/lib/ai/rate-limit', () => ({
  aiRateLimiter: { check: vi.fn(() => true) },
}));

import { prisma } from '@/lib/prisma';
import { parseMarkdown } from '@/lib/parser';
import { aiParseQuestions } from '@/lib/ai/parser';
import { getSession } from '@/lib/sessionStore';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { POST } from '@/app/api/ai/parse-stream/route';

async function readSseEvents(res: Response): Promise<any[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events: any[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.replace(/^data: /, '').trim();
      if (line) events.push(JSON.parse(line));
    }
  }
  return events;
}

function makeAuthedReq(body: any) {
  return new Request('http://localhost/api/ai/parse-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/parse-stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getTokenFromHeaders as any).mockImplementation((req: Request) => {
      const h = req.headers.get('authorization');
      return h ? h.replace('Bearer ', '') : null;
    });
    (verifyAdminToken as any).mockReturnValue(null);
    (getSession as any).mockReturnValue({ userId: 'u1', type: 'user' });
  });

  it('returns 401 when no auth header', async () => {
    (getTokenFromHeaders as any).mockReturnValueOnce(null);
    const req = new Request('http://localhost/api/ai/parse-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '# hello', mode: 'local' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('streams local parse progress events', async () => {
    (parseMarkdown as any).mockReturnValue([
      { type: 'single', content: 'q1', answer: 'A', score: 10 },
    ]);

    const res = await POST(makeAuthedReq({ text: '# hello', mode: 'local' }) as any);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const events = await readSseEvents(res);
    const progresses = events.map((e) => e.progress);
    expect(progresses).toContain(5);
    expect(progresses).toContain(30);
    expect(progresses).toContain(85);
    expect(progresses).toContain(100);
    const last = events[events.length - 1];
    expect(last.questions).toHaveLength(1);
  });

  it('returns error event when no active AI provider for mode=ai', async () => {
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue(null);

    const res = await POST(makeAuthedReq({ text: '# hello', mode: 'ai' }) as any);
    const events = await readSseEvents(res);
    expect(events.some((e) => e.error)).toBe(true);
  });

  it('streams AI parse progress events', async () => {
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue({
      id: 'p1', baseURL: 'https://x', apiKeyCipher: 'c', model: 'm',
    });
    (aiParseQuestions as any).mockResolvedValue([
      { type: 'single', content: 'q1', answer: 'A' },
    ]);

    const res = await POST(makeAuthedReq({ text: '# hello', mode: 'ai' }) as any);
    const events = await readSseEvents(res);
    const last = events[events.length - 1];
    expect(last.progress).toBe(100);
    expect(last.questions).toHaveLength(1);
  });
});