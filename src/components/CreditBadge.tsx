'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface CreditsState {
  balance: number;
  checkedIn: boolean;
  checkInReward: number;
}

export default function CreditBadge() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [state, setState] = useState<CreditsState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!token) return;
    const res = await fetch('/api/user/credits', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setState(await res.json());
  };

  useEffect(() => { load(); }, [token]);

  if (!user || user.isGuest) return null;

  const checkIn = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/user/checkin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.status === 409) alert(data.error || '今天已签到');
      else if (res.ok) {
        setState((s) => (s ? { ...s, balance: data.balance, checkedIn: true } : null));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <button
        onClick={() => router.push('/credits')}
        className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors font-medium"
        title="查看积分明细"
      >
        💎 {state?.balance ?? '—'}
      </button>
      {state && !state.checkedIn && (
        <button
          onClick={checkIn}
          disabled={busy}
          className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
        >
          签到 +{state.checkInReward}
        </button>
      )}
      {state?.checkedIn && (
        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px]">
          今日已签到
        </span>
      )}
    </div>
  );
}