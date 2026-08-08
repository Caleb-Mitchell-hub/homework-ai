import { callChatStream } from './providers';
import { QUESTION_PARSE_PROMPT } from './prompt';
import { normalizeAIOutputToQuestions, autoConvertEssayToInterview } from './normalize';
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
/** 流式模式下估算 1 token ≈ 3.5 chars (中英混合偏低) */
const CHARS_PER_TOKEN_ESTIMATE = 3.5;
/** 流式进度上报间隔:每收到 N 字符上报一次 */
const PROGRESS_REPORT_INTERVAL_CHARS = 400;

function stripCodeFence(s: string): string {
  const t = s.trim();
  if (t.startsWith('```') && t.endsWith('```')) {
    const start = t.indexOf('\n');
    const content = start >= 0 ? t.slice(start + 1) : t.slice(3);
    return content.slice(0, content.lastIndexOf('```')).trim();
  }
  return t;
}

/**
 * 容错: AI 有时在合法 JSON 后面附加解释文字 (如 "以上是解析结果...")。
 * 使用括号/大括号深度匹配, 提取第一个完整 JSON 结构。
 */
function tryExtractJsonPrefix(s: string): string | null {
  const trimmed = s.trim();
  const startChar = trimmed[0];
  if (startChar !== '[' && startChar !== '{') return null;

  const closeChar = startChar === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === startChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        try { JSON.parse(trimmed.slice(0, i + 1)); } catch { return null; }
        return trimmed.slice(0, i + 1);
      }
    }
  }

  return null; // 括号不平衡
}

/**
 * 容错修复:AI 输出 JSON 可能在末尾被截断(达到 token 上限)。
 * 尝试找到最后一个 '}' 之前的位置截断,并补上 ']}'
 */
function tryRepairTruncatedJson(s: string): string | null {
  const objStart = s.indexOf('{"questions"');
  if (objStart >= 0) {
    for (let i = s.length - 1; i > objStart; i--) {
      if (s[i] === '}') {
        const candidate = s.slice(objStart, i + 1) + '}';
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions) && parsed.questions.length > 0) return candidate;
        } catch { /* continue */ }
      }
    }
  }
  const start = s.indexOf('[');
  if (start < 0) return null;
  for (let i = s.length - 1; i > start; i--) {
    if (s[i] === '}') {
      const candidate = s.slice(start, i + 1) + ']';
      try {
        const arr = JSON.parse(candidate);
        if (Array.isArray(arr) && arr.length > 0) return candidate;
      } catch { /* continue */ }
    }
  }
  return null;
}

function genId(): string {
  return 'q_' + Math.random().toString(36).slice(2, 10);
}

export interface ParseProgressEvent {
  progress: number;
  message: string;
  receivedChars: number;
  expectedChars?: number;
}

/**
 * 解析 JSON 并提取 questions 数组。失败返回 null。
 */
type Loose = Record<string, any>;

function extractQuestions(rawContent: string): Loose[] | null {
  let json = stripCodeFence(rawContent);
  let parsed: unknown;

  // 1) 直接解析
  try {
    parsed = JSON.parse(json);
  } catch {
    // 2) 尝试提取第一个完整 JSON (处理尾部附加文字)
    const prefix = tryExtractJsonPrefix(json);
    if (prefix) {
      try { parsed = JSON.parse(prefix); } catch { /* fall through */ }
    }
    // 3) 尝试修复截断 JSON (处理 token 上限截断)
    if (!parsed) {
      const fixed = tryRepairTruncatedJson(json);
      if (fixed) {
        try { parsed = JSON.parse(fixed); } catch { return null; }
      }
    }
    if (!parsed) return null;
  }
  const arr: unknown = (parsed && typeof parsed === 'object' && 'questions' in (parsed as Record<string, unknown>))
    ? (parsed as Record<string, unknown>).questions
    : parsed;
  return Array.isArray(arr) ? arr : null;
}

/**
 * 流式 AI 解析:强制使用 SSE streaming 获取实时字符进度。
 * 不提供非流式回退 —— 流式失败直接报错。
 */
