'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import Toast from '@/components/Toast';
import { useDialog } from '@/components/DialogProvider';

interface PresetCategory {
  id: string;
  key: string;
  text: string;
  emoji: string;
  order: number;
  quizCount: number;
  createdAt: string;
}

export default function AdminCategoriesPage() {
  const { admin, loading: adminLoading } = useAdminAuth();
  const dialog = useDialog();
  const [categories, setCategories] = useState<PresetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 新增表单
  const [newKey, setNewKey] = useState('');
  const [newText, setNewText] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newOrder, setNewOrder] = useState(0);
  const [adding, setAdding] = useState(false);

  // 编辑弹窗
  const [editing, setEditing] = useState<PresetCategory | null>(null);
  const [editText, setEditText] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editOrder, setEditOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  // 删除状态
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 图标文件上传
  const newIconInputRef = useRef<HTMLInputElement>(null);
  const editIconInputRef = useRef<HTMLInputElement>(null);
  const [uploadingNewIcon, setUploadingNewIcon] = useState(false);
  const [uploadingEditIcon, setUploadingEditIcon] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
  };

  /** 上传图标文件，返回 URL */
  const uploadIcon = async (file: File): Promise<string | null> => {
    const token = localStorage.getItem('adminToken');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/admin/upload/category-icon', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || '上传失败'); return null; }
      return data.url;
    } catch { showToast('网络错误'); return null; }
  };

  /** 渲染图标：图片 URL → <img>，emoji/文字 → 文本 */
  const renderIcon = (icon: string | null | undefined, size: 'lg' | 'sm' = 'lg') => {
    if (!icon) return <span className={size === 'lg' ? 'text-lg' : 'text-base'}>📘</span>;
    if (icon.startsWith('http') || icon.startsWith('/')) {
      return <img src={icon} alt="" className={size === 'lg' ? 'w-6 h-6 rounded object-cover' : 'w-5 h-5 rounded object-cover'} />;
    }
    return <span className={size === 'lg' ? 'text-lg' : 'text-base'}>{icon}</span>;
  };

  const fetchCategories = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch('/api/admin/quiz-categories/presets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setCategories(data.presets || []);
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
    fetchCategories();
  }, [admin, adminLoading, fetchCategories]);

  const handleAdd = async () => {
    const key = newKey.trim();
    const text = newText.trim();
    if (!key || !text) { showToast('请输入分类标识和名称'); return; }
    setAdding(true);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch('/api/admin/quiz-categories/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key, text, emoji: newEmoji.trim() || undefined, order: newOrder }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || '创建失败'); return; }
      setNewKey(''); setNewText(''); setNewEmoji(''); setNewOrder(0);
      showToast('分类已创建');
      fetchCategories();
    } catch { showToast('网络错误'); }
    finally { setAdding(false); }
  };

  const openEdit = (cat: PresetCategory) => {
    setEditing(cat);
    setEditText(cat.text);
    setEditEmoji(cat.emoji || '');
    setEditOrder(cat.order);
  };

  const handleEdit = async () => {
    if (!editing) return;
    const text = editText.trim();
    if (!text) { showToast('分类名称不能为空'); return; }
    setSaving(true);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/quiz-categories/presets/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, emoji: editEmoji.trim() || null, order: editOrder }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || '编辑失败'); return; }
      setEditing(null);
      showToast('分类已更新');
      fetchCategories();
    } catch { showToast('网络错误'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (cat: PresetCategory) => {
    const ok = await dialog.confirm({
      title: '删除分类',
      message: `确定要删除分类「${cat.text}」吗？\n已有 ${cat.quizCount} 个题库的分类标记将变为"未分类"，题库本身不受影响。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(cat.id);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/quiz-categories/presets/${cat.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const data = await res.json(); showToast(data.error || '删除失败'); return; }
      showToast('分类已删除');
      fetchCategories();
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
              Category Management
            </div>
            <h2 className="text-[28px] leading-tight text-slate-800 mb-1.5"
              style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}>
              分类管理
            </h2>
            <p className="text-slate-500 text-sm">管理预置题库分类，用户可在题库列表中按分类筛选</p>
          </div>

          {/* 新增表单 */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="分类标识（英文）"
              className="w-32 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="分类名称"
              className="w-36 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <input
              type="text"
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="图标（emoji 或 URL）"
              className="w-40 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <input
              ref={newIconInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingNewIcon(true);
                const url = await uploadIcon(file);
                setUploadingNewIcon(false);
                if (url) setNewEmoji(url);
                if (newIconInputRef.current) newIconInputRef.current.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => newIconInputRef.current?.click()}
              disabled={uploadingNewIcon}
              className="px-3 py-2.5 text-[11px] bg-white/80 border border-slate-200 rounded-xl text-slate-500 hover:text-indigo-500 hover:border-indigo-300 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {uploadingNewIcon ? '上传中…' : '📷 上传'}
            </button>
            <input
              type="number"
              value={newOrder}
              onChange={(e) => setNewOrder(Number(e.target.value) || 0)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="排序"
              className="w-20 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newKey.trim() || !newText.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-sm font-medium rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md shadow-indigo-200 disabled:opacity-50 transition-all"
            >
              {adding ? '创建中…' : '新增分类'}
            </button>
          </div>

          {/* 列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full" />
            </div>
          ) : categories.length === 0 ? (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-12 text-center">
              <p className="text-slate-400">暂无预置分类，请添加</p>
            </div>
          ) : (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200/60 bg-slate-50/50 text-slate-500 text-[12px] uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-medium">图标</th>
                    <th className="text-left px-6 py-3 font-medium">名称</th>
                    <th className="text-left px-6 py-3 font-medium">标识</th>
                    <th className="text-left px-6 py-3 font-medium">题目数量</th>
                    <th className="text-left px-6 py-3 font-medium">排序</th>
                    <th className="text-right px-6 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat.id} className="border-b border-slate-100/60 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">{renderIcon(cat.emoji)}</td>
                      <td className="px-6 py-4 text-slate-800 font-medium text-[13.5px]">{cat.text}</td>
                      <td className="px-6 py-4 text-slate-400 text-[12.5px] font-mono">{cat.key}</td>
                      <td className="px-6 py-4 text-slate-600 text-[13px] tabular-nums">{cat.quizCount}</td>
                      <td className="px-6 py-4 text-slate-600 text-[13px] tabular-nums">{cat.order}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => openEdit(cat)}
                            className="px-3 py-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg text-[12.5px] transition-colors"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(cat)}
                            disabled={deletingId === cat.id}
                            className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-[12.5px] transition-colors disabled:opacity-50"
                          >
                            {deletingId === cat.id ? '删除中…' : '删除'}
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

      {/* 编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setEditing(null)}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-slate-800 text-lg font-bold mb-4">编辑分类「{editing.text}」</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">分类标识（不可修改）</label>
                <input type="text" value={editing.key} disabled
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 text-sm" />
              </div>
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">名称</label>
                <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm" />
              </div>
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">图标（emoji 或图片 URL）</label>
                <div className="flex gap-2">
                  <input type="text" value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm" />
                  <input
                    ref={editIconInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingEditIcon(true);
                      const url = await uploadIcon(file);
                      setUploadingEditIcon(false);
                      if (url) setEditEmoji(url);
                      if (editIconInputRef.current) editIconInputRef.current.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => editIconInputRef.current?.click()}
                    disabled={uploadingEditIcon}
                    className="px-3 py-2.5 text-[11px] bg-white/80 border border-slate-200 rounded-xl text-slate-500 hover:text-indigo-500 hover:border-indigo-300 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {uploadingEditIcon ? '上传中…' : '📷 上传'}
                  </button>
                </div>
                {editEmoji && (editEmoji.startsWith('http') || editEmoji.startsWith('/')) && (
                  <div className="mt-2">{renderIcon(editEmoji)}</div>
                )}
              </div>
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">排序</label>
                <input type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-sm">
                取消
              </button>
              <button onClick={handleEdit} disabled={saving}
                className="flex-1 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md disabled:opacity-50 transition-all text-sm">
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </div>
  );
}
