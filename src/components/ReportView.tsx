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

interface InterviewReportContent {
  overallScore: number;
  overallComment: string;
  masteredAreas: { area: string; detail: string }[];
  weakAreas: { area: string; detail: string; suggestion: string }[];
  improvementPlan: string;
}

function isInterviewReport(r: any): r is InterviewReportContent {
  return r && typeof r.overallScore === 'number' && Array.isArray(r.masteredAreas);
}

export default function ReportView({
  resultId,
  stats,
  quizTitle,
  initialReport,
  isInterview = false,
}: {
  resultId: string;
  stats: ReportStats;
  quizTitle: string;
  initialReport?: AIReportContent | InterviewReportContent;
  /** 是否为面试题测验 — 决定调用哪个 AI 报告 API */
  isInterview?: boolean;
}) {
  const { token, refreshCredits } = useAuth();
  const [report, setReport] = useState<AIReportContent | InterviewReportContent | undefined>(initialReport);
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
      if (!data.cached) refreshCredits();
    } catch (e: any) {
      setError(e?.message ?? '生成失败');
    } finally {
      setLoading(false);
    }
  };

  /** 面试题报告生成（100积分） */
  const generateInterviewReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/interview-report', {
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
      refreshCredits();
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

  const typeLabels: Record<string, string> = {
    single: '单选题', multiple: '多选题', boolean: '判断题',
    fill: '填空题', essay: '简答题', code: '代码题', interview: '面试题',
  };

  /** 导出报告为 Markdown 文件 */
  const exportReport = () => {
    const lines: string[] = [];
    lines.push(`# 📊 答题报告 - ${quizTitle}`);
    lines.push('');
    lines.push(`> 导出时间: ${new Date().toISOString().slice(0, 10)}`);
    lines.push('');

    // 总览
    lines.push('## 一、总览');
    lines.push('');
    lines.push(`- **得分**: ${stats.overview.score} / ${stats.overview.totalScore}`);
    lines.push(`- **正确率**: ${Math.round(stats.overview.correctRate * 100)}%`);
    lines.push(`- 正确: ${stats.overview.correctCount} · 错误: ${stats.overview.wrongCount} · 未答: ${stats.overview.unansweredCount}`);
    lines.push('');

    // 按题型
    if (typeItems.length > 0) {
      lines.push('## 二、按题型正确率');
      lines.push('');
      for (const t of typeItems) {
        lines.push(`- ${typeLabels[t.label] || t.label}: ${t.display}`);
      }
      lines.push('');
    }

    // 按难度
    if (diffItems.length > 0) {
      lines.push('## 三、按难度正确率');
      lines.push('');
      for (const d of diffItems) {
        lines.push(`- ${d.label}: ${d.display}`);
      }
      if (stats.byDifficulty.noDifficultyCount > 0) {
        lines.push(`- 另有 ${stats.byDifficulty.noDifficultyCount} 题无难度标记`);
      }
      lines.push('');
    }

    // AI 分析
    if (report) {
      if (isInterviewReport(report)) {
        lines.push('## 四、AI 面试深度分析');
        lines.push('');
        lines.push(`**综合评分**: ${report.overallScore}/100`);
        lines.push('');
        lines.push('### 整体评价');
        lines.push('');
        lines.push(report.overallComment);
        lines.push('');
        if (report.masteredAreas.length > 0) {
          lines.push('### 已掌握领域');
          lines.push('');
          for (const m of report.masteredAreas) {
            lines.push(`- **${m.area}**: ${m.detail}`);
          }
          lines.push('');
        }
        if (report.weakAreas.length > 0) {
          lines.push('### 薄弱领域');
          lines.push('');
          for (const w of report.weakAreas) {
            lines.push(`- **${w.area}**: ${w.detail}`);
            lines.push(`  - 建议: ${w.suggestion}`);
          }
          lines.push('');
        }
        lines.push('### 改进计划');
        lines.push('');
        lines.push(report.improvementPlan);
        lines.push('');
      } else {
        lines.push('## 四、AI 分析');
        lines.push('');
        if (report.knowledgePoints.length > 0) {
          lines.push('### 薄弱知识点');
          lines.push('');
          for (const kp of report.knowledgePoints) {
            lines.push(`- **${kp.tag}** (相关题目: ${kp.relatedQuestions.join(', ')})`);
          }
          lines.push('');
        }
        lines.push('### 学习建议');
        lines.push('');
        lines.push(report.advice);
        lines.push('');
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${quizTitle.replace(/[\\/:*?"<>|]/g, '_')}_报告_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] text-slate-800 font-semibold">📊 答题报告</h2>
        <button
          onClick={exportReport}
          className="px-3 py-1.5 text-[12px] bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
        >
          📥 导出报告
        </button>
      </div>

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

      {/* 模块 4: AI 分析 — 根据题型类型显示不同内容 */}
      {isInterview ? (
        /* ===== 面试题 AI 深度报告 ===== */
        <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400">
              🤖 AI 面试深度分析（100 积分/次）
            </h3>
            {!report && (
              <button
                onClick={generateInterviewReport}
                disabled={loading}
                className="px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[12px] rounded-lg hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50"
              >
                {loading ? '生成中...' : '🔮 AI 面试分析'}
              </button>
            )}
          </div>
          {error && (
            <div className="text-[12px] text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
              {error}
            </div>
          )}
          {report && isInterviewReport(report) && (
            <div className="space-y-5">
              {/* 综合评分 */}
              <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200">
                <div className="text-center">
                  <div className={`text-4xl font-bold ${
                    report.overallScore >= 80 ? 'text-emerald-600' :
                    report.overallScore >= 60 ? 'text-amber-600' :
                    'text-red-500'
                  }`}>
                    {report.overallScore}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">/ 100 综合评分</div>
                </div>
                <div className="flex-1 text-[13px] text-slate-600 leading-relaxed">
                  <MarkdownView content={report.overallComment} size="base" />
                </div>
              </div>

              {/* 已掌握领域 */}
              {report.masteredAreas.length > 0 && (
                <div>
                  <div className="text-[12px] font-medium text-emerald-600 mb-2">✅ 已掌握领域</div>
                  <div className="space-y-2">
                    {report.masteredAreas.map((m, i) => (
                      <div key={i} className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <div className="text-[13px] font-medium text-emerald-800">{m.area}</div>
                        <div className="text-[12px] text-emerald-700 mt-0.5">{m.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 薄弱领域 */}
              {report.weakAreas.length > 0 && (
                <div>
                  <div className="text-[12px] font-medium text-amber-600 mb-2">⚠️ 薄弱领域</div>
                  <div className="space-y-2">
                    {report.weakAreas.map((w, i) => (
                      <div key={i} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="text-[13px] font-medium text-amber-800">{w.area}</div>
                        <div className="text-[12px] text-amber-700 mt-0.5">{w.detail}</div>
                        <div className="text-[12px] text-blue-700 mt-1.5 pl-2 border-l-2 border-blue-300">
                          💡 {w.suggestion}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 改进计划 */}
              {report.improvementPlan && (
                <div>
                  <div className="text-[12px] font-medium text-blue-600 mb-2">📋 改进计划</div>
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-[13px] text-slate-700 leading-relaxed">
                    <MarkdownView content={report.improvementPlan} size="base" />
                  </div>
                </div>
              )}

              {newBalance !== null && (
                <div className="text-[11px] text-slate-400">
                  本次扣 100 积分，剩余 {newBalance} 积分
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        /* ===== 普通题型 AI 分析 ===== */
        <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400">
              AI 分析 · 知识点 + 建议（扣 5 积分）
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
          {report && !isInterviewReport(report) && (
            <div className="space-y-4">
              {(report as AIReportContent).knowledgePoints.length > 0 && (
                <div>
                  <div className="text-[12px] text-slate-500 mb-2">薄弱知识点</div>
                  <div className="flex flex-wrap gap-2">
                    {(report as AIReportContent).knowledgePoints.map((kp, i) => (
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
                <MarkdownView content={(report as AIReportContent).advice} size="base" />
              </div>
              {newBalance !== null && (
                <div className="text-[11px] text-slate-400">
                  本次扣 5 积分，剩余 {newBalance} 积分
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
