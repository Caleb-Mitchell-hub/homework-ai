import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callChat } from '@/lib/ai/providers';

describe('callChat', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends POST to baseURL/chat/completions with Bearer token', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
    });

    const out = await callChat({
      baseURL: 'https://api.deepseek.com/v1/',
      apiKey: 'sk-test',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(out).toBe('pong');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('strips trailing slash from baseURL', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    });
    await callChat({
      baseURL: 'https://example.com/',
      apiKey: 'k',
      model: 'm',
      messages: [],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/chat/completions',
      expect.anything()
    );
  });

  it('includes response_format=json_object when jsonMode', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    await callChat({
      baseURL: 'https://x.com',
      apiKey: 'k',
      model: 'm',
      messages: [],
      jsonMode: true,
    });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws on non-ok with status and excerpt', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":"unauthorized"}',
    });
    await expect(
      callChat({ baseURL: 'https://x.com', apiKey: 'k', model: 'm', messages: [] })
    ).rejects.toThrow(/401.*unauthorized/);
  });

  it('supports image_url content parts', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'OCR done' } }] }),
    });
    await callChat({
      baseURL: 'https://x.com',
      apiKey: 'k',
      model: 'vision',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,XXX' } },
          { type: 'text', text: '描述此图' },
        ],
      }],
    });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.messages[0].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,XXX' },
    });
  });
});
