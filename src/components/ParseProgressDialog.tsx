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
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    completedRef.current = false;
    setState({ progress: 0, message: '准备中...' });

    const ctrl = new AbortController();

    (async () => {
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

        const reader = res.body.getReader();
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
              const evt: ParseProgress = JSON.parse(data);
              setState(evt);
              if (evt.error) {
                if (!completedRef.current) {
                  completedRef.current = true;
                  onError(evt.error);
                }
                return;
              }
              if (evt.progress === 100 && evt.questions && !completedRef.current) {
                completedRef.current = true;
                onComplete(evt.questions);
                return;
              }
            } catch {
              // ignore malformed events
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (!completedRef.current) {
          completedRef.current = true;
          onError(err?.message ?? '解析失败');
        }
      }
    })();

    return () => {
      ctrl.abort();
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h3 id="parse-progress-title" className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          {isAi ? '🧠 AI 解析中' : '⚡ 本地解析中'}
          <span className="text-[11px] text-slate-400 font-normal">{state.progress}%</span>
        </h3>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${state.progress}%` }}
          />
        </div>
        <p className="text-[12px] text-slate-500 min-h-[1.25rem]">{state.message}</p>

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