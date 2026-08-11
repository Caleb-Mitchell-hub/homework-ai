'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import AdminSidebar from '@/components/AdminSidebar';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { useDialog } from '@/components/DialogProvider';
import Toast from '@/components/Toast';

// ── 类型 ──

interface DayPoint { date: string; issued: number; consumed: number }

interface ByReason { [k: string]: { delta: number; count: number } }

interface Summary {
  totalBalance: number;
  totalIssued: number;
  totalConsumed: number;
  accounts: number;
  zeroBalanceAccounts: number;
  todayIssued: number;
  todayConsumed: number;
  trend: DayPoint[];
  byReason: ByReason;
}

interface LedgerRow {
  id: string;
  userId: string;
  username: string;
  occupation: string | null;
  professionName: string | null;
  delta: number;
  reason: string;
  refId: string | null;
  balance: number;
  createdAt: string;
}

interface UserRow {
  id: string;
  username: string;
  occupation: string | null;
  professionName: string | null;
  balance: number;
  disabled: boolean;
  createdAt: string;
  lastActiveAt: string | null;
  ledgerCount: number;
  explanationCount: number;
  checkInCount: number;
}

interface UserDetail {
  user: {
    id: string;
    username: string;
    occupation: string | null;
    professionName: string | null;
    balance: number;
    disabled: boolean;
    createdAt: string;
    lastActiveAt: string | null;
  };
  stats: {
    totalIssued: number;
    totalConsumed: number;
    fromSignin: number;
    fromTopup: number;
    fromAdminAdjust: number;
    aiConsumed: number;
    explanationCount: number;
  };
  recentLedger: LedgerRow[];
  checkIns30: { id: string; checkInDate: string; credit: number; createdAt: string }[];
}

const REASON_LABEL: Record<string, string> = {
  signup: '注册赠送',
  daily_signin: '每日签到',
  topup: '充值',
  admin_adjust: '管理员调整',
  ai_explain: 'AI 解析消耗',
  refund: '退还',
};

// ── 工具 ──

const tokenFromAdmin = () =>
  typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

const CHART_TEXT = { color: '#94a3b8', fontSize: 11, fontFamily: 'inherit' };

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function reasonChipStyle(reason: string) {
  const map: Record<string, { bg: string; text: string }> = {
    signup: { bg: 'bg-sky-50', text: 'text-sky-600' },
    daily_signin: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    topup: { bg: 'bg-amber-50', text: 'text-amber-600' },
    admin_adjust: { bg: 'bg-violet-50', text: 'text-violet-600' },
    ai_explain: { bg: 'bg-rose-50', text: 'text-rose-600' },
    refund: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  };
  return map[reason] || { bg: 'bg-slate-50', text: 'text-slate-500' };
}

// ── 页面 ──

type Tab = 'overview' | 'ledger' | 'users';

