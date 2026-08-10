'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import QuizUploadPanel, { type ParsedQuestion } from '@/components/admin/QuizUploadPanel';
import AIGenerateForm from '@/components/AIGenerateForm';
import AIGenerateDialog from '@/components/AIGenerateDialog';
import AIGeneratePreview from '@/components/AIGeneratePreview';
import {
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
} from '@/lib/ai/generate-prompt';
import type { Question } from '@/types';

type Tab = 'upload' | 'ai';

export default function NewQuizPage() {
  const router = useRouter();
  const { admin, loading: adminLoading } = useAdminAuth();

  const [tab, setTab] = useState<Tab>('upload');
  const [timeLimit, setTimeLimit] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // AI 生成状态
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genQuestions, setGenQuestions] = useState<Question[]>([]);
  const [genTopic, setGenTopic] = useState('');
  const [genCounts, setGenCounts] = useState<Record<string, number>>({});

  // 缓存最后一次 topic/counts 用于重新生成
  const lastRequestRef = useRef<{
    topic: string;
    counts: Record<string, number>;
  }>({ topic: '', counts: {} });

  useEffect(() => {
    if (adminLoading) return;
    const token = localStorage.getItem('adminToken');
    if (!token || !admin) {
      window.location.href = '/admin/login';
    }
  }, [admin, adminLoading]);

  // ---- AI handlers ----

  const handleGenerate = useCallback(
    (topic: string, counts: Record<string, number>) => {
      setGenError('');
      setGenQuestions([]);
      setGenTopic(topic);
      setGenCounts(counts);
      lastRequestRef.current = { topic, counts };
      setGenerating(true);
    },
    [],
  );

  const handleGenerateComplete = useCallback(
    (questions: any[], _usage?: any) => {
      setGenerating(false);
      setGenQuestions(questions);
    },
    [],
  );

  const handleGenerateError = useCallback((msg: string) => {
    setGenerating(false);
    setGenError(msg);
  }, []);

  const handleCancelGenerate = useCallback(() => {
    setGenerating(false);
    setGenError('');
  }, []);

  const handleRegenerate = useCallback(() => {
    setGenQuestions([]);
    setGenError('');
    const { topic, counts } = lastRequestRef.current;
    if (topic && Object.values(counts).some((v) => v > 0)) {
      setGenerating(true);
    }
  }, []);

  // 保存 AI 生成的题库
  const handleSaveAIQuestions = useCallback(async () => {
    if (genQuestions.length === 0) return;
    setSaving(true);
    setGenError('');
    const token = localStorage.getItem('adminToken');
    try {
      const title = genTopic.trim().slice(0, 100) || 'AI 生成题库';
      const res = await fetch('/api/admin/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          questions: genQuestions,
          isOfficial: true,
          timeLimit,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || '保存失败');
        return;
      }
      router.push('/admin/quizzes');
    } catch {
      setGenError('网络错误');
    } finally {
      setSaving(false);
    }
  }, [genQuestions, genTopic, timeLimit, router]);

  const handleCopyPrompt = useCallback(
    async (topic: string, counts: Record<string, number>) => {
      const systemPrompt = buildGenerateSystemPrompt();
      const userPrompt = buildGenerateUserPrompt(topic, counts);
      const fullText = systemPrompt + '\n\n' + userPrompt;
      try {
        await navigator.clipboard.writeText(fullText);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = fullText;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    },
    [],
  );

  const handleCopyPromptFromPreview = useCallback(() => {
    const { topic, counts } = lastRequestRef.current;
    if (topic && Object.values(counts).some((v) => v > 0)) {
      handleCopyPrompt(topic, counts);
    }
  }, [handleCopyPrompt]);

  // ---- Upload handler ----
  const handleUploadParsed = useCallback(
    async (parsedTitle: string, parsedQuestions: ParsedQuestion[]) => {
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
    },
    [timeLimit, router],
  );

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
              <p className="text-slate-500 text-sm">上传 Markdown 文件或使用 AI 生成题库</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex bg-white/80 border border-slate-200 rounded-xl p-1 gap-1">
              <button
                onClick={() => setTab('upload')}
                className={`px-5 py-2 text-[13px] rounded-lg transition-all ${
                  tab === 'upload'
                    ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-md shadow-indigo-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                📤 上传题库
              </button>
              <button
                onClick={() => setTab('ai')}
                className={`px-5 py-2 text-[13px] rounded-lg transition-all ${
                  tab === 'ai'
                    ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-md shadow-indigo-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                ✨ AI 生成
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600">
              {error}
            </div>
          )}

          {/* 答题时长设置（两个 tab 共享） */}
          <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 mb-6 shadow-sm">
            <label className="block text-slate-700 text-sm mb-2 font-medium">答题时长</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="480"
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

          {/* Upload tab */}
          {tab === 'upload' && (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 shadow-sm">
              <QuizUploadPanel
                tone="admin"
                busy={saving}
                onParsed={handleUploadParsed}
              />
            </div>
          )}

          {/* AI Generate tab */}
          {tab === 'ai' && (
            <div className="bg-white/80 border border-slate-200 rounded-2xl p-6 shadow-sm">
              {genError && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {genError}
                  <button onClick={() => setGenError('')} className="ml-auto text-rose-400 hover:text-rose-600">
                    ✕
                  </button>
                </div>
              )}

              <AIGenerateForm
                onGenerate={handleGenerate}
                onCopyPrompt={handleCopyPrompt}
                disabled={generating || saving}
                hideCredits
              />
            </div>
          )}
        </div>
      </main>

      {/* AI 生成对话框 */}
      <AIGenerateDialog
        open={generating}
        topic={genTopic}
        counts={genCounts}
        token={typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null}
        onComplete={handleGenerateComplete}
        onError={handleGenerateError}
        onCancel={handleCancelGenerate}
      />

      {/* AI 生成预览 */}
      {genQuestions.length > 0 && (
        <AIGeneratePreview
          questions={genQuestions}
          topic={genTopic}
          timeLimit={timeLimit}
          onTimeLimitChange={setTimeLimit}
          onSave={handleSaveAIQuestions}
          onRegenerate={handleRegenerate}
          onCopyPrompt={handleCopyPromptFromPreview}
          saving={saving}
        />
      )}
    </div>
  );
}
