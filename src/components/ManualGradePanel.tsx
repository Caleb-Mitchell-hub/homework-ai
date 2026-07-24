'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Item {
  questionId: string;
  userAnswer: string;
  correct: boolean;
  autoGraded: boolean;
  manualScore?: number;
  manualComment?: string;
  manualGradedBy?: string;
  manualGradedAt?: string;
}

export default function ManualGradePanel({
  resultId,
  questionId,
  item,
}: {
  resultId: string;
  questionId: string;
  item: Item;
}) {
  const { token } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState<string>(
    typeof item.manualScore === 'number' ? String(item.manualScore) : '',
  );
  const [comment, setComment] = useState<string>(item.manualComment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsAdmin(!!localStorage.getItem('adminToken'));
  }, []);

  const alreadyGraded =
    typeof item.manualScore === 'number' || !!item.manualComment;

  if (!isAdmin) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const adminToken = localStorage.getItem('adminToken') ?? '';
      const res = await fetch(`/api/admin/results/${resultId}/grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          questionId,
          manualScore: score === '' ? null : parseFloat(score),
          manualComment: comment,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `保存失败(${res.status})`);
      }
      // 成功后刷新当前页(简化做法)
      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50/40 border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] tracking-[0.2em] uppercase text-slate-400">
          ✍️ 人工批阅
        </div>
        {alreadyGraded && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-slate-500 hover:text-sky-500"
          >
            修改
          </button>
        )}
      </div>
      {alreadyGraded && !editing ? (
        <div className="mt-2 text-[12px] text-slate-600">
          <div>
            <span className="text-slate-400">分数:</span>
            <span className="ml-1 font-mono">{item.manualScore}</span>
          </div>
          {item.manualComment && (
            <div className="mt-1 text-slate-700 whitespace-pre-wrap">
              {item.manualComment}
            </div>
          )}
          <div className="mt-1 text-[10.5px] text-slate-400">
            by {item.manualGradedBy} at{' '}
            {item.manualGradedAt?.slice(0, 16).replace('T', ' ')}
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-[11px] text-sky-500 hover:text-sky-700"
          >
            {editing ? '收起' : '展开评分'}
          </button>
          {editing && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="分数(0~1)"
                  className="w-24 px-2 py-1 border border-slate-200 rounded text-[12px]"
                />
                <span className="text-[11px] text-slate-400">0~1</span>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="评语"
                rows={3}
                className="w-full px-2 py-1 border border-slate-200 rounded text-[12px]"
              />
              {error && (
                <div className="text-[11px] text-rose-500">{error}</div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={saving}
                  className="px-3 py-1 bg-sky-400 text-white text-[12px] rounded hover:bg-sky-500 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '提交'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setScore('');
                    setComment('');
                  }}
                  className="px-3 py-1 bg-slate-100 text-slate-600 text-[12px] rounded hover:bg-slate-200"
                >
                  取消
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}