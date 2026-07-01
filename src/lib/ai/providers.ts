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

export async function callChat(opts: CallChatOpts): Promise<string> {
  const url = `${opts.baseURL.replace(/\/$/, '')}/chat/completions`;
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
      max_tokens: opts.maxTokens ?? 8000,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}
