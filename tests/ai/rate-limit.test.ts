import { describe, it, expect } from 'vitest';
import { aiRateLimiter } from '@/lib/ai/rate-limit';

describe('aiRateLimiter', () => {
  it('allows first N requests', () => {
    const key = 'user-' + Math.random();
    for (let i = 0; i < 10; i++) {
      expect(aiRateLimiter.check(key, 10, 60_000)).toBe(true);
    }
  });

  it('blocks after exceeding limit', () => {
    const key = 'user-' + Math.random();
    for (let i = 0; i < 10; i++) aiRateLimiter.check(key, 10, 60_000);
    expect(aiRateLimiter.check(key, 10, 60_000)).toBe(false);
  });

  it('isolates different keys', () => {
    const k1 = 'u1-' + Math.random();
    const k2 = 'u2-' + Math.random();
    for (let i = 0; i < 10; i++) aiRateLimiter.check(k1, 10, 60_000);
    expect(aiRateLimiter.check(k2, 10, 60_000)).toBe(true);
  });

  it('resets after window expires', () => {
    const key = 'u3-' + Math.random();
    aiRateLimiter.check(key, 2, 1); // 1ms window
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(aiRateLimiter.check(key, 2, 1)).toBe(true);
        resolve();
      }, 10);
    });
  });
});