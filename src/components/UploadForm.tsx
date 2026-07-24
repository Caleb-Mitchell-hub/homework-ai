'use client';

import { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { extractTitle } from '@/lib/parser';
import { sha256Hex } from '@/lib/hash';
import ParseChoiceDialog from '@/components/ParseChoiceDialog';
import ParseProgressDialog from '@/components/ParseProgressDialog';

const ALLOWED_ACCEPT = '.md,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['md', 'txt', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'];

function resolveFileAccept(file: File): 'text' | 'upload' {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'md' || ext === 'txt') return 'text';
  if (ALLOWED_EXT.includes(ext)) return 'upload';
  return 'text'; // fallback
}

interface Question {
  type: 'single' | 'multiple' | 'judge' | 'fill' | 'essay' | 'code';
  content: string;
  options?: string[];
  answer: string;
  analysis?: string;
  score: number;
}

export interface UploadFormHandle {
  /**
   * 触发系统文件选择器(等价于点击"选择文件"按钮)
   * 用于侧边栏抽屉:点"上传新题库"后,展开面板的同时自动弹出原生文件框
   */
  triggerFilePicker: () => void;
}

interface UploadFormProps {
  /**
   * 题库创建成功后的回调。
   * - 传入时:创建成功后只调 onCreated(quizId),不自动 router.push
   * - 不传时(默认):创建成功后 router.push(`/quiz/${id}`)
   *
   * 用于侧边栏抽屉场景:创建成功后需要先关抽屉,再让调用方决定如何跳转
   */
  onCreated?: (quizId: string) => void;
  /** 紧凑模式:用于侧边栏抽屉,缩小内边距、缩小字号、隐藏大标题区 */
  compact?: boolean;
  /** 强制直接进入手动新增模式(用于 /upload/manual 路由) */
  forceManual?: boolean;
}

