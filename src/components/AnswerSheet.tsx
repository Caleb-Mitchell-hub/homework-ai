'use client';

import { useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { Quiz, QuizResult } from '@/types';
import {
  isCorrect,
  formatCorrectAnswer,
  getReferenceAnswer,
} from '@/lib/answer-sheet-helpers';
import AIExplainPanel from '@/components/AIExplainPanel';
import AIFollowUp from '@/components/AIFollowUp';
import MarkdownView from '@/components/MarkdownView';
import { useAuth } from '@/contexts/AuthContext';

const typeNames: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  boolean: '判断题',
  fill: '填空题',
  essay: '简答题',
  code: '代码题',
  interview: '面试题',
};

/**
 * 提交后的"答案速查"视图
 * - 每题默认折叠，但题目标题旁直接显示：
 *   · 题型标签
 *   · 对错标记（✓ / ✗）
 *   · 正确答案（点击右侧 ⌄ 可展开详情）
 * - 点开可看：题目内容 / 你的作答 / 参考答案（高亮 / 纯文本）
 * - 顶部"全部展开 / 全部收起"快捷
 */
export default function AnswerSheet({ quiz, result }: { quiz: Quiz; result: QuizResult }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allOpen, setAllOpen] = useState(false);
  // 记录每道题的 AI 解析内容，供追问上下文使用
  const [explainContents, setExplainContents] = useState<Record<string, string>>({});
  const { token } = useAuth();

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
          // 参考答案/解析 —— 用 helper 统一取数,兼容 AI 解析(q.answer=解析文字)
          // 和旧题库(q.answer=答案)两种情况
          const refAnswer = getReferenceAnswer(q);
          // 简答/代码题的参考答案可能为多行代码块
          const isCode = q.type === 'code';
          const isEssay = q.type === 'essay';
          // 代码语言：优先取题目的 language 字段
          const codeLang = isCode ? (q as any).language || 'plaintext' : 'plaintext';
          // 真正的"无答案"判断（trim 后为空）
          const hasRef = !!refAnswer && refAnswer.trim().length > 0;
          // 对错判定(主观题 = undefined)
          const correct = isCorrect(q, userAnswer);
          const correctText = formatCorrectAnswer(q);

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
                <span
                  className="flex-1 min-w-0 text-[13px] text-slate-700 leading-snug line-clamp-2"
                  title={q.title}
                >
                  {q.title}
                </span>
                {/* 对错标记 */}
                {correct === true && (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-medium flex-shrink-0">
                    ✓ 正确
                  </span>
                )}
                {correct === false && (
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-medium flex-shrink-0">
                    ✗ 错误
                  </span>
                )}
                {correct === undefined && (
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] flex-shrink-0">
                    主观
                  </span>
                )}
                {/* 正确答案(短文本) */}
                {hasRef && correctText && (
                  <span
                    className="hidden sm:inline-block max-w-[140px] truncate text-[11px] text-slate-500 font-mono px-2 py-0.5 bg-slate-50 border border-slate-200 rounded flex-shrink-0"
                    title={correctText}
                  >
                    答: {correctText}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 tracking-wider uppercase flex-shrink-0 hidden md:inline">
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
                  {/* 注:题目标题已在折叠题头里展示(完整版本可 hover title 查看),
                      展开区不再重复显示,避免冗余 */}

                  {/* 原始选项(单选/多选) */}
                  {(q.type === 'single' || q.type === 'multiple') &&
                    Array.isArray((q as any).options) &&
                    (q as any).options.length > 0 && (
                      <div>
                        <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-1.5">
                          选项
                        </div>
                        <ul className="space-y-1.5">
                          {((q as any).options as string[]).map((opt, idx) => {
                            // 选项字母 A/B/C/...
                            const letter = String.fromCharCode(65 + idx);
                            // 是否为正确答案 —— 用 correctAnswer,而不是 q.answer
                            // (AI 解析时 q.answer 是解析文字)
                            const correctLetters: string[] = (
                              String((q as any).correctAnswer ?? '').toUpperCase().match(
                                /[A-Z]/g
                              ) ?? []
                            );
                            const isCorrectOpt = correctLetters.includes(letter);
                            // 用户是否选了此项 —— 兼容 "AC" / "A,C" 两种写法
                            const userPickedLetters: string[] = userAnswer
                              ? userAnswer.toUpperCase().match(/[A-Z]/g) ?? []
                              : [];
                            const userPicked = userPickedLetters.includes(letter);
                            // 视觉样式
                            let cls = 'bg-slate-50 border-slate-200 text-slate-700';
                            let badge: React.ReactNode = null;
                            if (isCorrectOpt && userPicked) {
                              cls = 'bg-emerald-50 border-emerald-300 text-emerald-800';
                              badge = (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9.5px]">
                                  ✓ 你选对了
                                </span>
                              );
                            } else if (isCorrectOpt) {
                              cls = 'bg-emerald-50 border-emerald-300 text-emerald-800';
                              badge = (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9.5px]">
                                  ✓ 正确答案
                                </span>
                              );
                            } else if (userPicked) {
                              cls = 'bg-rose-50 border-rose-300 text-rose-800 line-through';
                              badge = (
                                <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9.5px]">
                                  ✗ 你的错选
                                </span>
                              );
                            }
                            return (
                              <li
                                key={letter}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[13px] ${cls}`}
                              >
                                <span className="w-5 h-5 rounded-full border border-current/30 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                                  {letter}
                                </span>
                                <span className="flex-1 min-w-0"><MarkdownView content={opt} size="base" /></span>
                                {badge}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                  {/* 判断题:显示 true/false + 标记 */}
                  {q.type === 'boolean' && (
                    <div>
                      <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-1.5">
                        判断
                      </div>
                      <div className="flex gap-2">
                        {(['正确', '错误'] as const).map((label, idx) => {
                          const val = idx === 0 ? 'true' : 'false';
                          // 用 correctAnswer,而不是 q.answer(AI 解析时存的是解析)
                          const isCorrectOpt = String(
                            (q as any).correctAnswer ?? ''
                          ).toLowerCase() === val;
                          const userPicked = userAnswer.toLowerCase() === val;
                          let cls = 'bg-slate-50 border-slate-200 text-slate-700';
                          let tag: React.ReactNode = null;
                          if (isCorrectOpt && userPicked) {
                            cls = 'bg-emerald-50 border-emerald-300 text-emerald-800';
                            tag = <span className="text-[10px]">✓ 你选对了</span>;
                          } else if (isCorrectOpt) {
                            cls = 'bg-emerald-50 border-emerald-300 text-emerald-800';
                            tag = <span className="text-[10px]">✓ 正确答案</span>;
                          } else if (userPicked) {
                            cls = 'bg-rose-50 border-rose-300 text-rose-800';
                            tag = <span className="text-[10px]">✗ 你的错选</span>;
                          }
                          return (
                            <div
                              key={val}
                              className={`flex-1 px-3 py-2 rounded-lg border text-[13px] flex items-center justify-between ${cls}`}
                            >
                              <span>{label}</span>
                              {tag}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
                        <div className="text-[13px] leading-relaxed text-slate-700 px-3 py-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
                          <MarkdownView content={refAnswer} size="base" />
                        </div>
                      )
                    ) : (
                      <div className="text-[12px] text-slate-400 italic px-3 py-2 rounded-lg bg-slate-50/40 border border-dashed border-slate-200">
                        （本题暂无参考答案 — {isCode ? '请参考题目输入/输出样例自行核对' : isEssay ? '请与同学或老师讨论评分要点' : '出题人未提供'}）
                      </div>
                    )}
                  </div>

                  {/* AI 解析 - 仅错题显示 */}
                  {correct === false && token && (
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-1.5">AI 解析</div>
                      <AIExplainPanel
                        questionId={q.id}
                        questionContent={q.title}
                        questionType={q.type}
                        onNeedCredits={(req, bal) => {
                          alert(`积分不足: 需要 ${req} 积分, 当前 ${bal} 积分。请前往 /credits 充值`);
                          window.location.href = '/credits';
                        }}
                        onDone={(content) => {
                          setExplainContents((prev) => ({ ...prev, [q.id]: content }));
                        }}
                      />
                    </div>
                  )}

                  {/* 追问入口 - 所有题型都可追问 */}
                  <div className="pt-2 border-t border-slate-200/60">
                    <AIFollowUp
                      questionId={q.id}
                      questionContent={q.title}
                      questionType={q.type}
                      answer={refAnswer}
                      aiExplanation={explainContents[q.id]}
                    />
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
