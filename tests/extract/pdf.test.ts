import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { extractPdf } from '@/lib/extract/pdf';

describe('extractPdf', () => {
  it('extracts text from sample PDF', async () => {
    const buf = readFileSync(path.resolve(__dirname, '../fixtures/parse/sample.pdf'));
    const text = await extractPdf(buf);
    expect(text).toContain('Sample Quiz');
    expect(text).toMatch(/2\+2/);
    expect(text).toMatch(/100/);
  });

  it('throws on invalid buffer', async () => {
    const buf = Buffer.from('not a pdf');
    await expect(extractPdf(buf)).rejects.toThrow();
  });
});