export async function* aiParseQuestionsStream(opts: {
  text: string;
  provider: ProviderLike;
  signal?: AbortSignal;
  estimatedOutputTokens?: number;
}): AsyncGenerator<
  | { type: 'progress'; data: ParseProgressEvent }
  | { type: 'delta'; content: string }
  | { type: 'complete'; questions: Question[] }
  | { type: 'error'; error: string }
> {
  const apiKey = decryptApiKey(opts.provider.apiKeyCipher);
  const text = opts.text.slice(0, MAX_TEXT_CHARS);
  const maxTokens = opts.estimatedOutputTokens ?? 8000;

  yield { type: 'progress', data: { progress: 5, message: '正在准备...', receivedChars: 0 } };
  if (opts.signal?.aborted) return;

  // ── 强制流式调用 (实时字符进度) ──
  let rawContent = '';
  const expectedChars = Math.round(maxTokens * CHARS_PER_TOKEN_ESTIMATE);
  let lastReportedChars = 0;

  yield { type: 'progress', data: { progress: 8, message: 'AI 正在解析题目...', receivedChars: 0, expectedChars } };

  try {
    for await (const chunk of callChatStream({
      baseURL: opts.provider.baseURL,
      apiKey,
      model: opts.provider.model,
      messages: [
        { role: 'system' as const, content: QUESTION_PARSE_PROMPT },
        { role: 'user' as const, content: text },
      ],
      // 不传 jsonMode: true —— jsonMode 会让 AI Provider 内部缓冲完整 JSON
      // 再发送，导致所有 chunk 几乎同时到达，流式输出形同虚设。
      // extractQuestions() 已有 code fence 剥离 + 截断修复，能容错非纯 JSON 输出。
      jsonMode: false,
      maxTokens,
      signal: opts.signal,
    })) {
      if (opts.signal?.aborted) return;
      if (chunk.done) break;
      rawContent += chunk.delta;
      // 每个 delta 都发到前端，实现真正的逐字流式输出 (同追问)
      const content = chunk.delta;
      yield { type: 'delta', content };
      const charCount = rawContent.length;
      if (charCount - lastReportedChars >= PROGRESS_REPORT_INTERVAL_CHARS) {
        lastReportedChars = charCount;
        const pct = Math.min(85, 10 + Math.round((charCount / expectedChars) * 75));
        yield {
          type: 'progress',
          data: { progress: pct, message: `AI 正在解析... (${charCount} 字符)`, receivedChars: charCount, expectedChars },
        };
      }
    }
  } catch (err) {
    if (opts.signal?.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'error', error: `AI 流式调用失败: ${msg.slice(0, 200)}` };
    return;
  }

  if (opts.signal?.aborted) return;

  yield {
    type: 'progress',
    data: { progress: 88, message: `AI 已响应 (${rawContent.length} 字符)，正在解析...`, receivedChars: rawContent.length },
  };

  // ── 解析 JSON → 规范化 ──
  const arr = extractQuestions(rawContent);
  if (!arr) {
    const head500 = rawContent.slice(0, 500).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
    const tail200 = rawContent.slice(-200).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
    const isJsonLike = rawContent.trim().startsWith('{') || rawContent.trim().startsWith('[');
    yield { type: 'error', error: `JSON解析失败(${rawContent.length}chars,isJson=${isJsonLike}) | HEAD:${head500} | TAIL:${tail200}` };
    return;
  }

  yield {
    type: 'progress',
    data: { progress: 93, message: '规范化题目...', receivedChars: rawContent.length },
  };

  const questions = autoConvertEssayToInterview(normalizeAIOutputToQuestions(arr, genId));
  yield { type: 'complete', questions };
}

export async function aiParseQuestions(opts: {
  text: string;
  provider: ProviderLike;
  signal?: AbortSignal;
}): Promise<Question[]> {
  // 强制使用流式调用，收集结果后返回（兼容旧调用方）
  const results: Question[] = [];
  for await (const evt of aiParseQuestionsStream({
    text: opts.text,
    provider: opts.provider,
    signal: opts.signal,
  })) {
    if (evt.type === 'complete') {
      results.push(...evt.questions);
    } else if (evt.type === 'error') {
      throw new Error(evt.error);
    }
  }
  if (results.length === 0) {
    throw new Error('AI 解析失败: 流式调用未返回题目');
  }
  return results;
}
