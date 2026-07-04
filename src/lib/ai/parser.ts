import { callChat, callChatStream } from './providers';
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

/**
 * 容错修复:AI 输出 JSON 可能在末尾被截断(达到 token 上限)。
 * 尝试找到最后一个 '}' 之前的位置截断,并补上 ']'
 * 返回修复后的字符串,失败返回 null
 */
function tryRepairTruncatedJson(s: string): string | null {
  const start = s.indexOf('[');
  if (start < 0) return null;
  for (let i = s.length - 1; i > start; i--) {
    if (s[i] === '}') {
      const candidate = s.slice(start, i + 1) + ']';
      try {
        const arr = JSON.parse(candidate);
        if (Array.isArray(arr) && arr.length > 0) return candidate;
      } catch {
        // 继续往前找
      }
    }
  }
  return null;
}

function genId(): string {
  return 'q_' + Math.random().toString(36).slice(2, 10);
}

/**
 * 流式 AI 解析:逐 chunk 返回 AI 输出片段 + 实时进度。
 * 调用方拿到完整 JSON 字符串后做 normalize。
 */
export interface ParseProgressEvent {
  /** 0-100 的进度估算 */
  progress: number;
  /** 当前阶段文案 */
  message: string;
  /** 当前累计收到的字符数 */
  receivedChars: number;
  /** 估算的 AI 响应总字符数 (基于 maxTokens 推算) */
  expectedChars?: number;
}

export async function* aiParseQuestionsStream(opts: {
  text: string;
  provider: ProviderLike;
  signal?: AbortSignal;
  /** 估算的输出 token 数,用于进度条(默认 8000) */
  estimatedOutputTokens?: number;
}): AsyncGenerator<{ type: 'progress'; data: ParseProgressEvent } | { type: 'complete'; questions: Question[] } | { type: 'error'; error: string }> {
  const apiKey = decryptApiKey(opts.provider.apiKeyCipher);
  const text = opts.text.slice(0, MAX_TEXT_CHARS);

  // 粗略估算 AI 总输出字符数(中文 1 字 ≈ 1.5 token,英文 1 字 ≈ 0.25 token)
  // 这里保守用 max_tokens 作为 expectedChars 上限
  const maxTokens = 16000;
  const expectedChars = Math.floor(opts.estimatedOutputTokens ?? maxTokens * 0.75);

  let acc = '';
  let lastYieldedProgress = 0;

  yield {
    type: 'progress',
    data: { progress: 5, message: '正在调用 AI 厂商...', receivedChars: 0, expectedChars },
  };

  let streamError: unknown = null;
  try {
    for await (const chunk of callChatStream({
      baseURL: opts.provider.baseURL,
      apiKey,
      model: opts.provider.model,
      messages: [
        { role: 'system', content: QUESTION_PARSE_PROMPT },
        { role: 'user', content: text },
      ],
      jsonMode: true,
      signal: opts.signal,
    })) {
      if (opts.signal?.aborted) return;
      acc += chunk.delta;
      // 进度 30% ~ 88% 映射到字符数
      const ratio = Math.min(1, acc.length / expectedChars);
      const progress = Math.floor(30 + ratio * 58); // 30 → 88
      // 节流:每 1% 才上报一次,避免高频
      if (progress - lastYieldedProgress >= 1 || progress === 88) {
        lastYieldedProgress = progress;
        yield {
          type: 'progress',
          data: {
            progress,
            message: `AI 输出中 (${acc.length}/${expectedChars} 字符)`,
            receivedChars: acc.length,
            expectedChars,
          },
        };
      }
    }
  } catch (err) {
    streamError = err;
  }

  if (streamError) {
    const msg = streamError instanceof Error ? streamError.message : String(streamError);
    yield { type: 'error', error: `AI 调用失败: ${msg.slice(0, 200)}` };
    return;
  }

  yield {
    type: 'progress',
    data: { progress: 90, message: '规范化题目...', receivedChars: acc.length, expectedChars },
  };

  const json = stripCodeFence(acc);
  let arr: unknown;
  try {
    arr = JSON.parse(json);
  } catch (parseErr) {
    const fixed = tryRepairTruncatedJson(json);
    if (fixed) {
      arr = JSON.parse(fixed);
    } else {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      yield { type: 'error', error: `JSON 解析失败: ${msg.slice(0, 200)}` };
      return;
    }
  }

  if (!Array.isArray(arr)) {
    yield { type: 'error', error: 'AI 返回不是数组' };
    return;
  }

  const questions = normalizeAIOutputToQuestions(arr, genId);
  yield {
    type: 'complete',
    questions,
  };
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