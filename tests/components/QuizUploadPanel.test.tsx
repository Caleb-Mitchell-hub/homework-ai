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

import QuizUploadPanel from '@/components/admin/QuizUploadPanel';

function makeSseStream(events: any[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

describe('QuizUploadPanel - parse flow', () => {
  let onParsed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch.mockReset();
    onParsed = vi.fn().mockResolvedValue(undefined);
  });

  it('opens choice dialog after file is read into textarea', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ available: false }),
    });

    const { findByText } = render(<QuizUploadPanel onParsed={onParsed as any} />);

    const file = new File(['# hi\nA. one'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await findByText('选择解析方式');
  });

  it('calls onParsed with parsed questions after local parse completes', async () => {
    // mockFetch order: ai/available, parse-stream, (no /api/quizzes since onParsed handles it)
    mockFetch.mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('/api/ai/available')) {
        return { ok: true, json: async () => ({ available: false }) };
      }
      if (u.includes('/api/ai/parse-stream')) {
        return {
          ok: true,
          body: makeSseStream([
            { progress: 100, message: 'ok', questions: [{ type: 'single', content: 'q1', answer: 'A', score: 10 }] },
          ]),
        };
      }
      return { ok: false, status: 404 };
    });

    const { findByRole } = render(<QuizUploadPanel onParsed={onParsed as any} />);

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
});