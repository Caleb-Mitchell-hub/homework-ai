'use client';

import { useState, useEffect } from 'react';
import type { Note, NoteType, NoteSource } from '@/types';

interface Props {
  /** 是否显示面板 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 当前题目ID（可选，用于自动关联） */
  questionId?: string;
  /** 当前测验ID（可选） */
  quizId?: string;
  /** 当前答题结果ID（可选） */
  resultId?: string;
  /** 预设内容（如从AI输出打开笔记时自动填入） */
  presetContent?: string;
  /** 预设来源 */
  presetSource?: NoteSource;
}

export default function NotePanel({
  open,
  onClose,
  questionId,
  quizId,
  resultId,
  presetContent,
  presetSource,
}: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('answer');
  const [saving, setSaving] = useState(false);

  // 加载笔记列表
  useEffect(() => {
    if (!open) return;
    loadNotes();
  }, [open, questionId, quizId, resultId]);

  // 预设内容
  useEffect(() => {
    if (presetContent) {
      setContent(presetContent);
      setNoteType('ai_output');
      setEditingId(null);
      setTitle('');
    }
  }, [presetContent]);

  async function loadNotes() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (questionId) params.set('questionId', questionId);
      if (quizId) params.set('quizId', quizId);
      if (resultId) params.set('resultId', resultId);

      const res = await fetch(`/api/notes?${params.toString()}`);
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

  async function handleSave() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        // 更新
        await fetch(`/api/notes/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim(), content: content.trim() }),
        });
      } else {
        // 新建
        await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: noteType,
            questionId: questionId || null,
            quizId: quizId || null,
            resultId: resultId || null,
            title: title.trim(),
            content: content.trim(),
            source: presetSource || 'manual',
          }),
        });
      }
      // 重置表单
      setTitle('');
      setContent('');
      setEditingId(null);
      setNoteType('answer');
      await loadNotes();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      await loadNotes();
    } catch {
      // ignore
    }
  }

  function handleEdit(note: Note) {
    setEditingId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setNoteType(note.type);
  }

  function cancelEdit() {
    setEditingId(null);
    setTitle('');
    setContent('');
    setNoteType('answer');
  }

  if (!open) return null;

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

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="font-semibold text-slate-800">📝 笔记</h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 编辑区 */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        {editingId && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">编辑中</span>
          </div>
        )}
        <div className="flex gap-2">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value as NoteType)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="question">题目笔记</option>
            <option value="answer">答题笔记</option>
            <option value="ai_output">AI输出</option>
          </select>
        </div>
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
          rows={5}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 resize-none"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || !content.trim()}
            className="flex-1 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中...' : editingId ? '更新' : '保存'}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              className="text-sm text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              取消
            </button>
          )}
        </div>
      </div>

      {/* 笔记列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="text-center text-slate-400 text-sm py-8">加载中...</p>
        ) : notes.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">暂无笔记</p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-indigo-200 transition-colors cursor-pointer group"
              onClick={() => handleEdit(note)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {typeLabels[note.type]}
                    </span>
                    {note.source !== 'manual' && (
                      <span className="text-xs text-slate-500">{sourceLabels[note.source]}</span>
                    )}
                  </div>
                  <h4 className="text-sm font-medium text-slate-800 truncate">{note.title}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{note.content.slice(0, 100)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(note.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"
                  title="删除"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
