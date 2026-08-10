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
    console.error(`AI 服务商返回错误 (${res.status}):`, errText.slice(0, 500));
    throw new Error(`AI 服务调用失败 (HTTP ${res.status})`);
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
 * 流式调用 OpenAI 兼容 API（内部实现）。
 * - 逐 chunk 返回 delta 字符串
 * - 调用方通过拼接 delta 拿到完整响应
 * - 支持 AbortSignal 中断
 */
async function* doStreamFetch(opts: CallChatOpts, useJsonMode: boolean): AsyncGenerator<StreamChunk> {
  const url = `${opts.baseURL.replace(/\/$/, '')}/chat/completions`;
  const signal = opts.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        response_format: useJsonMode ? { type: 'json_object' } : undefined,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 16000,
        stream: true,
      }),
      signal,
    });
  } catch (fetchErr) {
    const cause = (fetchErr as any)?.cause?.code ?? 'unknown';
    console.error(`[callChatStream] fetch 失败: url=${url} model=${opts.model} cause=${cause} message=${(fetchErr as Error).message}`);
    throw fetchErr;
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    console.error(`[callChatStream] AI 返回错误 (${res.status}): url=${url} model=${opts.model} jsonMode=${useJsonMode} body=${errText.slice(0, 500)}`);
    // 抛出一个带 status 的错误，方便上层判断是否可重试
    const err = new Error(`AI 服务调用失败 (HTTP ${res.status})`) as Error & { httpStatus: number };
    (err as any).httpStatus = res.status;
    throw err;
  }

  console.log('[callChatStream] 连接成功, 开始流式读取');

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

/**
 * 流式调用 OpenAI 兼容 API。
 * - 部分 OpenAI 兼容服务不支持 jsonMode + stream，会自动回退到无 response_format
 * - 5xx、429 限流、网络错误自动重试 1 次
 * - 其他接口行为与 doStreamFetch 一致
 */
export async function* callChatStream(opts: CallChatOpts): AsyncGenerator<StreamChunk> {
  let lastError: unknown;
  const maxAttempts = 2; // 首次 + 1 次重试

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const useJsonMode = opts.jsonMode === true;
      for await (const chunk of doStreamFetch(opts, useJsonMode)) {
        yield chunk;
      }
      return; // 成功，退出
    } catch (err) {
      lastError = err;
      const httpStatus = (err as any)?.httpStatus;

      // jsonMode + stream 不兼容 → 回退到无 response_format（不限重试次数，立即切换）
      const isJsonModeError = opts.jsonMode === true && httpStatus != null && httpStatus >= 400 && httpStatus < 500;
      if (isJsonModeError) {
        console.log('[callChatStream] jsonMode+stream 失败 (HTTP %d)，回退到无 response_format 重试', httpStatus);
        opts.jsonMode = false; // 切换到非 jsonMode，下次循环用新参数
        continue;
      }

      // 5xx、429 限流、网络错误（无 httpStatus）→ 重试 1 次
      const isRetryable =
        httpStatus == null || // 网络错误（连接重置、DNS 失败等）
        httpStatus === 429 || // 限流
        httpStatus >= 500;    // 服务端错误
      if (isRetryable && attempt < maxAttempts - 1) {
        const reason = httpStatus == null ? '网络错误' : `HTTP ${httpStatus}`;
        console.log('[callChatStream] %s，第 %d 次重试…', reason, attempt + 1);
        // 等待一小段时间再重试（429 多等一会）
        await new Promise((r) => setTimeout(r, httpStatus === 429 ? 3000 : 800));
        continue;
      }

      throw err;
    }
  }

  // 理论上不会到这里（循环内要么 return 要么 throw），但安全兜底
  throw lastError;
}