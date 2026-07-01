import { extractPdf } from './pdf';
import { extractDocx } from './docx';
import { extractImage } from './image';

interface ProviderLike {
  baseURL: string;
  apiKeyCipher: string;
  visionModel?: string | null;
  supportsVision?: boolean;
}

export async function extractText(opts: {
  buffer: Buffer;
  mime?: string;
  filename?: string;
  provider?: ProviderLike;
  signal?: AbortSignal;
}): Promise<string> {
  const name = opts.filename ?? '';
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const mime = (opts.mime ?? '').toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') return extractPdf(opts.buffer);
  if (ext === 'docx' || mime.includes('wordprocessingml')) return extractDocx(opts.buffer);
  if (ext === 'doc') throw new Error('.doc 格式不支持,请另存为 .docx');
  if (/^image\//.test(mime) || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    if (!opts.provider) throw new Error('图片识别需要 AI 厂商(请先在管理后台配置)');
    return extractImage({
      buffer: opts.buffer,
      mime: mime || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      provider: opts.provider,
      signal: opts.signal,
    });
  }
  // 兜底 utf8
  return opts.buffer.toString('utf8');
}
