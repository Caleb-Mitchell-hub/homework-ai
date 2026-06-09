'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { PRESET_CATEGORIES, PREFIX_USER } from '@/lib/quizCategories';

/**
 * 题库分类 Context —— 预设 + 私有双层。
 *
 *  - 预设分类:从 @/lib/quizCategories 同步拿(代码常量),不需要请求
 *  - 私有分类:存 localStorage,key = `homework-ai-quiz-categories-v1:<userId>`
 *    · 命名空间与现有 CategoryContext(答题记录分类)分开,避免耦合
 *    · 登出时清空;切换用户时重新 hydrate
 *
 * id 格式:
 *  - 预设  → "preset:<key>"
 *  - 私有  → "user:<id>"   本地生成的 c_xxxxx
 *  - null  → "未分类"
 */

export type QuizCategoryId = string | null;

export interface QuizUserCategory {
  id: string;            // 不含 "user:" 前缀
  name: string;
  order: number;
}

interface QuizCategoryContextValue {
  /** 预设 + 私有合并后的分类列表(按预设在前,私有在后) */
  all: Array<
    | { id: string; kind: 'preset'; key: string; text: string; emoji: string }
    | { id: string; kind: 'user'; key: string; text: string; emoji: string }
  >;
  userCategories: QuizUserCategory[];
  addUserCategory: (name: string) => string;   // 返回完整 id("user:xxx")
  removeUserCategory: (id: string) => void;   // id = "user:xxx"
  /** 已登录的 userId(供 layout 触发 hydrate 用) */
  currentUserId: string | null;
}

const QuizCategoryContext = createContext<QuizCategoryContextValue | null>(null);

const storageKey = (userId: string) => `homework-ai-quiz-categories-v1:${userId}`;

function genId() {
  return 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function loadUserCats(userId: string): QuizUserCategory[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string') : [];
  } catch {
    return [];
  }
}

function saveUserCats(userId: string, list: QuizUserCategory[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(list));
  } catch (e) {
    console.error('保存题库分类失败:', e);
  }
}

export function QuizCategoryProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [userCategories, setUserCategories] = useState<QuizUserCategory[]>([]);

  // 监听 storage 事件 + AuthContext 变化 → 重新 hydrate
  useEffect(() => {
    function refresh() {
      const authRaw = typeof window !== 'undefined' ? localStorage.getItem('auth_user') : null;
      let uid: string | null = null;
      try {
        if (authRaw) {
          const u = JSON.parse(authRaw);
          if (u && typeof u.id === 'string') uid = u.id;
        }
      } catch {}
      setUserId(uid);
      if (uid) {
        setUserCategories(loadUserCats(uid));
      } else {
        setUserCategories([]);
      }
    }
    refresh();
    window.addEventListener('storage', refresh);
    // 监听自定义事件:AuthContext 登录/登出时 dispatch
    window.addEventListener('homework-auth-changed', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('homework-auth-changed', refresh);
    };
  }, []);

  const addUserCategory = useCallback(
    (name: string): string => {
      if (!userId) throw new Error('未登录,不能创建分类');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('分类名不能为空');
      const newCat: QuizUserCategory = {
        id: genId(),
        name: trimmed,
        order: userCategories.length,
      };
      const next = [...userCategories, newCat];
      setUserCategories(next);
      saveUserCats(userId, next);
      return `${PREFIX_USER}${newCat.id}`;
    },
    [userId, userCategories]
  );

  const removeUserCategory = useCallback(
    (fullId: string) => {
      if (!userId) return;
      const bare = fullId.startsWith(PREFIX_USER) ? fullId.slice(PREFIX_USER.length) : fullId;
      const next = userCategories.filter((c) => c.id !== bare);
      setUserCategories(next);
      saveUserCats(userId, next);
    },
    [userId, userCategories]
  );

  const all = [
    ...PRESET_CATEGORIES.map((c) => ({
      id: `${PREFIX_USER}`.replace('user', 'preset') + c.key,
      kind: 'preset' as const,
      key: c.key,
      text: c.text,
      emoji: c.emoji ?? '📘',
    })),
    ...userCategories
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        id: `${PREFIX_USER}${c.id}`,
        kind: 'user' as const,
        key: c.id,
        text: c.name,
        emoji: '🏷️',
      })),
  ];

  return (
    <QuizCategoryContext.Provider
      value={{ all, userCategories, addUserCategory, removeUserCategory, currentUserId: userId }}
    >
      {children}
    </QuizCategoryContext.Provider>
  );
}

export function useQuizCategories() {
  const ctx = useContext(QuizCategoryContext);
  if (!ctx) throw new Error('useQuizCategories must be used within QuizCategoryProvider');
  return ctx;
}
