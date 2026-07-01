import { callChat } from './providers';
import { QUESTION_PARSE_PROMPT } from './prompt';
import { normalizeAIOutputToQuestions } from './normalize';
import { decryptApiKey } from './crypto';
import type { Question } from '@/types';

interface ProviderLike {
  id: string;
  baseURL: string;
  apiKeyCipher: string;
  model: string;
  supportsVision?: boolean;
  visionModel?: string | null;
  isActive?: boolean;
}

const MAX_TEXT_CHARS = 60_000;
const RETRYABLE = 1;

function stripCodeFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  return s.trim();
}

function genId(): string {
  return 'q_' + Math.random().toString(36).slice(2, 10);
}

export async function aiParseQuestions(opts: {
  text: string;
  provider: ProviderLike;
  signal?: AbortSignal;
}): Promise<Question[]> {
  const apiKey = decryptApiKey(opts.provider.apiKeyCipher);
  const text = opts.text.slice(0, MAX_TEXT_CHARS);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRYABLE; attempt++) {
    try {
      const content = await callChat({
        baseURL: opts.provider.baseURL,
        apiKey,
        model: opts.provider.model,
        messages: [
          { role: 'system', content: QUESTION_PARSE_PROMPT },
          { role: 'user', content: text },
        ],
        jsonMode: true,
        signal: opts.signal,
      });
      const json = stripCodeFence(content);
      const arr = JSON.parse(json);
      if (!Array.isArray(arr)) throw new Error('AI 返回不是数组');
      return normalizeAIOutputToQuestions(arr, genId);
    } catch (err) {
      lastErr = err;
      // 非最后一次尝试则重试
    }
  }
  throw new Error(`AI 解析失败(已重试 ${RETRYABLE} 次): ${(lastErr as Error).message}`);
}