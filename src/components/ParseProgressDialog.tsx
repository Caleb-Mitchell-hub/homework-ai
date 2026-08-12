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
  /** 后台预解析状态。传入后跳过独立 fetch，直接复用已有进度/结果。 */
  bgState?: {
    questions: unknown[] | null;
    error: string | null;
    progress: number;
    message: string;
    streamContent: string;
  } | null;
  /** 后台预解析 AbortController，取消时一并 abort */
  bgAbortRef?: React.MutableRefObject<AbortController | null>;
}

export default function ParseProgressDialog({
  open,
  mode,
  text,
  token,
  onComplete,
  onError,
  onCancel,
  bgState,
  bgAbortRef,
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

    // ─── 后台预解析已完成 → 直接返回结果，跳过独立 fetch ───
    const _bgState = bgState; // snapshot at open time
    if (_bgState?.questions) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete(_bgState.questions);
      }
      return;
    }
    if (_bgState?.error) {
      // bgState error is displayed via displayError in render, no setState needed
      return;
    }

    setState({ progress: 0, message: '准备中...' });
    setStreamContent('');
    if (_bgState) {
      setStreamContent(_bgState.streamContent);
    }

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
          const rawError = errData.error ?? `HTTP ${res.status}`;
          if (res.status === 401) {
            throw new Error('登录已过期,请刷新页面重新登录');
          }
          throw new Error(rawError);
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
  // 后台预解析活跃时，直接从 bgState 读取进度/文本（避免显示冻结的旧数据）
  const active = bgState && !bgState.questions && !bgState.error ? bgState : null;
  const displayProgress = active ? active.progress : state.progress;
  const displayMessage = active ? active.message : state.message;
  const displayContent = active ? active.streamContent : streamContent;
  const displayError = state.error || (bgState?.error ?? null);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="parse-progress-title"
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full p-6 ${isAi && displayContent ? 'max-w-xl' : 'max-w-md'}`}>
        <h3 id="parse-progress-title" className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          {isAi ? '🧠 AI 解析中' : '⚡ 本地解析中'}
          <span className="text-[11px] text-slate-400 font-normal">{displayProgress}%</span>
        </h3>
        <div
          className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2"
          role="progressbar"
          aria-valuenow={displayProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={isAi ? 'AI 解析进度' : '本地解析进度'}
        >
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
        <p className="text-[12px] text-slate-500 min-h-[1.25rem]">{displayMessage}</p>

        {/* AI 模式: 展示实时流式文本 */}
        {isAi && displayContent && (
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-slate-900 p-3">
            <pre className="text-[11px] text-green-400 whitespace-pre-wrap break-all font-mono leading-relaxed">
              {displayContent}
            </pre>
          </div>
        )}

        {!displayError && (
          <button
            onClick={() => {
              bgAbortRef?.current?.abort();
              onCancel();
            }}
            className="mt-3 text-[12px] text-slate-500 hover:text-slate-700"
          >
            取消
          </button>
        )}

        {displayError && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-[12px] text-rose-600 mb-2">{displayError}</p>
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