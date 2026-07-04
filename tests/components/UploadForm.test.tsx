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

describe('UploadForm - parse flow', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockPush.mockReset();
  });

  it('opens choice dialog after file is read into textarea', async () => {
    // 1st fetch: /api/ai/available
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ available: false }),
    });

    const { findByText } = render(<UploadForm />);

    const file = new File(['# hi\nA. one'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await findByText('选择解析方式');
  });

  it('starts local parse and navigates to quiz when complete', async () => {
    // 1st fetch: /api/ai/available
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ available: false }),
    });
    // 2nd fetch: SSE parse-stream
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: makeSseStream([
        { progress: 100, message: 'ok', questions: [{ type: 'single', content: 'q1', answer: 'A', score: 10 }] },
      ]),
    });
    // 3rd fetch: POST /api/quizzes
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ quiz: { id: 'quiz1' } }),
    });

    const { findByText, findByRole } = render(<UploadForm />);
    const file = new File(['# hi\nA. one\n答案: A'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const localBtn = await findByRole('button', { name: /本地解析/ });
    fireEvent.click(localBtn);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/quiz/quiz1'));
  });
});