'use client';

import { useMemo } from 'react';
import type { Question } from '@/types';

/**
 * 答题状态侧边栏 —— 紧凑编号网格
 *
 *  - 顶部：仅一行「已答 X/Y」
 *  - 主体：纯题号网格（每行 5 个，已答用蓝色实心，未答用浅色描边）
 *  - 点击跳转到对应题
 *  - lg 屏起显示，窄屏隐藏
 */
export default function QuizSidebar({
  questions,
  answers,
}: {
  questions: Question[];
  answers: Record<string, string>;
}) {
  const stats = useMemo(() => {
    return questions.map((q, i) => {
      const a = (answers[q.id] ?? '').trim();
      return { id: q.id, index: i, answered: a.length > 0 };
    });
  }, [questions, answers]);

  const answered = stats.filter((s) => s.answered).length;
  const total = stats.length;
  const ratio = total ? Math.round((answered / total) * 100) : 0;

  const jumpTo = (qid: string) => {
    const el = document.getElementById(`q-${qid}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <aside
      className="hidden lg:block sticky top-[120px] self-start w-[260px] flex-shrink-0 max-h-[calc(100vh-140px)] overflow-y-auto rounded-2xl border border-slate-200/70 bg-white/85 backdrop-blur-sm shadow-sm"
      aria-label="答题状态"
    >
      {/* 顶部：单行进度 + 百分比 */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <span
          className="text-[11px] tracking-[0.2em] uppercase text-slate-400"
          style={{ fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic' }}
        >
          Status
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15px] font-semibold text-sky-500 tabular-nums">
            {answered}
          </span>
          <span className="text-[11px] text-slate-400 tabular-nums">/ {total}</span>
          <span className="text-[11px] text-slate-300 tabular-nums">· {ratio}%</span>
        </div>
      </div>

      {/* 细线进度条 */}
      <div className="h-[2px] bg-slate-100">
        <div
          className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-500 ease-out"
          style={{ width: `${ratio}%` }}
        />
      </div>

      {/* 编号网格 */}
      <div className="px-3 py-3">
        <div className="grid grid-cols-5 gap-1.5">
          {stats.map((s) => (
            <button
              key={s.id}
              onClick={() => jumpTo(s.id)}
              title={s.answered ? `第 ${s.index + 1} 题 · 已答` : `第 ${s.index + 1} 题 · 未答`}
              className={`aspect-square rounded-md flex items-center justify-center text-[12px] font-medium tabular-nums transition-all ${
                s.answered
                  ? 'bg-sky-400 text-white hover:bg-sky-500 shadow-sm'
                  : 'bg-slate-50 text-slate-400 border border-slate-200 hover:border-sky-300 hover:text-sky-500'
              }`}
            >
              {s.index + 1}
            </button>
          ))}
        </div>
      </div>

      {/* 底部：图例 + 状态文字 */}
      <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-400" />
          <span>已答</span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-50 border border-slate-200" />
          <span>未答</span>
        </div>
        {total - answered > 0 ? (
          <span className="text-slate-400 tabular-nums">余 {total - answered}</span>
        ) : (
          <span className="text-emerald-500">完成</span>
        )}
      </div>
    </aside>
  );
}
