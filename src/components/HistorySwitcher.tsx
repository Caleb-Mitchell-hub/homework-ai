'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface HistoryItem {
  id: string;
  name: string;
  status: string;
  score: number;
  totalScore: number;
  submittedAt: string;
}

export default function HistorySwitcher({
  quizId,
  onSelect,
  disabled,
}: {
  quizId: string;
  onSelect: (item: HistoryItem) => void;
  disabled?: boolean;
}) {
  const { token } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/results?quizId=${quizId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const submitted = (data.results ?? []).filter(
          (r: HistoryItem) => r.status === 'submitted',
        );
        // 按 submittedAt 倒序(新→旧)
        submitted.sort((a: HistoryItem, b: HistoryItem) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
        );
        setItems(submitted);
      } catch {
        // 静默失败
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, token]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/80 border border-slate-200 text-slate-600 hover:border-sky-300 text-[12px]"
        title="查看历史答卷"
      >
        📚 {items.length} 次
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 max-h-80 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20">
          {items.map((item) => {
            const date = new Date(item.submittedAt);
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
                className="block w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
              >
                <div className="text-[13px] font-medium text-slate-700">{item.name}</div>
                <div className="text-[11px] text-slate-400 flex items-center justify-between mt-0.5">
                  <span>{date.toLocaleString('zh-CN')}</span>
                  <span className="font-mono">
                    {item.score}/{item.totalScore}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}