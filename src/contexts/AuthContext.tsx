'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useDialog } from '@/components/DialogProvider';

interface User {
  id: string;
  username: string;
  isGuest: boolean;
  professionId?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dialog = useDialog();

  // 初始化时从 localStorage 读取，并校验 token 仍有效（处理被停用的账号）
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      localStorage.setItem('auth_user', storedUser);
      window.dispatchEvent(new Event('homework-auth-changed'));
      // 异步验证一次：被停用（403）或 token 失效（401）时自动清空
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${storedToken}` },
      })
        .then((res) => {
          if (res.status === 401 || res.status === 403) {
            // 触发 logout 清空本地状态
            setToken(null);
            setUser(null);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (res.status === 403) {
              // 仅在「被停用」时显式提示
              setTimeout(async () => {
                await dialog.alert({
                  title: '账号已停用',
                  message: '您的账号已被管理员停用',
                  confirmText: '前往登录',
                });
                window.location.href = '/login';
              }, 50);
            }
          }
        })
        .catch(() => {
          // 网络问题：保持当前态，不强制登出
        });
    }
    setLoading(false);
  }, [dialog]);

  // 监听 storage 事件（跨组件同步状态）
  useEffect(() => {
    const handleStorageChange = () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } else {
        setToken(null);
        setUser(null);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    localStorage.setItem('auth_user', JSON.stringify(newUser));
    window.dispatchEvent(new Event('homework-auth-changed'));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_user');
    window.dispatchEvent(new Event('homework-auth-changed'));
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}