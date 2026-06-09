'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { PREDEFINED_QUESTIONS } from '@/lib/securityQuestions';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'guest'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  // 注册时用户名实时查重状态
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 注册 - 密保问题
  const [securityQuestion, setSecurityQuestion] = useState<string>(PREDEFINED_QUESTIONS[0].key);
  const [securityAnswer, setSecurityAnswer] = useState('');

  useEffect(() => {
    setAnimateIn(true);
    // 读取已记住的账号 + 密码
    const savedUsername = localStorage.getItem('remember_username');
    const savedPassword = localStorage.getItem('remember_password') ?? '';
    const savedRemember = localStorage.getItem('remember_flag') === '1';
    if (savedRemember && savedUsername) {
      setUsername(savedUsername);
      setPassword(savedPassword);
      setRemember(true);
    }
    // 切到非 register 模式时,清空查重状态(避免状态串台)
    // 注意:下面有第二个 useEffect 监听 mode 变化
    // Initialize particles
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.4 + 0.2,
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56, 189, 248, ${p.opacity})`;
        ctx.fill();
      });
      animationId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 注册模式实时查重 + 切换模式时清空状态
  useEffect(() => {
    if (mode !== 'register') {
      setUsernameStatus('idle');
      setUsernameSuggestions([]);
      return;
    }
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
      setUsernameStatus('idle');
      setUsernameSuggestions([]);
      return;
    }
    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          setUsernameStatus('idle');
          return;
        }
        const data = await res.json();
        if (data.exists) {
          setUsernameStatus('taken');
          setUsernameSuggestions(data.suggestions || []);
        } else {
          setUsernameStatus('available');
          setUsernameSuggestions([]);
        }
      } catch {
        setUsernameStatus('idle');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [username, mode]);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登录失败');
        return;
      }
      login(data.token, data.user);
      if (remember) {
        localStorage.setItem('remember_username', username);
        localStorage.setItem('remember_password', password);
        localStorage.setItem('remember_flag', '1');
      } else {
        localStorage.removeItem('remember_username');
        localStorage.removeItem('remember_password');
        localStorage.removeItem('remember_flag');
      }
      window.location.href = '/';
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    if (!securityQuestion || !securityAnswer.trim()) {
      setError('请设置密保问题和答案');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, securityQuestion, securityAnswer: securityAnswer.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '注册失败');
        return;
      }
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const loginData = await loginRes.json();
      if (loginRes.ok) {
        login(loginData.token, loginData.user);
        if (remember) {
          localStorage.setItem('remember_username', username);
          localStorage.setItem('remember_password', password);
          localStorage.setItem('remember_flag', '1');
        }
        window.location.href = '/';
      } else {
        setMode('login');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/guest', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '游客登录失败');
        return;
      }
      login(data.token, data.user);
      window.location.href = '/';
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Floating orbs - 清新薄荷蓝绿色 */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-sky-300/30 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-emerald-300/30 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-200/20 rounded-full blur-[150px]" />

      {/* Logo */}
      <div className={`absolute top-8 left-1/2 -translate-x-1/2 transition-all duration-700 z-10 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center shadow-lg shadow-sky-200">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">在线答题系统</h1>
            <p className="text-slate-500 text-sm">智能评测 · 即时反馈</p>
          </div>
        </div>
      </div>

      {/* Main card */}
      <div className={`absolute inset-0 flex items-center justify-center p-4 transition-all duration-700 z-10 ${animateIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="relative w-full max-w-md">
          <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-xl shadow-sky-100 border border-white">
            {/* Mode tabs */}
            <div className="flex mb-8 bg-slate-100/80 rounded-2xl p-1.5">
              {[
                { key: 'login', label: '登录' },
                { key: 'register', label: '注册' },
                { key: 'guest', label: '游客' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => { setMode(tab.key as typeof mode); setError(''); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                    mode === tab.key
                      ? 'bg-white text-sky-600 shadow-md shadow-sky-100'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Form */}
            <div className={`space-y-5 transition-all duration-500 ${mode === 'guest' ? 'translate-x-8 opacity-0 h-0 overflow-hidden' : 'translate-x-0 opacity-100'}`}>
              <div>
                <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">用户名</label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="输入用户名"
                    className={`w-full pl-4 pr-10 py-3.5 bg-slate-50 border rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 transition-all ${
                      mode === 'register' && usernameStatus === 'taken'
                        ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                        : mode === 'register' && usernameStatus === 'available'
                        ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-100'
                        : 'border-slate-200 focus:border-sky-400 focus:ring-sky-100'
                    }`}
                  />
                  {/* 注册模式下的状态图标 */}
                  {mode === 'register' && usernameStatus === 'checking' && (
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {mode === 'register' && usernameStatus === 'available' && (
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {mode === 'register' && usernameStatus === 'taken' && (
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>

                {/* 注册模式:查重提示 + 系统推荐 */}
                {mode === 'register' && usernameStatus === 'taken' && (
                  <div className="mt-2 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-lg anim-stagger-1">
                    <div className="flex items-center gap-1.5 text-rose-600 text-[12.5px]">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.071 19h13.858c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>该用户名已被使用,请重新命名或使用系统推荐:</span>
                    </div>
                    {usernameSuggestions.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {usernameSuggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setUsername(s)}
                            className="px-2.5 py-1 text-[12px] bg-white border border-rose-200 text-rose-600 rounded-md hover:bg-rose-100 hover:border-rose-300 transition-colors font-mono"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[11.5px] text-rose-500">暂无可用推荐,请手动换一个名字。</p>
                    )}
                  </div>
                )}
                {mode === 'register' && usernameStatus === 'available' && (
                  <p className="mt-1.5 ml-1 text-[11.5px] text-emerald-600">✓ 该用户名可用</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">密码</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
                    onKeyDown={(e) => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())}
                    className="w-full pl-4 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-sky-500 transition-colors rounded-lg"
                  >
                    {showPassword ? (
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
              </div>

              {/* 记住密码 + 忘记密码 - 仅登录模式,同一行 */}
              {mode === 'login' && (
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-[18px] h-[18px] rounded-md border-2 border-slate-300 bg-white peer-checked:bg-gradient-to-br peer-checked:from-sky-400 peer-checked:to-emerald-400 peer-checked:border-transparent transition-all flex items-center justify-center group-hover:border-sky-400">
                        {remember && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <span className="text-sm text-slate-500 group-hover:text-slate-700 transition-colors">记住密码</span>
                  </label>
                  <button
                    onClick={() => router.push('/forgot-password')}
                    className="text-sm text-sky-500 hover:text-sky-600 font-medium transition-colors"
                  >
                    忘记密码？
                  </button>
                </div>
              )}

              {/* 密保问题 - 仅注册模式(强制) */}
              {mode === 'register' && (
                <div className="pt-1 space-y-3 border-t border-slate-100 mt-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>设置密保问题(忘记密码时使用,必填)</span>
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
                          <option key={q.key} value={q.key}>
                            {q.text}
                          </option>
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
                      placeholder="请输入答案(至少 2 个字符,不区分大小写)"
                      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mt-5 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 animate-shake">
                <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-rose-600 text-sm">{error}</span>
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleGuestLogin}
              disabled={loading}
              className={`w-full mt-6 py-4 rounded-xl font-medium transition-all duration-300 text-white ${
                mode === 'guest'
                  ? 'bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-200'
                  : 'bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 shadow-lg shadow-sky-200'
              } disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98]`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  处理中...
                </span>
              ) : (
                mode === 'guest' ? '匿名进入' : mode === 'login' ? '登录' : '注册'
              )}
            </button>

            {/* Switch mode hint */}
            {mode !== 'guest' && (
              <p className="text-center text-slate-500 text-sm mt-4">
                {mode === 'login' ? '还没有账号？' : '已有账号？'}
                <button
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="text-sky-500 hover:text-sky-600 ml-1 font-medium transition-colors"
                >
                  {mode === 'login' ? '立即注册' : '立即登录'}
                </button>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom decoration */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 text-slate-400 text-sm z-10">
        <span>支持 6 种题型</span>
        <span className="w-1 h-1 rounded-full bg-slate-300" />
        <span>即时自动批改</span>
        <span className="w-1 h-1 rounded-full bg-slate-300" />
        <span>数据云端同步</span>
      </div>

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
