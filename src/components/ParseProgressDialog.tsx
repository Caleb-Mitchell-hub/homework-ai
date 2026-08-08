'use client';

import { useEffect, useRef, useState } from 'react';

interface ParseProgress {
  progress: number;
  message: string;
  questions?: unknown[];
  error?: string;
}

interface Props {
  open: boolean;
  mode: 'local' | 'ai';
  text: string;
  token: string | null;
  onComplete: (questions: unknown[]) => void;
  onError: (err: string) => void;
  onCancel: () => void;
}

export default function ParseProgressDialog({
  open,
  mode,
  text,
  token,
  onComplete,
  onError,
  onCancel,
}: Props) {
  const [state, setState] = useState<ParseProgress>({ progress: 0, message: '准备中...' });
  const [streamContent, setStreamContent] = useState('');
  const completedRef = useRef(false);

  // Effect deps intentionally only include `open`. The effect should only run
  // when the dialog opens/closes; the latest closure values for `text`,
  // `mode`, `token`, `onComplete`, `onError`, and `onCancel` are read at the
  // time the dialog opens. Re-running on every callback identity change would
  // abort and restart the in-flight SSE stream.
  useEffect(() => {
    if (!open) return;
    completedRef.current = false;
    setState({ progress: 0, message: '准备中...' });
    setStreamContent('');

    const ctrl = new AbortController();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    (async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      try {
        const res = await fetch('/api/ai/parse-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify({ text, mode }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }

        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.trim();
            if (!line) continue;
            const data = line.replace(/^data: /, '').trim();
            try {
              const evt = JSON.parse(data);
              // delta 事件: 逐字流式文本
              if (evt.type === 'delta') {
                setStreamContent((prev) => prev + (evt.content ?? ''));
                continue;
              }
              // progress / complete / error 事件
              const progressEvt = evt as ParseProgress;
              setState(progressEvt);
              if (progressEvt.error) {
                if (!completedRef.current) {
                  completedRef.current = true;
                  onError(progressEvt.error);
                }
                await reader.cancel().catch(() => {});
                return;
              }
              if (progressEvt.progress === 100) {
                if (!progressEvt.questions) {
                  if (!completedRef.current) {
                    completedRef.current = true;
                    onError('解析响应格式异常');
                  }
                  await reader.cancel().catch(() => {});
                  return;
                }
                if (!completedRef.current) {
                  completedRef.current = true;
                  onComplete(progressEvt.questions);
                }
                await reader.cancel().catch(() => {});
                return;
              }
            } catch {
              // ignore malformed events
            }
          }
        }

        // Stream ended without completion or error event — treat as hang.
        if (!completedRef.current) {
          completedRef.current = true;
          onError('解析中断');
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!completedRef.current) {
          completedRef.current = true;
          onError(err instanceof Error ? err.message : '解析失败');
        }
      } finally {
        if (reader) {
          reader.cancel().catch(() => {});
        }
      }
    })();

    return () => {
      ctrl.abort();
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const isAi = mode === 'ai';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="parse-progress-title"
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full p-6 ${isAi && streamContent ? 'max-w-xl' : 'max-w-md'}`}>
        <h3 id="parse-progress-title" className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          {isAi ? '🧠 AI 解析中' : '⚡ 本地解析中'}
          <span className="text-[11px] text-slate-400 font-normal">{state.progress}%</span>
        </h3>
        <div
          className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2"
          role="progressbar"
          aria-valuenow={state.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={isAi ? 'AI 解析进度' : '本地解析进度'}
        >
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${state.progress}%` }}
          />
        </div>
        <p className="text-[12px] text-slate-500 min-h-[1.25rem]">{state.message}</p>

        {/* AI 模式: 展示实时流式文本 */}
        {isAi && streamContent && (
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-slate-900 p-3">
            <pre className="text-[11px] text-green-400 whitespace-pre-wrap break-all font-mono leading-relaxed">
              {streamContent}
            </pre>
          </div>
        )}

        {!state.error && (
          <button
            onClick={onCancel}
            className="mt-3 text-[12px] text-slate-500 hover:text-slate-700"
          >
            取消
          </button>
        )}

        {state.error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-[12px] text-rose-600 mb-2">{state.error}</p>
            <button
              onClick={onCancel}
              className="text-[12px] text-rose-700 underline hover:text-rose-900"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
}