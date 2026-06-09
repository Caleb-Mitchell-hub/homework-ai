'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import Toast from '@/components/Toast';
import { useDialog } from '@/components/DialogProvider';

interface Profession {
  id: string;
  name: string;
  userCount: number;
  assignmentCount: number;
  createdAt: string;
}

export default function AdminProfessionsPage() {
  const { admin, loading: adminLoading } = useAdminAuth();
  const dialog = useDialog();
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
  };

  const fetchProfessions = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch('/api/admin/professions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setProfessions(data.professions || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (adminLoading) return;
    const token = localStorage.getItem('adminToken');
    if (!token || !admin) {
      window.location.href = '/admin/login';
      return;
    }
    fetchProfessions();
  }, [admin, adminLoading, fetchProfessions]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { showToast('请输入职业名称'); return; }
    if (name.length > 20) { showToast('职业名称最长 20 个字符'); return; }
    setAdding(true);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch('/api/admin/professions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || '创建失败'); return; }
      setNewName('');
      showToast('职业已创建');
      fetchProfessions();
    } catch { showToast('网络错误'); }
    finally { setAdding(false); }
  };

  const handleDelete = async (profession: Profession) => {
    const ok = await dialog.confirm({
      title: '删除职业',
      message: `确定要删除职业「${profession.name}」吗？\n该职业下有 ${profession.userCount} 个用户，${profession.assignmentCount} 个分配记录将被清理。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(profession.id);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/professions/${profession.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const data = await res.json(); showToast(data.error || '删除失败'); return; }
      showToast('职业已删除');
      fetchProfessions();
    } catch { showToast('网络错误'); }
    finally { setDeletingId(null); }
  };

  if (adminLoading || !admin) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-pink-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-6">
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1.5">
              Profession Management
            </div>
            <h2 className="text-[28px] leading-tight text-slate-800 mb-1.5"
              style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}>
              职业管理
            </h2>
            <p className="text-slate-500 text-sm">管理系统职业列表，用户注册时可选择职业</p>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="输入新职业名称…"
              className="flex-1 max-w-sm px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-sm font-medium rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md shadow-indigo-200 disabled:opacity-50 transition-all"
            >
              {adding ? '创建中…' : '新增职业'}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full" />
            </div>
          ) : professions.length === 0 ? (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-12 text-center">
              <p className="text-slate-400">暂无职业，请添加</p>
            </div>
          ) : (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200/60 bg-slate-50/50 text-slate-500 text-[12px] uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-medium">职业名称</th>
                    <th className="text-left px-6 py-3 font-medium">用户数</th>
                    <th className="text-left px-6 py-3 font-medium">分配题库数</th>
                    <th className="text-left px-6 py-3 font-medium">创建时间</th>
                    <th className="text-right px-6 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {professions.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100/60 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-slate-800 font-medium text-[13.5px]">{p.name}</td>
                      <td className="px-6 py-4 text-slate-600 text-[13px] tabular-nums">{p.userCount}</td>
                      <td className="px-6 py-4 text-slate-600 text-[13px] tabular-nums">{p.assignmentCount}</td>
                      <td className="px-6 py-4 text-slate-400 text-[12px]">
                        {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-[12.5px] transition-colors disabled:opacity-50"
                        >
                          {deletingId === p.id ? '删除中…' : '删除'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </div>
  );
}
