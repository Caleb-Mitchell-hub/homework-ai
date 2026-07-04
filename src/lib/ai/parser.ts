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
      // 容错:若 JSON.parse 失败,尝试用简单启发式修复(移除尾部不完整内容)
      let arr: unknown;
      try {
        arr = JSON.parse(json);
      } catch (parseErr) {
        // 启发式:找到最后一个完整的数组项边界 '},' 或 '}]'
        const fixed = tryRepairTruncatedJson(json);
        if (fixed) {
          arr = JSON.parse(fixed);
        } else {
          throw parseErr;
        }
      }
      if (!Array.isArray(arr)) throw new Error('AI 返回不是数组');
      return normalizeAIOutputToQuestions(arr, genId);
    } catch (err) {
      lastErr = err;
      // 非最后一次尝试则重试
    }
  }
  throw new Error(`AI 解析失败(已重试 ${RETRYABLE} 次): ${(lastErr as Error).message}`);
}

/**
 * 容错修复:AI 输出 JSON 可能在末尾被截断(达到 token 上限)。
 * 尝试找到最后一个 '}' 之前的位置截断,并补上 ']'
 * 返回修复后的字符串,失败返回 null
 */
function tryRepairTruncatedJson(s: string): string | null {
  // 找到数组起始 [
  const start = s.indexOf('[');
  if (start < 0) return null;
  // 从后往前找 }, 或 },  或 }]
  for (let i = s.length - 1; i > start; i--) {
    if (s[i] === '}') {
      // 检查这是不是一个完整的对象结束
      const candidate = s.slice(start, i + 1) + ']';
      try {
        const arr = JSON.parse(candidate);
        if (Array.isArray(arr) && arr.length > 0) {
          return candidate;
        }
      } catch {
        // 继续往前找
      }
    }
  }
  return null;
}