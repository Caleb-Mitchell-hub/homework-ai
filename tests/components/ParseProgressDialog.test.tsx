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

  it('parses events split across chunk boundaries', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          // First chunk: partial first event + empty line, no terminator yet
          controller.enqueue(new TextEncoder().encode('data: {"progress":50,"message":"half1"}\n'));
          // Second chunk: terminator + second complete event
          controller.enqueue(
            new TextEncoder().encode(
              '\ndata: {"progress":100,"message":"done","questions":[{"type":"single","content":"q","answer":"A","score":10}]}\n\n'
            )
          );
          controller.close();
        },
      }),
    });
    const onComplete = vi.fn();
    render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# x"
        token="t"
        onComplete={onComplete}
        onError={() => {}}
        onCancel={() => {}}
      />
    );
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0]).toHaveLength(1);
  });

  it('calls onError when stream closes without completion', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"progress":50,"message":"halfway"}\n\n')
          );
          controller.close();
        },
      }),
    });
    const onError = vi.fn();
    const onComplete = vi.fn();
    render(
      <ParseProgressDialog
        open={true}
        mode="ai"
        text="# x"
        token="t"
        onComplete={onComplete}
        onError={onError}
        onCancel={() => {}}
      />
    );
    await waitFor(() => expect(onError).toHaveBeenCalledWith('解析中断'));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('calls onError when 100% arrives without questions payload', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([{ progress: 100, message: '完成' }]),
    });
    const onError = vi.fn();
    const onComplete = vi.fn();
    render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# x"
        token="t"
        onComplete={onComplete}
        onError={onError}
        onCancel={() => {}}
      />
    );
    await waitFor(() => expect(onError).toHaveBeenCalledWith('解析响应格式异常'));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('triggers onCancel from the in-progress cancel button', async () => {
    // Stream that never closes on its own — we'll cancel manually
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"progress":10,"message":"starting"}\n\n')
          );
          // intentionally do not close
        },
      }),
    });
    const onCancel = vi.fn();
    const { getByText } = render(
      <ParseProgressDialog
        open={true}
        mode="ai"
        text="# x"
        token="t"
        onComplete={() => {}}
        onError={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.click(getByText('取消'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('exposes ARIA progressbar semantics', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([
        { progress: 25, message: '进行中' },
        { progress: 100, message: '完成', questions: [] },
      ]),
    });
    const { container } = render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# x"
        token="t"
        onComplete={() => {}}
        onError={() => {}}
        onCancel={() => {}}
      />
    );
    await waitFor(() => {
      const bar = container.querySelector('[role="progressbar"]');
      expect(bar).toBeTruthy();
    });
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).not.toBeNull();
  });

  it('does not call callbacks after unmount during in-flight parse', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"progress":20,"message":"mid"}\n\n')
          );
          // do not close
        },
      }),
    });
    const onComplete = vi.fn();
    const onError = vi.fn();
    const { unmount } = render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# x"
        token="t"
        onComplete={onComplete}
        onError={onError}
        onCancel={() => {}}
      />
    );
    // Give the effect a tick to attach the reader
    await new Promise((r) => setTimeout(r, 0));
    unmount();
    // Give any pending microtasks a chance to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});