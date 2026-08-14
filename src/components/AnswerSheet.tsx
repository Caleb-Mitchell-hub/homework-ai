'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Highlight, themes } from 'prism-react-renderer';
import { Quiz, QuizResult } from '@/types';
import {
  isCorrect,
  formatCorrectAnswer,
  getReferenceAnswer,
} from '@/lib/answer-sheet-helpers';
import { SUBJECTIVE_TYPES } from '@/lib/score';
import AIExplainPanel from '@/components/AIExplainPanel';
import AIFollowUp from '@/components/AIFollowUp';
import ManualGradePanel from '@/components/ManualGradePanel';
import MarkdownView from '@/components/MarkdownView';
import NotePanel from '@/components/NotePanel';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/components/DialogProvider';

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
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [allOpen, setAllOpen] = useState(false);
  // 记录每道题的 AI 解析内容，供追问上下文使用
  const [explainContents, setExplainContents] = useState<Record<string, string>>({});
  const { token, user } = useAuth();
  const dialog = useDialog();
  // 笔记面板状态
  const [notePanelOpen, setNotePanelOpen] = useState(false);
  const [notePanelQId, setNotePanelQId] = useState<string | undefined>();
  const [notePreset, setNotePreset] = useState<{ content: string; source: 'ai_explain' | 'reference_answer' } | undefined>();
  // 正在 AI 评分的题目
  const [gradingQids, setGradingQids] = useState<Set<string>>(new Set());
  // 动态评分结果（用于即时显示，不必刷新页面）
  const [dynamicScores, setDynamicScores] = useState<Record<string, { interviewScore: number; interviewFeedback: any }>>({});

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

  const getRecord = (qid: string) => {
    const base = result.results.find((r) => r.questionId === qid);
    const dyn = dynamicScores[qid];
    if (dyn && base) {
      return { ...base, interviewScore: dyn.interviewScore, interviewFeedback: dyn.interviewFeedback };
    }
    return base;
  };

  /** 对单道面试题触发 AI 评分 */
  async function triggerGrade(questionId: string) {
    if (!token || !result?.id) return;
    if (user?.isGuest) {
      await dialog.alert({ title: '游客受限', message: '游客功能暂未开通，请登录使用 AI 评分' });
      return;
    }
    setGradingQids((prev) => new Set(prev).add(questionId));
    try {
      const res = await fetch('/api/ai/grade-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resultId: result.id, questionId }),
      });
      if (res.ok) {
        const data = await res.json();
        setDynamicScores((prev) => ({
          ...prev,
          [questionId]: { interviewScore: data.interviewScore, interviewFeedback: data.interviewFeedback },
        }));
      } else {
        const err = await res.json().catch(() => ({ error: 'AI 评分失败' }));
        await dialog.alert({ title: '评分失败', message: err.error || 'AI 评分失败' });
      }
    } catch {
      await dialog.alert({ title: '网络异常', message: 'AI 评分请求失败，请检查网络后重试' });
    } finally {
      setGradingQids((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  }

  /** 对已评分题目重新触发 AI 评分（带确认） */
  async function retriggerGrade(questionId: string) {
    const ok = await dialog.confirm({
      title: '重新评分',
      message: '将重新调用 AI 对该题评分，是否继续？',
      confirmText: '重新评分',
    });
    if (ok) await triggerGrade(questionId);
  }

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
        {result?.id && (
          <button
            onClick={() => router.push(`/result/${result.id}/report`)}
            className="text-[11px] text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded border border-emerald-200 hover:border-emerald-300 bg-emerald-50/50 transition-colors"
          >
            📊 查看报告
          </button>
        )}
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
                    <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>你的答案</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNotePanelQId(q.id);
                          setNotePreset(undefined);
                          setNotePanelOpen(true);
                        }}
                        className="text-[11px] text-indigo-500 hover:text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                        title="为此题记笔记"
                      >
                        笔记
                      </button>
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

                  {/* 主观题 AI 评分 — 兼容 interview / essay / code 三种类型 */}
                  {SUBJECTIVE_TYPES.has(q.type) && (
                    <div>
                      <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>AI 评分</span>
                        {/* 每题笔记入口 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setNotePanelQId(q.id);
                            setNotePreset(undefined);
                            setNotePanelOpen(true);
                          }}
                          className="text-[11px] text-indigo-500 hover:text-indigo-700 px-2 py-0.5 rounded border border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                          title="为此题记笔记"
                        >
                          笔记
                        </button>
                      </div>
                      {(() => {
                        const score = (r as any)?.interviewScore;
                        if (typeof score === 'number') {
                          return (
                            <div className="p-3 rounded-lg bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className={`text-xl font-bold ${
                                  score >= 80 ? 'text-emerald-600' :
                                  score >= 60 ? 'text-amber-600' :
                                  'text-red-500'
                                }`}>
                                  {score}<span className="text-sm font-normal text-slate-400">/100</span>
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); retriggerGrade(q.id); }}
                                  disabled={gradingQids.has(q.id)}
                                  className="text-[11px] text-indigo-500 hover:text-indigo-700 underline disabled:opacity-50"
                                >
                                  {gradingQids.has(q.id) ? '评分中…' : '🔄 重新评分'}
                                </button>
                              </div>
                              {(r as any)?.interviewFeedback?.strengths?.length > 0 && (
                                <div className="text-[12px]">
                                  <span className="text-emerald-600 font-medium">✅ 亮点：</span>
                                  {(r as any).interviewFeedback.strengths.map((s: string, i: number) => (
                                    <span key={i} className="text-slate-600">{s}{i < (r as any).interviewFeedback.strengths.length - 1 ? '；' : ''}</span>
                                  ))}
                                </div>
                              )}
                              {(r as any)?.interviewFeedback?.weaknesses?.length > 0 && (
                                <div className="text-[12px]">
                                  <span className="text-amber-600 font-medium">⚠️ 不足：</span>
                                  {(r as any).interviewFeedback.weaknesses.map((w: string, i: number) => (
                                    <span key={i} className="text-slate-600">{w}{i < (r as any).interviewFeedback.weaknesses.length - 1 ? '；' : ''}</span>
                                  ))}
                                </div>
                              )}
                              {(r as any)?.interviewFeedback?.suggestion && (
                                <div className="text-[12px]">
                                  <span className="text-blue-600 font-medium">💡 建议：</span>
                                  <div className="text-slate-600 mt-0.5">
                                    <MarkdownView content={(r as any).interviewFeedback.suggestion} size="sm" />
                                  </div>
                                </div>
                              )}
                              {(r as any)?.aiComment && (
                                <div className="mt-2 pt-2 border-t border-indigo-100">
                                  <MarkdownView content={(r as any).aiComment} size="sm" />
                                </div>
                              )}
                            </div>
                          );
                        }
                        // 无评分 → 显示触发按钮
                        const isGrading = gradingQids.has(q.id);
                        return (
                          <div className="p-3 rounded-lg bg-amber-50/50 border border-dashed border-amber-200 text-center">
                            <p className="text-[12px] text-amber-600 mb-2">暂未评分</p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerGrade(q.id);
                              }}
                              disabled={isGrading}
                              className="px-4 py-1.5 text-[12px] bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                            >
                              {isGrading ? (
                                <span className="flex items-center gap-1.5">
                                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                  </svg>
                                  AI 评分中...
                                </span>
                              ) : (
                                'AI 评分'
                              )}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}

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
                      {q.type === 'interview' && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[9.5px] tracking-wider">
                          面试
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

                  {/* AI 解析 - 错题 + 主观题显示 (主观题无法自动判对错, 始终提供 AI 解析) */}
                  {token && correct !== true && (
                    <div className="pt-2 border-t border-slate-200/60">
                      <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-1.5">AI 解析</div>
                      <AIExplainPanel
                        questionId={q.id}
                        questionContent={q.title}
                        questionType={q.type}
                        userAnswer={userAnswer}
                        correctAnswer={correctText}
                        options={(q as any).options}
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

                  {/* 人工批阅 - 仅主观题(essay/code, interview 由 AI 自动打分) */}
                  {(q.type === 'essay' || q.type === 'code') && result?.id && (
                    <ManualGradePanel
                      resultId={result.id}
                      questionId={q.id}
                      item={{
                        questionId: q.id,
                        userAnswer,
                        correct: !!correct,
                        autoGraded: false,
                        manualScore: r?.manualScore,
                        manualComment: r?.manualComment,
                        manualGradedBy: r?.manualGradedBy,
                        manualGradedAt: r?.manualGradedAt,
                      }}
                    />
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

      {/* 每题笔记面板 */}
      <NotePanel
        open={notePanelOpen}
        onClose={() => { setNotePanelOpen(false); setNotePreset(undefined); }}
        questionId={notePanelQId}
        quizId={quiz.id}
        resultId={result?.id}
        presetContent={notePreset?.content}
        presetSource={notePreset?.source}
      />
    </div>
  );
}
