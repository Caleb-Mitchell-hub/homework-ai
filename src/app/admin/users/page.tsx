'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import Toast from '@/components/Toast';
import { useDialog } from '@/components/DialogProvider';

interface AdminUser {
  id: string;
  username: string;
  isGuest: boolean;
  disabled: boolean;
  isAdmin: boolean;
  lastActiveAt: string | null;
  createdAt: string;
  quizCount: number;
  resultCount: number;
}

type FilterType = 'all' | 'registered' | 'guest';

export default function AdminUsersPage() {
  const router = useRouter();
  const { admin, loading: adminLoading } = useAdminAuth();
  const dialog = useDialog();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
  };

  useEffect(() => {
    if (adminLoading) return;
    const token = localStorage.getItem('adminToken');
    if (!token || !admin) {
      window.location.href = '/admin/login';
    }
  }, [admin, adminLoading]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('adminToken');
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (filter !== 'all') params.set('type', filter);
    try {
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    if (!admin) return;
    fetchUsers();
  }, [admin, fetchUsers]);

  const handleDisableToggle = async (user: AdminUser) => {
    if (user.isAdmin) {
      showToast('管理员用户无法停用');
      return;
    }
    if (user.id === admin?.id) {
      showToast('不能停用自己');
      return;
    }
    const ok = await dialog.confirm({
      title: user.disabled ? '启用用户' : '停用用户',
      message: `确定要${user.disabled ? '启用' : '停用'}用户「${user.username}」吗?`,
      confirmText: user.disabled ? '启用' : '停用',
      danger: !user.disabled,
    });
    if (!ok) return;
    setBusyId(user.id);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/users/${user.id}/disable`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ disabled: !user.disabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || '操作失败');
        return;
      }
      showToast(user.disabled ? '已启用' : '已停用');
      fetchUsers();
    } catch {
      showToast('网络错误');
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async () => {
    if (!resettingId) return;
    if (newPassword.length < 6) {
      showToast('密码至少 6 位');
      return;
    }
    setBusyId(resettingId);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/users/${resettingId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || '重置失败');
        return;
      }
      showToast('密码已重置');
      setResettingId(null);
      setNewPassword('');
    } catch {
      showToast('网络错误');
    } finally {
      setBusyId(null);
    }
  };

  const stats = useMemo(() => {
    return {
      total: users.length,
      registered: users.filter((u) => !u.isGuest).length,
      guest: users.filter((u) => u.isGuest).length,
      disabled: users.filter((u) => u.disabled).length,
    };
  }, [users]);

  if (adminLoading || !admin) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-pink-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* 标题 */}
          <div className="mb-6">
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1.5">
              User Management
            </div>
            <h2
              className="text-[28px] leading-tight text-slate-800 mb-1.5"
              style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}
            >
              用户管理
            </h2>
            <p className="text-slate-500 text-sm">查看、重置密码、停用或启用用户账号</p>
          </div>

          {/* 统计 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatPill label="总用户" value={stats.total} color="indigo" />
            <StatPill label="已注册" value={stats.registered} color="sky" />
            <StatPill label="游客" value={stats.guest} color="amber" />
            <StatPill label="已停用" value={stats.disabled} color="slate" />
          </div>

          {/* 搜索 + 筛选 */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索用户名…"
                className="w-full pl-10 pr-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="flex gap-1.5 p-1 bg-white/60 backdrop-blur rounded-xl border border-slate-200/60">
              {([
                { key: 'all', label: '全部' },
                { key: 'registered', label: '已注册' },
                { key: 'guest', label: '游客' },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setFilter(t.key)}
                  className={`px-4 py-1.5 rounded-lg text-[12.5px] font-medium transition-all ${
                    filter === t.key
                      ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 表格 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-12 text-center">
              <p className="text-slate-400">暂无符合条件的用户</p>
            </div>
          ) : (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200/60 bg-slate-50/50 text-slate-500 text-[12px] uppercase tracking-wider">
                      <th className="text-left px-5 py-3 font-medium">用户</th>
                      <th className="text-left px-5 py-3 font-medium">角色</th>
                      <th className="text-left px-5 py-3 font-medium">状态</th>
                      <th className="text-left px-5 py-3 font-medium">题库</th>
                      <th className="text-left px-5 py-3 font-medium">答题</th>
                      <th className="text-left px-5 py-3 font-medium">最近活跃</th>
                      <th className="text-left px-5 py-3 font-medium">注册时间</th>
                      <th className="text-right px-5 py-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const canManage = !u.isAdmin && u.id !== admin?.id;
                      return (
                        <tr
                          key={u.id}
                          className="border-b border-slate-100/60 hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-300 to-pink-300 flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
                                {u.username.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-slate-800 font-medium text-[13.5px]">{u.username}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            {u.isAdmin ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-indigo-50 text-indigo-600 font-medium">
                                管理员
                              </span>
                            ) : u.isGuest ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-600 font-medium">
                                游客
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-sky-50 text-sky-600 font-medium">
                                已注册
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            {u.disabled ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-400 font-medium">
                                已停用
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-600 font-medium">
                                正常
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 text-[13px] tabular-nums">
                            {u.quizCount}
                          </td>
                          <td className="px-5 py-3.5 text-slate-600 text-[13px] tabular-nums">
                            {u.resultCount}
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 text-[12px]">
                            {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString('zh-CN', { hour12: false }) : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-slate-400 text-[12px]">
                            {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => {
                                  setResettingId(u.id);
                                  setNewPassword('');
                                }}
                                disabled={!canManage || busyId === u.id}
                                className="px-3 py-1.5 text-indigo-500 hover:bg-indigo-50 disabled:text-slate-300 disabled:hover:bg-transparent rounded-lg text-[12.5px] transition-colors"
                              >
                                重置密码
                              </button>
                              <button
                                onClick={() => handleDisableToggle(u)}
                                disabled={!canManage || busyId === u.id}
                                className={`px-3 py-1.5 rounded-lg text-[12.5px] transition-colors disabled:opacity-50 ${
                                  u.disabled
                                    ? 'text-emerald-500 hover:bg-emerald-50'
                                    : 'text-rose-500 hover:bg-rose-50'
                                }`}
                              >
                                {u.disabled ? '启用' : '停用'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 重置密码弹窗 */}
      {resettingId && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => {
            setResettingId(null);
            setNewPassword('');
          }}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-slate-800 text-lg font-bold mb-1">重置密码</h3>
            <p className="text-slate-500 text-sm mb-4">
              为用户「<span className="text-slate-700 font-medium">{users.find((u) => u.id === resettingId)?.username}</span>」设置新密码
            </p>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密码（至少 6 位）"
              autoFocus
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 mb-4"
              onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setResettingId(null);
                  setNewPassword('');
                }}
                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
              >
                取消
              </button>
              <button
                onClick={handleResetPassword}
                disabled={busyId === resettingId}
                className="flex-1 py-2 rounded-lg text-white bg-gradient-to-r from-indigo-400 to-pink-400 hover:from-indigo-500 hover:to-pink-500 disabled:opacity-50"
              >
                {busyId === resettingId ? '处理中...' : '确认重置'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: 'indigo' | 'sky' | 'amber' | 'slate' }) {
  const palette: Record<string, string> = {
    indigo: 'from-indigo-50 to-pink-50 text-indigo-700 border-indigo-100',
    sky: 'from-sky-50 to-emerald-50 text-sky-700 border-sky-100',
    amber: 'from-amber-50 to-orange-50 text-amber-700 border-amber-100',
    slate: 'from-slate-50 to-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <div className={`bg-gradient-to-br ${palette[color]} border rounded-xl px-4 py-3 shadow-sm`}>
      <div className="text-[11px] tracking-wider uppercase opacity-80">{label}</div>
      <div className="text-2xl font-bold tabular-nums leading-none mt-1">{value}</div>
    </div>
  );
}
