'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface Ledger {
  id: string;
  delta: number;
  reason: string;
  refId: string | null;
  balance: number;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  daily_signin: '每日签到',
  topup: '充值',
  admin_adjust: '管理员调整',
  ai_explain: 'AI 解析',
  refund: '退还',
  signup: '注册奖励',
};

export default function CreditsPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<Ledger[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  const load = async () => {
    if (!token) return;
    const [creditsRes, historyRes] = await Promise.all([
      fetch('/api/user/credits', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/user/credits/history', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (creditsRes.ok) {
      const d = await creditsRes.json();
      setBalance(d.balance);
    }
    if (historyRes.ok) {
      const d = await historyRes.json();
      setHistory(d.history ?? []);
    }
  };

  useEffect(() => { load(); }, [token]);

  const topup = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch('/api/user/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: 100 }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`${data.message}\n新余额: ${data.balance}`);
        load();
      } else alert(data.error || '失败');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-6">
      <button
        onClick={() => router.back()}
        className="text-slate-500 hover:text-slate-800 mb-6 inline-flex items-center gap-2"
      >
        ← 返回
      </button>
      <div className="max-w-2xl mx-auto bg-white/80 backdrop-blur rounded-2xl p-6 shadow-sm border border-slate-200/60">
        <h1 className="text-2xl font-semibold text-slate-800 mb-4">积分中心</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-amber-600">当前余额</div>
            <div className="text-3xl font-bold text-amber-700">💎 {balance}</div>
          </div>
          <button
            onClick={topup}
            disabled={busy}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            {busy ? '充值中…' : '充值 (占位)'}
          </button>
        </div>
        <p className="text-[12px] text-slate-500 mb-6">
          充值服务即将上线。当前可联系管理员手工充值,或每日签到领取 5 积分。
        </p>

        <h2 className="text-[14px] font-semibold text-slate-700 mb-2">积分流水</h2>
        {history.length === 0 ? (
          <div className="text-[12px] text-slate-400 py-4 text-center">暂无流水</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left py-2">时间</th>
                <th className="text-left">类型</th>
                <th className="text-right">变动</th>
                <th className="text-right">余额</th>
              </tr>
            </thead>
            <tbody>
              {history.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-2 text-slate-500">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="text-slate-700">{REASON_LABELS[l.reason] || l.reason}</td>
                  <td
                    className={`text-right font-mono ${l.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                  >
                    {l.delta >= 0 ? '+' : ''}{l.delta}
                  </td>
                  <td className="text-right font-mono text-slate-600">{l.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}