const UploadForm = forwardRef<UploadFormHandle, UploadFormProps>(function UploadForm(
  { onCreated, compact = false, forceManual = false }: UploadFormProps = {},
  ref
) {
  const [preview, setPreview] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showManualEditor, setShowManualEditor] = useState(forceManual);
  const [manualQuestions, setManualQuestions] = useState<Question[]>([createEmptyQuestion('single')]);
  const [manualTitle, setManualTitle] = useState('');
  const [showChoice, setShowChoice] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [parseMode, setParseMode] = useState<'local' | 'ai'>('local');
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiAvailableResolved, setAiAvailableResolved] = useState(false);
  const [pendingChoiceOpen, setPendingChoiceOpen] = useState(false);
  // 答题时长(分钟),0 = 不限时
  const [timeLimit, setTimeLimit] = useState<number>(0);
  const router = useRouter();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 选择层状态
  const [reuploadChoice, setReuploadChoice] = useState<{
    quizId: string;
    draftId: string | null;
    hasSubmitted: boolean;
  } | null>(null);
  // 重置 progress 用
  const progressKey = (quizId: string) => `quiz_progress_${quizId}`;

  // 暴露给父级的方法:触发系统文件选择器
  useImperativeHandle(ref, () => ({
    triggerFilePicker: () => {
      fileInputRef.current?.click();
    },
  }));

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

  function createEmptyQuestion(type: Question['type']): Question {
    return {
      type,
      content: '',
      options: type === 'single' || type === 'multiple' ? ['', '', '', ''] : undefined,
      answer: type === 'judge' ? 'true' : '',
      analysis: '',
      score: 10,
    };
  }

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
        setPendingChoiceOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }
  }, [token]);

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

  // 重传选择层处理
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

  // 手动编辑器
  const addManualQuestion = (type: Question['type']) => {
    setManualQuestions((prev) => [...prev, createEmptyQuestion(type)]);
  };

  const updateManualQuestion = (index: number, updates: Partial<Question>) => {
    setManualQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...updates } : q)));
  };

  const removeManualQuestion = (index: number) => {
    setManualQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleManualTypeChange = (index: number, type: Question['type']) => {
    setManualQuestions((prev) => {
      const old = prev[index];
      const updated: Question = { ...old, type };
      if (type === 'single' || type === 'multiple') {
        updated.options = old.options && old.options.length > 0 ? old.options : ['', '', '', ''];
      } else {
        updated.options = undefined;
      }
      if (type === 'judge') {
        updated.answer = 'true';
      }
      return prev.map((q, i) => (i === index ? updated : q));
    });
  };

  const updateManualOption = (qIndex: number, oIndex: number, value: string) => {
    setManualQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || !q.options) return q;
        const newOptions = [...q.options];
        newOptions[oIndex] = value;
        return { ...q, options: newOptions };
      })
    );
  };

  const addManualOption = (qIndex: number) => {
    setManualQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || !q.options) return q;
        return { ...q, options: [...q.options, ''] };
      })
    );
  };

  const removeManualOption = (qIndex: number, oIndex: number) => {
    setManualQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || !q.options) return q;
        return { ...q, options: q.options.filter((_, j) => j !== oIndex) };
      })
    );
  };

  const handleManualSubmit = async () => {
    if (!token) {
      setError('请先登录');
      return;
    }
    if (!manualTitle.trim()) {
      setError('请输入题库标题');
      return;
    }
    if (manualQuestions.length === 0) {
      setError('至少需要一道题');
      return;
    }
    for (let i = 0; i < manualQuestions.length; i++) {
      const q = manualQuestions[i];
      if (!q.content.trim()) {
        setError(`第 ${i + 1} 题题干不能为空`);
        return;
      }
      if ((q.type === 'single' || q.type === 'multiple') && (!q.options || q.options.filter((o) => o.trim()).length < 2)) {
        setError(`第 ${i + 1} 题至少需要 2 个选项`);
        return;
      }
      if (!q.answer.trim()) {
        setError(`第 ${i + 1} 题答案不能为空`);
        return;
      }
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title: manualTitle.trim(), questions: manualQuestions, timeLimit }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '创建题库失败');
        return;
      }
      if (onCreated) {
        onCreated(data.quiz.id);
      } else {
        router.push(`/quiz/${data.quiz.id}`);
      }
    } catch (err) {
      setError('网络错误');
    } finally {
      setIsLoading(false);
    }
  };

  if (showManualEditor) {
    return (
      <div className="w-full min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => {
                setShowManualEditor(false);
                setError('');
              }}
              className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回上传
            </button>
            <button
              onClick={handleManualSubmit}
              disabled={isLoading}
              className="px-6 py-3 bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 shadow-md shadow-sky-200 disabled:opacity-50 transition-all"
            >
              {isLoading ? '创建中...' : '创建题库并开始答题'}
            </button>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600">
              {error}
            </div>
          )}

          <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 mb-6 shadow-sm">
            <label className="block text-slate-700 text-sm mb-2 font-medium">题库标题</label>
            <input
              type="text"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="为你的题库起个名字"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
            />
          </div>

          <div className="space-y-4 mb-6">
            {manualQuestions.map((q, qIndex) => (
              <div key={qIndex} className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-slate-800 font-medium">第 {qIndex + 1} 题</h3>
                  <div className="flex items-center gap-2">
                    <select
                      value={q.type}
                      onChange={(e) => handleManualTypeChange(qIndex, e.target.value as Question['type'])}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm"
                    >
                      <option value="single">单选</option>
                      <option value="multiple">多选</option>
                      <option value="judge">判断</option>
                      <option value="fill">填空</option>
                      <option value="essay">简答</option>
                      <option value="code">代码</option>
                      <option value="interview">面试</option>
                    </select>
                    <input
                      type="number"
                      value={q.score}
                      onChange={(e) => updateManualQuestion(qIndex, { score: parseInt(e.target.value) || 0 })}
                      min="1"
                      className="w-16 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm text-center"
                    />
                    <span className="text-slate-500 text-sm">分</span>
                    <button
                      onClick={() => removeManualQuestion(qIndex)}
                      className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-sm transition-colors"
                    >
                      删除
                    </button>
                  </div>
                </div>

                <textarea
                  value={q.content}
                  onChange={(e) => updateManualQuestion(qIndex, { content: e.target.value })}
                  placeholder="输入题目内容..."
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 mb-4 resize-none"
                />

                {(q.type === 'single' || q.type === 'multiple') && q.options && (
                  <div className="space-y-2 mb-4">
                    {q.options.map((opt, oIndex) => (
                      <div key={oIndex} className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm w-6">{String.fromCharCode(65 + oIndex)}.</span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updateManualOption(qIndex, oIndex, e.target.value)}
                          placeholder={`选项 ${String.fromCharCode(65 + oIndex)}`}
                          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-sky-400"
                        />
                        <button
                          onClick={() => removeManualOption(qIndex, oIndex)}
                          className="text-rose-400 hover:text-rose-500"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addManualOption(qIndex)}
                      className="text-sky-500 text-sm hover:text-sky-600"
                    >
                      + 添加选项
                    </button>
                  </div>
                )}

                <div className="mb-4">
                  <p className="text-slate-500 text-sm mb-2">
                    答案
                    {q.type === 'judge' && <span className="text-slate-400 ml-2">（正确 / 错误）</span>}
                  </p>
                  {q.type === 'judge' ? (
                    <select
                      value={q.answer}
                      onChange={(e) => updateManualQuestion(qIndex, { answer: e.target.value })}
                      className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    >
                      <option value="true">正确</option>
                      <option value="false">错误</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={q.answer}
                      onChange={(e) => updateManualQuestion(qIndex, { answer: e.target.value })}
                      placeholder="答案"
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mb-8 flex-wrap">
            <button onClick={() => addManualQuestion('single')} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-sky-400 hover:text-sky-600 transition-colors text-sm shadow-sm">+ 单选题</button>
            <button onClick={() => addManualQuestion('multiple')} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-sky-400 hover:text-sky-600 transition-colors text-sm shadow-sm">+ 多选题</button>
            <button onClick={() => addManualQuestion('judge')} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-sky-400 hover:text-sky-600 transition-colors text-sm shadow-sm">+ 判断题</button>
            <button onClick={() => addManualQuestion('fill')} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-sky-400 hover:text-sky-600 transition-colors text-sm shadow-sm">+ 填空题</button>
            <button onClick={() => addManualQuestion('essay')} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-sky-400 hover:text-sky-600 transition-colors text-sm shadow-sm">+ 简答题</button>
            <button onClick={() => addManualQuestion('code')} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-sky-400 hover:text-sky-600 transition-colors text-sm shadow-sm">+ 代码题</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 overflow-hidden flex items-center justify-center">
      <div className="w-full max-w-3xl px-4 py-8 overflow-y-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-slate-800 mb-4">在线答题系统</h1>
          <p className="text-slate-500 text-lg">上传 Markdown 题目文件，自动解析并批改</p>
          <div className="mt-4 flex gap-2 justify-center">
            <a
              href="/admin/login"
              className="text-sm text-slate-400 hover:text-sky-500 transition-colors"
            >
              管理后台入口
            </a>
          </div>
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

        <div className="text-center text-slate-400 mb-6">
          <span>或</span>
          <button
            onClick={() => setShowManualEditor(true)}
            className="ml-3 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-sky-400 hover:text-sky-600 transition-colors shadow-sm"
          >
            手动新增题目
          </button>
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
          <div className="text-[11px] text-slate-400 mt-1">0 = 不限时,1~480 分钟可选</div>
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
            onChange={(e) => setPreview(e.target.value)}
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
              setPendingChoiceOpen(true);
            }}
            disabled={!preview.trim() || isLoading}
            className="flex-1 py-4 bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-sky-200 flex items-center justify-center gap-2"
          >
            开始解析
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
                {/* 设计选择:取消时保留 preview,允许用户重新点击"开始解析"以再次进入选择层 */}
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
