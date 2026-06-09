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
    </div>
  );
}
