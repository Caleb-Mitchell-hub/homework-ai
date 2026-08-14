'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { calcReportStats, ReportStats } from '@/lib/report/calculator';
import { SUBJECTIVE_TYPES, recalcTotalScore } from '@/lib/score';
import ReportView from '@/components/ReportView';

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const resultId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    quizTitle: string;
    stats: ReportStats;
    initialReport?: any;
    isInterview: boolean;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        // 1) 使用详情 API 获取完整数据（含 results 数组 + quiz.questions）
        const detailRes = await fetch(`/api/results/${resultId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!detailRes.ok) {
          const err = await detailRes.json().catch(() => ({}));
          throw new Error(err.error || '无法加载结果');
        }
        const detailData = await detailRes.json();
        const found = detailData.result;
        if (!found) throw new Error('结果不存在');

        // 2) 防御性 parse results
        let parsedResults: any[] = [];
        if (typeof found.results === 'string') {
          try { parsedResults = JSON.parse(found.results); } catch { /* keep [] */ }
        } else if (Array.isArray(found.results)) {
          parsedResults = found.results;
        }

        // 3) 防御性 parse questions（已通过 include quiz.questions 返回）
        let questions: any[] = [];
        try {
          const rawQuestions = found.quiz?.questions;
          if (typeof rawQuestions === 'string') {
            questions = JSON.parse(rawQuestions);
          } else if (Array.isArray(rawQuestions)) {
            questions = rawQuestions;
          }
        } catch { /* keep [] */ }

        // 4) 判断是否为面试题型（全部题目都是 interview 或 essay 类型）
        const isInterview = questions.length > 0 && questions.every((q: any) => SUBJECTIVE_TYPES.has(q.type));

        // 5) 计算本地统计（区分客观题与主观题）
        const stats = calcReportStats({
          totalScore: recalcTotalScore(parsedResults),
          maxTotalScore: found.totalScore,
          results: parsedResults,
          questions,
        });

        // 6) 尝试加载缓存报告（仅查询缓存，不触发 AI 生成和扣积分）
        let initialReport: any = undefined;
        try {
          const cacheRes = await fetch(`/api/ai/report?resultId=${encodeURIComponent(resultId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (cacheRes.ok) {
            const cacheData = await cacheRes.json();
            if (cacheData.cached && cacheData.content) {
              initialReport = cacheData.content;
            }
          }
        } catch {
          // 静默忽略
        }

        if (!cancelled) {
          setData({
            quizTitle: found.quiz?.title ?? '',
            stats,
            initialReport,
            isInterview,
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resultId, token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-rose-500 mb-3">{error}</div>
          <button onClick={() => router.push('/')} className="text-sky-500 underline">
            返回首页
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 pb-12">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-slate-500 hover:text-slate-800 hover:bg-white/70 rounded-lg transition-all mb-4"
        >
          ← 返回
        </button>
        <ReportView
          resultId={resultId}
          stats={data.stats}
          quizTitle={data.quizTitle}
          initialReport={data.initialReport}
          isInterview={data.isInterview}
        />
      </div>
    </div>
  );
}
