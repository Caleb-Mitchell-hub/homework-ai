'use client';

import { useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { Quiz, QuizResult } from '@/types';

const typeNames: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  boolean: '判断题',
  fill: '填空题',
  essay: '简答题',
  code: '代码题',
};

/**
 * 提交后的"答案速查"视图
 * - 没有任何批改对错信息、分数、得分率
 * - 每题默认折叠，点开可看：
 *   · 题目内容
 *   · 你的作答
 *   · 参考答案（所有题型都展示，包括 essay / code）
 * - 顶部"全部展开 / 全部收起"快捷
 */
export default function AnswerSheet({ quiz, result }: { quiz: Quiz; result: QuizResult }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allOpen, setAllOpen] = useState(false);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allOpen) {
      setExpanded(new Set());
      setAllOpen(false);
    } else {
      setExpanded(new Set(quiz.questions.map((q) => q.id)));
      setAllOpen(true);
    }
  };

  const getRecord = (qid: string) => result.results.find((r) => r.questionId === qid);

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      {/* 顶部工具条 */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400">
          Answer Sheet · 答案速查
        </div>
        <button
          onClick={toggleAll}
          className="text-[11px] text-slate-500 hover:text-sky-500 px-2 py-1 rounded border border-slate-200 hover:border-sky-300 bg-white/70 transition-colors"
        >
          {allOpen ? '全部收起' : '全部展开'}
        </button>
      </div>

      <ul className="space-y-2.5">
        {quiz.questions.map((q, i) => {
          const r = getRecord(q.id);
          const isOpen = expanded.has(q.id);
          const userAnswer = r?.userAnswer || '';
          // 简答题：用 referenceAnswer 兜底；其他题用 answer
          const refAnswer =
            q.type === 'essay'
              ? ((q as any).referenceAnswer ?? q.answer ?? '')
              : q.answer ?? '';
          // 简答/代码题的参考答案可能为多行代码块
          const isCode = q.type === 'code';
          const isEssay = q.type === 'essay';
          // 代码语言：优先取题目的 language 字段
          const codeLang = isCode ? (q as any).language || 'plaintext' : 'plaintext';
          // 真正的"无答案"判断（trim 后为空）
          const hasRef = !!refAnswer && refAnswer.trim().length > 0;

          return (
            <li
              key={q.id}
              className="bg-white/80 border border-slate-200/60 rounded-xl shadow-sm overflow-hidden"
            >
              <button
                onClick={() => toggle(q.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white transition-colors"
              >
                <span
                  className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                >
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0 truncate text-[13px] text-slate-700">
                  {q.title}
                </span>
                <span className="text-[10px] text-slate-400 tracking-wider uppercase flex-shrink-0">
                  {typeNames[q.type] || q.type}
                </span>
                <span
                  className="text-slate-300 transition-transform flex-shrink-0"
                  style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-slate-200/60 space-y-3">
                  {/* 题目完整内容（防截断） */}
                  <p className="text-[13.5px] text-slate-800 leading-relaxed whitespace-pre-wrap">
                    {q.title}
                  </p>

                  {/* 你的答案 */}
                  <div>
                    <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-1.5">
                      你的答案
                    </div>
                    {isCode ? (
                      // 代码题作答区：等宽字体 + 浅灰底
                      <pre
                        className={`text-[12.5px] leading-relaxed whitespace-pre-wrap px-3 py-2 rounded-lg border font-mono overflow-x-auto ${
                          userAnswer
                            ? 'bg-slate-50 border-slate-200 text-slate-700'
                            : 'bg-slate-50/40 border-dashed border-slate-200 text-slate-400 italic'
                        }`}
                      >
                        {userAnswer || '（未作答）'}
                      </pre>
                    ) : (
                      <div
                        className={`text-[13px] leading-relaxed whitespace-pre-wrap px-3 py-2 rounded-lg border ${
                          userAnswer
                            ? 'bg-slate-50 border-slate-200 text-slate-700'
                            : 'bg-slate-50/40 border-dashed border-slate-200 text-slate-400 italic'
                        }`}
                      >
                        {userAnswer || '（未作答）'}
                      </div>
                    )}
                  </div>

                  {/* 参考答案 —— 所有题型统一展示 */}
                  <div>
                    <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-1.5 flex items-center gap-1.5">
                      参考答案
                      {isCode && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-600 text-[9.5px] tracking-wider">
                          {codeLang}
                        </span>
                      )}
                      {isEssay && (
                        <span className="px-1.5 py-0.5 rounded bg-pink-50 text-pink-600 text-[9.5px] tracking-wider">
                          简答
                        </span>
                      )}
                    </div>
                    {hasRef ? (
                      isCode ? (
                        // 代码题参考答案：高亮代码块
                        <Highlight
                          theme={themes.nightOwl}
                          code={refAnswer}
                          language={codeLang as any}
                        >
                          {({ className, style, tokens, getLineProps, getTokenProps }) => (
                            <pre
                              className={`${className} px-3 py-2 rounded-lg text-[12.5px] leading-relaxed overflow-x-auto border border-cyan-200/60`}
                              style={style}
                            >
                              {tokens.map((line, i) => (
                                <div key={i} {...getLineProps({ line })}>
                                  {line.map((token, key) => (
                                    <span key={key} {...getTokenProps({ token })} />
                                  ))}
                                </div>
                              ))}
                            </pre>
                          )}
                        </Highlight>
                      ) : (
                        // 简答题/其他题：白底纯文本
                        <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-slate-700 px-3 py-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
                          {refAnswer}
                        </div>
                      )
                    ) : (
                      <div className="text-[12px] text-slate-400 italic px-3 py-2 rounded-lg bg-slate-50/40 border border-dashed border-slate-200">
                        （本题暂无参考答案 — {isCode ? '请参考题目输入/输出样例自行核对' : isEssay ? '请与同学或老师讨论评分要点' : '出题人未提供'}）
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
