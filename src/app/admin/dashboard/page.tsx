'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';

// ── 类型 ──

interface OccupationRow {
  name: string;
  count: number;
}

interface ProfessionRow {
  id: string;
  name: string;
  userCount: number;
  assignmentCount: number;
}

interface Permissions {
  admins: number;
  regularUsers: number;
  guests: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

interface MomComparison {
  currentMonth: { users: number; quizzes: number; results: number };
  previousMonth: { users: number; quizzes: number; results: number };
  growth: { users: number | null; quizzes: number | null; results: number | null };
}

interface Stats {
  totalUsers: number;
  registeredUsers: number;
  guestUsers: number;
  onlineUsers: number;
  totalQuizzes: number;
  officialQuizzes: number;
  subscribedUsers: number;
  disabledUsers: number;
  todayNewUsers: number;
  todayNewQuizzes: number;
  todayResults: number;
  occupations: OccupationRow[];
  professions: ProfessionRow[];
  permissions: Permissions;
  userTrend: TrendPoint[];
  quizTrend: TrendPoint[];
  resultTrend: TrendPoint[];
  momComparison: MomComparison;
}

// ── 图表工具 ──

const CHART_TEXT_STYLE = { color: '#94a3b8', fontSize: 11, fontFamily: 'inherit' };

function lineChartOption(dates: string[], series: { name: string; data: number[]; color: string }[]) {
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
    grid: { left: 48, right: 24, top: 20, bottom: 48, containLabel: false },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisTick: { show: false },
      boundaryGap: false,
      axisLabel: {
        ...CHART_TEXT_STYLE,
        rotate: dates.length > 14 ? 45 : 0,
        interval: dates.length > 14 ? Math.ceil(dates.length / 7) : 'auto',
        formatter: (v: string) => v.slice(5), // MM-DD
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      axisLabel: { ...CHART_TEXT_STYLE, margin: 8 },
    },
    series: series.map((s) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { color: s.color, width: 2.5 },
      itemStyle: { color: s.color },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: s.color + '25' },
            { offset: 1, color: s.color + '02' },
          ],
        },
      },
    })),
  };
}

// ── 卡片组件 ──

