'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import UploadForm from '@/components/UploadForm';
import AIGenerateForm from '@/components/AIGenerateForm';
import AIGenerateDialog from '@/components/AIGenerateDialog';
import AIGeneratePreview from '@/components/AIGeneratePreview';
import {
  buildGenerateSystemPrompt,
  buildGenerateUserPrompt,
} from '@/lib/ai/generate-prompt';
import { extractTitle } from '@/lib/parser';
import { sha256Hex } from '@/lib/hash';
import type { Question } from '@/types';

type Tab = 'upload' | 'ai';

/**
 * 上传/生成题库页
 * 路径:/upload
 * - Tab "上传题库": 复用 UploadForm
 * - Tab "AI 生成": AIGenerateForm → AIGenerateDialog(SSE) → AIGeneratePreview → 保存
 * - 未登录跳 /login
 */
export default function UploadPage() {
  const router = useRouter();
  const { user, loading, token } = useAuth();

  const [tab, setTab] = useState<Tab>('upload');

  // AI 生成状态
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genQuestions, setGenQuestions] = useState<Question[]>([]);
  const [genTopic, setGenTopic] = useState('');
  const [genCounts, setGenCounts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [timeLimit, setTimeLimit] = useState(30); // 默认30分钟

  // 缓存最后一次 topic/counts 用于重新生成
  const lastRequestRef = useRef<{
    topic: string;
    counts: Record<string, number>;
  }>({ topic: '', counts: {} });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // ---- handlers ----

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

  const handleSaveQuestions = useCallback(async () => {
    if (!token || genQuestions.length === 0) return;
    setSaving(true);
    try {
      const title = genTopic.trim().slice(0, 100) || extractTitle(genTopic);
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, questions: genQuestions, timeLimit }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error ?? '保存题库失败');
        return;
      }
      router.push(`/quiz/${data.quiz.id}`);
    } catch (err) {
      setGenError(
        '网络错误: ' + (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setSaving(false);
    }
  }, [token, genQuestions, genTopic, router]);

  const handleCopyPrompt = useCallback(
    async (topic: string, counts: Record<string, number>) => {
      const systemPrompt = buildGenerateSystemPrompt();
      const userPrompt = buildGenerateUserPrompt(topic, counts);
      const fullText = systemPrompt + '\n\n' + userPrompt;
      try {
        await navigator.clipboard.writeText(fullText);
      } catch {
        // fallback: select + execCommand
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

  // ---- render ----

  if (loading || !user) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            返回首页
          </button>
          <div className="text-center">
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-sky-500/80 font-medium mb-1">
              {tab === 'upload' ? 'Upload' : 'AI Generate'}
            </div>
            <h1
              className="text-[22px] leading-tight text-slate-800"
              style={{
                fontFamily:
                  'var(--font-serif), "Songti SC", serif',
                fontStyle: 'italic',
                fontWeight: 500,
              }}
            >
              {tab === 'upload' ? '上传题库' : 'AI 生成题库'}
            </h1>
          </div>
          <div className="w-20" />
        </div>

        {/* Tab switcher */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-white/80 border border-slate-200 rounded-xl p-1 gap-1">
            <button
              onClick={() => setTab('upload')}
              className={`px-5 py-2 text-[13px] rounded-lg transition-all ${
                tab === 'upload'
                  ? 'bg-gradient-to-r from-sky-400 to-emerald-400 text-white shadow-md shadow-sky-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              📤 上传题库
            </button>
            <button
              onClick={() => setTab('ai')}
              className={`px-5 py-2 text-[13px] rounded-lg transition-all ${
                tab === 'ai'
                  ? 'bg-gradient-to-r from-sky-400 to-emerald-400 text-white shadow-md shadow-sky-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              ✨ AI 生成
            </button>
          </div>
        </div>

        {/* Content */}
        {tab === 'upload' && <UploadForm />}

        {tab === 'ai' && (
          <div className="bg-white/80 border border-slate-200 rounded-2xl p-6 shadow-sm">
            {genError && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm flex items-center gap-2">
                <svg
                  className="w-5 h-5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {genError}
                <button
                  onClick={() => setGenError('')}
                  className="ml-auto text-rose-400 hover:text-rose-600"
                >
                  ✕
                </button>
              </div>
            )}

            <AIGenerateForm
              onGenerate={handleGenerate}
              onCopyPrompt={handleCopyPrompt}
              disabled={generating || saving}
            />
          </div>
        )}
      </div>

      {/* AI 生成对话框 */}
      <AIGenerateDialog
        open={generating}
        topic={genTopic}
        counts={genCounts}
        token={token}
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
          onSave={handleSaveQuestions}
          onRegenerate={handleRegenerate}
          onCopyPrompt={handleCopyPromptFromPreview}
          saving={saving}
        />
      )}
    </div>
  );
}