export default function AdminCreditsPage() {
  const { admin, loading: adminLoading } = useAdminAuth();
  const dialog = useDialog();
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 2400);
  }, []);

  // ── 概览数据 ──
  useEffect(() => {
    if (adminLoading || !admin) return;
    const tok = tokenFromAdmin();
    if (!tok) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/credits/summary', {
          headers: { Authorization: `Bearer ${tok}` },
        });
        const data = await res.json();
        if (res.ok) setSummary(data);
        else showToast('err', data.error || '加载汇总失败');
      } finally {
        setLoadingSummary(false);
      }
    })();
  }, [admin, adminLoading, showToast]);

  // ── 趋势图 ──
  const trendOption = useMemo(() => {
    if (!summary) return {};
    const dates = summary.trend.map((p) => p.date.slice(5));
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
        textStyle: { color: '#334155', fontSize: 12 },
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      },
      legend: {
        bottom: 0,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 16,
      },
      grid: { left: 50, right: 24, top: 20, bottom: 48 },
      xAxis: {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisTick: { show: false },
        axisLabel: {
          ...CHART_TEXT,
          interval: Math.ceil(dates.length / 8),
        },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { ...CHART_TEXT, margin: 8 },
      },
      series: [
        {
          name: '每日入账',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: summary.trend.map((p) => p.issued),
          itemStyle: { color: '#34d399' },
          lineStyle: { color: '#34d399', width: 2 },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(52,211,153,0.18)' },
                { offset: 1, color: 'rgba(52,211,153,0)' },
              ],
            },
          },
        },
        {
          name: '每日消耗',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          data: summary.trend.map((p) => p.consumed),
          itemStyle: { color: '#fb7185' },
          lineStyle: { color: '#fb7185', width: 2 },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(251,113,133,0.16)' },
                { offset: 1, color: 'rgba(251,113,133,0)' },
              ],
            },
          },
        },
      ],
    };
  }, [summary]);

  if (adminLoading) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }
  if (!admin) {
    if (typeof window !== 'undefined') {
      window.location.href = '/admin/login';
    }
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-pink-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="px-6 py-8 max-w-7xl mx-auto">
        {/* 标题 */}
        <div className="mb-6">
          <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1">
            Credits
          </div>
          <h1
            className="text-[28px] leading-tight text-slate-800"
            style={{ fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic', fontWeight: 500 }}
          >
            积分与使用管理
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            全局积分余额、流水明细、签到/AI 解析使用情况查询与重置
          </p>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-5 border-b border-slate-200/60">
          {(
            [
              ['overview', '概览'],
              ['ledger', '流水明细'],
              ['users', '用户管理'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-[13px] tracking-wider transition-colors -mb-px border-b-2 ${
                tab === key
                  ? 'text-indigo-600 border-indigo-500 font-medium'
                  : 'text-slate-500 border-transparent hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <OverviewTab
            summary={summary}
            loading={loadingSummary}
            trendOption={trendOption}
            onExport={async (type) => {
              const tok = tokenFromAdmin();
              if (!tok) return;
              const url = `/api/admin/credits/export?type=${type}`;
              const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
              if (!res.ok) {
                showToast('err', '导出失败');
                return;
              }
              const blob = await res.blob();
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = type === 'users' ? `用户积分_${new Date().toISOString().slice(0,10)}.csv` : `积分流水_${new Date().toISOString().slice(0,10)}.csv`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(a.href);
              showToast('ok', '已导出');
            }}
          />
        )}
        {tab === 'ledger' && <LedgerTab showToast={showToast} />}
        {tab === 'users' && <UsersTab showToast={showToast} toastOk={(t) => showToast('ok', t)} toastErr={(t) => showToast('err', t)} dialog={dialog} />}
        </div>
      </main>

      {toast && (
        <div
          onClick={() => setToast(null)}
          className={`fixed top-4 right-4 z-[100] px-4 py-2 text-sm rounded-xl shadow-lg cursor-pointer border ${
            toast.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-600'
          }`}
        >
          {toast.text}（点击关闭）
        </div>
      )}
    </div>
  );
}

// ── 概览 Tab ──

function OverviewTab({
  summary,
  loading,
  trendOption,
  onExport,
}: {
  summary: Summary | null;
  loading: boolean;
  trendOption: any;
  onExport: (type: 'ledger' | 'users') => void;
}) {
  const byReason = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.byReason)
      .map(([k, v]) => ({ key: k, label: REASON_LABEL[k] || k, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [summary]);

  const byReasonOption = useMemo(() => {
    if (byReason.length === 0) return {};
    return {
      tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#e2e8f0', textStyle: { color: '#334155', fontSize: 12 } },
      legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
      series: [
        {
          type: 'pie',
          radius: ['50%', '75%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          data: byReason.map((r) => ({ name: r.label, value: r.count })),
        },
      ],
      color: ['#818cf8', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#22d3ee'],
    };
  }, [byReason]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/60 border border-slate-200/60 animate-pulse" />
        ))}
      </div>
    );
  }
  if (!summary) {
    return <div className="text-center py-12 text-slate-400">暂无汇总数据</div>;
  }

  return (
    <div className="space-y-5">
      {/* 顶部 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="全站余额" value={summary.totalBalance} unit="积分" tone="indigo" />
        <StatCard label="累计入账" value={summary.totalIssued} unit="积分" tone="emerald" />
        <StatCard label="累计消耗" value={Math.abs(summary.totalConsumed)} unit="积分" tone="rose" />
        <StatCard
          label="零余额用户"
          value={`${summary.zeroBalanceAccounts} / ${summary.accounts}`}
          unit="个"
          tone="amber"
        />
      </div>

      {/* 今日数据 */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="今日入账" value={summary.todayIssued} unit="积分" tone="emerald" small />
        <StatCard label="今日消耗" value={summary.todayConsumed} unit="积分" tone="rose" small />
      </div>

      {/* 趋势图 */}
      <div className="rounded-2xl bg-white/85 border border-slate-200/60 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[13px] text-slate-700 font-medium">近 30 天积分动向</div>
            <div className="text-[11px] text-slate-400">绿 = 入账 / 红 = 消耗</div>
          </div>
        </div>
        <ReactECharts option={trendOption} style={{ height: 260 }} notMerge lazyUpdate />
      </div>

      {/* 原因分布 + 导出 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white/85 border border-slate-200/60 p-4 lg:col-span-2">
          <div className="text-[13px] text-slate-700 font-medium mb-3">各类型累计（30 天）</div>
          {byReason.length === 0 ? (
            <div className="text-center text-slate-400 py-12 text-sm">暂无流水</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {byReason.map((r) => {
                const cs = reasonChipStyle(r.key);
                return (
                  <div key={r.key} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] ${cs.bg} ${cs.text}`}>
                        {r.label}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-3 text-right">
                      <span className={`text-[14px] font-semibold tabular-nums ${r.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {r.delta > 0 ? '+' : ''}{r.delta}
                      </span>
                      <span className="text-[11px] text-slate-400 tabular-nums w-12 text-right">
                        {r.count} 笔
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white/85 border border-slate-200/60 p-4">
          <div className="text-[13px] text-slate-700 font-medium mb-3">数据导出</div>
          <div className="space-y-2">
            <button
              onClick={() => onExport('ledger')}
              className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
            >
              <div className="text-[12.5px] text-slate-700 font-medium">导出流水</div>
              <div className="text-[10.5px] text-slate-400 mt-0.5">全部 ledger,CSV</div>
            </button>
            <button
              onClick={() => onExport('users')}
              className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
            >
              <div className="text-[12.5px] text-slate-700 font-medium">导出用户积分表</div>
              <div className="text-[10.5px] text-slate-400 mt-0.5">当前快照,CSV</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
  tone,
  small,
}: {
  label: string;
  value: number | string;
  unit?: string;
  tone: 'indigo' | 'emerald' | 'rose' | 'amber';
  small?: boolean;
}) {
  const bg: Record<string, string> = {
    indigo: 'from-indigo-50/60 to-white border-indigo-100',
    emerald: 'from-emerald-50/60 to-white border-emerald-100',
    rose: 'from-rose-50/60 to-white border-rose-100',
    amber: 'from-amber-50/60 to-white border-amber-100',
  };
  const valueColor: Record<string, string> = {
    indigo: 'text-indigo-600',
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
    amber: 'text-amber-600',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${bg[tone]} p-4`}>
      <div className="text-[11.5px] text-slate-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`${small ? 'text-[24px]' : 'text-[28px]'} leading-none font-semibold tabular-nums tracking-tight ${valueColor[tone]}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {unit && <span className="text-[11px] text-slate-400">{unit}</span>}
      </div>
    </div>
  );
}

// ── 流水 Tab ──

function LedgerTab({ showToast }: { showToast: (k: 'ok' | 'err', t: string) => void }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalDelta, setTotalDelta] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [keyword, setKeyword] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchList = useCallback(async () => {
    const tok = tokenFromAdmin();
    if (!tok) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        ...(reason && { reason }),
        ...(keyword && { keyword }),
        ...(from && { from }),
        ...(to && { to }),
      });
      const res = await fetch(`/api/admin/credits/ledger?${q}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (res.ok) {
        setRows(data.list);
        setTotal(data.total);
        setTotalDelta(data.totalDelta);
      }
    } finally {
      setLoading(false);
    }
  }, [page, reason, keyword, from, to]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={reason}
          onChange={(e) => { setPage(1); setReason(e.target.value); }}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[12.5px] outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        >
          <option value="">全部原因</option>
          {Object.entries(REASON_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          type="date"
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[12.5px]"
        />
        <span className="self-center text-slate-400 text-[12px]">至</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          type="date"
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[12.5px]"
        />
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索用户名/职业"
          className="flex-1 min-w-[160px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-[12.5px] outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchList(); } }}
        />
        <button
          onClick={() => { setPage(1); fetchList(); }}
          className="px-4 py-2 bg-indigo-500 text-white text-[12.5px] rounded-lg hover:bg-indigo-600"
        >
          应用筛选
        </button>
        <button
          onClick={async () => {
            const tok = tokenFromAdmin();
            if (!tok) return;
            const q = new URLSearchParams({ ...(reason && { reason }), ...(from && { from }), ...(to && { to }) });
            const res = await fetch(`/api/admin/credits/export?type=ledger&${q}`, { headers: { Authorization: `Bearer ${tok}` } });
            if (!res.ok) { showToast('err', '导出失败'); return; }
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `积分流水_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            showToast('ok', '已导出');
          }}
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-[12.5px] rounded-lg hover:border-indigo-300"
        >
          导出 CSV
        </button>
      </div>

      {/* 总和提示 */}
      <div className="mb-2 text-[11.5px] text-slate-500">
        共 <span className="font-semibold text-slate-700 tabular-nums">{total}</span> 笔,
        合计变动{' '}
        <span className={`font-semibold tabular-nums ${totalDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {totalDelta > 0 ? '+' : ''}{totalDelta}
        </span>{' '}
        积分
      </div>

      {/* 表格 */}
      <div className="rounded-2xl bg-white/85 border border-slate-200/60 overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-slate-50/60 border-b border-slate-200/60 text-left text-slate-500">
              <th className="px-4 py-2.5 font-normal">时间</th>
              <th className="px-4 py-2.5 font-normal">用户</th>
              <th className="px-4 py-2.5 font-normal">职业</th>
              <th className="px-4 py-2.5 font-normal text-right">变动</th>
              <th className="px-4 py-2.5 font-normal text-right">余额</th>
              <th className="px-4 py-2.5 font-normal">原因</th>
              <th className="px-4 py-2.5 font-normal">关联 ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={7} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">暂无流水</td></tr>
            ) : (
              rows.map((r) => {
                const cs = reasonChipStyle(r.reason);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/40">
                    <td className="px-4 py-2.5 text-slate-500 tabular-nums">{fmtDate(r.createdAt)}</td>
                    <td className="px-4 py-2.5 text-slate-700">{r.username}</td>
                    <td className="px-4 py-2.5 text-slate-500">{r.occupation || r.professionName || '—'}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {r.delta > 0 ? '+' : ''}{r.delta}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{r.balance}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] ${cs.bg} ${cs.text}`}>
                        {REASON_LABEL[r.reason] || r.reason}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-[11px] truncate max-w-[180px]" title={r.refId || ''}>
                      {r.refId || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-[12px] border border-slate-200 rounded-md disabled:opacity-40 hover:bg-white"
          >
            上一页
          </button>
          <span className="text-[12px] text-slate-500 tabular-nums">
            {page} / {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-3 py-1.5 text-[12px] border border-slate-200 rounded-md disabled:opacity-40 hover:bg-white"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

// ── 用户 Tab ──

function UsersTab({
  showToast,
  toastOk,
  toastErr,
  dialog,
}: {
  showToast: (k: 'ok' | 'err', t: string) => void;
  toastOk: (t: string) => void;
  toastErr: (t: string) => void;
  dialog: any;
}) {
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<'balance_desc' | 'balance_asc'>('balance_desc');
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  const fetchList = useCallback(async () => {
    const tok = tokenFromAdmin();
    if (!tok) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        sort,
        ...(keyword && { keyword }),
      });
      const res = await fetch(`/api/admin/credits/users?${q}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.list);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, keyword, sort]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // 打开详情
  const openDetail = async (userId: string) => {
    const tok = tokenFromAdmin();
    if (!tok) return;
    setDetailBusy(true);
    try {
      const res = await fetch(`/api/admin/credits/user/${userId}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (res.ok) setDetail(data);
      else toastErr(data.error || '加载失败');
    } finally {
      setDetailBusy(false);
    }
  };

  // 调整积分
  const handleAdjust = async (userId: string, username: string) => {
    const deltaStr = await dialog.prompt({
      title: `调整积分 · ${username}`,
      message: '输入要加减的积分数量（负数=扣除），单次不超过 ±100000',
      placeholder: '例如: 100 或 -50',
    });
    if (deltaStr === null) return;
    const delta = Number(deltaStr);
    if (!Number.isFinite(delta) || delta === 0) {
      toastErr('请输入非零数值');
      return;
    }
    const ok = await dialog.confirm({
      title: '确认调整',
      message: `对「${username}」调整 ${delta > 0 ? '+' : ''}${delta} 积分,确认执行?`,
      confirmText: '执行',
    });
    if (!ok) return;

    const tok = tokenFromAdmin();
    const res = await fetch(`/api/admin/credits/user/${userId}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ delta }),
    });
    const data = await res.json();
    if (res.ok) {
      toastOk(`已调整,新余额 ${data.balance}`);
      fetchList();
      if (detail?.user.id === userId) openDetail(userId);
    } else {
      toastErr(data.error || '调整失败');
    }
  };

  // 重置操作
  const handleReset = async (
    userId: string,
    username: string,
    action: 'checkin' | 'explanations' | 'all'
  ) => {
    const labels = {
      checkin: '清空签到记录',
      explanations: '清空 AI 解析记录',
      all: '一键重置账户(签到 + AI 解析 + 余额归零)',
    } as const;
    const ok = await dialog.confirm({
      title: labels[action],
      message: `对「${username}」${labels[action]}?\n此操作不可撤销。`,
      confirmText: '执行',
      danger: true,
    });
    if (!ok) return;

    const tok = tokenFromAdmin();
    const res = await fetch(`/api/admin/credits/user/${userId}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (res.ok) {
      toastOk(data.message || '重置成功');
      fetchList();
      if (detail?.user.id === userId) openDetail(userId);
    } else {
      toastErr(data.error || '重置失败');
    }
  };

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索用户名/职业"
          className="flex-1 min-w-[180px] px-3 py-2 bg-white border border-slate-200 rounded-lg text-[12.5px] outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
          onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchList(); } }}
        />
        <select
          value={sort}
          onChange={(e) => { setPage(1); setSort(e.target.value as any); }}
          className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-[12.5px]"
        >
          <option value="balance_desc">余额高 → 低</option>
          <option value="balance_asc">余额低 → 高</option>
        </select>
        <button
          onClick={() => { setPage(1); fetchList(); }}
          className="px-4 py-2 bg-indigo-500 text-white text-[12.5px] rounded-lg hover:bg-indigo-600"
        >
          查询
        </button>
        <button
          onClick={async () => {
            const tok = tokenFromAdmin();
            if (!tok) return;
            const res = await fetch(`/api/admin/credits/export?type=users`, { headers: { Authorization: `Bearer ${tok}` } });
            if (!res.ok) { toastErr('导出失败'); return; }
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `用户积分_${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            toastOk('已导出');
          }}
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-[12.5px] rounded-lg hover:border-indigo-300"
        >
          导出 CSV
        </button>
      </div>

      <div className="text-[11.5px] text-slate-500 mb-2">
        共 <span className="font-semibold text-slate-700 tabular-nums">{total}</span> 个用户
      </div>

      {/* 用户表 */}
      <div className="rounded-2xl bg-white/85 border border-slate-200/60 overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-slate-50/60 border-b border-slate-200/60 text-left text-slate-500">
              <th className="px-4 py-2.5 font-normal">用户</th>
              <th className="px-4 py-2.5 font-normal">职业</th>
              <th className="px-4 py-2.5 font-normal text-right">余额</th>
              <th className="px-4 py-2.5 font-normal text-center">流水</th>
              <th className="px-4 py-2.5 font-normal text-center">签到</th>
              <th className="px-4 py-2.5 font-normal text-center">AI</th>
              <th className="px-4 py-2.5 font-normal">最近活跃</th>
              <th className="px-4 py-2.5 font-normal text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={8} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded" /></td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">暂无用户</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/40">
                  <td className="px-4 py-2.5">
                    <div className="text-slate-700 font-medium">{u.username}</div>
                    {u.disabled && <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-600">已停用</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{u.occupation || u.professionName || '—'}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${u.balance === 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                    {u.balance.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-slate-500">{u.ledgerCount}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-slate-500">{u.checkInCount}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-slate-500">{u.explanationCount}</td>
                  <td className="px-4 py-2.5 text-slate-500 tabular-nums text-[11.5px]">
                    {u.lastActiveAt ? fmtDate(u.lastActiveAt).slice(0, 16) : '从未'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => openDetail(u.id)}
                        className="px-2 py-1 text-[11.5px] text-indigo-600 hover:bg-indigo-50 rounded"
                      >
                        详情
                      </button>
                      <button
                        onClick={() => handleAdjust(u.id, u.username)}
                        className="px-2 py-1 text-[11.5px] text-emerald-600 hover:bg-emerald-50 rounded"
                      >
                        调整
                      </button>
                      <button
                        onClick={() => handleReset(u.id, u.username, 'all')}
                        className="px-2 py-1 text-[11.5px] text-rose-600 hover:bg-rose-50 rounded"
                      >
                        重置
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-[12px] border border-slate-200 rounded-md disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-[12px] text-slate-500 tabular-nums">{page} / {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-3 py-1.5 text-[12px] border border-slate-200 rounded-md disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {/* 详情侧抽屉 */}
      {detail && (
        <UserDetailDrawer
          detail={detail}
          busy={detailBusy}
          onClose={() => setDetail(null)}
          onAdjust={() => handleAdjust(detail.user.id, detail.user.username)}
          onReset={(action) => handleReset(detail.user.id, detail.user.username, action)}
        />
      )}
    </div>
  );
}

function UserDetailDrawer({
  detail,
  busy,
  onClose,
  onAdjust,
  onReset,
}: {
  detail: UserDetail;
  busy: boolean;
  onClose: () => void;
  onAdjust: () => void;
  onReset: (action: 'checkin' | 'explanations' | 'all') => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[560px] bg-white shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80">User Detail</div>
            <h3 className="text-[18px] text-slate-800 font-semibold mt-0.5">{detail.user.username}</h3>
            {(detail.user.occupation || detail.user.professionName) && (
              <div className="text-[11.5px] text-slate-400 mt-0.5">{detail.user.occupation || detail.user.professionName}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"
            aria-label="关闭"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {busy && (
            <div className="text-center py-4 text-slate-400 text-sm">加载中…</div>
          )}

          {/* 当前余额 */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 p-4">
            <div className="text-[11.5px] text-slate-500">当前余额</div>
            <div className="mt-1 text-[36px] font-semibold text-indigo-600 tabular-nums leading-none">
              {detail.user.balance.toLocaleString()}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={onAdjust}
                className="px-3 py-1.5 text-[11.5px] bg-indigo-500 text-white rounded-md hover:bg-indigo-600"
              >
                调整积分
              </button>
              <button
                onClick={() => onReset('checkin')}
                className="px-3 py-1.5 text-[11.5px] bg-white border border-slate-200 text-slate-700 rounded-md hover:border-slate-300"
              >
                清空签到
              </button>
              <button
                onClick={() => onReset('explanations')}
                className="px-3 py-1.5 text-[11.5px] bg-white border border-slate-200 text-slate-700 rounded-md hover:border-slate-300"
              >
                清空 AI
              </button>
              <button
                onClick={() => onReset('all')}
                className="px-3 py-1.5 text-[11.5px] bg-rose-500 text-white rounded-md hover:bg-rose-600"
              >
                一键重置
              </button>
            </div>
          </div>

          {/* 累计 */}
          <div>
            <div className="text-[12px] text-slate-500 mb-2">累计</div>
            <div className="grid grid-cols-2 gap-2">
              <KPI label="累计入账" value={`+${detail.stats.totalIssued}`} tone="emerald" />
              <KPI label="累计消耗" value={`${detail.stats.totalConsumed}`} tone="rose" />
              <KPI label="签到贡献" value={`+${detail.stats.fromSignin}`} tone="sky" />
              <KPI label="充值贡献" value={`+${detail.stats.fromTopup}`} tone="amber" />
              <KPI label="管理员调整" value={`${detail.stats.fromAdminAdjust > 0 ? '+' : ''}${detail.stats.fromAdminAdjust}`} tone="violet" />
              <KPI label="AI 消耗次数" value={`${detail.stats.explanationCount} 次`} tone="rose" />
            </div>
          </div>

          {/* 最近 10 条流水 */}
          <div>
            <div className="text-[12px] text-slate-500 mb-2">最近 10 条流水</div>
            <div className="rounded-lg border border-slate-200/60 divide-y divide-slate-100">
              {detail.recentLedger.length === 0 ? (
                <div className="px-3 py-6 text-center text-slate-400 text-[12px]">暂无</div>
              ) : (
                detail.recentLedger.map((r) => {
                  const cs = reasonChipStyle(r.reason);
                  return (
                    <div key={r.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10.5px] ${cs.bg} ${cs.text}`}>
                          {REASON_LABEL[r.reason] || r.reason}
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {fmtDate(r.createdAt).slice(5)}
                        </span>
                      </div>
                      <span className={`tabular-nums text-[12.5px] font-medium ${r.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {r.delta > 0 ? '+' : ''}{r.delta}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 最近 30 天签到 */}
          <div>
            <div className="text-[12px] text-slate-500 mb-2">最近 30 天签到</div>
            <div className="rounded-lg border border-slate-200/60 p-3 max-h-48 overflow-y-auto">
              {detail.checkIns30.length === 0 ? (
                <div className="text-center text-slate-400 text-[12px] py-2">暂无签到</div>
              ) : (
                <div className="grid grid-cols-5 gap-1.5">
                  {detail.checkIns30.map((c) => (
                    <div
                      key={c.id}
                      className="rounded bg-emerald-50 text-emerald-700 text-[10px] py-1 px-1 text-center"
                      title={`${c.checkInDate.toString().slice(0,10)} +${c.credit}`}
                    >
                      {typeof c.checkInDate === 'string'
                        ? c.checkInDate.slice(5)
                        : new Date(c.checkInDate).toISOString().slice(5, 10)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'rose' | 'sky' | 'amber' | 'violet' }) {
  const map: Record<string, string> = {
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
    sky: 'text-sky-600',
    amber: 'text-amber-600',
    violet: 'text-violet-600',
  };
  return (
    <div className="rounded-lg border border-slate-200/60 bg-white px-3 py-2">
      <div className="text-[10.5px] text-slate-500">{label}</div>
      <div className={`mt-0.5 text-[16px] font-semibold tabular-nums ${map[tone]}`}>{value}</div>
    </div>
  );
}
