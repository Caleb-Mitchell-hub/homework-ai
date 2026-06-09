/**
 * 计算文本的 SHA-256 十六进制摘要。
 * - 浏览器优先使用 SubtleCrypto(更快)
 * - 服务端/老浏览器降级到 Node crypto
 *
 * 用于"按文件内容生成 fileKey",实现 Quiz 去重。
 */
export async function sha256Hex(text: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const buf = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest('SHA-256', buf);
    return bytesToHex(new Uint8Array(digest));
  }
  // 服务端/降级:动态 import,避免浏览器打包时拉 Node crypto
  const nodeCrypto = await import('crypto');
  return nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}
