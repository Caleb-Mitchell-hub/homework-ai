'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Quiz, QuizResult } from '@/types';
import AnswerSheet from '@/components/AnswerSheet';

interface Props {
  resultId: string | null;
  open: boolean;
  onClose: () => void;
  token: string;
}

export default function RecordDetailDrawer({ resultId, open, onClose, token }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    if (!open || !resultId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`/api/results/${resultId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || '加载失败');
        }
        const data = await res.json();
        if (cancelled) return;

        const r = data.result;

        // 构造 Quiz 格式给 AnswerSheet 使用
        let questions: any[] = [];
        try {
          if (typeof r.quiz?.questions === 'string') {
            questions = JSON.parse(r.quiz.questions);
          } else if (Array.isArray(r.quiz?.questions)) {
            questions = r.quiz.questions;
          }
        } catch {
          // keep []
        }

        // 构造 ResultItem 数组(解析 results JSON)
        let items: any[] = [];
        try {
          items = typeof r.results === 'string'
            ? JSON.parse(r.results)
            : (Array.isArray(r.results) ? r.results : []);
        } catch {
          // keep []
        }

        setQuiz({
          id: r.quizId,
          title: r.quiz?.title || '',
          questions,
          createdAt: new Date(r.submittedAt).getTime(),
        });

        setResult({
          id: r.id,
          quizId: r.quizId,
          name: r.name,
          status: r.status,
          score: r.score,
          totalScore: r.totalScore,
          results: items,
          answers: [],
          submittedAt: new Date(r.submittedAt).getTime(),
        });
      } catch (e: any) {
        if (!cancelled) setError(e.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [resultId, open, token]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* 抽屉 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300">
        {/* 头部栏 */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-slate-200/60 px-4 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-800 truncate">
              {quiz?.title || '加载中...'}{result ? ` · ${result.name}` : ''}
            </h2>
            {result && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                {new Date(result.submittedAt).toLocaleString('zh-CN')} ·
                得分 {result.score}/{result.totalScore}
                {result.totalScore > 0 && ` (${Math.round(result.score / result.totalScore * 100)}%)`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {result?.id && (
              <button
                onClick={() => router.push(`/result/${result.id}/report`)}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
              >
                查看完整报告
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all flex items-center justify-center"
              aria-label="关闭"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-6 h-6 border-3 border-sky-400 border-t-transparent rounded-full" />
            </div>
          )}
          {error && (
            <div className="text-center py-20 text-rose-500 text-sm">{error}</div>
          )}
          {!loading && !error && quiz && result && (
            <AnswerSheet quiz={quiz} result={result} />
          )}
        </div>
      </div>
    </>
  );
}
