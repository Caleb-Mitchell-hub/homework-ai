import { Suspense } from 'react';
import AdminAIList from './AdminAIList';

export default function AdminAIPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">加载中...</div>}>
      <AdminAIList />
    </Suspense>
  );
}
