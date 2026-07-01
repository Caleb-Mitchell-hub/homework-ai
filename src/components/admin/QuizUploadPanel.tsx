'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { parseMarkdown, extractTitle } from '@/lib/parser';
import { Question } from '@/types';
import DualPreview, { type DualAiState } from '@/components/DualPreview';

const ALLOWED_ACCEPT = '.md,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['md', 'txt', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'];

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
  onParsed: (title: string, questions: Question[]) => Promise<void>;
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
  const { token } = useAuth();
  const [aiState, setAiState] = useState<DualAiState>({ status: 'idle' });
  const [aiStart, setAiStart] = useState(0);

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
        if (result) setPreview(result);
        else setError('文件读取失败，请尝试重新选择文件');
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

  const fetchAi = async () => {
    if (!preview.trim()) return;
    setAiStart(Date.now());
    setAiState({ status: 'loading', elapsed: 0 });
    try {
      const res = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: preview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '解析失败');
      setAiState({ status: 'done', questions: data.questions ?? [] });
    } catch (err: any) {
      setAiState({ status: 'error', message: String(err?.message ?? err) });
    }
  };

  useEffect(() => {
    if (aiState.status !== 'loading') return;
    const t = setInterval(() => {
      setAiState((s) => s.status === 'loading'
        ? { ...s, elapsed: Math.floor((Date.now() - aiStart) / 1000) }
        : s);
    }, 1000);
    return () => clearInterval(t);
  }, [aiState.status, aiStart]);

  const handleParse = async () => {
    if (!preview.trim()) {
      setError('请先选择文件或粘贴内容');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const questions = parseMarkdown(preview);
      if (questions.length === 0) {
        setError('未能解析到任何题目，请检查文件格式是否正确');
        setIsLoading(false);
        return;
      }
      const title = extractTitle(preview);
      await onParsed(title, questions);
    } catch (err) {
      setError('解析失败：' + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
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
          onChange={(e) => setPreview(e.target.value)}
          placeholder={`# 题库标题\n## 一、单选题\n1. ...\nA. ...\nB. ...\n答案：A\n## 二、...\n## 七、答案\n1. A 2. ...`}
          className={`w-full h-64 p-4 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none ${focusBorder} focus:ring-4 resize-none font-mono text-sm shadow-sm`}
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={fetchAi}
            disabled={aiState.status === 'loading' || !preview.trim()}
            className="px-3 py-1.5 bg-violet-500 text-white text-[12px] rounded-lg hover:bg-violet-600 disabled:opacity-50"
          >
            {aiState.status === 'loading' ? 'AI 解析中...' : '🧠 AI 解析'}
          </button>
          {aiState.status === 'done' && (
            <span className="text-[11px] text-emerald-600">✓ AI: {aiState.questions.length} 道题</span>
          )}
          {aiState.status === 'error' && (
            <span className="text-[11px] text-rose-600">⚠ {aiState.message}</span>
          )}
          {aiState.status === 'loading' && (
            <span className="text-[11px] text-slate-400">⏳ {aiState.elapsed}s</span>
          )}
        </div>
        {aiState.status === 'error' && aiState.message.includes('未配置 AI 厂商') && (
          <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[12px]">
            ⚠ 未配置 AI 厂商,当前仅可使用本地解析。请管理员在「AI 配置」中设置激活厂商后再使用 AI 解析。
          </div>
        )}
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
          onClick={handleParse}
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

      {/* 提示信息 */}
      <div className={`mt-6 p-4 bg-${isAdmin ? 'indigo' : 'sky'}-50/60 border border-${isAdmin ? 'indigo' : 'sky'}-100 rounded-xl text-xs text-slate-600 leading-relaxed`}>
        <p className="font-medium text-slate-700 mb-1.5">📖 文件格式说明</p>
        <p>使用 <code className="px-1.5 py-0.5 bg-white rounded text-slate-700">##</code> 标记题型（例：一、选择题），用 <code className="px-1.5 py-0.5 bg-white rounded text-slate-700">A. 选项内容</code> 列选项，代码块用 <code className="px-1.5 py-0.5 bg-white rounded text-slate-700">```</code> 包裹，最后用「## 七、答案」段落给出答案。</p>
      </div>
    </div>
  );
}
