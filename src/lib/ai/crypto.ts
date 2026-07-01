import crypto from 'crypto';
import { AI_KEY_SECRET } from '@/lib/env';

// 把 secret 规整成 32 字节 key (AES-256)
const KEY = Buffer.from(AI_KEY_SECRET.padEnd(32).slice(0, 32));

export function encryptApiKey(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptApiKey(cipherText: string): string {
  const buf = Buffer.from(cipherText, 'base64');
  if (buf.length < 12 + 16) throw new Error('cipher too short');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** 取字符串末 4 位用于 UI 展示(不暴露明文) */
export function last4(s: string): string {
  return s.length <= 4 ? s : s.slice(-4);
}
