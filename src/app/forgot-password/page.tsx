'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'username' | 'answer' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('username');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 步骤 1 → 2
  const [username, setUsername] = useState('');
  const [questionText, setQuestionText] = useState('');

  // 步骤 2 → 3
  const [answer, setAnswer] = useState('');
  const [resetToken, setResetToken] = useState('');

  // 步骤 3 → 4
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const goBack = () => {
    setError('');
    if (step === 'answer') {
      setAnswer('');
      setStep('username');
    } else if (step === 'reset') {
      setNewPassword('');
      setNewPassword2('');
      setStep('answer');
    } else {
      router.push('/login');
    }
  };

  const submitUsername = async () => {
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'get_question', username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '查询失败');
        return;
      }
      setQuestionText(data.questionText);
      setStep('answer');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!answer.trim()) {
      setError('请输入密保答案');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'verify_answer',
          username: username.trim(),
          answer: answer.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '验证失败');
        return;
      }
      setResetToken(data.resetToken);
      setStep('reset');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    if (newPassword.length < 6) {
      setError('新密码至少 6 个字符');
      return;
    }
    if (newPassword !== newPassword2) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'reset_password', resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '重置失败');
        // 校验过期时回到用户名步骤
        if (res.status === 401) {
          setStep('username');
          setAnswer('');
          setResetToken('');
        }
        return;
      }
      setStep('done');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const stepIndex: Record<Step, number> = {
    username: 1,
    answer: 2,
    reset: 3,
    done: 3,
  };
  const currentIndex = stepIndex[step];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-sky-300/30 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-emerald-300/30 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3 justify-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center shadow-lg shadow-sky-200">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">找回密码</h1>
              <p className="text-slate-500 text-sm">通过密保问题验证身份</p>
            </div>
          </div>

          {/* Steps indicator */}
          {step !== 'done' && (
            <div className="flex items-center justify-center gap-1.5 mb-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i < currentIndex
                      ? 'w-8 bg-sky-400'
                      : i === currentIndex
                      ? 'w-12 bg-gradient-to-r from-sky-400 to-emerald-400'
                      : 'w-8 bg-slate-200'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-xl shadow-sky-100 border border-white">
            {step === 'username' && (
              <>
                <h2 className="text-lg font-semibold text-slate-800 mb-1">第一步:验证账号</h2>
                <p className="text-slate-500 text-sm mb-5">输入您要找回的账号的用户名</p>
                <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitUsername()}
                  placeholder="输入用户名"
                  autoFocus
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
                />
              </>
            )}

            {step === 'answer' && (
              <>
                <h2 className="text-lg font-semibold text-slate-800 mb-1">第二步:回答密保问题</h2>
                <p className="text-slate-500 text-sm mb-5">请回答账号「<span className="text-slate-700 font-medium">{username}</span>」的密保问题</p>
                <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl mb-4">
                  <div className="text-[11px] text-sky-600 uppercase tracking-wider mb-1">安全问题</div>
                  <div className="text-slate-800 text-sm font-medium">{questionText}</div>
                </div>
                <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">您的答案</label>
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitAnswer()}
                  placeholder="输入当时设置的答案(不区分大小写)"
                  autoFocus
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
                />
              </>
            )}

            {step === 'reset' && (
              <>
                <h2 className="text-lg font-semibold text-slate-800 mb-1">第三步:设置新密码</h2>
                <p className="text-slate-500 text-sm mb-5">为账号「<span className="text-slate-700 font-medium">{username}</span>」设置新密码</p>
                <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">新密码</label>
                <div className="relative mb-3">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="至少 6 个字符"
                    autoFocus
                    className="w-full pl-4 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showNewPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-sky-500 transition-colors rounded-lg"
                  >
                    {showNewPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">确认新密码</label>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitReset()}
                  placeholder="再次输入新密码"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
                />
              </>
            )}

            {step === 'done' && (
              <div className="text-center py-2">
                <div className="w-16 h-16 rounded-full bg-emerald-100 mx-auto mb-4 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-slate-800 mb-1">密码重置成功</h2>
                <p className="text-slate-500 text-sm mb-6">请使用新密码登录</p>
                <button
                  onClick={() => router.push('/login')}
                  className="w-full py-3 bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 text-white text-sm font-medium rounded-xl shadow-md shadow-sky-200 transition-all"
                >
                  返回登录
                </button>
              </div>
            )}

            {/* Error */}
            {error && step !== 'done' && (
              <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5">
                <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-rose-600 text-sm">{error}</span>
              </div>
            )}

            {/* Buttons */}
            {step !== 'done' && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={goBack}
                  className="flex-1 py-3 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  {step === 'username' ? '返回登录' : '上一步'}
                </button>
                <button
                  onClick={step === 'username' ? submitUsername : step === 'answer' ? submitAnswer : submitReset}
                  disabled={loading}
                  className="flex-1 py-3 text-sm text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl shadow-md shadow-sky-200 disabled:opacity-50 transition-all"
                >
                  {loading ? '处理中...' : step === 'reset' ? '重置密码' : '下一步'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
