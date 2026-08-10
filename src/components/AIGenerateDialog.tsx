'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  topic: string;
  counts: Record<string, number>;
  token: string | null;
  onComplete: (questions: any[], usage?: any) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}

export default function AIGenerateDialog({
  open,
  topic,
  counts,
  token,
  onComplete,
  onError,
  onCancel,
}: Props) {
  const [stage, setStage] = useState('');
  const [message, setMessage] = useState('准备中…');
  const [streamContent, setStreamContent] = useState('');
  const [progress, setProgress] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    completedRef.current = false;
    setStage('');
    setMessage('准备中…');
    setStreamContent('');
    setProgress(0);

    const ctrl = new AbortController();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    (async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      try {
        const res = await fetch('/api/ai/generate-quiz', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify({ topic, counts }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({}));
          const msg = errData.error ?? `HTTP ${res.status}`;
          if (errData.required != null) {
            onError(
              `积分不足：需要 ${errData.required} 积分，当前 ${errData.balance} 积分。请前往充值`,
            );
          } else {
            onError(msg);
          }
          return;
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
              if (evt.type === 'delta') {
                setStreamContent((prev) => prev + (evt.text ?? ''));
              } else if (evt.type === 'progress') {
                setStage(evt.stage ?? '');
                setMessage(evt.message ?? '');
                setProgress(evt.progress ?? progress);
              } else if (evt.type === 'complete') {
                if (!completedRef.current) {
                  completedRef.current = true;
                  setProgress(100);
                  onComplete(evt.questions ?? [], evt.usage);
                }
                await reader.cancel().catch(() => {});
                return;
              } else if (evt.type === 'error') {
                if (!completedRef.current) {
                  completedRef.current = true;
                  onError(evt.message ?? '生成失败');
                }
                await reader.cancel().catch(() => {});
                return;
              }
            } catch {
              /* ignore malformed events */
            }
          }
        }

        if (!completedRef.current) {
          completedRef.current = true;
          onError('生成中断');
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!completedRef.current) {
          completedRef.current = true;
          onError(err instanceof Error ? err.message : '网络异常');
        }
      } finally {
        if (reader) reader.cancel().catch(() => {});
      }
    })();

    return () => {
      ctrl.abort();
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full p-6 ${streamContent ? 'max-w-xl' : 'max-w-md'}`}
      >
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          ✨ AI 正在生成题库
          <span className="text-[11px] text-slate-400 font-normal">
            {progress}%
          </span>
        </h3>
        <div
          className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2"
          role="progressbar"
          aria-valuenow={progress}
        >
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <p className="text-[12px] text-slate-500 min-h-[1.25rem]">
          {message}
        </p>

        {streamContent && (
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-slate-900 p-3">
            <pre className="text-[11px] text-green-400 whitespace-pre-wrap break-all font-mono leading-relaxed">
              {streamContent}
            </pre>
          </div>
        )}

        <button
          onClick={onCancel}
          className="mt-3 text-[12px] text-slate-500 hover:text-slate-700"
        >
          取消
        </button>
      </div>
    </div>
  );
}
