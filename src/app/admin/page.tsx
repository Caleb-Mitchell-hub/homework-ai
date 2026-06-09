'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

export default function AdminIndex() {
  const router = useRouter();
  const { admin, loading } = useAdminAuth();

  useEffect(() => {
    if (!loading) {
      router.push(admin ? '/admin/dashboard' : '/admin/login');
    }
  }, [admin, loading, router]);

  return (
    <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full"></div>
    </div>
  );
}
