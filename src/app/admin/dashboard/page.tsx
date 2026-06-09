'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';

interface Stats {
  totalUsers: number;
  registeredUsers: number;
  guestUsers: number;
  onlineUsers: number;
  totalQuizzes: number;
  officialQuizzes: number;
}

export default function AdminDashboard() {
  const router = useRouter();
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
          headers: { 'Authorization': `Bearer ${token}` },
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
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
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
                  title="注册用户"
                  value={stats.registeredUsers}
                  color="from-emerald-400 to-teal-500"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  }
                />
                <StatCard
                  title="游客数量"
                  value={stats.guestUsers}
                  color="from-amber-400 to-orange-400"
                  icon={
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-500 text-sm">题库总数</p>
                      <p className="text-slate-800 text-3xl font-bold mt-1 tabular-nums">{stats.totalQuizzes}</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white shadow-md shadow-indigo-200">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-500 text-sm">官方题库</p>
                      <p className="text-slate-800 text-3xl font-bold mt-1 tabular-nums">{stats.officialQuizzes}</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white shadow-md shadow-pink-200">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center text-slate-400 py-20">加载失败</div>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ title, value, color, icon, pulse }: {
  title: string;
  value: number;
  color: string;
  icon: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-slate-300/60 transition-all group">
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-500 text-[12.5px]">{title}</p>
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform`}>
          {icon}
        </div>
      </div>
      <p className={`text-[32px] font-bold text-slate-800 tabular-nums leading-none ${pulse ? 'animate-pulse' : ''}`}>
        {value}
      </p>
    </div>
  );
}
