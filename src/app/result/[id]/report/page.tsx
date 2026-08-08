'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { calcReportStats, ReportStats } from '@/lib/report/calculator';
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
        // 1) 查所有结果，找到目标
        const resultsRes = await fetch('/api/results', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resultsRes.ok) throw new Error('无法加载结果');
        const all = await resultsRes.json();
        const found = (all.results ?? []).find((r: any) => r.id === resultId);
        if (!found) throw new Error('结果不存在');
        // 2) 防御性 parse results
        if (typeof found.results === 'string') {
          try {
            found.results = JSON.parse(found.results);
          } catch {
            found.results = [];
          }
        }
        // 3) 查 quiz
        const quizRes = await fetch(`/api/quizzes/${found.quizId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!quizRes.ok) throw new Error('无法加载题目');
        const quizData = await quizRes.json();
        const questions = quizData.quiz?.questions ?? [];

        // 4) 判断是否为面试题型（全部题目都是 interview 或 essay 类型）
        const isInterview = questions.length > 0 && questions.every((q: any) => q.type === 'interview' || q.type === 'essay');

        // 5) 计算本地统计
        const stats = calcReportStats({
          totalScore: found.score,
          results: found.results ?? [],
          questions,
        });

        // 6) 尝试加载缓存报告
        let initialReport: any = undefined;
        if (!isInterview) {
          // 普通题型：尝试加载缓存的 AI 报告
          try {
            const reportRes = await fetch('/api/ai/report', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ resultId }),
            });
            if (reportRes.ok) {
              const reportData = await reportRes.json();
              if (reportData.cached && reportData.content) {
                initialReport = reportData.content;
              }
            }
          } catch {
            // 静默忽略
          }
        }
        // 面试题报告不做缓存预加载

        if (!cancelled) {
          setData({
            quizTitle: quizData.quiz?.title ?? '',
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
