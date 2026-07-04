'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import QuizUploadPanel, { type ParsedQuestion } from '@/components/admin/QuizUploadPanel';

interface Question {
  id?: string;
  type: 'single' | 'multiple' | 'judge' | 'fill' | 'essay' | 'code';
  content: string;
  options?: string[];
  answer: string;
  analysis?: string;
  score: number;
}

const QUESTION_TYPES = [
  { key: 'single', label: '单选题' },
  { key: 'multiple', label: '多选题' },
  { key: 'judge', label: '判断题' },
  { key: 'fill', label: '填空题' },
  { key: 'essay', label: '简答题' },
  { key: 'code', label: '代码题' },
];

export default function NewQuizPage() {
  const router = useRouter();
  const { admin, loading: adminLoading } = useAdminAuth();
  const [title, setTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState<number>(0);
  const [questions, setQuestions] = useState<Question[]>([createEmptyQuestion('single')]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'manual' | 'upload'>('manual');

  useEffect(() => {
    if (adminLoading) return;
    const token = localStorage.getItem('adminToken');
    if (!token || !admin) {
      window.location.href = '/admin/login';
    }
  }, [admin, adminLoading]);

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

  const addQuestion = (type: Question['type']) => {
    setQuestions((prev) => [...prev, createEmptyQuestion(type)]);
  };

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...updates } : q)));
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTypeChange = (index: number, type: Question['type']) => {
    setQuestions((prev) => {
      const old = prev[index];
      const updated: Question = { ...old, type };
      if (type === 'single' || type === 'multiple') {
        updated.options = old.options && old.options.length > 0 ? old.options : ['', '', '', ''];
      } else {
        updated.options = undefined;
      }
      if (type === 'judge' && old.type !== 'judge') {
        updated.answer = 'true';
      }
      return prev.map((q, i) => (i === index ? updated : q));
    });
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || !q.options) return q;
        const newOptions = [...q.options];
        newOptions[oIndex] = value;
        return { ...q, options: newOptions };
      })
    );
  };

  const addOption = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || !q.options) return q;
        return { ...q, options: [...q.options, ''] };
      })
    );
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || !q.options) return q;
        return { ...q, options: q.options.filter((_, j) => j !== oIndex) };
      })
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请输入题库标题');
      return;
    }
    if (questions.length === 0) {
      setError('至少需要一道题');
      return;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
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

    setSaving(true);
    setError('');
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch('/api/admin/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          questions,
          isOfficial: true,
          timeLimit,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/admin/quizzes');
      } else {
        setError(data.error || '创建失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setSaving(false);
    }
  };

  if (adminLoading || !admin) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-pink-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1.5">
                New Quiz
              </div>
              <h2
                className="text-[28px] leading-tight text-slate-800 mb-1.5"
                style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}
              >
                发布新题库
              </h2>
              <p className="text-slate-500 text-sm">创建一份新的官方题库，所有用户都能看到</p>
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving || mode === 'upload'}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-[13px] font-medium rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md shadow-indigo-200 disabled:opacity-50 transition-all"
            >
              {saving ? '发布中...' : '发布题库'}
            </button>
          </div>

          {/* 模式 tab 切换 */}
          <div className="flex gap-1.5 mb-6 p-1 bg-white/60 backdrop-blur rounded-xl border border-slate-200/60 w-fit">
            {([
              { key: 'manual', label: '手动编辑' },
              { key: 'upload', label: '上传文件' },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setMode(t.key);
                  setError('');
                }}
                className={`px-5 py-1.5 rounded-lg text-[12.5px] font-medium transition-all ${
                  mode === t.key
                    ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600">
            {error}
          </div>
        )}

        {/* 上传模式分支 */}
        {mode === 'upload' ? (
          <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 mb-6 shadow-sm">
            <QuizUploadPanel
              tone="admin"
              busy={saving}
              onParsed={async (parsedTitle, parsedQuestions: ParsedQuestion[]) => {
                setError('');
                if (!parsedTitle.trim()) {
                  setError('未能从文件中提取到标题');
                  return;
                }
                setSaving(true);
                const token = localStorage.getItem('adminToken');
                try {
                  const res = await fetch('/api/admin/quizzes', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      title: parsedTitle.trim(),
                      questions: parsedQuestions,
                      isOfficial: true,
                      timeLimit,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setError(data.error || '创建失败');
                    return;
                  }
                  router.push('/admin/quizzes');
                } catch {
                  setError('网络错误');
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
        ) : null}

        {mode === 'manual' && (
        <>
        <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 mb-6 shadow-sm">
          <label className="block text-slate-700 text-sm mb-2 font-medium">题库标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：JavaScript 基础测试"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
        </div>

        <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 mb-6 shadow-sm">
          <label className="block text-slate-700 text-sm mb-2 font-medium">答题时长</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={timeLimit}
              onChange={(e) => setTimeLimit(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm text-center"
            />
            <span className="text-slate-500 text-sm">分钟</span>
            <span className="text-slate-400 text-xs ml-2">（0 = 不限时）</span>
            {[10, 20, 30, 60].map((m) => (
              <button
                key={m}
                onClick={() => setTimeLimit(m)}
                className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                  timeLimit === m
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                }`}
              >
                {m} 分钟
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 mb-6">
          {questions.map((q, qIndex) => (
            <div key={qIndex} className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-800 font-medium">第 {qIndex + 1} 题</h3>
                <div className="flex items-center gap-2">
                  <select
                    value={q.type}
                    onChange={(e) => handleTypeChange(qIndex, e.target.value as Question['type'])}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={q.score}
                    onChange={(e) => updateQuestion(qIndex, { score: parseInt(e.target.value) || 0 })}
                    min="1"
                    className="w-16 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm text-center"
                  />
                  <span className="text-slate-500 text-sm">分</span>
                  <button
                    onClick={() => removeQuestion(qIndex)}
                    className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-sm transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>

              <textarea
                value={q.content}
                onChange={(e) => updateQuestion(qIndex, { content: e.target.value })}
                placeholder="输入题目内容..."
                rows={2}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 mb-4 resize-none"
              />

              {(q.type === 'single' || q.type === 'multiple') && q.options && (
                <div className="space-y-2 mb-4">
                  <p className="text-slate-500 text-sm">选项</p>
                  {q.options.map((opt, oIndex) => (
                    <div key={oIndex} className="flex items-center gap-2">
                      <span className="text-slate-400 text-sm w-6">{String.fromCharCode(65 + oIndex)}.</span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                        placeholder={`选项 ${String.fromCharCode(65 + oIndex)}`}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-400"
                      />
                      <button
                        onClick={() => removeOption(qIndex, oIndex)}
                        className="text-rose-400 hover:text-rose-500"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addOption(qIndex)}
                    className="text-indigo-500 text-sm hover:text-indigo-600"
                  >
                    + 添加选项
                  </button>
                </div>
              )}

              <div className="mb-4">
                <p className="text-slate-500 text-sm mb-2">
                  答案
                  {q.type === 'single' && <span className="text-slate-400 ml-2">（输入选项字母，如 A）</span>}
                  {q.type === 'multiple' && <span className="text-slate-400 ml-2">（输入选项字母，如 ABC）</span>}
                  {q.type === 'judge' && <span className="text-slate-400 ml-2">（正确 / 错误）</span>}
                </p>
                {q.type === 'judge' ? (
                  <select
                    value={q.answer}
                    onChange={(e) => updateQuestion(qIndex, { answer: e.target.value })}
                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  >
                    <option value="true">正确</option>
                    <option value="false">错误</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={q.answer}
                    onChange={(e) => updateQuestion(qIndex, { answer: e.target.value })}
                    placeholder="答案"
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400"
                  />
                )}
              </div>

              <div>
                <p className="text-slate-500 text-sm mb-2">解析（可选）</p>
                <textarea
                  value={q.analysis || ''}
                  onChange={(e) => updateQuestion(qIndex, { analysis: e.target.value })}
                  placeholder="输入答案解析..."
                  rows={2}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-400 resize-none"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-8 flex-wrap">
          {QUESTION_TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => addQuestion(t.key as Question['type'])}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-indigo-400 hover:text-indigo-600 transition-colors text-sm shadow-sm"
            >
              + 添加{t.label}
            </button>
          ))}
        </div>
        </>
        )}
        </div>
      </main>
    </div>
  );
}
