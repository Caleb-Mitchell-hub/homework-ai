import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: () => 'sk-fake',
}));

import { extractImage } from '@/lib/extract/image';

const fakeProvider = {
  baseURL: 'https://example.com/v1',
  apiKeyCipher: 'X',
  visionModel: 'vision-v1',
  supportsVision: true,
} as any;

describe('extractImage', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('throws if provider does not support vision', async () => {
    await expect(
      extractImage({ buffer: Buffer.from([1]), mime: 'image/png', provider: { ...fakeProvider, supportsVision: false } })
    ).rejects.toThrow(/不支持视觉/);
  });

  it('throws if visionModel is missing', async () => {
    await expect(
      extractImage({ buffer: Buffer.from([1]), mime: 'image/png', provider: { ...fakeProvider, visionModel: null } })
    ).rejects.toThrow(/不支持视觉/);
  });

  it('calls vision model with data url', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'OCR done' } }] }),
    });
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // png magic bytes
    const text = await extractImage({ buffer: buf, mime: 'image/png', provider: fakeProvider });
    expect(text).toBe('OCR done');

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.model).toBe('vision-v1');
    expect(body.messages[1].content[0]).toMatchObject({
      type: 'image_url',
      image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) },
    });
  });
});
