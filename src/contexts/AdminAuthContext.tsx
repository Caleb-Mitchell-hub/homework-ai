'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Admin {
  id: string;
  username: string;
}

interface AdminAuthContextType {
  admin: Admin | null;
  token: string | null;
  login: (token: string, admin: Admin) => void;
  logout: () => void;
  loading: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('adminToken');
    const storedAdmin = localStorage.getItem('adminUser');
    if (storedToken && storedAdmin) {
      setToken(storedToken);
      setAdmin(JSON.parse(storedAdmin));
      // 异步校验一次:token 失效(401)时自动清空 + 跳登录页
      // (服务重启后旧 JWT token 不在 sessionStore Map 里 → 401 → 强制重新登录)
      fetch('/api/admin/auth/me', {
        headers: { 'Authorization': `Bearer ${storedToken}` },
      })
        .then((res) => {
          if (res.status === 401 || res.status === 403) {
            setToken(null);
            setAdmin(null);
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminUser');
            if (typeof window !== 'undefined') {
              window.location.href = '/admin/login';
            }
          }
        })
        .catch(() => {
          // 网络问题:保持当前态,不强制登出
        });
    }
    setLoading(false);
  }, []);

  const login = (newToken: string, newAdmin: Admin) => {
    setToken(newToken);
    setAdmin(newAdmin);
    localStorage.setItem('adminToken', newToken);
    localStorage.setItem('adminUser', JSON.stringify(newAdmin));
  };

  const logout = () => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
  };

  return (
    <AdminAuthContext.Provider value={{ admin, token, login, logout, loading }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
}
