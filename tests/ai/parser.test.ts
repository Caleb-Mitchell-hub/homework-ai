import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock crypto 模块,避免依赖真实密钥
vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: (): string => 'sk-fake',
}));

// mock callChatStream 以控制流式输出
const mockStreamYield = vi.fn();
vi.mock('@/lib/ai/providers', () => ({
  callChatStream: vi.fn(),
  callChat: vi.fn(),
}));

import { aiParseQuestions } from '@/lib/ai/parser';
import { callChatStream } from '@/lib/ai/providers';

const fakeProvider = {
  id: 'p1',
  baseURL: 'https://example.com/v1',
  apiKeyCipher: 'X',
  model: 'fake-model',
  supportsVision: false,
  isActive: true,
} as any;

/** 构造一个模拟的 AsyncGenerator, 产生指定的 deltas */
async function* makeStream(deltas: string[]): AsyncGenerator<{ delta: string; done: boolean }> {
  for (const d of deltas) {
    yield { delta: d, done: false };
  }
  yield { delta: '', done: true };
}

describe('aiParseQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns normalized questions on valid JSON response', async () => {
    vi.mocked(callChatStream).mockReturnValue(
      makeStream([JSON.stringify([
        { type: 'single', title: '哪项?', options: [{ key: 'A', text: '甲' }], correctAnswer: 'A', answer: '' },
      ])]),
    );
    const out = await aiParseQuestions({ text: '...', provider: fakeProvider });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('single');
  });

  it('strips ```json code fence', async () => {
    vi.mocked(callChatStream).mockReturnValue(
      makeStream(['```json\n[{"type":"single","title":"x","correctAnswer":"A","answer":""}]\n```']),
    );
    const out = await aiParseQuestions({ text: '...', provider: fakeProvider });
    expect(out).toHaveLength(1);
  });

  it('handles JSON with trailing text (AI adds explanation after valid JSON)', async () => {
    vi.mocked(callChatStream).mockReturnValue(
      makeStream(['[{"type":"single","title":"x","correctAnswer":"A","answer":""}]\n以上是根据题目内容解析出的结果。']),
    );
    const out = await aiParseQuestions({ text: '...', provider: fakeProvider });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('single');
  });

  it('truncates text to 60k chars', async () => {
    let capturedText = '';
    vi.mocked(callChatStream).mockImplementation((async function* (opts: any) {
      capturedText = opts.messages.find((m: any) => m.role === 'user')?.content ?? '';
      yield { delta: '[{"type":"fill","title":"x","correctAnswer":"y","answer":"y"}]', done: false };
      yield { delta: '', done: true };
    }) as any);
    const big = 'A'.repeat(100_000);
    const out = await aiParseQuestions({ text: big, provider: fakeProvider });
    expect(capturedText.length).toBe(60_000);
    expect(out).toHaveLength(1);
  });

  it('throws on invalid JSON after stream completes', async () => {
    vi.mocked(callChatStream).mockReturnValue(
      makeStream(['not json at all']),
    );
    await expect(
      aiParseQuestions({ text: '...', provider: fakeProvider })
    ).rejects.toThrow();
  });
});