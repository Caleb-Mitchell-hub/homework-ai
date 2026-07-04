'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { extractTitle } from '@/lib/parser';
import ParseChoiceDialog from '@/components/ParseChoiceDialog';
import ParseProgressDialog from '@/components/ParseProgressDialog';

const ALLOWED_ACCEPT = '.md,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['md', 'txt', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'];

/**
 * SSE/本地解析器的输出 shape。
 * 注意：与 @/types 的 Question（Discriminated Union）不同 —— 解析器用 `content`/`answer`/`'judge'`
 * 而非 `title`/`correctAnswer`/`'boolean'`。父组件按本结构直接 POST 到后端。
 */
export interface ParsedQuestion {
  type: 'single' | 'multiple' | 'judge' | 'fill' | 'essay' | 'code';
  content: string;
  options?: string[];
  answer: string;
  analysis?: string;
  score?: number;
}

function resolveFileAccept(file: File): 'text' | 'upload' {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'md' || ext === 'txt') return 'text';
  if (ALLOWED_EXT.includes(ext)) return 'upload';
  return 'text';
}

type Tone = 'admin' | 'user';

interface Props {
  tone?: Tone;
  /** 解析成功后回调，父组件负责 POST + 跳转 */
  onParsed: (title: string, questions: ParsedQuestion[]) => Promise<void>;
  busy?: boolean;
}

/**
 * 共享的"上传/粘贴/解析"面板。
 * - 从原 src/components/UploadForm.tsx 抽出
 * - 不绑定具体路由 / 存储后端，由父组件的 onParsed 决定
 * - tone='admin' 用 indigo/pink 配色，'user' 用 sky/emerald
 */
