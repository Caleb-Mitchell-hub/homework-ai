'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import { useDialog } from '@/components/DialogProvider';
import { PREFIX_PRESET } from '@/lib/quizCategories';
import { getCategoryEmojiText } from '@/components/CategoryIcon';

interface Question {
  id?: string;
  type: 'single' | 'multiple' | 'judge' | 'fill' | 'essay' | 'code' | 'interview';
  content: string;
  options?: string[];
  answer: string;
  analysis?: string;
  score: number;
}

export default function EditQuizPage() {
  const params = useParams();
  const router = useRouter();
  const { admin, loading: adminLoading } = useAdminAuth();
  const dialog = useDialog();
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isOfficial, setIsOfficial] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [presetCategories, setPresetCategories] = useState<{ key: string; text: string; emoji: string }[]>([]);

  // 从 API 加载预设分类
  useEffect(() => {
    fetch('/api/quiz-categories/presets')
      .then((res) => res.json())
      .then((data) => {
        if (data.presets) setPresetCategories(data.presets);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (adminLoading) return;
    const token = localStorage.getItem('adminToken');
    if (!token || !admin) {
      window.location.href = '/admin/login';
    }
  }, [admin, adminLoading]);

  useEffect(() => {
    if (!admin) return;
    const id = params.id as string;
    const token = localStorage.getItem('adminToken');
    fetch(`/api/admin/quizzes/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.quiz) {
          setTitle(data.quiz.title);
          setIsOfficial(data.quiz.isOfficial);
          setCategoryId(data.quiz.categoryId ?? null);
          setQuestions(data.quiz.questions || []);
        } else {
          setError(data.error || '加载失败');
        }
      })
      .catch(() => setError('网络错误'))
      .finally(() => setLoading(false));
  }, [admin, params.id]);

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...updates } : q)));
  };

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex || !q.options) return q;
        const newOptions = [...q.options];
        newOptions[oIndex] = value;
        return { ...q, options: newOptions };
      })
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('题库标题不能为空');
      return;
    }
    setSaving(true);
    setError('');
    const id = params.id as string;
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/quizzes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title: title.trim(), questions, categoryId }),
      });
      if (res.ok) {
        router.push('/admin/quizzes');
      } else {
        const data = await res.json();
        setError(data.error || '保存失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await dialog.confirm({
      title: '删除题库',
      message: '确定要删除这个题库吗?此操作不可恢复!',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    const id = params.id as string;
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/quizzes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        router.push('/admin/quizzes');
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

  if (loading) {
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
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium">
                  Edit Quiz
                </span>
                {isOfficial && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-50 text-indigo-600 font-medium">
                    官方
                  </span>
                )}
              </div>
              <h2
                className="text-[28px] leading-tight text-slate-800 mb-1.5"
                style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}
              >
                查看 / 编辑题库
              </h2>
              <p className="text-slate-500 text-sm">修改题库内容或删除该题库</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-rose-50 text-rose-500 text-[12.5px] rounded-xl hover:bg-rose-100 transition-colors"
              >
                删除
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-[13px] font-medium rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md shadow-indigo-200 disabled:opacity-50 transition-all"
              >
                {saving ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600">
            {error}
          </div>
        )}

        <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 mb-6 shadow-sm">
          <label className="block text-slate-700 text-sm mb-2 font-medium">题库标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          />
        </div>

        <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 mb-6 shadow-sm">
          <label className="block text-slate-700 text-sm mb-2 font-medium">题库分类</label>
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">未分类</option>
            {presetCategories.map((c) => (
              <option key={c.key} value={`${PREFIX_PRESET}${c.key}`}>
                {getCategoryEmojiText(c.emoji)} {c.text}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          {questions.map((q, qIndex) => (
            <div key={qIndex} className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-800 font-medium">第 {qIndex + 1} 题</h3>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-500">
                    {q.type === 'single' && '单选'}
                    {q.type === 'multiple' && '多选'}
                    {q.type === 'judge' && '判断'}
                    {q.type === 'fill' && '填空'}
                    {q.type === 'essay' && '简答'}
                    {q.type === 'code' && '代码'}
                    {q.type === 'interview' && '面试'}
                  </span>
                  <span className="text-slate-500 text-sm">{q.score} 分</span>
                </div>
              </div>

              <div className="mb-4 p-4 bg-slate-50 rounded-xl text-slate-800">{q.content}</div>

              {(q.type === 'single' || q.type === 'multiple') && q.options && (
                <div className="space-y-2 mb-4">
                  {q.options.map((opt, oIndex) => (
                    <div key={oIndex} className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl">
                      <span className="text-slate-400 w-6">{String.fromCharCode(65 + oIndex)}.</span>
                      <span className="text-slate-700 text-sm flex-1">{opt}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-emerald-600 text-sm">
                  答案: {q.type === 'judge' ? (q.answer === 'true' ? '正确' : '错误') : q.answer}
                </p>
              </div>

              {q.analysis && (
                <div className="mt-3 p-3 bg-slate-50 rounded-xl text-slate-600 text-sm">
                  解析: {q.analysis}
                </div>
              )}
            </div>
          ))}
        </div>
        </div>
      </main>
    </div>
  );
}
