import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset } from '@/lib/ai/providers-presets';

describe('provider presets', () => {
  it('contains all 5 keys', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(
      ['custom', 'deepseek', 'doubao', 'qwen', 'zhipu']
    );
  });

  it('deepseek has no vision model', () => {
    expect(PRESETS.deepseek.visionModel).toBeUndefined();
  });

  it('doubao/qwen/zhipu have vision models', () => {
    expect(PRESETS.doubao.visionModel).toBeTruthy();
    expect(PRESETS.qwen.visionModel).toBeTruthy();
    expect(PRESETS.zhipu.visionModel).toBeTruthy();
  });

  it('getPreset returns by key', () => {
    expect(getPreset('deepseek').baseURL).toContain('deepseek');
  });

  it('custom preset has empty fields', () => {
    expect(getPreset('custom').baseURL).toBe('');
    expect(getPreset('custom').model).toBe('');
  });
});