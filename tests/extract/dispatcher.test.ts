import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/extract/pdf', () => ({ extractPdf: vi.fn(async () => 'PDF_TEXT') }));
vi.mock('@/lib/extract/docx', () => ({ extractDocx: vi.fn(async () => 'DOCX_TEXT') }));
vi.mock('@/lib/extract/image', () => ({
  extractImage: vi.fn(async () => 'IMAGE_TEXT'),
}));

import { extractText } from '@/lib/extract/index';
import { extractPdf } from '@/lib/extract/pdf';
import { extractDocx } from '@/lib/extract/docx';
import { extractImage } from '@/lib/extract/image';

const fakeProvider = { baseURL: 'x', apiKeyCipher: 'x', visionModel: 'v', supportsVision: true } as any;

describe('extractText dispatcher', () => {
  it('routes .pdf by extension', async () => {
    const out = await extractText({ buffer: Buffer.from([1]), filename: 'a.pdf' });
    expect(out).toBe('PDF_TEXT');
    expect(extractPdf).toHaveBeenCalled();
  });

  it('routes .docx by extension', async () => {
    const out = await extractText({ buffer: Buffer.from([1]), filename: 'a.docx' });
    expect(out).toBe('DOCX_TEXT');
    expect(extractDocx).toHaveBeenCalled();
  });

  it('routes image by mime and forwards provider', async () => {
    const out = await extractText({ buffer: Buffer.from([1]), mime: 'image/png', provider: fakeProvider });
    expect(out).toBe('IMAGE_TEXT');
    expect(extractImage).toHaveBeenCalledWith(expect.objectContaining({ provider: fakeProvider }));
  });

  it('throws when image given but no provider', async () => {
    await expect(
      extractText({ buffer: Buffer.from([1]), mime: 'image/png' })
    ).rejects.toThrow(/图片识别需要 AI 厂商/);
  });

  it('falls back to utf8 for unknown mime', async () => {
    const out = await extractText({ buffer: Buffer.from('hello', 'utf8'), mime: 'text/plain' });
    expect(out).toBe('hello');
  });
});
