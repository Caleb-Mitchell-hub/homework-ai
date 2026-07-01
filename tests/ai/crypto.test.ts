import { describe, it, expect } from 'vitest';
import { encryptApiKey, decryptApiKey } from '@/lib/ai/crypto';

describe('AI crypto', () => {
  it('round-trips API key', () => {
    const plain = 'sk-test-1234567890abcdef';
    const cipher = encryptApiKey(plain);
    expect(cipher).not.toBe(plain);
    expect(decryptApiKey(cipher)).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const plain = 'sk-test-same-input';
    const c1 = encryptApiKey(plain);
    const c2 = encryptApiKey(plain);
    expect(c1).not.toBe(c2);
  });

  it('throws on tampered ciphertext', () => {
    const cipher = encryptApiKey('sk-test');
    // 翻转密文最后一位 base64 字符
    const tampered = cipher.slice(0, -1) + (cipher.endsWith('A') ? 'B' : 'A');
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it('handles unicode keys', () => {
    const plain = '密钥-中文-key';
    expect(decryptApiKey(encryptApiKey(plain))).toBe(plain);
  });
});
