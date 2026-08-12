'use client';

import { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { extractTitle } from '@/lib/parser';
import { sha256Hex } from '@/lib/hash';
import ParseChoiceDialog from '@/components/ParseChoiceDialog';
import ParseProgressDialog from '@/components/ParseProgressDialog';
import type { Question } from '@/types';

const ALLOWED_ACCEPT = '.md,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['md', 'txt', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'];

/** 后台预解析状态 */
interface BgParseState {
  questions: Question[] | null;
  error: string | null;
  progress: number;
  message: string;
  streamContent: string;
}

function resolveFileAccept(file: File): 'text' | 'upload' {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'md' || ext === 'txt') return 'text';
  if (ALLOWED_EXT.includes(ext)) return 'upload';
  return 'text'; // fallback
}

export interface UploadFormHandle {
  triggerFilePicker: () => void;
}

interface UploadFormProps {
  onCreated?: (quizId: string) => void;
  compact?: boolean;
}

const UploadForm = forwardRef<UploadFormHandle, UploadFormProps>(function UploadForm(
  { onCreated, compact = false }: UploadFormProps = {},
  ref
) {
  const [preview, setPreview] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [parseMode, setParseMode] = useState<'local' | 'ai'>('local');
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiAvailableResolved, setAiAvailableResolved] = useState(false);
  const [pendingChoiceOpen, setPendingChoiceOpen] = useState(false);
  const [timeLimit, setTimeLimit] = useState<number>(0);
  const router = useRouter();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reuploadChoice, setReuploadChoice] = useState<{
    quizId: string;
    draftId: string | null;
    hasSubmitted: boolean;
  } | null>(null);
  const progressKey = (quizId: string) => `quiz_progress_${quizId}`;

  // ─── 后台 AI 预解析：文本就绪后立即启动，不等用户点击 ───
  const [bgParse, setBgParse] = useState<BgParseState | null>(null);
  const bgAbortRef = useRef<AbortController | null>(null);
  // 记录已启动后台解析的文本内容，用于检测用户是否编辑了文本
  const bgParseTextRef = useRef<string>('');

  /** 后台启动 AI 流式解析。完成后结果存入 bgParse，用户点击时可瞬间拿到结果。 */
  const startBgParse = useCallback(async (text: string) => {
    if (!token || !aiAvailable) return;
    // Abort previous background parse
    bgAbortRef.current?.abort();
    const ctrl = new AbortController();
    bgAbortRef.current = ctrl;
    bgParseTextRef.current = text;

    setBgParse({ questions: null, error: null, progress: 5, message: 'AI 正在读取文档…', streamContent: '' });

    try {
      const res = await fetch('/api/ai/parse-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, mode: 'ai' }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        const rawError = errData.error ?? `HTTP ${res.status}`;
        // 401 → session 失效（dev server 重启导致），提示刷新页面
        if (res.status === 401) {
          throw new Error('登录已过期,请刷新页面重新登录');
        }
        throw new Error(rawError);
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
            const evt = JSON.parse(data);
            if (evt.type === 'delta') {
              setBgParse(prev => prev ? { ...prev, streamContent: prev.streamContent + (evt.content ?? '') } : null);
            } else if (evt.error) {
              setBgParse(prev => prev ? { ...prev, error: evt.error, progress: 0 } : null);
              return;
            } else if (evt.progress === 100 && evt.questions) {
              setBgParse(prev => prev ? { ...prev, questions: evt.questions as Question[], progress: 100, message: '解析完成' } : null);
              return;
            } else if (typeof evt.progress === 'number') {
              setBgParse(prev => prev ? { ...prev, progress: evt.progress, message: evt.message ?? prev.message } : null);
            }
          } catch { /* ignore malformed SSE events */ }
        }
      }
      // Stream ended without completion event
      setBgParse(prev => prev && !prev.questions && !prev.error ? { ...prev, error: '解析中断', progress: 0 } : prev);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI 预解析失败';
      if (msg.includes('AbortError') || (err as Error)?.name === 'AbortError') return;
      setBgParse(prev => prev ? { ...prev, error: msg, progress: 0 } : null);
    }
  }, [token, aiAvailable]);

  useImperativeHandle(ref, () => ({
    triggerFilePicker: () => {
      fileInputRef.current?.click();
    },
  }));

  useEffect(() => {
    fetch('/api/ai/available')
      .then((r) => r.json())
      .then((d) => { setAiAvailable(!!d.available); setAiAvailableResolved(true); })
      .catch(() => { setAiAvailable(false); setAiAvailableResolved(true); });
  }, []);

  useEffect(() => {
    if (pendingChoiceOpen && aiAvailableResolved) {
      setShowChoice(true);
      setPendingChoiceOpen(false);
    }
  }, [pendingChoiceOpen, aiAvailableResolved]);

  const handleFile = useCallback(async (file: File) => {
    setError('');
    if (file.size > MAX_BYTES) {
      setError(`文件超过 10MB 限制`);
      return;
    }
    const mode = resolveFileAccept(file);
    if (mode === 'text') {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result) {
          setPreview(result);
          if (aiAvailable) startBgParse(result);
          setPendingChoiceOpen(true);
        } else {
          setError('文件读取失败，请尝试重新选择文件');
        }
      };
      reader.onerror = () => {
        setError('文件读取失败，请尝试重新选择文件');
      };
      reader.readAsText(file);
    } else {
      setIsLoading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '上传失败');
        setPreview(data.text ?? '');
        if (aiAvailable) startBgParse(data.text ?? '');
        setPendingChoiceOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }
  }, [token, aiAvailable, startBgParse]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  }, [handleFile]);

  const handleParseChoice = (mode: 'local' | 'ai') => {
    setParseMode(mode);
    setShowChoice(false);
    setShowProgress(true);
  };

  const handleParseComplete = async (questions: unknown[]) => {
    setShowProgress(false);
    const qs = questions as Array<{ type: string; content: string; answer: string; score?: number; options?: string[]; analysis?: string }>;
    if (!token) {
      setError('请先登录');
      return;
    }
    setIsLoading(true);
    try {
      const title = extractTitle(preview);
      const fileKey = await sha256Hex(preview);
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, questions: qs, fileKey, timeLimit }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '创建题库失败');
        return;
      }
      if (data.existed) {
        setReuploadChoice({
          quizId: data.quiz.id,
          draftId: data.draftId ?? null,
          hasSubmitted: !!data.hasSubmitted,
        });
        return;
      }
      if (onCreated) onCreated(data.quiz.id);
      else router.push(`/quiz/${data.quiz.id}`);
    } catch (err) {
      setError('网络错误: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleParseError = (err: string) => {
    setShowProgress(false);
    setError('解析失败: ' + err);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const ext = file.name.toLowerCase().split('.').pop() ?? '';
      if (ALLOWED_EXT.includes(ext)) {
        handleFile(file);
      } else {
        setError(`不支持的文件类型: .${ext || '未知'}`);
      }
    }
  }, [handleFile]);

  const handleClear = () => {
    setPreview('');
    setError('');
  };

  const handleReuploadContinue = () => {
    if (!reuploadChoice) return;
    const id = reuploadChoice.quizId;
    setReuploadChoice(null);
    if (onCreated) onCreated(id);
    else router.push(`/quiz/${id}`);
  };

  const handleReuploadRestart = async () => {
    if (!reuploadChoice || !token) return;
    const { quizId, draftId } = reuploadChoice;
    if (draftId) {
      try {
        await fetch(`/api/results?id=${draftId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.error('删除 draft 失败:', e);
      }
    }
    try { localStorage.removeItem(progressKey(quizId)); } catch {}
    setReuploadChoice(null);
    if (onCreated) onCreated(quizId);
    else router.push(`/quiz/${quizId}`);
  };

  const handleReuploadViewSubmitted = () => {
    if (!reuploadChoice) return;
    const id = reuploadChoice.quizId;
    setReuploadChoice(null);
    router.push(`/?focus=${id}`);
  };

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-800 mb-4">在线答题系统</h1>
          <p className="text-slate-500 text-lg">上传 Markdown 题目文件，自动解析并批改</p>
        </div>

        <div
          className="relative border-2 border-dashed border-slate-300 rounded-2xl p-8 mb-6 transition-all hover:border-sky-400 bg-white/40 backdrop-blur-sm"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-sky-100 to-emerald-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-slate-600 mb-4">拖拽文件到此处，或点击下方按钮选择</p>
            <label className="inline-block cursor-pointer">
              <span className="px-6 py-3 bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 transition-all shadow-md shadow-sky-200 inline-block">
                选择文件
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_ACCEPT}
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* 答题时长(可选) */}
        <div className="bg-white/80 border border-slate-200 rounded-xl p-4 mb-6">
          <label className="block text-[13px] font-medium text-slate-700 mb-2">
            答题时长(可选)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="480"
              value={timeLimit}
              onChange={(e) => setTimeLimit(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0"
              className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
            <span className="text-[13px] text-slate-500">分钟</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">0 = 不限时，1~480 分钟可选</div>
          <div className="flex gap-2 mt-2">
            {[10, 20, 30, 60].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTimeLimit(m)}
                className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
                  timeLimit === m
                    ? 'bg-sky-100 border-sky-300 text-sky-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-sky-300'
                }`}
              >
                {m} 分钟
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <textarea
            value={preview}
            onChange={(e) => {
              setPreview(e.target.value);
              // 用户编辑文本后，后台解析结果作废
              if (e.target.value !== bgParseTextRef.current) {
                bgAbortRef.current?.abort();
                setBgParse(null);
                bgParseTextRef.current = '';
              }
            }}
            placeholder="在此粘贴 Markdown 格式的题目..."
            className="w-full h-64 p-4 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 resize-none font-mono text-sm shadow-sm"
          />
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* 后台 AI 预解析进度提示（文本就绪后自动启动，不等用户点击） */}
        {bgParse && !bgParse.error && !bgParse.questions && (
          <div className="mb-4 p-3 bg-violet-50/80 border border-violet-200 rounded-xl flex items-center gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-violet-300 border-t-violet-500 animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] text-violet-700 font-medium">🧠 {bgParse.message}</span>
                <span className="text-[11px] text-violet-400">{bgParse.progress}%</span>
              </div>
              <div className="h-1.5 bg-violet-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-400 to-pink-400 rounded-full transition-all duration-500"
                  style={{ width: `${bgParse.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 后台预解析完成提示 */}
        {bgParse?.questions && (
          <div className="mb-4 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-center gap-3">
            <span className="text-lg">✅</span>
            <div>
              <span className="text-[12px] text-emerald-700 font-medium">AI 已自动解析完成</span>
              <span className="text-[11px] text-emerald-500 ml-2">共 {bgParse.questions.length} 题，点击下方按钮保存</span>
            </div>
          </div>
        )}

        {/* 后台预解析失败提示 */}
        {bgParse?.error && (
          <div className="mb-4 p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <span className="text-[12px] text-amber-700 font-medium">AI 预解析失败</span>
              <span className="text-[11px] text-amber-500 ml-2">{bgParse.error.slice(0, 80)}</span>
            </div>
            <button
              onClick={() => { bgAbortRef.current?.abort(); setBgParse(null); startBgParse(preview); }}
              className="text-[11px] text-amber-700 underline hover:text-amber-900 flex-shrink-0"
            >
              重试
            </button>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleClear}
            disabled={!preview || isLoading}
            className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            清空
          </button>
          <button
            onClick={() => {
              if (!preview.trim()) return;
              setError('');
              // 🚀 后台预解析已完成 → 跳过所有弹窗，直接保存
              if (bgParse?.questions) {
                handleParseComplete(bgParse.questions);
                return;
              }
              // 后台预解析进行中 → 直接显示进度弹窗（跳过选择弹窗）
              if (bgParse && !bgParse.error && bgParse.progress > 0 && bgParse.progress < 100) {
                setParseMode('ai');
                setShowProgress(true);
                return;
              }
              // AI 不可用时跳过选择弹窗,直接本地解析
              if (aiAvailableResolved && !aiAvailable) {
                setParseMode('local');
                setShowProgress(true);
              } else {
                setPendingChoiceOpen(true);
              }
            }}
            disabled={!preview.trim() || isLoading}
            className="flex-1 py-4 bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-sky-200 flex items-center justify-center gap-2"
          >
            {bgParse?.questions ? '✓ 解析完成,立即保存' : '开始解析'}
          </button>
        </div>

        <div className="mt-12 grid grid-cols-3 gap-6 text-center">
          <div className="p-4 bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm">
            <div className="text-2xl font-bold bg-gradient-to-r from-sky-500 to-emerald-500 bg-clip-text text-transparent mb-1">6</div>
            <div className="text-slate-500 text-sm">题型支持</div>
          </div>
          <div className="p-4 bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm">
            <div className="text-2xl font-bold bg-gradient-to-r from-sky-500 to-emerald-500 bg-clip-text text-transparent mb-1">自动</div>
            <div className="text-slate-500 text-sm">即时批改</div>
          </div>
          <div className="p-4 bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm">
            <div className="text-2xl font-bold bg-gradient-to-r from-sky-500 to-emerald-500 bg-clip-text text-transparent mb-1">云端</div>
            <div className="text-slate-500 text-sm">数据存储</div>
          </div>
        </div>
      </div>

      {showChoice && (
        <ParseChoiceDialog
          open={showChoice}
          onClose={() => setShowChoice(false)}
          onSelect={handleParseChoice}
          aiAvailable={aiAvailable}
        />
      )}

      {showProgress && (
        <ParseProgressDialog
          open={showProgress}
          mode={parseMode}
          text={preview}
          token={token}
          onComplete={handleParseComplete}
          onError={handleParseError}
          onCancel={() => setShowProgress(false)}
          bgState={bgParse}
          bgAbortRef={bgAbortRef}
        />
      )}

      {reuploadChoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }}
          onClick={() => setReuploadChoice(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[18px] font-semibold text-slate-800 mb-2">检测到已存在的题库</h4>
            <p className="text-[13px] text-slate-500 mb-5">
              {reuploadChoice.draftId
                ? '这份文件之前有未提交的进度。'
                : '这份文件已经有完成记录。'}
            </p>
            <div className="space-y-2.5">
              {reuploadChoice.draftId && (
                <button
                  onClick={handleReuploadContinue}
                  className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all"
                >
                  继续上次进度
                </button>
              )}
              {reuploadChoice.draftId && (
                <button
                  onClick={handleReuploadRestart}
                  className="w-full py-2.5 text-[13.5px] text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  重新开始(清空旧进度)
                </button>
              )}
              {reuploadChoice.hasSubmitted && !reuploadChoice.draftId && (
                <button
                  onClick={handleReuploadViewSubmitted}
                  className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all"
                >
                  查看已有完成记录
                </button>
              )}
              {!reuploadChoice.draftId && !reuploadChoice.hasSubmitted && (
                <button
                  onClick={handleReuploadContinue}
                  className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all"
                >
                  进入答题
                </button>
              )}
              <button
                onClick={() => setReuploadChoice(null)}
                className="w-full py-2.5 text-[13px] text-slate-500 hover:text-slate-700 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default UploadForm;
