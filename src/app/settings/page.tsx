'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/components/DialogProvider';
import { PREDEFINED_QUESTIONS, getQuestionText } from '@/lib/securityQuestions';

export default function SettingsPage() {
  const { user, token, logout, updateUser, loading } = useAuth();
  const router = useRouter();
  const dialog = useDialog();

  // 基本信息
  const [username, setUsername] = useState('');
  const [professionId, setProfessionId] = useState('');
  const [professions, setProfessions] = useState<{ id: string; name: string }[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [professionSaving, setProfessionSaving] = useState(false);

  // 修改密码
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');

  // 密保
  const [secQuestion, setSecQuestion] = useState('');
  const [secAnswer, setSecAnswer] = useState('');
  const [currentSecQuestion, setCurrentSecQuestion] = useState<string | null>(null);
  const [secLoading, setSecLoading] = useState(false);
  const [secError, setSecError] = useState('');

  // 退出登录
  const [showLogout, setShowLogout] = useState(false);

  // 加载当前用户信息和职业列表
  useEffect(() => {
    if (!token) return;

    // 加载职业列表
    fetch('/api/professions')
      .then(res => res.json())
      .then(data => { if (data.professions) setProfessions(data.professions); })
      .catch(() => {});

    // 加载当前用户信息
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUsername(data.user.username || '');
          setProfessionId(data.user.professionId || '');
          if (data.user.securityQuestion) {
            setCurrentSecQuestion(data.user.securityQuestion);
          }
        }
      })
      .catch(() => {});
  }, [token]);

  // 保存基本信息（仅用户名）
  async function handleSaveProfile() {
    if (!username.trim() || username.trim().length < 3) {
      setProfileError('用户名长度需在3-20个字符之间');
      return;
    }
    setProfileLoading(true);
    setProfileError('');
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        // 同步更新 AuthContext 中的用户名
        updateUser({ username: data.user.username });
        await dialog.alert({ title: '保存成功', message: '基本信息已更新' });
      } else if (res.status === 409) {
        setProfileError('用户名已被占用');
      } else {
        setProfileError(data.error || '保存失败');
      }
    } catch {
      setProfileError('网络错误，请稍后重试');
    } finally {
      setProfileLoading(false);
    }
  }

  // 切换职业（即时保存）
  async function handleProfessionChange(newProfessionId: string) {
    setProfessionId(newProfessionId);
    if (!token) return;
    setProfessionSaving(true);
    try {
      await fetch('/api/user/profession', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ professionId: newProfessionId || null }),
      });
    } catch {
      // 静默失败，不影响使用
    } finally {
      setProfessionSaving(false);
    }
  }

  // 修改密码
  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setPwdError('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('新密码至少需要6个字符');
      return;
    }
    setPwdLoading(true);
    setPwdError('');
    try {
      const res = await fetch('/api/user/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        await dialog.alert({ title: '修改成功', message: '密码已更新，下次登录请使用新密码' });
      } else {
        setPwdError(data.error || '修改失败');
      }
    } catch {
      setPwdError('网络错误，请稍后重试');
    } finally {
      setPwdLoading(false);
    }
  }

  // 保存密保
  async function handleSaveSecurity() {
    if (!secQuestion) {
      setSecError('请选择密保问题');
      return;
    }
    if (!secAnswer.trim() || secAnswer.trim().length < 2) {
      setSecError('密保答案至少需要2个字符');
      return;
    }
    setSecLoading(true);
    setSecError('');
    try {
      const res = await fetch('/api/user/security', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          securityQuestion: secQuestion,
          securityAnswer: secAnswer.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentSecQuestion(secQuestion);
        setSecAnswer('');
        await dialog.alert({ title: '保存成功', message: '密保信息已更新' });
      } else {
        setSecError(data.error || '保存失败');
      }
    } catch {
      setSecError('网络错误，请稍后重试');
    } finally {
      setSecLoading(false);
    }
  }

  // 退出登录
  function handleLogout() {
    logout();
    window.location.href = '/login';
  }

  // 密码一致性
  const pwdMismatch = !!(confirmPassword && newPassword !== confirmPassword);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">请先登录</p>
      </div>
    );
  }

  if (user.isGuest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 text-lg mb-4">游客账号不支持个人设置</p>
          <button
            onClick={() => router.push('/login?mode=register')}
            className="bg-indigo-600 text-white text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            注册账号
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 头部 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">⚙️ 个人设置</h1>
        <p className="text-sm text-slate-500 mt-1">管理账户信息与安全设置</p>
      </div>

      {/* 第一行：基本信息 + 修改密码 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* 基本信息 */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">👤 基本信息</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">用户名</label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setProfileError(''); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                maxLength={20}
                minLength={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">职业</label>
              <div className="relative">
                <select
                  value={professionId}
                  onChange={(e) => handleProfessionChange(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white appearance-none cursor-pointer"
                  disabled={professionSaving}
                >
                  <option value="">暂不选择</option>
                  {professions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {professionSaving && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2">
                    <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
            {profileError && (
              <p className="text-xs text-red-500">{profileError}</p>
            )}
            <button
              onClick={handleSaveProfile}
              disabled={profileLoading || !username.trim()}
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {profileLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>

        {/* 修改密码 */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">🔒 修改密码</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">当前密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => { setOldPassword(e.target.value); setPwdError(''); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPwdError(''); }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                placeholder="至少6个字符"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPwdError(''); }}
                className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 ${
                  pwdMismatch ? 'border-red-300 bg-red-50' : 'border-slate-200'
                }`}
              />
              {pwdMismatch && (
                <p className="text-xs text-red-500 mt-1">两次输入的新密码不一致</p>
              )}
            </div>
            {pwdError && (
              <p className="text-xs text-red-500">{pwdError}</p>
            )}
            <button
              onClick={handleChangePassword}
              disabled={pwdLoading || !oldPassword || !newPassword || !confirmPassword || pwdMismatch}
              className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {pwdLoading ? '修改中...' : '修改密码'}
            </button>
          </div>
        </div>
      </div>

      {/* 第二行：密保设置 */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">🛡️ 密保设置</h3>
        <p className="text-xs text-slate-400 mb-4">密保用于忘记密码时找回账号，请妥善保管答案</p>

        {currentSecQuestion && (
          <div className="flex items-center gap-2 mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
            <span className="text-sm text-emerald-700">
              当前问题：{getQuestionText(currentSecQuestion)}
            </span>
            <span className="text-xs text-emerald-500 bg-emerald-100 px-1.5 py-0.5 rounded">已设置</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-600 mb-1.5">密保问题</label>
            <select
              value={secQuestion}
              onChange={(e) => { setSecQuestion(e.target.value); setSecError(''); }}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white"
            >
              <option value="">-- 请选择 --</option>
              {PREDEFINED_QUESTIONS.map((q) => (
                <option key={q.key} value={q.key}>{q.text}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-600 mb-1.5">密保答案</label>
            <input
              type="text"
              value={secAnswer}
              onChange={(e) => { setSecAnswer(e.target.value); setSecError(''); }}
              placeholder="至少2个字符"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
              maxLength={100}
            />
          </div>
        </div>
        {secError && (
          <p className="text-xs text-red-500 mt-2">{secError}</p>
        )}
        <div className="mt-4">
          <button
            onClick={handleSaveSecurity}
            disabled={secLoading || !secQuestion || !secAnswer.trim()}
            className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {secLoading ? '保存中...' : currentSecQuestion ? '更换密保' : '设置密保'}
          </button>
        </div>
      </div>

      {/* 第三行：危险操作 */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-rose-600 mb-4">⚠️ 危险操作</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">退出登录</p>
            <p className="text-xs text-slate-400 mt-0.5">清除本地会话并返回登录页</p>
          </div>
          <button
            onClick={() => setShowLogout(true)}
            className="text-sm text-rose-600 hover:text-rose-700 border border-rose-200 hover:border-rose-300 px-4 py-2 rounded-lg hover:bg-rose-50 transition-colors"
          >
            退出当前账号
          </button>
        </div>
      </div>

      {/* 退出确认弹窗 */}
      {showLogout && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowLogout(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-slate-800 mb-1.5">确认退出？</h4>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">
              当前账号将从本设备登出，已提交的答题记录会保留在云端。
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowLogout(false)}
                className="flex-1 py-2.5 rounded-xl text-sm text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-2.5 rounded-xl text-sm text-white bg-gradient-to-r from-rose-400 to-pink-500 hover:from-rose-500 hover:to-pink-600 shadow-md shadow-rose-200 transition-all"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
