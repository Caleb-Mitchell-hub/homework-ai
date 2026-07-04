// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'mytoken',
    user: { id: 'u1', username: 'u', isGuest: false },
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import UploadForm from '@/components/UploadForm';

function makeSseStream(events: any[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

/**
 * Resilient fetch mock keyed by URL. Each entry can either be:
 *  - a plain value (treated as the resolved Response), or
 *  - a function that produces a Response (lazy).
 * Returns a fetch fn and a setter so each test can describe its endpoint
 * behaviour without chaining mockResolvedValueOnce calls.
 */
function makeFetchMock(
  responses: Partial<Record<string, unknown>> = {}
) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    // Match longest-key prefix so /api/ai/parse-stream wins over /api/ai
    const key = Object.keys(responses).find((k) => url.includes(k));
    const v = key ? responses[key] : undefined;
    if (typeof v === 'function') return (v as (u: string) => unknown)(url);
    if (v === undefined) {
      throw new Error(`Unhandled fetch in test: ${url}`);
    }
    return v;
  });
  return fn;
}

function uploadFile(content: string, name = 'test.md', type = 'text/markdown') {
  const file = new File([content], name, { type });
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

function makeAiAvailableResp(available: boolean) {
  return {
    ok: true,
    json: async () => ({ available }),
  };
}

function makeQuizzesPostResp(body: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => body,
  };
}

describe('UploadForm - parse flow', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockPush.mockReset();
    // Default fallback: AI unavailable. Tests that need otherwise override.
    (global as { fetch: unknown }).fetch = vi.fn(async () => makeAiAvailableResp(false));
  });

  it('opens choice dialog after file is read into textarea', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(false),
    });

    const { findByText } = render(<UploadForm />);

    uploadFile('# hi\nA. one');

    await findByText('选择解析方式');
  });

  it('starts local parse and navigates to quiz when complete', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(false),
      '/api/ai/parse-stream': {
        ok: true,
        body: makeSseStream([
          { progress: 100, message: 'ok', questions: [{ type: 'single', content: 'q1', answer: 'A', score: 10 }] },
        ]),
      },
      '/api/quizzes': makeQuizzesPostResp({ quiz: { id: 'quiz1' } }),
    });

    const { findByRole } = render(<UploadForm />);
    uploadFile('# hi\nA. one\n答案: A');

    const localBtn = await findByRole('button', { name: /本地解析/ });
    fireEvent.click(localBtn);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/quiz/quiz1'));
  });

  it('AI parse mode happy path: AI available -> SSE -> POST -> navigate', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(true),
      '/api/ai/parse-stream': {
        ok: true,
        body: makeSseStream([
          { progress: 100, message: 'ok', questions: [{ type: 'code', content: 'q1', answer: 'A', score: 10 }] },
        ]),
      },
      '/api/quizzes': makeQuizzesPostResp({ quiz: { id: 'aiQuiz1' } }),
    });

    const { findByRole } = render(<UploadForm />);
    uploadFile('# ai题\nA. one');

    const aiBtn = await findByRole('button', { name: /AI 解析/ });
    expect(aiBtn).toHaveProperty('disabled', false);
    fireEvent.click(aiBtn);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/quiz/aiQuiz1'));
  });

  it('data.existed flow: shows reupload choice modal instead of navigating', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(false),
      '/api/ai/parse-stream': {
        ok: true,
        body: makeSseStream([
          { progress: 100, message: 'ok', questions: [{ type: 'single', content: 'q1', answer: 'A', score: 10 }] },
        ]),
      },
      '/api/quizzes': makeQuizzesPostResp({
        existed: true,
        quiz: { id: 'q1' },
        draftId: 'd1',
        hasSubmitted: false,
      }),
    });

    const { findByRole, findByText } = render(<UploadForm />);
    uploadFile('# hi\nA. one');

    const localBtn = await findByRole('button', { name: /本地解析/ });
    fireEvent.click(localBtn);

    await findByText('检测到已存在的题库');
    await findByText('继续上次进度');

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('rejects oversized file (>10MB) with size-limit error', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(false),
    });

    const { findByText } = render(<UploadForm />);

    // 11MB of content
    const big = new Uint8Array(11 * 1024 * 1024);
    const file = new File([big], 'big.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const errEl = await findByText(/文件超过 10MB 限制/);
    expect(errEl).toBeTruthy();
  });

  it('disables AI button when /api/ai/available reports false', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(false),
    });

    const { findByRole } = render(<UploadForm />);
    uploadFile('# hi');

    // 探测 resolve 之后,选择对话框才会出现
    const aiBtn = await findByRole('button', { name: /AI 解析/ });
    expect(aiBtn).toHaveProperty('disabled', true);

    // 点击被禁用按钮不会触发选择
    fireEvent.click(aiBtn);
  });
});