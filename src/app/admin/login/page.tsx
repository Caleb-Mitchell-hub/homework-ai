'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

export default function AdminLoginPage() {
  const router = useRouter();
  const { admin, login } = useAdminAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    setAnimateIn(true);
    // 读取已记住的账号
    const savedUsername = localStorage.getItem('admin_remember_username');
    const savedRemember = localStorage.getItem('admin_remember_flag') === '1';
    if (savedRemember && savedUsername) {
      setUsername(savedUsername);
      setRemember(true);
    }
    // 已登录态直接跳（双保险：context 触发 + 直接读 localStorage）
    if (admin) {
      window.location.replace('/admin/dashboard');
      return;
    }
    const hasToken = typeof window !== 'undefined' && localStorage.getItem('adminToken');
    if (hasToken && !admin) {
      window.location.replace('/admin/dashboard');
    }
  }, [admin]);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '登录失败');
        return;
      }
      // 先把 token/user 同步写入 localStorage（双保险：context 的 login + 显式 setItem）
      try {
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminUser', JSON.stringify(data.admin));
      } catch {}
      login(data.token, data.admin);
      if (remember) {
        localStorage.setItem('admin_remember_username', username);
        localStorage.setItem('admin_remember_flag', '1');
      } else {
        localStorage.removeItem('admin_remember_username');
        localStorage.removeItem('admin_remember_flag');
      }
      // 硬跳转（绕过 React Context 同步问题），用 window.location.replace 避免历史栈残留
      window.location.replace('/admin/dashboard');
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-pink-50">
      {/* Floating orbs - 轻柔粉紫调 */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-indigo-200/40 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-pink-200/40 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-100/40 rounded-full blur-[150px]" />

      <div className={`absolute top-8 left-1/2 -translate-x-1/2 transition-all duration-700 z-10 ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-8'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-pink-400 flex items-center justify-center shadow-lg shadow-indigo-200">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">管理后台</h1>
            <p className="text-slate-500 text-sm">仅限管理员访问</p>
          </div>
        </div>
      </div>

      <div className={`absolute inset-0 flex items-center justify-center p-4 transition-all duration-700 z-10 ${animateIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <div className="relative w-full max-w-md">
          <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-xl shadow-indigo-100 border border-white">
            <h2 className="text-slate-800 text-xl font-bold mb-6 text-center">管理员登录</h2>

            <div className="space-y-5">
              <div>
                <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">密码</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="密码"
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    className="w-full pl-4 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-indigo-500 transition-colors rounded-lg"
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

              <label className="flex items-center gap-2.5 cursor-pointer select-none group pt-1">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-[18px] h-[18px] rounded-md border-2 border-slate-300 bg-white peer-checked:bg-gradient-to-br peer-checked:from-indigo-400 peer-checked:to-pink-400 peer-checked:border-transparent transition-all flex items-center justify-center group-hover:border-indigo-400">
                    {remember && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-slate-500 group-hover:text-slate-700 transition-colors">记住用户名</span>
              </label>
            </div>

            {error && (
              <div className="mt-5 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-rose-600 text-sm">{error}</span>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full mt-6 py-4 rounded-xl font-medium text-white bg-gradient-to-r from-indigo-400 to-pink-400 hover:from-indigo-500 hover:to-pink-500 shadow-lg shadow-indigo-200 disabled:opacity-50 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? '处理中...' : '登录'}
            </button>

            <p className="text-center text-slate-400 text-sm mt-4">
              默认账号: admin / admin123
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
