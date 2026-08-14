'use client';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/components/DialogProvider';
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
  const { token, user, refreshCredits } = useAuth();
  const dialog = useDialog();
  const [report, setReport] = useState<AIReportContent | InterviewReportContent | undefined>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);
  const [progressMsg, setProgressMsg] = useState('');
  const [progress, setProgress] = useState(0); // 0-100
  const [streamContent, setStreamContent] = useState(''); // 流式内容预览
  const [elapsedSec, setElapsedSec] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 清理定时器
  const stopProgress = () => {
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  };

  // 组件卸载时清理
  useEffect(() => () => stopProgress(), []);

  /** 启动进度指示器（计时 + 模拟消息轮播，收到 SSE progress 事件后自动停止轮播） */
  const startProgress = () => {
    setElapsedSec(0);
    setProgress(5);
    setStreamContent('');
    setProgressMsg('正在分析答题数据…');
    const msgs = ['正在分析答题数据…', '正在调用 AI 模型…', 'AI 正在生成报告…', '正在整理报告内容…'];
    let idx = 0;
    progressRef.current = setInterval(() => {
      idx = (idx + 1) % msgs.length;
      setProgressMsg(msgs[idx]);
      // 缓慢递增进度条（SSE 会覆盖为真实值）
      setProgress((prev) => Math.min(90, prev + 2));
    }, 2000);
    elapsedRef.current = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
  };

  /** SSE 流式生成普通报告 */
  const generate = async (force = false) => {
    if (user?.isGuest) {
      await dialog.alert({ title: '游客受限', message: '游客功能暂未开通，请登录使用 AI 报告' });
      return;
    }
    setLoading(true);
    setError(null);
    startProgress();

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resultId, force }),
      });

      // 缓存命中 → 普通 JSON 响应
      if (res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) {
          if (data.required != null) setError(`积分不足：需要 ${data.required}，当前 ${data.balance}`);
          else setError(data.error ?? '生成失败');
          return;
        }
        // cached 响应
        setReport(data.content);
        setNewBalance(data.newBalance ?? null);
        return;
      }

      // SSE 流式响应
      if (!res.ok || !res.body) {
        setError(`HTTP ${res.status}`);
        return;
      }

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const data = line.replace(/^data: /, '').trim();
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'delta') {
              setStreamContent((prev) => prev + (evt.text ?? ''));
            } else if (evt.type === 'progress') {
              // SSE 发送真实进度，停止模拟轮播
              if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
              setProgressMsg(evt.message ?? '');
              setProgress(evt.progress ?? progress);
            } else if (evt.type === 'complete') {
              setProgress(100);
              setReport(evt.content);
              setNewBalance(evt.newBalance);
              refreshCredits();
              return;
            } else if (evt.type === 'error') {
              setError(evt.message ?? '生成失败');
              return;
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e?.message ?? '生成失败');
    } finally {
      if (reader) reader.cancel().catch(() => {});
      stopProgress();
      setLoading(false);
      setProgressMsg('');
    }
  };

  /** SSE 流式面试题报告生成（100积分） */
  const generateInterviewReport = async (force = false) => {
    if (user?.isGuest) {
      await dialog.alert({ title: '游客受限', message: '游客功能暂未开通，请登录使用 AI 面试分析' });
      return;
    }
    setLoading(true);
    setError(null);
    startProgress();

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const res = await fetch('/api/ai/interview-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resultId, force }),
      });

      // 缓存命中 / 错误 → JSON 响应
      if (res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) {
          if (data.required != null) setError(`积分不足：需要 ${data.required}，当前 ${data.balance}`);
          else setError(data.error ?? '生成失败');
          return;
        }
        // 缓存命中
        setReport(data.content);
        setNewBalance(data.newBalance ?? null);
        return;
      }

      // SSE 流式响应
      if (!res.ok || !res.body) {
        setError(`HTTP ${res.status}`);
        return;
      }

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const data = line.replace(/^data: /, '').trim();
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'delta') {
              setStreamContent((prev) => prev + (evt.text ?? ''));
            } else if (evt.type === 'progress') {
              if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
              setProgressMsg(evt.message ?? '');
              setProgress(evt.progress ?? progress);
            } else if (evt.type === 'complete') {
              setProgress(100);
              setReport(evt.content);
              setNewBalance(evt.newBalance);
              refreshCredits();
              return;
            } else if (evt.type === 'error') {
              setError(evt.message ?? '生成失败');
              return;
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e?.message ?? '生成失败');
    } finally {
      if (reader) reader.cancel().catch(() => {});
      stopProgress();
      setLoading(false);
      setProgressMsg('');
    }
  };

  const typeLabels: Record<string, string> = {
    single: '单选题', multiple: '多选题', boolean: '判断题',
    fill: '填空题', essay: '简答题', code: '代码题', interview: '面试题',
  };

  const typeItems = Object.entries(stats.byType).map(([t, v]) => {
    if (v.isSubjective) {
      // 主观题：显示评分人数 + 平均分，不显示正确率
      const graded = v.gradedCount ?? 0;
      const avg = v.averageScore ?? 0;
      return {
        label: typeLabels[t] || t,
        value: graded > 0 ? avg / 100 : 0, // 条长度用平均分/100
        display: graded > 0
          ? `${graded}/${v.total} 已评分 · 均分 ${avg}`
          : `${v.total} 题 · 未评分`,
        isSubjective: true as const,
      };
    }
    return {
      label: typeLabels[t] || t,
      value: v.correctRate,
      display: `${v.correct}/${v.total} (${Math.round(v.correctRate * 100)}%)`,
      isSubjective: false as const,
    };
  });
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
    lines.push(`- **总题数**: ${stats.overview.totalQuestions}（客观 ${stats.overview.objectiveCount} · 主观 ${stats.overview.subjectiveCount}）`);
    if (stats.overview.correctRate !== null) {
      lines.push(`- **正确率**: ${Math.round(stats.overview.correctRate * 100)}%`);
      lines.push(`- 正确: ${stats.overview.correctCount} · 错误: ${stats.overview.wrongCount} · 未答: ${stats.overview.unansweredCount}`);
    } else {
      lines.push(`- 已答: ${stats.overview.correctCount + stats.overview.wrongCount} · 未答: ${stats.overview.unansweredCount}`);
    }
    lines.push('');

    // 主观题评分概览
    if (stats.subjective) {
      lines.push('## 二、主观题 AI 评分概览');
      lines.push('');
      lines.push(`- 已评分: ${stats.subjective.gradedCount} / ${stats.subjective.totalCount}`);
      lines.push(`- 平均分: ${stats.subjective.averageScore} / 100`);
      lines.push(`- 优秀(≥80): ${stats.subjective.distribution.excellent} · 良好(60-79): ${stats.subjective.distribution.good} · 待提高(<60): ${stats.subjective.distribution.needsWork}`);
      lines.push(`- 未评分: ${stats.subjective.distribution.ungraded}`);
      lines.push('');
    }

    // 按题型
    const typeSectionNum = stats.subjective ? '三' : '二';
    if (typeItems.length > 0) {
      lines.push(`## ${typeSectionNum}、按题型`);
      lines.push('');
      for (const t of typeItems) {
        lines.push(`- ${typeLabels[t.label] || t.label}: ${t.display}`);
      }
      lines.push('');
    }

    // 按难度
    const diffSectionNum = stats.subjective ? '四' : '三';
    if (diffItems.length > 0) {
      lines.push(`## ${diffSectionNum}、按难度`);
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
    const aiSectionNum = stats.subjective ? '五' : '四';
    if (report) {
      if (isInterviewReport(report)) {
        lines.push(`## ${aiSectionNum}、AI 面试深度分析`);
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
        <div className="flex items-center gap-2">
          {report && (
            <button
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: '重新生成报告',
                  message: '将重新生成报告并扣除对应积分，是否继续？',
                  confirmText: '重新生成',
                });
                if (!ok) return;
                if (isInterview) await generateInterviewReport(true);
                else await generate(true);
              }}
              disabled={loading}
              className="text-sm text-indigo-600 hover:text-indigo-800 px-3 py-1 rounded-lg border border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              🔄 重新生成报告
            </button>
          )}
          <button
            onClick={exportReport}
            className="px-3 py-1.5 text-[12px] bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
          >
            📥 导出报告
          </button>
        </div>
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
            <div className="text-[10.5px] text-slate-400">
              {stats.overview.correctRate !== null ? '正确率' : '题型构成'}
            </div>
            <div className="text-[24px] font-bold text-emerald-500 tabular-nums">
              {stats.overview.correctRate !== null
                ? `${Math.round(stats.overview.correctRate * 100)}%`
                : '主观题'}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-400">
              {stats.overview.correctRate !== null ? '对 / 错 / 未答' : '已答 / 未答'}
            </div>
            <div className="text-[16px] font-medium text-slate-700 tabular-nums">
              {stats.overview.correctRate !== null ? (
                <>✓ {stats.overview.correctCount} &nbsp; ✗ {stats.overview.wrongCount} &nbsp; ⊘{' '}
              {stats.overview.unansweredCount}</>
              ) : (
                <>✎ {stats.overview.correctCount + stats.overview.wrongCount} &nbsp; ⊘{' '}
              {stats.overview.unansweredCount}</>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-400">总题数</div>
            <div className="text-[24px] font-bold text-indigo-500 tabular-nums">
              {stats.overview.totalQuestions}
              <span className="text-slate-300 text-[13px] font-normal">
                {stats.overview.subjectiveCount > 0 && (
                  <> · 主观 {stats.overview.subjectiveCount}</>
                )}
                {stats.overview.objectiveCount > 0 && stats.overview.subjectiveCount > 0 && (
                  <> · 客观 {stats.overview.objectiveCount}</>
                )}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 主观题 AI 评分概览（仅含主观题时显示） */}
      {stats.subjective && (
        <section className="bg-white/80 border border-purple-200 rounded-xl p-5">
          <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-purple-400 mb-3">
            🎯 主观题 AI 评分概览
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-[10.5px] text-slate-400">已评分</div>
              <div className="text-[24px] font-bold text-purple-500 tabular-nums">
                {stats.subjective.gradedCount}
                <span className="text-slate-300 text-[16px]"> / {stats.subjective.totalCount}</span>
              </div>
            </div>
            <div>
              <div className="text-[10.5px] text-slate-400">平均分</div>
              <div className={`text-[24px] font-bold tabular-nums ${
                stats.subjective.averageScore >= 80 ? 'text-emerald-500' :
                stats.subjective.averageScore >= 60 ? 'text-amber-500' :
                'text-rose-500'
              }`}>
                {stats.subjective.averageScore}
                <span className="text-slate-300 text-[16px]"> / 100</span>
              </div>
            </div>
            <div>
              <div className="text-[10.5px] text-slate-400">优秀 · 良好 · 待提高</div>
              <div className="text-[16px] font-medium text-slate-700 tabular-nums">
                <span className="text-emerald-600">{stats.subjective.distribution.excellent}</span>
                {' · '}
                <span className="text-amber-600">{stats.subjective.distribution.good}</span>
                {' · '}
                <span className="text-rose-500">{stats.subjective.distribution.needsWork}</span>
              </div>
            </div>
            <div>
              <div className="text-[10.5px] text-slate-400">未评分</div>
              <div className="text-[24px] font-bold text-slate-400 tabular-nums">
                {stats.subjective.distribution.ungraded}
              </div>
            </div>
          </div>
        </section>
      )}

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
                onClick={() => generateInterviewReport()}
                disabled={loading}
                className="px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[12px] rounded-lg hover:from-indigo-600 hover:to-purple-600 disabled:opacity-70"
              >
                {loading ? `分析中 ${elapsedSec > 0 ? `${elapsedSec}s` : '…'}` : '🔮 AI 面试分析'}
              </button>
            )}
          </div>
          {loading && (
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-indigo-600">{progressMsg || '准备中…'}</span>
                <span className="text-[11px] text-slate-400">{progress}% · {elapsedSec}s</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress > 0 ? progress : 5}%` }}
                />
              </div>
              {streamContent && (
                <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-900 p-2.5">
                  <pre className="text-[10px] text-green-400 whitespace-pre-wrap break-all font-mono leading-relaxed">
                    {streamContent.slice(-2000)}
                  </pre>
                </div>
              )}
            </div>
          )}
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
                onClick={() => generate()}
                disabled={loading}
                className="px-3 py-1.5 bg-gradient-to-r from-sky-400 to-emerald-400 text-white text-[12px] rounded-lg hover:from-sky-500 hover:to-emerald-500 disabled:opacity-70"
              >
                {loading ? `生成中 ${elapsedSec > 0 ? `${elapsedSec}s` : '…'}` : '🔮 AI 生成报告'}
              </button>
            )}
          </div>
          {loading && (
            <div className="mb-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sky-600">{progressMsg || '准备中…'}</span>
                <span className="text-[11px] text-slate-400">{progress}% · {elapsedSec}s</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress > 0 ? progress : 5}%` }}
                />
              </div>
              {streamContent && (
                <div className="max-h-32 overflow-y-auto rounded-lg bg-slate-900 p-2.5">
                  <pre className="text-[10px] text-green-400 whitespace-pre-wrap break-all font-mono leading-relaxed">
                    {streamContent.slice(-2000)}
                  </pre>
                </div>
              )}
            </div>
          )}
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
