'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories } from '@/contexts/CategoryContext';
import { gradeQuiz } from '@/lib/checker';
import { Quiz, Answer, Question } from '@/types';
import QuestionCard from '@/components/QuestionCard';
import ResultCard from '@/components/ResultCard';
import AnswerSheet from '@/components/AnswerSheet';
import CategorySelect from '@/components/CategorySelect';
import Toast from '@/components/Toast';
import QuizSidebar from '@/components/QuizSidebar';
import HistorySwitcher from '@/components/HistorySwitcher';
import NotePanel from '@/components/NotePanel';

export default function QuizPage() {
  const params = useParams();
  const router = useRouter();
  const { token: userToken, user } = useAuth();
  // 兼容 admin 登录：admin 的 token 存在 localStorage.adminToken，userToken 拿不到
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(userToken || (typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null));
  }, [userToken]);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draftName, setDraftName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 同步提交锁：ref 即时生效，防止异步 state 更新间隙的重复提交
  const submittingRef = useRef(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [quizName, setQuizName] = useState('');
  const [dialogMode, setDialogMode] = useState<'draft' | 'submit'>('draft');
  // 暂存/提交弹窗里选中的分类 id（null = 未分类）
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  // 倒计时（秒）—— null 表示无限制
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  // 是否已自动提交（避免重复弹窗）
  const autoSubmittedRef = useRef(false);
  // 5 分钟 / 1 分钟提醒已触发过(避免重复弹)
  const warned5minRef = useRef(false);
  const warned1minRef = useRef(false);
  // 笔记面板
  const [notePanelOpen, setNotePanelOpen] = useState(false);
  // 提交后自动逐题 AI 评分
  const [autoGrading, setAutoGrading] = useState(false);
  const [autoGradeProgress, setAutoGradeProgress] = useState({ done: 0, total: 0 });

  const cat = useCategories();

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
  };

  useEffect(() => {
    const id = params.id as string;
    if (!token) return;

    const fetchQuiz = async () => {
      try {
        const res = await fetch(`/api/quizzes/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && data.quiz) {
          setQuiz(data.quiz);
          // 初始化倒计时
          if (data.quiz.timeLimit && data.quiz.timeLimit > 0) {
            setRemainingSec(data.quiz.timeLimit * 60);
          } else {
            setRemainingSec(null);
          }
        } else {
          router.push('/');
        }
      } catch {
        router.push('/');
      }
    };

    fetchQuiz();
  }, [params.id, token, router]);

  // 加载现有结果(draft 优先 → submitted),恢复答案 / 名称 / 分类
  useEffect(() => {
    if (!quiz || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/results?quizId=${quiz.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const list: any[] = data.results || [];
        if (cancelled || list.length === 0) return;
        // 优先取 draft(没 draft 才取最新的 submitted,用于"重答已提交"场景)
        const draft = list.find((r) => r.status === 'draft');
        const latest = draft ?? list[0];
        // 还原 answers
        const restored: Record<string, string> = {};
        for (const item of latest.results || []) {
          if (item?.questionId && typeof item.userAnswer === 'string') {
            restored[item.questionId] = item.userAnswer;
          }
        }
        setAnswers(restored);
        // 名称:Quiz.defaultName 优先,否则用结果名
        if (quiz.defaultName) setQuizName(quiz.defaultName);
        else if (latest.name) setQuizName(latest.name);
        // 分类
        if (quiz.defaultCategoryId) setSelectedCategoryId(quiz.defaultCategoryId);
        // 记录结果名,供 doSubmit fallback 使用
        if (latest.name) setDraftName(latest.name);
      } catch (e) {
        console.error('加载 draft 失败:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [quiz, token]);

  // 答题进度自动保存
  useEffect(() => {
    if (quiz && Object.keys(answers).length > 0) {
      localStorage.setItem(`quiz_progress_${quiz.id}`, JSON.stringify(answers));
    }
  }, [answers, quiz]);

  // 注:不要在弹窗打开时重置 selectedCategoryId。
  // 该值在初始加载时已经从 quiz.defaultCategoryId 恢复(见上面 useEffect)，
  // 重置会把"上次保存的分类"清掉,迫使用户每次重选。
  // 如需清空,让用户在 CategorySelect 里手动选"未分类"。

  // 倒计时
  useEffect(() => {
    if (remainingSec == null || submitted) return;
    // 5 分钟提醒(只在原时长 ≥ 6 分钟时提醒)
    if (
      quiz?.timeLimit && quiz.timeLimit >= 6 &&
      remainingSec === 300 && !warned5minRef.current
    ) {
      warned5minRef.current = true;
      showToast('还剩 5 分钟');
    }
    // 1 分钟提醒
    if (remainingSec === 60 && !warned1minRef.current) {
      warned1minRef.current = true;
      showToast('还剩 1 分钟，请注意时间');
    }
    if (remainingSec <= 0) {
      // 时间到 → 自动提交
      if (!autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        showToast('时间到，自动提交');
        // 直接走提交逻辑，跳过命名对话框
        doSubmit(true);
      }
      return;
    }
    const t = setTimeout(() => setRemainingSec((s) => (s == null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, submitted, quiz]);

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const handleSaveDraft = () => {
    if (!quiz) return;
    // 有名称 + 分类时跳过对话框(默认值或 draft 已恢复)
    if (quizName.trim() && selectedCategoryId) {
      confirmAction('draft');
      return;
    }
    setDialogMode('draft');
    setShowNameDialog(true);
  };

  const handleSubmit = async () => {
    if (!quiz) return;
    if (quizName.trim() && selectedCategoryId) {
      // 跳过对话框,直接提交
      confirmAction('submit');
      return;
    }
    setDialogMode('submit');
    setShowNameDialog(true);
  };

  /**
   * 真实提交动作（被对话框确认 / 自动超时 调用）
   * @param skipDialog 跳过命名对话框（自动提交场景）
   */
  const doSubmit = async (skipDialog: boolean = false) => {
    if (!quiz || !token || submittingRef.current) return;
    submittingRef.current = true;
    if (!skipDialog) {
      setShowNameDialog(false);
    }
    setIsSubmitting(true);

    const answerList = quiz.questions.map((q: Question) => ({
      questionId: q.id,
      userAnswer: answers[q.id] || '',
      correct: false,
    }));

    const gradedResult = gradeQuiz(
      quiz.questions,
      answerList.map((a) => ({ questionId: a.questionId, answer: a.userAnswer }))
    );

    try {
      const res = await fetch('/api/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          quizId: quiz.id,
          name:
            quizName.trim() ||
            draftName ||
            `${quiz.title}_${new Date().toLocaleDateString('zh-CN')}`,
          score: gradedResult.score,
          totalScore: gradedResult.totalScore,
          results: gradedResult.results,
          status: 'submitted',
          defaultName: quizName.trim() || undefined,
          defaultCategoryId: selectedCategoryId || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('currentQuizId', quiz.id);
        localStorage.removeItem(`quiz_progress_${quiz.id}`);
        setQuizName('');
        setDraftName('');
        // 防御性 parse：万一后端忘了 parse，前端也不会崩
        if (typeof data.result.results === 'string') {
          try {
            data.result.results = JSON.parse(data.result.results);
          } catch {
            data.result.results = [];
          }
        }
        // ★ 归入分类（仅当用户选了）
        if (selectedCategoryId && data.result?.id) {
          cat.setResultCategory(data.result.id, selectedCategoryId);
        }
        setResult(data.result);
        setSubmitted(true);
      }
    } catch (error) {
      console.error('提交失败:', error);
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const confirmAction = async (mode?: 'draft' | 'submit') => {
    if (!quiz || !token || submittingRef.current) return;
    const actionMode = mode || dialogMode;
    submittingRef.current = true;

    const answerList = quiz.questions.map((q: Question) => ({
      questionId: q.id,
      userAnswer: answers[q.id] || '',
      correct: false,
    }));

    const gradedResult = gradeQuiz(
      quiz.questions,
      answerList.map((a) => ({ questionId: a.questionId, answer: a.userAnswer }))
    );

    if (actionMode === 'draft') {
      try {
        const res = await fetch('/api/results', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            quizId: quiz.id,
            name:
              quizName.trim() ||
              draftName ||
              `${quiz.title}_${new Date().toLocaleDateString('zh-CN')}`,
            score: gradedResult.score,
            totalScore: gradedResult.totalScore,
            results: gradedResult.results,
            status: 'draft',
            defaultName: quizName.trim() || undefined,
            defaultCategoryId: selectedCategoryId || undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          // ★ 归入分类（仅当用户选了）
          if (selectedCategoryId && data.result?.id) {
            cat.setResultCategory(data.result.id, selectedCategoryId);
          }
          setDraftName(data.result.name);
          setShowNameDialog(false);
          setQuizName('');
          showToast('进度已暂存');
        }
      } catch (error) {
        console.error('暂存失败:', error);
      } finally {
        submittingRef.current = false;
      }
    } else {
      // 释放锁让 doSubmit 重新获取（confirmAction 与 doSubmit 各自持锁，避免死锁）
      submittingRef.current = false;
      doSubmit(true);
    }
  };

  const handleReset = () => {
    setAnswers({});
    setSubmitted(false);
    setResult(null);
    setRemainingSec(quiz?.timeLimit && quiz.timeLimit > 0 ? quiz.timeLimit * 60 : null);
    autoSubmittedRef.current = false;
    if (quiz) {
      localStorage.removeItem(`quiz_progress_${quiz.id}`);
    }
  };

  // 提交后自动逐题 AI 评分（不阻塞页面，逐题进行）
  useEffect(() => {
    if (!submitted || !result?.id || !token || user?.isGuest || autoGrading) return;
    const items = result.results || [];
    const needGrade = items.filter((item: any) => {
      const q = quiz?.questions.find((qq: Question) => qq.id === item.questionId);
      return q && (q.type === 'interview' || q.type === 'essay') && typeof item.interviewScore !== 'number';
    });
    if (needGrade.length === 0) return;

    setAutoGrading(true);
    setAutoGradeProgress({ done: 0, total: needGrade.length });

    let cancelled = false;
    (async () => {
      for (let i = 0; i < needGrade.length; i++) {
        if (cancelled) break;
        const item = needGrade[i];
        try {
          const res = await fetch('/api/ai/grade-interview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ resultId: result.id, questionId: item.questionId }),
          });
          if (res.ok) {
            const data = await res.json();
            setResult((prev: any) => {
              const updated = { ...prev };
              const results = [...(updated.results || [])];
              const idx = results.findIndex((r: any) => r.questionId === item.questionId);
              if (idx >= 0) {
                results[idx] = {
                  ...results[idx],
                  interviewScore: data.interviewScore,
                  interviewFeedback: data.interviewFeedback,
                };
              }
              updated.results = results;
              return updated;
            });
          }
        } catch { /* 继续下一题 */ }
        if (!cancelled) {
          setAutoGradeProgress({ done: i + 1, total: needGrade.length });
        }
      }
      if (!cancelled) setAutoGrading(false);
    })();
    return () => { cancelled = true; };
  }, [submitted, result?.id, token]);

  const answeredCount = Object.keys(answers).filter(k => answers[k]).length;

  // 倒计时展示
  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const lowTime = remainingSec != null && remainingSec <= 60;

  if (!quiz) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // 提交后：只显示答案视图（无批改）
  if (submitted && result) {
    return (
      <div className="w-full">
        {/* 返回首页 */}
        <div className="w-full px-4 pt-4 max-w-4xl mx-auto">
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-slate-500 hover:text-slate-800 hover:bg-white/70 rounded-lg transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回首页
          </button>
        </div>

        <div className="w-full px-4 py-10">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <div className="text-[10.5px] tracking-[0.25em] uppercase text-sky-500/80 font-medium mb-2">
                Submitted
              </div>
              <h1
                className="text-[28px] leading-tight text-slate-800 mb-1.5"
                style={{ fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic', fontWeight: 500 }}
              >
                答案速查
              </h1>
              <p className="text-slate-500 text-sm">
                {quiz.title} · 共 {quiz.questions.length} 题 ·{' '}
                {result.name}
              </p>
            </div>
          </div>
        </div>

        <AnswerSheet quiz={quiz} result={result} />

        <div className="w-full px-4 pb-12 flex gap-4 justify-center">
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            重新答题
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 transition-all shadow-md shadow-sky-200"
          >
            上传新文件
          </button>
        </div>

        {/* 笔记面板 */}
        <NotePanel
          open={notePanelOpen}
          onClose={() => setNotePanelOpen(false)}
          quizId={quiz.id}
          resultId={result?.id}
        />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen pb-24">
      <div className="px-4 py-8 max-w-7xl mx-auto">
        {/* ★ Sticky 顶部(高度 ≤ 视口 15%)：紧凑单行 [返回+标题] · [倒计时] · [进度+已答/总题数] */}
        <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-2.5 bg-gradient-to-b from-sky-50/95 via-sky-50/80 to-white/0 backdrop-blur-sm">
          {/* 单行：返回+标题  |  倒计时  |  进度 */}
          <div className="flex items-center gap-3 h-[15vh] min-h-[60px] max-h-[120px]">
            <button
              onClick={() => router.push('/')}
              title="返回"
              className="flex-shrink-0 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-all flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <h1
              className="flex-1 min-w-0 text-[15px] font-semibold text-slate-800 truncate"
              title={quiz.title}
            >
              {quiz.title}
            </h1>

            {/* 倒计时（仅有限时） */}
            {remainingSec != null ? (
              <div
                className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border tabular-nums text-[12px] font-medium ${
                  lowTime
                    ? 'bg-rose-50 border-rose-300 text-rose-600 animate-pulse'
                    : 'bg-white/80 border-slate-200 text-slate-700'
                }`}
                title="剩余时间"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
                  <path strokeWidth={1.8} strokeLinecap="round" d="M12 7v5l3 2" />
                </svg>
                {formatTime(remainingSec)}
              </div>
            ) : (
              <span className="flex-shrink-0 px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-[11px] font-medium">
                ⏱ 不限时
              </span>
            )}

            {/* 历史切换器(在有 ≥1 份 submitted 时显示) */}
            <HistorySwitcher
              quizId={quiz.id}
              onSelect={async (item) => {
                const res = await fetch(`/api/results?quizId=${quiz.id}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                const target = (data.results ?? []).find((r: any) => r.id === item.id);
                if (target) {
                  if (typeof target.results === 'string') {
                    try {
                      target.results = JSON.parse(target.results);
                    } catch {
                      target.results = [];
                    }
                  }
                  setResult(target);
                  setSubmitted(true);
                }
              }}
            />

            {/* 进度环：X / Y · 进度条 */}
            <div className="flex-shrink-0 flex items-center gap-1.5">
              <div
                className="tabular-nums text-[12.5px] font-semibold text-sky-500"
                title="已答 / 总题"
              >
                {answeredCount}
                <span className="text-slate-300 font-normal"> / {quiz.questions.length}</span>
              </div>
              {/* 微型进度条 */}
              <div className="w-12 h-1 bg-slate-200/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
                  style={{
                    width: `${
                      quiz.questions.length > 0
                        ? Math.round((answeredCount / quiz.questions.length) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* 限时进度条(仅限时) */}
          {quiz.timeLimit && quiz.timeLimit > 0 && remainingSec != null && (
            <div className="h-[2px] bg-slate-200/60 rounded-full overflow-hidden -mt-0.5">
              <div
                className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                  lowTime
                    ? 'bg-gradient-to-r from-rose-400 to-rose-500'
                    : 'bg-gradient-to-r from-sky-400 to-emerald-400'
                }`}
                style={{
                  width: `${Math.max(0, Math.min(100, ((quiz.timeLimit * 60 - remainingSec) / (quiz.timeLimit * 60)) * 100))}%`,
                }}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-4">
            {quiz.questions.map((q: Question, i: number) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                userAnswer={answers[q.id] || ''}
                onChange={handleAnswerChange}
              />
            ))}
          </div>

          <QuizSidebar questions={quiz.questions} answers={answers} />
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex justify-center gap-3 z-50">
        <button
          type="button"
          onClick={() => document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="px-4 py-3 bg-white/90 backdrop-blur text-slate-600 rounded-xl hover:bg-white border border-slate-200 shadow-md"
        >
          置顶
        </button>
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isSubmitting}
          className="px-6 py-3 bg-amber-400 text-white rounded-xl hover:bg-amber-500 shadow-md shadow-amber-200 disabled:opacity-50"
        >
          暂存进度
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="px-8 py-3 bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 shadow-md shadow-sky-200 disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              AI 评分中...
            </span>
          ) : (
            '提交答案'
          )}
        </button>
      </div>

      {showNameDialog && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-slate-800 text-lg font-bold mb-4">
              {dialogMode === 'draft' ? '暂存答题进度' : '确认提交答案'}
            </h3>
            <input
              type="text"
              value={quizName}
              onChange={(e) => setQuizName(e.target.value)}
              placeholder={draftName || `${quiz.title}_${new Date().toLocaleDateString('zh-CN')}`}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 mb-3"
            />
            {/* ★ 保存到分类 */}
            <div className="mb-4">
              <label className="block text-[12px] text-slate-500 mb-1.5">
                保存到分类
              </label>
              <CategorySelect
                value={selectedCategoryId}
                onChange={setSelectedCategoryId}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNameDialog(false);
                  setQuizName('');
                }}
                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
              >
                取消
              </button>
              <button
                onClick={() => confirmAction()}
                className={`flex-1 py-2 rounded-lg text-white ${
                  dialogMode === 'draft' ? 'bg-amber-400 hover:bg-amber-500' : 'bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500'
                }`}
              >
                {dialogMode === 'draft' ? '确认暂存' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />

      {/* 笔记面板 */}
      <NotePanel
        open={notePanelOpen}
        onClose={() => setNotePanelOpen(false)}
        quizId={quiz.id}
      />
    </div>
  );
}