export default function QuizUploadPanel({ tone = 'user', onParsed, busy }: Props) {
  const [preview, setPreview] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showChoice, setShowChoice] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [parseMode, setParseMode] = useState<'local' | 'ai'>('local');
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiAvailableResolved, setAiAvailableResolved] = useState(false);
  const [pendingChoiceOpen, setPendingChoiceOpen] = useState(false);
  const { token } = useAuth();

  // AI 可用性探测
  useEffect(() => {
    fetch('/api/ai/available')
      .then((r) => r.json())
      .then((d) => { setAiAvailable(!!d.available); setAiAvailableResolved(true); })
      .catch(() => { setAiAvailable(false); setAiAvailableResolved(true); });
  }, []);

  // 探测完成后,若期间收到"打开选择对话框"的请求,立即打开
  useEffect(() => {
    if (pendingChoiceOpen && aiAvailableResolved) {
      setShowChoice(true);
      setPendingChoiceOpen(false);
    }
  }, [pendingChoiceOpen, aiAvailableResolved]);

  const isAdmin = tone === 'admin';
  const gradient = isAdmin
    ? 'from-indigo-400 to-pink-400 hover:from-indigo-500 hover:to-pink-500 shadow-indigo-200'
    : 'from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 shadow-sky-200';
  const focusBorder = isAdmin
    ? 'focus:border-indigo-400 focus:ring-indigo-100'
    : 'focus:border-sky-400 focus:ring-sky-100';
  const orbA = isAdmin ? 'bg-indigo-200/40' : 'bg-sky-200/40';
  const orbB = isAdmin ? 'bg-pink-200/40' : 'bg-emerald-200/40';
  const iconBg = isAdmin ? 'from-indigo-100 to-pink-100' : 'from-sky-100 to-emerald-100';
  const iconColor = isAdmin ? 'text-indigo-500' : 'text-sky-500';
  const borderHover = isAdmin ? 'hover:border-indigo-400' : 'hover:border-sky-400';
  const textHover = isAdmin ? 'hover:text-indigo-600' : 'hover:text-sky-600';
  const tipBox = isAdmin ? 'bg-indigo-50/60 border-indigo-100' : 'bg-sky-50/60 border-sky-100';

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
          setPendingChoiceOpen(true);
        } else {
          setError('文件读取失败，请尝试重新选择文件');
        }
      };
      reader.onerror = () => setError('文件读取失败，请尝试重新选择文件');
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
        setPendingChoiceOpen(true);
      } catch (err: any) {
        setError(String(err?.message ?? err));
      } finally {
        setIsLoading(false);
      }
    }
  }, [token]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  }, [handleFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
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
    },
    [handleFile]
  );

  const handleParseChoice = (mode: 'local' | 'ai') => {
    setParseMode(mode);
    setShowChoice(false);
    setShowProgress(true);
  };

  const handleParseComplete = async (questions: unknown[]) => {
    setShowProgress(false);
    const qs = questions as ParsedQuestion[];
    if (qs.length === 0) {
      setError('未能解析到任何题目');
      return;
    }
    const title = extractTitle(preview);
    try {
      await onParsed(title, qs);
    } catch (err) {
      setError('保存失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleParseError = (err: string) => {
    setShowProgress(false);
    setError('解析失败: ' + err);
  };

  const handleClear = () => {
    setPreview('');
    setError('');
  };

  return (
    <div className="w-full">
      {/* 装饰柔光 */}
      <div className="relative mb-6">
        <div className={`absolute -top-8 -left-8 w-48 h-48 ${orbA} rounded-full blur-3xl pointer-events-none`} />
        <div className={`absolute -top-4 -right-8 w-48 h-48 ${orbB} rounded-full blur-3xl pointer-events-none`} />
      </div>

      {/* 拖拽区 */}
      <div
        className={`relative border-2 border-dashed border-slate-300 rounded-2xl p-8 mb-6 transition-all ${borderHover} bg-white/40 backdrop-blur-sm`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <div className={`w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br ${iconBg} flex items-center justify-center`}>
            <svg className={`w-8 h-8 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-slate-600 mb-4">拖拽文件到此处，或点击下方按钮选择</p>
          <label className="inline-block cursor-pointer">
            <span className={`px-6 py-3 bg-gradient-to-r ${gradient} text-white rounded-xl transition-all shadow-md inline-block`}>
              选择文件
            </span>
            <input
              type="file"
              accept={ALLOWED_ACCEPT}
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          <p className="mt-3 text-slate-400 text-xs">支持 .md / .txt / .pdf / .docx / 图片</p>
        </div>
      </div>

      {/* 文本预览/编辑区 */}
      <div className="mb-6">
        <p className="text-slate-500 text-sm mb-2">或直接粘贴 Markdown 内容：</p>
        <textarea
          value={preview}
          onChange={(e) => { setPreview(e.target.value); if (error) setError(''); }}
          placeholder={`# 题库标题\n## 一、单选题\n1. ...\nA. ...\nB. ...\n答案：A\n## 二、...\n## 七、答案\n1. A 2. ...`}
          className={`w-full h-64 p-4 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none ${focusBorder} focus:ring-4 resize-none font-mono text-sm shadow-sm`}
        />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-4">
        <button
          onClick={handleClear}
          disabled={!preview || isLoading || busy}
          className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          清空
        </button>
        <button
          onClick={() => { if (!preview.trim()) return; setError(''); setPendingChoiceOpen(true); }}
          disabled={!preview.trim() || isLoading || busy}
          className={`flex-1 py-4 bg-gradient-to-r ${gradient} text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center gap-2`}
        >
          {isLoading || busy ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              解析中...
            </>
          ) : (
            '开始解析'
          )}
        </button>
      </div>

      {/* 选择解析方式对话框 */}
      {showChoice && (
        <ParseChoiceDialog
          open={showChoice}
          onClose={() => setShowChoice(false)}
          onSelect={handleParseChoice}
          aiAvailable={aiAvailable}
        />
      )}

      {/* 解析进度对话框 */}
      {showProgress && (
        <ParseProgressDialog
          open={showProgress}
          mode={parseMode}
          text={preview}
          token={token}
          onComplete={handleParseComplete}
          onError={handleParseError}
          onCancel={() => setShowProgress(false)}
        />
      )}

      {/* 提示信息 */}
      <div className={`mt-6 p-4 ${tipBox} rounded-xl text-xs text-slate-600 leading-relaxed`}>
        <p className="font-medium text-slate-700 mb-1.5">📖 文件格式说明</p>
        <p>使用 <code className="px-1.5 py-0.5 bg-white rounded text-slate-700">##</code> 标记题型（例：一、选择题），用 <code className="px-1.5 py-0.5 bg-white rounded text-slate-700">A. 选项内容</code> 列选项，代码块用 <code className="px-1.5 py-0.5 bg-white rounded text-slate-700">```</code> 包裹，最后用「## 七、答案」段落给出答案。</p>
      </div>
    </div>
  );
}
