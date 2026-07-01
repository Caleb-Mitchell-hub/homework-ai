import { describe, it, expect } from 'vitest';
import { QUESTION_PARSE_PROMPT } from '@/lib/ai/prompt';

describe('parse prompt', () => {
  it('mentions all 6 question types', () => {
    expect(QUESTION_PARSE_PROMPT).toContain('"single"');
    expect(QUESTION_PARSE_PROMPT).toContain('"multiple"');
    expect(QUESTION_PARSE_PROMPT).toContain('"boolean"');
    expect(QUESTION_PARSE_PROMPT).toContain('"fill"');
    expect(QUESTION_PARSE_PROMPT).toContain('"essay"');
    expect(QUESTION_PARSE_PROMPT).toContain('"code"');
  });

  it('instructs JSON output (no markdown)', () => {
    expect(QUESTION_PARSE_PROMPT).toMatch(/JSON/i);
    expect(QUESTION_PARSE_PROMPT).toMatch(/不要.*markdown/);
  });

  it('instructs preserving code block indentation', () => {
    expect(QUESTION_PARSE_PROMPT).toMatch(/缩进/);
  });

  it('handles empty input', () => {
    expect(QUESTION_PARSE_PROMPT).toContain('[]');
  });
});
