'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import { useDialog } from '@/components/DialogProvider';

interface AdminQuiz {
  id: string;
  title: string;
  isOfficial: boolean;
  creator: string;
  isGuestCreator: boolean;
  resultCount: number;
  createdAt: string;
}

export default function AdminQuizzes() {
  const router = useRouter();
  const { admin, loading: adminLoading } = useAdminAuth();
  const dialog = useDialog();
  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'official' | 'user'>('all');

  // 分配弹窗 state
  interface ProfessionNode { id: string; name: string; users: { id: string; username: string }[]; }
  type SelectionMap = Map<string, Set<string>>;
  const [assignTarget, setAssignTarget] = useState<AdminQuiz | null>(null);
  const [assignProfessions, setAssignProfessions] = useState<ProfessionNode[]>([]);
  const [assignSelection, setAssignSelection] = useState<SelectionMap>(new Map());
  const [assignExpanded, setAssignExpanded] = useState<Set<string>>(new Set());
  const [assignSaving, setAssignSaving] = useState(false);

  useEffect(() => {
    if (adminLoading) return;
    const token = localStorage.getItem('adminToken');
    if (!token || !admin) {
      window.location.href = '/admin/login';
    }
  }, [admin, adminLoading]);

  useEffect(() => {
    if (!admin) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    fetch('/api/admin/quizzes', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.quizzes) setQuizzes(data.quizzes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [admin]);

  const handleDelete = async (id: string, title: string) => {
    const ok = await dialog.confirm({
      title: '删除题库',
      message: `确定要删除题库「${title}」吗?此操作不可恢复!`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/quizzes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setQuizzes((prev) => prev.filter((q) => q.id !== id));
      } else {
        await dialog.alert({ title: '删除失败', message: '请稍后重试' });
      }
    } catch {
      await dialog.alert({ title: '删除失败', message: '网络错误' });
    }
  };

  // 打开分配弹窗
  const openAssignDialog = async (quiz: AdminQuiz) => {
    setAssignTarget(quiz);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/quizzes/${quiz.id}/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAssignProfessions(data.professions || []);
      const sel: SelectionMap = new Map();
      for (const a of (data.assignments || [])) {
        if (!sel.has(a.professionId)) sel.set(a.professionId, new Set());
        if (a.userId) sel.get(a.professionId)!.add(a.userId);
      }
      setAssignSelection(sel);
    } catch { /* ignore */ }
  };

  // 切换职业选择
  const toggleProfession = (professionId: string) => {
    setAssignSelection((prev) => {
      const next = new Map(prev);
      if (next.has(professionId)) { next.delete(professionId); }
      else { next.set(professionId, new Set()); }
      return next;
    });
  };

  // 切换用户选择
  const toggleUser = (professionId: string, userId: string) => {
    setAssignSelection((prev) => {
      const next = new Map(prev);
      let userSet = next.get(professionId);
      if (!userSet) {
        const profession = assignProfessions.find((p) => p.id === professionId);
        userSet = new Set(profession?.users.map((u) => u.id) || []);
        next.set(professionId, userSet);
      }
      if (userSet.has(userId)) {
        userSet.delete(userId);
        if (userSet.size === 0) next.delete(professionId);
      } else {
        userSet.add(userId);
      }
      return next;
    });
  };

  // 保存分配
  const handleAssignSave = async () => {
    if (!assignTarget) return;
    setAssignSaving(true);
    const token = localStorage.getItem('adminToken');
    const assignments: { professionId: string; userId: string | null }[] = [];
    for (const [professionId, userIds] of assignSelection) {
      if (userIds.size === 0) {
        assignments.push({ professionId, userId: null });
      } else {
        for (const uid of userIds) {
          assignments.push({ professionId, userId: uid });
        }
      }
    }
    try {
      const res = await fetch(`/api/admin/quizzes/${assignTarget.id}/assignments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignments }),
      });
      if (res.ok) { setAssignTarget(null); }
    } catch { /* ignore */ }
    finally { setAssignSaving(false); }
  };

  // 职业选择状态
  const getProfessionState = (professionId: string): 'none' | 'all' | 'partial' => {
    const sel = assignSelection.get(professionId);
    if (!sel) return 'none';
    if (sel.size === 0) return 'all';
    return 'partial';
  };

  if (adminLoading || !admin) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  const filtered = quizzes.filter((q) => {
    if (filter === 'official') return q.isOfficial;
    if (filter === 'user') return !q.isOfficial;
    return true;
  });

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-pink-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1.5">
                Quizzes
              </div>
              <h2
                className="text-[28px] leading-tight text-slate-800 mb-1.5"
                style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}
              >
                题库管理
              </h2>
              <p className="text-slate-500 text-sm">管理所有题库，包括官方题库和用户题库</p>
            </div>
            <button
              onClick={() => router.push('/admin/quizzes/new')}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-[13px] font-medium rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md shadow-indigo-200 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              发布新题库
            </button>
          </div>

          {/* 筛选 */}
          <div className="flex gap-1.5 mb-5 p-1 bg-white/60 backdrop-blur rounded-xl border border-slate-200/60 w-fit">
            {[
              { key: 'all', label: '全部', count: quizzes.length },
              { key: 'official', label: '官方题库', count: quizzes.filter((q) => q.isOfficial).length },
              { key: 'user', label: '用户题库', count: quizzes.filter((q) => !q.isOfficial).length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as typeof filter)}
                className={`px-4 py-1.5 rounded-lg text-[12.5px] font-medium transition-all ${
                  filter === tab.key
                    ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label} <span className="ml-1 opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>

          {/* 列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-12 text-center">
              <p className="text-slate-400">暂无题库</p>
            </div>
          ) : (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200/60 bg-slate-50/50 text-slate-500 text-[12px] uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-medium">题库标题</th>
                    <th className="text-left px-6 py-3 font-medium">类型</th>
                    <th className="text-left px-6 py-3 font-medium">创建者</th>
                    <th className="text-left px-6 py-3 font-medium">答题记录</th>
                    <th className="text-left px-6 py-3 font-medium">创建时间</th>
                    <th className="text-right px-6 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((quiz) => (
                    <tr key={quiz.id} className="border-b border-slate-100/60 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-slate-800 font-medium text-[13.5px]">{quiz.title}</td>
                      <td className="px-6 py-4">
                        {quiz.isOfficial ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-indigo-50 text-indigo-600 font-medium">官方</span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-500">用户</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-[13px]">
                        {quiz.creator}
                        {quiz.isGuestCreator && (
                          <span className="ml-2 text-[11px] text-amber-500">(游客)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-[13px] tabular-nums">{quiz.resultCount}</td>
                      <td className="px-6 py-4 text-slate-400 text-[12px]">
                        {new Date(quiz.createdAt).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => router.push(`/admin/quizzes/${quiz.id}/edit`)}
                            className="px-3 py-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg text-[12.5px] transition-colors"
                          >
                            查看
                          </button>
                          <button
                            onClick={() => openAssignDialog(quiz)}
                            className="px-3 py-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg text-[12.5px] transition-colors"
                          >
                            分配
                          </button>
                          <button
                            onClick={() => handleDelete(quiz.id, quiz.title)}
                            className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-[12.5px] transition-colors"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 分配弹窗 */}
      {assignTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setAssignTarget(null)}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-slate-800 text-lg font-bold mb-1">分配题库</h3>
            <p className="text-slate-500 text-sm mb-4">「{assignTarget.title}」→ 选择目标职业和用户</p>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {assignProfessions.map((p) => {
                const state = getProfessionState(p.id);
                const expanded = assignExpanded.has(p.id);
                return (
                  <div key={p.id}>
                    <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                      <CheckboxState state={state} onChange={() => toggleProfession(p.id)} />
                      <span className="flex-1 text-[13px] text-slate-700 font-medium">{p.name}</span>
                      <span className="text-[11px] text-slate-400">{p.users.length} 人</span>
                      <button
                        onClick={() => setAssignExpanded((prev) => { const next = new Set(prev); next.has(p.id) ? next.delete(p.id) : next.add(p.id); return next; })}
                        className="p-1 text-slate-400 hover:text-slate-600"
                      >
                        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </label>
                    {expanded && p.users.length > 0 && (
                      <div className="ml-6 space-y-0.5">
                        {p.users.map((u) => {
                          const checked = state === 'all' || assignSelection.get(p.id)?.has(u.id);
                          return (
                            <label key={u.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer">
                              <input type="checkbox" checked={!!checked} onChange={() => toggleUser(p.id, u.id)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
                              <span className="text-[12.5px] text-slate-600">{u.username}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {assignProfessions.length === 0 && (
                <p className="text-slate-400 text-sm text-center py-4">暂无职业，请先在「职业管理」中添加</p>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setAssignTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-sm">
                取消
              </button>
              <button onClick={handleAssignSave} disabled={assignSaving}
                className="flex-1 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md disabled:opacity-50 transition-all text-sm">
                {assignSaving ? '保存中…' : '保存分配'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckboxState({ state, onChange }: { state: 'none' | 'all' | 'partial'; onChange: () => void }) {
  return (
    <button onClick={onChange} className="w-4 h-4 flex items-center justify-center flex-shrink-0">
      {state === 'all' ? (
        <svg className="w-4 h-4 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      ) : state === 'partial' ? (
        <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-2 10H7v-2h10v2z" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
        </svg>
      )}
    </button>
  );
}
