'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { PREDEFINED_QUESTIONS } from '@/lib/securityQuestions';

export default function SetupPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [securityQuestion, setSecurityQuestion] = useState(PREDEFINED_QUESTIONS[0].key);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [professionId, setProfessionId] = useState('');
  const [professions, setProfessions] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [animateIn, setAnimateIn] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    setAnimateIn(true);
    fetch('/api/professions')
      .then((res) => res.json())
      .then((data) => { if (data.professions) setProfessions(data.professions); })
      .catch(() => {});
  }, []);

  // 未登录则跳回登录页
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleSubmit = async () => {
    if (!securityAnswer.trim()) {
      setError('请输入密保答案');
      return;
    }
    if (securityAnswer.trim().length < 2) {
      setError('密保答案至少 2 个字符');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          securityQuestion,
          securityAnswer: securityAnswer.trim(),
          professionId: professionId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '设置失败');
        return;
      }
      router.push('/welcome');
    } catch {
      setError('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    setSkipped(true);
    // 如果选了职业，只更新职业
    if (professionId) {
      fetch('/api/user/profession', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ professionId }),
      }).finally(() => router.push('/welcome'));
    } else {
      router.push('/welcome');
    }
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center p-6">
      {/* 装饰光晕 */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-sky-300/15 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-emerald-300/15 rounded-full blur-[100px]" />

      <div className={`relative w-full max-w-lg transition-all duration-700 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        {/* 进度指示 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[11px] rounded-full font-medium">✓ 账号已创建</span>
            <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="px-3 py-1 bg-sky-100 text-sky-700 text-[11px] rounded-full font-medium">完善信息</span>
          </div>
          <h2
            className="text-[32px] leading-tight text-slate-800 mb-2 tracking-[-0.01em]"
            style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}
          >
            完善账户信息
          </h2>
          <p className="text-slate-500 text-sm">设置密保问题保护您的账户，选择职业获得更好的体验</p>
        </div>

        {/* 表单卡片 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-xl shadow-sky-100 border border-white space-y-6">
          {/* 密保问题 */}
          <div className="space-y-4">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>密保设置 · 忘记密码时使用</span>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">安全问题</label>
              <div className="relative">
                <select
                  value={securityQuestion}
                  onChange={(e) => setSecurityQuestion(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all appearance-none cursor-pointer text-sm"
                >
                  {PREDEFINED_QUESTIONS.map((q) => (
                    <option key={q.key} value={q.key}>{q.text}</option>
                  ))}
                </select>
                <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div>
              <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">问题答案</label>
              <input
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="请输入答案（不区分大小写）"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
              />
            </div>
          </div>

          {/* 分割线 */}
          <div className="border-t border-slate-100" />

          {/* 职业选择 */}
          <div>
            <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">
              职业选择 <span className="text-slate-400 font-normal">（可选）</span>
            </label>
            <div className="relative">
              <select
                value={professionId}
                onChange={(e) => setProfessionId(e.target.value)}
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all appearance-none cursor-pointer text-sm"
              >
                <option value="">暂不选择</option>
                {professions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-rose-600 text-sm">{error}</span>
            </div>
          )}

          {/* 按钮 */}
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 rounded-xl font-medium text-white bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 shadow-lg shadow-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  保存中...
                </span>
              ) : (
                '完成设置'
              )}
            </button>
            <button
              onClick={handleSkip}
              disabled={submitting}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors py-2"
            >
              {skipped ? '跳转中...' : '暂时跳过，稍后设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
