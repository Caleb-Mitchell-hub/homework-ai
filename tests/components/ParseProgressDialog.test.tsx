// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
global.fetch = mockFetch;

import ParseProgressDialog from '@/components/ParseProgressDialog';

function makeSseStream(events: any[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

describe('ParseProgressDialog', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ParseProgressDialog
        open={false}
        mode="local"
        text="x"
        token="t"
        onComplete={() => {}}
        onError={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('calls onComplete when stream emits 100% with questions', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([
        { progress: 5, message: '准备中...' },
        { progress: 30, message: '解析中...' },
        { progress: 100, message: '完成', questions: [{ type: 'single', content: 'q', answer: 'A', score: 10 }] },
      ]),
    });

    const onComplete = vi.fn();
    render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# hello"
        token="t"
        onComplete={onComplete}
        onError={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toHaveLength(1);
  });

  it('calls onError when stream returns error event', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([
        { progress: 0, message: 'AI 失败', error: 'AI 失败' },
      ]),
    });

    const onError = vi.fn();
    render(
      <ParseProgressDialog
        open={true}
        mode="ai"
        text="# hello"
        token="t"
        onComplete={() => {}}
        onError={onError}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith('AI 失败'));
  });

  it('calls onError when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('网络错误'));

    const onError = vi.fn();
    render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# hello"
        token="t"
        onComplete={() => {}}
        onError={onError}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith('网络错误'));
  });

  it('uses Authorization header with Bearer token', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([]),
    });

    render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# hello"
        token="mytoken"
        onComplete={() => {}}
        onError={() => {}}
        onCancel={() => {}}
      />
    );

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/ai/parse-stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer mytoken' }),
      })
    );
  });

  it('renders AI mode title when mode=ai', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([
        { progress: 100, message: '完成', questions: [] },
      ]),
    });

    const { getByText } = render(
      <ParseProgressDialog
        open={true}
        mode="ai"
        text="# hello"
        token="t"
        onComplete={() => {}}
        onError={() => {}}
        onCancel={() => {}}
      />
    );

    expect(getByText('🧠 AI 解析中')).toBeTruthy();
  });

  it('renders local mode title when mode=local', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([
        { progress: 100, message: '完成', questions: [] },
      ]),
    });

    const { getByText } = render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# hello"
        token="t"
        onComplete={() => {}}
        onError={() => {}}
        onCancel={() => {}}
      />
    );

    expect(getByText('⚡ 本地解析中')).toBeTruthy();
  });
});