'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { QuizResult } from '@/types';
import ResultCard from '@/components/ResultCard';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  children: React.ReactNode;
}

export default function Layout({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [quizData, setQuizData] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 侧边栏显示逻辑:
  //  1) 路径在 /admin/* 下 → 完全不渲染用户侧栏(让 admin 页面自己用 AdminSidebar)
  //  2) 否则,仅在已登录用户时显示
  const isAdminRoute = pathname?.startsWith('/admin');
  const sidebarVisible = !isAdminRoute && !!user;

  const handleSelectResult = (result: any) => {
    if (result.status === 'draft') {
      router.push(`/quiz/${result.quizId}`);
    } else {
      setSelectedResult(result);
      const token = localStorage.getItem('token');
      if (token) {
        fetch(`/api/quizzes/${result.quizId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.quiz) {
              setQuizData(data.quiz);
            }
          });
      }
    }
  };

  const handleCloseResult = () => {
    setSelectedResult(null);
    setQuizData(null);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      {sidebarVisible && (
        <Sidebar
          onSelectResult={handleSelectResult}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpen={() => setSidebarOpen(true)}
          activeResultId={selectedResult?.id ?? null}
        />
      )}
      <main id="main-content" className="flex-1 overflow-y-auto relative">
        {sidebarVisible ? (
          selectedResult && quizData ? (
            <div className="w-full">
              <div className="w-full px-4 py-8">
                <div className="flex items-center justify-between mb-8">
                  <button
                    onClick={handleCloseResult}
                    className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    返回
                  </button>
                  <h1 className="text-xl font-bold text-slate-800">答题记录</h1>
                  <div className="w-20"></div>
                </div>
              </div>
              <ResultCard quiz={quizData} result={selectedResult} />
            </div>
          ) : (
            children
          )
        ) : (
          children
        )}
      </main>
    </div>
  );
}
