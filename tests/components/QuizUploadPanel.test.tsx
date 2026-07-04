// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'mytoken',
    user: { id: 'u1', username: 'admin', isGuest: false },
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import QuizUploadPanel, { type ParsedQuestion } from '@/components/admin/QuizUploadPanel';

type OnParsed = (title: string, questions: ParsedQuestion[]) => Promise<void>;

function makeSseStream(events: any[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

function makeFetchMock(
  responses: Partial<Record<string, unknown>> = {}
) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
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

function makeAiAvailableResp(available: boolean) {
  return {
    ok: true,
    json: async () => ({ available }),
  };
}

describe('QuizUploadPanel - parse flow', () => {
  let onParsed: ReturnType<typeof vi.fn<(title: string, questions: ParsedQuestion[]) => Promise<void>>>;

  beforeEach(() => {
    mockFetch.mockReset();
    onParsed = vi.fn<(title: string, questions: ParsedQuestion[]) => Promise<void>>().mockResolvedValue(undefined);
    // 默认探测不可用,具体用例可覆盖
    (global as { fetch: unknown }).fetch = vi.fn(async () => makeAiAvailableResp(false));
  });

  it('opens choice dialog after file is read into textarea', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(false),
    });

    const { findByText } = render(<QuizUploadPanel onParsed={onParsed} />);

    const file = new File(['# hi\nA. one'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await findByText('选择解析方式');
  });

  it('calls onParsed with parsed questions after local parse completes', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(false),
      '/api/ai/parse-stream': {
        ok: true,
        body: makeSseStream([
          { progress: 100, message: 'ok', questions: [{ type: 'single', content: 'q1', answer: 'A', score: 10 }] },
        ]),
      },
    });

    const { findByRole } = render(<QuizUploadPanel onParsed={onParsed} />);

    const file = new File(['# Title\nA. one\n答案: A'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const localBtn = await findByRole('button', { name: /本地解析/ });
    fireEvent.click(localBtn);

    await waitFor(() => expect(onParsed).toHaveBeenCalled());
    const [title, questions] = onParsed.mock.calls[0];
    expect(typeof title).toBe('string');
    expect(questions).toHaveLength(1);
    expect(questions[0].content).toBe('q1');
  });

  it('AI parse mode happy path: invokes onParsed when AI available', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(true),
      '/api/ai/parse-stream': {
        ok: true,
        body: makeSseStream([
          { progress: 100, message: 'ok', questions: [{ type: 'judge', content: 'q?', answer: 'true', score: 5 }] },
        ]),
      },
    });

    const { findByRole } = render(<QuizUploadPanel onParsed={onParsed} />);

    const file = new File(['# ai\nA. one'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const aiBtn = await findByRole('button', { name: /AI 解析/ });
    expect(aiBtn).toHaveProperty('disabled', false);
    fireEvent.click(aiBtn);

    await waitFor(() => expect(onParsed).toHaveBeenCalled());
    const [, questions] = onParsed.mock.calls[0];
    expect(questions[0].type).toBe('judge');
  });

  it('sets error when SSE returns an empty questions array', async () => {
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(false),
      '/api/ai/parse-stream': {
        ok: true,
        body: makeSseStream([
          { progress: 100, message: 'ok', questions: [] },
        ]),
      },
    });

    const { findByRole, findByText } = render(<QuizUploadPanel onParsed={onParsed} />);

    const file = new File(['# empty\nA. one'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const localBtn = await findByRole('button', { name: /本地解析/ });
    fireEvent.click(localBtn);

    await findByText('未能解析到任何题目');
    expect(onParsed).not.toHaveBeenCalled();
  });

  it('propagates error from onParsed to setError', async () => {
    onParsed.mockRejectedValueOnce(new Error('保存出错啦'));
    (global as { fetch: unknown }).fetch = makeFetchMock({
      '/api/ai/available': makeAiAvailableResp(false),
      '/api/ai/parse-stream': {
        ok: true,
        body: makeSseStream([
          { progress: 100, message: 'ok', questions: [{ type: 'single', content: 'q1', answer: 'A', score: 10 }] },
        ]),
      },
    });

    const { findByRole, findByText } = render(<QuizUploadPanel onParsed={onParsed} />);

    const file = new File(['# t\nA. one'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const localBtn = await findByRole('button', { name: /本地解析/ });
    fireEvent.click(localBtn);

    await findByText('保存失败: 保存出错啦');
    expect(onParsed).toHaveBeenCalled();
  });
});