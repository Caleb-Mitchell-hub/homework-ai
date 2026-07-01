import { describe, it, expect } from 'vitest';
import { generateDocxFixture } from './fixture-helper';
import { extractDocx } from '@/lib/extract/docx';

describe('extractDocx', () => {
  it('extracts text from DOCX', async () => {
    const buf = await generateDocxFixture([
      'Word Quiz',
      '1. Choose the correct option.',
      'A. option A',
      'B. option B',
    ]);
    const text = await extractDocx(buf);
    expect(text).toContain('Word Quiz');
    expect(text).toMatch(/option A/);
  });

  it('throws on invalid buffer', async () => {
    const buf = Buffer.from('not a docx');
    await expect(extractDocx(buf)).rejects.toThrow();
  });
});
