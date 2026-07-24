'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ReportStats } from '@/lib/report/calculator';
import ReportBarChart from '@/components/ReportBarChart';
import MarkdownView from '@/components/MarkdownView';

interface AIReportContent {
  knowledgePoints: { tag: string; relatedQuestions: number[] }[];
  advice: string;
  generatedAt?: string;
}

export default function ReportView({
  resultId,
  stats,
  quizTitle,
  initialReport,
}: {
  resultId: string;
  stats: ReportStats;
  quizTitle: string;
  initialReport?: AIReportContent;
}) {
  const { token } = useAuth();
  const [report, setReport] = useState<AIReportContent | undefined>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resultId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.required && data.balance != null) {
          setError(`积分不足:需要 ${data.required},当前 ${data.balance}`);
        } else {
          setError(data.error ?? '生成失败');
        }
        return;
      }
      setReport(data.content);
      setNewBalance(data.newBalance);
    } catch (e: any) {
      setError(e?.message ?? '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const typeItems = Object.entries(stats.byType).map(([t, v]) => ({
    label: t,
    value: v.correctRate,
    display: `${v.correct}/${v.total} (${Math.round(v.correctRate * 100)}%)`,
  }));
  const diffItems = (['简单', '中等', '困难'] as const)
    .filter((k) => stats.byDifficulty[k])
    .map((k) => {
      const v = stats.byDifficulty[k]!;
      return {
        label: k,
        value: v.correctRate,
        display: `${v.correct}/${v.total} (${Math.round(v.correctRate * 100)}%)`,
      };
    });

  return (
    <div className="space-y-6">
      <h2 className="text-[22px] text-slate-800 font-semibold">📊 答题报告</h2>

      {/* 模块 1:总览 */}
      <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
        <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-3">
          总览 · {quizTitle}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-[10.5px] text-slate-400">得分</div>
            <div className="text-[24px] font-bold text-sky-500 tabular-nums">
              {stats.overview.score}
              <span className="text-slate-300 text-[16px]"> / {stats.overview.totalScore}</span>
            </div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-400">正确率</div>
            <div className="text-[24px] font-bold text-emerald-500 tabular-nums">
              {Math.round(stats.overview.correctRate * 100)}%
            </div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-400">对 / 错 / 未答</div>
            <div className="text-[16px] font-medium text-slate-700 tabular-nums">
              ✓ {stats.overview.correctCount} &nbsp; ✗ {stats.overview.wrongCount} &nbsp; ⊘{' '}
              {stats.overview.unansweredCount}
            </div>
          </div>
        </div>
      </section>

      {/* 模块 2:题型维度 */}
      <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
        <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-3">
          按题型
        </h3>
        <ReportBarChart items={typeItems} />
      </section>

      {/* 模块 3:难度维度 */}
      {diffItems.length > 0 && (
        <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
          <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-3">
            按难度
            {stats.byDifficulty.noDifficultyCount > 0
              ? ` (另有 ${stats.byDifficulty.noDifficultyCount} 题无难度标记)`
              : ''}
          </h3>
          <ReportBarChart items={diffItems} />
        </section>
      )}

      {/* 模块 4+5:AI 知识点 + 建议 */}
      <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400">
            AI 分析 · 知识点 + 建议(扣 5 积分)
          </h3>
          {!report && (
            <button
              onClick={generate}
              disabled={loading}
              className="px-3 py-1.5 bg-gradient-to-r from-sky-400 to-emerald-400 text-white text-[12px] rounded-lg hover:from-sky-500 hover:to-emerald-500 disabled:opacity-50"
            >
              {loading ? '生成中...' : '🔮 AI 生成报告'}
            </button>
          )}
        </div>
        {error && (
          <div className="text-[12px] text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </div>
        )}
        {report && (
          <div className="space-y-4">
            {report.knowledgePoints.length > 0 && (
              <div>
                <div className="text-[12px] text-slate-500 mb-2">薄弱知识点</div>
                <div className="flex flex-wrap gap-2">
                  {report.knowledgePoints.map((kp, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[11.5px] rounded-md"
                      title={`相关题目: ${kp.relatedQuestions.join(', ')}`}
                    >
                      {kp.tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="text-[12px] text-slate-500 mb-2">下一步建议</div>
              <MarkdownView content={report.advice} size="base" />
            </div>
            {newBalance !== null && (
              <div className="text-[11px] text-slate-400">
                本次扣 5 积分,剩余 {newBalance} 积分
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}