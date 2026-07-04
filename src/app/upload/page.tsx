'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import UploadForm from '@/components/UploadForm';

/**
 * 上传题库 —— 普通模式入口
 * 路径:/upload
 * - 复用 UploadForm(无 forceManual,默认是上传/粘贴 + 选择对话框)
 * - 创建成功后 UploadForm 默认 router.push 到 /quiz/<id>
 * - 未登录跳 /login
 */
export default function UploadPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回首页
          </button>
          <div className="text-center">
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-sky-500/80 font-medium mb-1">
              Upload
            </div>
            <h1
              className="text-[22px] leading-tight text-slate-800"
              style={{ fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic', fontWeight: 500 }}
            >
              上传题库
            </h1>
          </div>
          <div className="w-20" />
        </div>

        <UploadForm />
      </div>
    </div>
  );
}