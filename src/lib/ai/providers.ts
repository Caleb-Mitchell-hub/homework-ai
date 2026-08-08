// 副作用:安装全局 fetch 代理 (从 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY 读取)
import './proxy';

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export interface CallChatOpts {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: AIChatMessage[];
  jsonMode?: boolean;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes (large question sets need time)

/**
 * 非流式调用。返回 AI 完整响应文本。
 * 大多数场景下推荐用 callChatStream 获得真实进度。
 */
export async function callChat(opts: CallChatOpts): Promise<string> {
  const url = `${opts.baseURL.replace(/\/$/, '')}/chat/completions`;
  // 优先用调用方传入的 signal，否则创建默认超时
  const signal = opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const body = {
    model: opts.model,
    messages: opts.messages,
    response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 16000,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

/**
 * 流式 chunk。每个 chunk 是 AI 增量输出的字符串片段。
 * 流结束时调用方拿到完整内容。
 */
export interface StreamChunk {
  /** 这一帧新增的内容片段 */
  delta: string;
  /** 是否结束 */
  done: boolean;
}

/**
 * 流式调用 OpenAI 兼容 API。
 * - 逐 chunk 返回 delta 字符串
 * - 调用方通过拼接 delta 拿到完整响应
 * - 支持 AbortSignal 中断
 * - 部分 OpenAI 兼容服务不支持 jsonMode stream，会自动回退到无 response_format
 */
export async function* callChatStream(opts: CallChatOpts): AsyncGenerator<StreamChunk> {
  const url = `${opts.baseURL.replace(/\/$/, '')}/chat/completions`;
  const signal = opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 16000,
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI ${res.status}: ${errText.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) {
        yield { delta: '', done: true };
        return;
      }
      buf += decoder.decode(value, { stream: true });
      // SSE 事件以 \n\n 分隔,但 OpenAI 用 \n 分隔 data 行
      const lines = buf.split('\n');
      buf = lines.pop() ?? ''; // 最后一行可能不完整,留到下次
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          yield { delta: '', done: true };
          return;
        }
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content;
          if (delta) yield { delta, done: false };
        } catch {
          // 忽略解析失败的 chunk
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch {}
  }
}