function StatCard({
  title,
  value,
  suffix,
  color,
  icon,
  pulse,
}: {
  title: string;
  value: number;
  suffix?: string;
  color: string;
  icon: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-300/60 transition-all group">
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-500 text-[12.5px]">{title}</p>
        <div
          className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform`}
        >
          {icon}
        </div>
      </div>
      <p
        className={`text-[32px] font-bold text-slate-800 tabular-nums leading-none ${pulse ? 'animate-pulse' : ''}`}
      >
        {value}
        {suffix && <span className="text-sm font-normal text-slate-400 ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}

function GrowthBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-slate-400">新增</span>;
  if (value > 0)
    return <span className="text-[11px] text-emerald-500 font-medium">↑ {value}%</span>;
  if (value < 0)
    return <span className="text-[11px] text-rose-500 font-medium">↓ {Math.abs(value)}%</span>;
  return <span className="text-[11px] text-slate-400">持平</span>;
}

// ── 主组件 ──

export default function AdminDashboard() {
  const { admin, loading: adminLoading } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (adminLoading) return;
    const token = localStorage.getItem('adminToken');
    if (!token || !admin) {
      window.location.href = '/admin/login';
    }
  }, [admin, adminLoading]);

  useEffect(() => {
    if (!admin) return;
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('获取统计失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [admin]);

  // ── 图表数据 ──

  const trendDates = useMemo(() => stats?.userTrend?.map((p) => p.date) ?? [], [stats]);
  const userTrendOption = useMemo(() => {
    if (!stats) return {};
    return lineChartOption(trendDates, [
      { name: '新增用户', data: stats.userTrend.map((p) => p.count), color: '#818cf8' },
    ]);
  }, [stats, trendDates]);

  const combinedTrendOption = useMemo(() => {
    if (!stats) return {};
    return lineChartOption(trendDates, [
      { name: '新增题库', data: stats.quizTrend.map((p) => p.count), color: '#34d399' },
      { name: '答题次数', data: stats.resultTrend.map((p) => p.count), color: '#f472b6' },
    ]);
  }, [stats, trendDates]);

  const momBarOption = useMemo(() => {
    if (!stats) return {};
    const m = stats.momComparison;
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
        textStyle: { color: '#334155', fontSize: 12 },
      },
      legend: {
        bottom: 0,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 20,
      },
      grid: { left: 48, right: 24, top: 30, bottom: 48 },
      xAxis: {
        type: 'category',
        data: ['用户', '题库', '答题'],
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisTick: { show: false },
        axisLabel: CHART_TEXT_STYLE,
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { ...CHART_TEXT_STYLE, margin: 8 },
      },
      series: [
        {
          name: '上月',
          type: 'bar',
          barGap: '30%',
          data: [m.previousMonth.users, m.previousMonth.quizzes, m.previousMonth.results],
          itemStyle: { color: '#cbd5e1', borderRadius: [4, 4, 0, 0] },
          barWidth: 32,
        },
        {
          name: '本月',
          type: 'bar',
          data: [m.currentMonth.users, m.currentMonth.quizzes, m.currentMonth.results],
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#818cf8' },
                { offset: 1, color: '#6366f1' },
              ],
            },
            borderRadius: [4, 4, 0, 0],
          },
          barWidth: 32,
          label: {
            show: true,
            position: 'top',
            distance: 6,
            fontSize: 11,
            color: '#6366f1',
            fontWeight: 600,
            formatter: (p: { value: number }) => (p.value > 0 ? p.value : ''),
          },
        },
      ],
    };
  }, [stats]);

  const occupationPieOption = useMemo(() => {
    if (!stats?.occupations?.length) return {};
    const list = stats.occupations.slice(0, 10);
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
        textStyle: { color: '#334155', fontSize: 12 },
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        orient: 'vertical',
        right: 4,
        top: 'center',
        itemGap: 8,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 8,
        itemHeight: 8,
        pageIconSize: 8,
        pageTextStyle: { color: '#94a3b8', fontSize: 10 },
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['35%', '50%'],
          emphasis: { label: { fontSize: 14, fontWeight: 'bold' } },
          label: { show: false },
          data: list.map((o) => ({ name: o.name, value: o.count })),
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
        },
      ],
      color: [
        '#818cf8', '#34d399', '#f472b6', '#fbbf24', '#fb923c',
        '#38bdf8', '#a78bfa', '#f87171', '#4ade80', '#e2e8f0',
      ],
    };
  }, [stats]);

  const permDonutOption = useMemo(() => {
    if (!stats) return {};
    const p = stats.permissions;
    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
        textStyle: { color: '#334155', fontSize: 12 },
        formatter: '{b}: {c} ({d}%)',
      },
      legend: {
        bottom: 4,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 20,
      },
      series: [
        {
          type: 'pie',
          radius: ['50%', '75%'],
          center: ['50%', '43%'],
          emphasis: { label: { fontSize: 14, fontWeight: 'bold' } },
          label: { show: false },
          data: [
            { name: '管理员', value: p.admins, itemStyle: { color: '#818cf8' } },
            { name: '普通用户', value: p.regularUsers, itemStyle: { color: '#34d399' } },
            { name: '游客', value: p.guests, itemStyle: { color: '#fbbf24' } },
          ],
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
        },
      ],
    };
  }, [stats]);

  // ── profession bar option ──
  const professionBarOption = useMemo(() => {
    if (!stats?.professions?.length) return {};
    const list = stats.professions.slice(0, 12);
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
        textStyle: { color: '#334155', fontSize: 12 },
      },
      legend: {
        bottom: 0,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 20,
      },
      grid: { left: 48, right: 24, top: 20, bottom: 48 },
      xAxis: {
        type: 'category',
        data: list.map((p) => p.name),
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        axisTick: { show: false },
        axisLabel: { ...CHART_TEXT_STYLE, rotate: list.length > 6 ? 30 : 0, interval: 0 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        axisLabel: { ...CHART_TEXT_STYLE, margin: 8 },
      },
      series: [
        {
          name: '用户数',
          type: 'bar',
          barGap: '20%',
          data: list.map((p) => p.userCount),
          itemStyle: { color: '#818cf8', borderRadius: [4, 4, 0, 0] },
          barWidth: 22,
        },
        {
          name: '指派题库',
          type: 'bar',
          data: list.map((p) => p.assignmentCount),
          itemStyle: { color: '#34d399', borderRadius: [4, 4, 0, 0] },
          barWidth: 22,
        },
      ],
    };
  }, [stats]);

  // ── 渲染 ──

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
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* 标题 */}
          <div>
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1.5">
              Dashboard
            </div>
            <h2
              className="text-[28px] leading-tight text-slate-800 mb-1.5"
              style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}
            >
              数据大屏
            </h2>
            <p className="text-slate-500 text-sm">实时统计系统数据，每 30 秒自动刷新</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
            </div>
          ) : stats ? (
            <>
              {/* ── 第一行：核心用户指标 ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="用户总数"
                  value={stats.totalUsers}
                  color="from-sky-400 to-blue-500"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  }
                />
                <StatCard
                  title="订阅用户"
                  value={stats.subscribedUsers}
                  suffix={`/ ${stats.registeredUsers}`}
                  color="from-emerald-400 to-teal-500"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  }
                />
                <StatCard
                  title="已停用"
                  value={stats.disabledUsers}
                  color="from-amber-400 to-orange-400"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  }
                />
                <StatCard
                  title="当前在线"
                  value={stats.onlineUsers}
                  color="from-rose-400 to-pink-500"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  }
                  pulse
                />
              </div>

              {/* ── 第二行：题库 & 今日概况 ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[11px]">题库总数</p>
                      <p className="text-slate-800 text-2xl font-bold tabular-nums">{stats.totalQuizzes}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-slate-500 text-[11px]">官方题库</p>
                      <p className="text-slate-800 text-2xl font-bold tabular-nums">{stats.officialQuizzes}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                  <p className="text-slate-500 text-[11px] mb-1">今日新增用户</p>
                  <div className="flex items-baseline justify-between">
                    <p className="text-slate-800 text-2xl font-bold tabular-nums">{stats.todayNewUsers}</p>
                  </div>
                </div>
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-4 shadow-sm">
                  <p className="text-slate-500 text-[11px] mb-1">今日答题次数</p>
                  <div className="flex items-baseline justify-between">
                    <p className="text-slate-800 text-2xl font-bold tabular-nums">{stats.todayResults}</p>
                  </div>
                </div>
              </div>

              {/* ── 第三行：趋势图 ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-[14px] font-semibold text-slate-700 mb-3">📈 用户增长趋势（近 30 天）</h3>
                  <ReactECharts option={userTrendOption} style={{ height: 300 }} notMerge />
                </div>
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-[14px] font-semibold text-slate-700 mb-3">📊 题库 & 答题趋势（近 30 天）</h3>
                  <ReactECharts option={combinedTrendOption} style={{ height: 300 }} notMerge />
                </div>
              </div>

              {/* ── 第四行：环比图 ── */}
              <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                <h3 className="text-[14px] font-semibold text-slate-700 mb-1">📅 环比对比（本月 vs 上月）</h3>
                <div className="flex items-center gap-5 mb-3">
                  {(['users', 'quizzes', 'results'] as const).map((key) => {
                    const label = key === 'users' ? '用户' : key === 'quizzes' ? '题库' : '答题';
                    return (
                      <div key={key} className="flex items-center gap-1.5 text-[12px] text-slate-500">
                        <span>{label}</span>
                        <GrowthBadge value={stats.momComparison.growth[key]} />
                      </div>
                    );
                  })}
                </div>
                <ReactECharts option={momBarOption} style={{ height: 260 }} notMerge />
              </div>

              {/* ── 第五行：分布图 ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* 职业分布 */}
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-[14px] font-semibold text-slate-700 mb-3">👔 职业分布</h3>
                  {stats.occupations.length > 0 ? (
                    <ReactECharts option={occupationPieOption} style={{ height: 280 }} notMerge />
                  ) : (
                    <div className="flex items-center justify-center h-[260px] text-slate-400 text-sm">
                      暂无职业数据
                    </div>
                  )}
                </div>

                {/* 权限分布 */}
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-[14px] font-semibold text-slate-700 mb-3">🔑 权限分布</h3>
                  <ReactECharts option={permDonutOption} style={{ height: 280 }} notMerge />
                </div>
              </div>

              {/* ── 第六行：专业分布（如果有数据）── */}
              {stats.professions.length > 0 && (
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                  <h3 className="text-[14px] font-semibold text-slate-700 mb-3">🏢 专业指派统计</h3>
                  <ReactECharts option={professionBarOption} style={{ height: 300 }} notMerge />
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-slate-400 py-20">加载失败</div>
          )}
        </div>
      </main>
    </div>
  );
}
