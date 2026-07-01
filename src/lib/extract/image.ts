import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';

interface ProviderLike {
  baseURL: string;
  apiKeyCipher: string;
  visionModel?: string | null;
  supportsVision?: boolean;
}

const SYSTEM_PROMPT = '你是 OCR + 题目解析专家,提取图中所有文字并尽量识别为结构化题目。';

export async function extractImage(opts: {
  buffer: Buffer;
  mime: string;
  provider: ProviderLike;
  signal?: AbortSignal;
}): Promise<string> {
  if (!opts.provider.supportsVision || !opts.provider.visionModel) {
    throw new Error('当前激活厂商不支持视觉识别,请在 AI 配置中启用视觉模型');
  }
  const apiKey = decryptApiKey(opts.provider.apiKeyCipher);
  const dataUrl = `data:${opts.mime};base64,${opts.buffer.toString('base64')}`;
  return await callChat({
    baseURL: opts.provider.baseURL,
    apiKey,
    model: opts.provider.visionModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: '请提取图中所有题目文字' },
        ],
      },
    ],
    signal: opts.signal,
  });
}
