import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiParseQuestions } from '@/lib/ai/parser';

// mock crypto 模块,避免依赖真实密钥
vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: (): string => 'sk-fake',
}));

const fakeProvider = {
  id: 'p1',
  baseURL: 'https://example.com/v1',
  apiKeyCipher: 'X',
  model: 'fake-model',
  supportsVision: false,
  isActive: true,
} as any;

describe('aiParseQuestions', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns normalized questions on valid JSON response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([
              { type: 'single', title: '哪项?', options: [{key:'A',text:'甲'}], correctAnswer: 'A', answer: '' },
            ]),
          },
        }],
      }),
    });
    const out = await aiParseQuestions({ text: '...', provider: fakeProvider });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('single');
  });

  it('strips ```json code fence', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '```json\n[{"type":"single","title":"x","correctAnswer":"A","answer":""}]\n```',
          },
        }],
      }),
    });
    const out = await aiParseQuestions({ text: '...', provider: fakeProvider });
    expect(out).toHaveLength(1);
  });

  it('truncates text to 60k chars', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '[]' } }] }),
    });
    const big = 'A'.repeat(100_000);
    await aiParseQuestions({ text: big, provider: fakeProvider });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    const userMsg = body.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content.length).toBe(60_000);
  });

  it('retries once on JSON parse failure, then gives up', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
    });
    await expect(
      aiParseQuestions({ text: '...', provider: fakeProvider })
    ).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once and succeeds on second try', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'broken' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '[{"type":"boolean","title":"x","correctAnswer":"true","answer":""}]' } }],
        }),
      });
    const out = await aiParseQuestions({ text: '...', provider: fakeProvider });
    expect(out).toHaveLength(1);
  });
});