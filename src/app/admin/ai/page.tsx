import { Suspense } from 'react';
import AdminSidebar from '@/components/AdminSidebar';
import AdminAIList from './AdminAIList';

export default function AdminAIPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-pink-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<div className="p-6 text-slate-500">加载中...</div>}>
          <AdminAIList />
        </Suspense>
      </main>
    </div>
  );
}
