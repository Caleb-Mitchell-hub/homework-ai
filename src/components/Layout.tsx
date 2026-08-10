'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  children: React.ReactNode;
}

export default function Layout({ children }: Props) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 侧边栏显示逻辑:
  //  1) 路径在 /admin/* 下 → 完全不渲染用户侧栏(让 admin 页面自己用 AdminSidebar)
  //  2) 否则,仅在已登录用户时显示
  const isAdminRoute = pathname?.startsWith('/admin');
  const sidebarVisible = !isAdminRoute && !!user;

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      {sidebarVisible && (
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpen={() => setSidebarOpen(true)}
        />
      )}
      <main id="main-content" className="flex-1 overflow-y-auto relative">
        {children}
      </main>
    </div>
  );
}
