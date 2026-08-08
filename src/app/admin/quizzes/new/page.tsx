'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import QuizUploadPanel, { type ParsedQuestion } from '@/components/admin/QuizUploadPanel';

export default function NewQuizPage() {
  const router = useRouter();
  const { admin, loading: adminLoading } = useAdminAuth();
  const [timeLimit, setTimeLimit] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (adminLoading) return;
    const token = localStorage.getItem('adminToken');
    if (!token || !admin) {
      window.location.href = '/admin/login';
    }
  }, [admin, adminLoading]);

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
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1.5">
                New Quiz
              </div>
              <h2
                className="text-[28px] leading-tight text-slate-800 mb-1.5"
                style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}
              >
                发布新题库
              </h2>
              <p className="text-slate-500 text-sm">上传 Markdown 文件创建一份新的官方题库，所有用户都能看到</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600">
              {error}
            </div>
          )}

          <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 mb-6 shadow-sm">
            <label className="block text-slate-700 text-sm mb-2 font-medium">答题时长</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="480"
                value={timeLimit}
                onChange={(e) => setTimeLimit(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm text-center"
              />
              <span className="text-slate-500 text-sm">分钟</span>
              <span className="text-slate-400 text-xs ml-2">（0 = 不限时）</span>
              {[10, 20, 30, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => setTimeLimit(m)}
                  className={`px-2 py-1 text-[11px] rounded border transition-colors ${
                    timeLimit === m
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {m} 分钟
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-6 mb-6 shadow-sm">
            <QuizUploadPanel
              tone="admin"
              busy={saving}
              onParsed={async (parsedTitle, parsedQuestions: ParsedQuestion[]) => {
                setError('');
                if (!parsedTitle.trim()) {
                  setError('未能从文件中提取到标题');
                  return;
                }
                setSaving(true);
                const token = localStorage.getItem('adminToken');
                try {
                  const res = await fetch('/api/admin/quizzes', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      title: parsedTitle.trim(),
                      questions: parsedQuestions,
                      isOfficial: true,
                      timeLimit,
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setError(data.error || '创建失败');
                    return;
                  }
                  router.push('/admin/quizzes');
                } catch {
                  setError('网络错误');
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
