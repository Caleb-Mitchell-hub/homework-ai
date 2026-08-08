'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSettingsPanel from '@/components/AdminSettingsPanel';
import {
  SERIF,
  HairlineDivider,
  SectionLabel,
  NavItem,
  UserCard,
  DotPattern,
  DateLabel,
  SidebarDrawer,
  DrawerTrigger,
} from '@/components/SidebarParts';

const TONE_KEY = 'admin' as const;

const NAV_ITEMS = [
  {
    key: 'dashboard',
    label: '数据大屏',
    path: '/admin/dashboard',
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: 'quizzes',
    label: '题库管理',
    path: '/admin/quizzes',
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    key: 'quizzes-new',
    label: '发布新题库',
    path: '/admin/quizzes/new',
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    key: 'professions',
    label: '职业管理',
    path: '/admin/professions',
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: 'ai',
    label: 'AI 配置',
    path: '/admin/ai',
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    key: 'users',
    label: '用户管理',
    path: '/admin/users',
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    key: 'credits',
    label: '积分与使用',
    path: '/admin/credits',
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.306 0 2.418.535 3.197 1.363M12 8V7m0 9v1m-9-4a9 9 0 1118 0 9 9 0 01-18 0z" />
      </svg>
    ),
  },
];

const QUICK_ITEMS = [
  {
    key: 'home',
    label: '前台首页',
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    path: '/',
  },
];

export default function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { admin } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 路由变化时自动关闭
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const drawerContent = (
    <>
      {/* 顶部：品牌 + 关闭按钮 */}
      <div className="relative p-4 border-b border-slate-200/60 flex-shrink-0">
        <div className="flex items-start justify-between gap-2 pr-8">
          <div className="min-w-0 flex-1">
            <h2
              className="text-[20px] leading-[1.15] text-slate-800 tracking-[-0.01em]"
              style={SERIF.italic}
            >
              管理控制台
            </h2>
            <p className="text-[10px] text-slate-400 tracking-wider uppercase mt-0.5">
              Admin Panel
            </p>
            <DateLabel />
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/60 transition-all flex items-center justify-center"
          title="关闭"
          aria-label="关闭侧栏"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 导航 */}
      <div className="flex-1 overflow-y-auto p-3">
        <SectionLabel>Functions · 功能</SectionLabel>
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.path || pathname?.startsWith(item.path + '/');
            return (
              <NavItem
                key={item.key}
                tone={TONE_KEY}
                icon={item.icon}
                label={item.label}
                active={active}
                onClick={() => router.push(item.path)}
              />
            );
          })}
        </div>

        <HairlineDivider />

        <SectionLabel>Shortcuts · 快捷</SectionLabel>
        <div className="space-y-0.5">
          {QUICK_ITEMS.map((item) => (
            <NavItem
              key={item.key}
              tone={TONE_KEY}
              icon={item.icon}
              label={item.label}
              onClick={() => router.push(item.path)}
            />
          ))}
        </div>
      </div>

      {/* 底部：设置入口 */}
      <div className="border-t border-slate-200/60 p-3 flex-shrink-0">
        {admin && (
          <UserCard
            username={admin.username}
            tone={TONE_KEY}
            onClick={() => setSettingsOpen(true)}
          />
        )}
      </div>
    </>
  );

  return (
    <>
      {/* 触发按钮：portal 到 body，浮在左上角 */}
      {mounted &&
        createPortal(
          <DrawerTrigger onClick={() => setOpen(true)} tone={TONE_KEY} />,
          document.body
        )}
      <SidebarDrawer open={open} onClose={() => setOpen(false)} tone={TONE_KEY}>
        {drawerContent}
      </SidebarDrawer>
      <AdminSettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
