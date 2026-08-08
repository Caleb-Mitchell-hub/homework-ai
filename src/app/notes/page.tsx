'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Note, NoteType, NoteSource } from '@/types';
import MarkdownView from '@/components/MarkdownView';

const typeLabels: Record<NoteType, string> = {
  question: '题目笔记',
  answer: '答题笔记',
  ai_output: 'AI输出',
};

const sourceLabels: Record<NoteSource, string> = {
  manual: '手动记录',
  ai_explain: 'AI解析',
  reference_answer: '标准答案',
  ai_report: 'AI报告',
};

export default function NotesPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<NoteType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!user) return;
    loadNotes();
  }, [user]);

  async function loadNotes() {
    setLoading(true);
    try {
      const res = await fetch('/api/notes');
      if (res.ok) {
        const data = await res.json();
        setNotes(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const selected = notes.find((n) => n.id === selectedId);

  function startEdit(note?: Note) {
    if (note) {
      setSelectedId(note.id);
      setTitle(note.title);
      setContent(note.content);
    } else {
      setSelectedId(null);
      setTitle('');
      setContent('');
    }
    setEditing(true);
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;
    try {
      if (selectedId) {
        await fetch(`/api/notes/${selectedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), content: content.trim() }),
        });
      } else {
        await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'question',
            title: title.trim(),
            content: content.trim(),
            source: 'manual',
          }),
        });
      }
      setEditing(false);
      await loadNotes();
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定要删除这条笔记吗？')) return;
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (selectedId === id) {
        setSelectedId(null);
        setEditing(false);
      }
      await loadNotes();
    } catch {
      // ignore
    }
  }

  const filtered = notes.filter((n) => {
    if (filter !== 'all' && n.type !== filter) return false;
    if (search && !n.title.includes(search) && !n.content.includes(search)) return false;
    return true;
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">请先登录</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📝 我的笔记</h1>
          <p className="text-sm text-slate-500 mt-1">管理所有题目笔记、答题笔记和AI输出记录</p>
        </div>
        <button
          onClick={() => startEdit()}
          className="bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + 新建笔记
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {(['all', 'question', 'answer', 'ai_output'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                filter === t ? 'bg-white shadow-sm text-slate-900 font-medium' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'all' ? '全部' : typeLabels[t]}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="搜索笔记..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-xs text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
        />
      </div>

      <div className="flex gap-6">
        {/* 笔记列表 */}
        <div className="w-80 flex-shrink-0">
          {loading ? (
            <p className="text-center text-slate-400 text-sm py-12">加载中...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-12">暂无笔记</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((note) => (
                <div
                  key={note.id}
                  onClick={() => { setSelectedId(note.id); setEditing(false); }}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedId === note.id
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-slate-200 hover:border-indigo-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {typeLabels[note.type]}
                    </span>
                    <span className="text-xs text-slate-400">{sourceLabels[note.source]}</span>
                  </div>
                  <h4 className="text-sm font-medium text-slate-800 truncate">{note.title}</h4>
                  <p className="text-xs text-slate-400 mt-1 truncate">{note.content.slice(0, 60)}</p>
                  <p className="text-xs text-slate-300 mt-1">
                    {new Date(note.updatedAt).toLocaleDateString('zh-CN')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 详情/编辑区 */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-slate-800">
                {selectedId ? '编辑笔记' : '新建笔记'}
              </h3>
              <input
                type="text"
                placeholder="笔记标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                maxLength={200}
              />
              <textarea
                placeholder="笔记内容（支持 Markdown）"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!title.trim() || !content.trim()}
                  className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  保存
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-sm text-slate-500 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {typeLabels[selected.type]}
                  </span>
                  <span className="text-xs text-slate-400">{sourceLabels[selected.source]}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(selected)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 px-3 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(selected.id)}
                    className="text-sm text-red-500 hover:text-red-700 px-3 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-4">{selected.title}</h2>
              <div className="prose prose-slate max-w-none">
                <MarkdownView content={selected.content} size="base" />
              </div>
              <p className="text-xs text-slate-400 mt-6">
                更新于 {new Date(selected.updatedAt).toLocaleString('zh-CN')}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              选择一条笔记查看详情，或点击"+ 新建笔记"开始记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
