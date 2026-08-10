'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PREFIX_USER, PREFIX_PRESET, type PresetCategory } from '@/lib/quizCategories';

/**
 * 题库分类 Context —— 预设 + 私有双层。
 *
 *  - 预设分类:从 @/lib/quizCategories 同步拿(代码常量),不需要请求
 *  - 私有分类:存数据库(通过 API),跨设备同步,不丢数据
 *
 * id 格式:
 *  - 预设  → "preset:<key>"
 *  - 私有  → "user:<id>"   数据库 QuizCategory.id
 *  - null  → "未分类"
 */

export type QuizCategoryId = string | null;

export interface QuizUserCategory {
  id: string;            // 数据库 QuizCategory.id（不含 "user:" 前缀）
  name: string;
  order: number;
}

interface QuizCategoryContextValue {
  /** 预设分类（从 API 加载，非编译时静态值） */
  presetCategories: PresetCategory[];
  /** 预设 + 私有合并后的分类列表(按预设在前,私有在后) */
  all: Array<
    | { id: string; kind: 'preset'; key: string; text: string; emoji: string }
    | { id: string; kind: 'user'; key: string; text: string; emoji: string }
  >;
  userCategories: QuizUserCategory[];
  addUserCategory: (name: string) => Promise<string>;   // 返回完整 id("user:xxx")
  removeUserCategory: (id: string) => Promise<void>;   // id = "user:xxx"
  /** 已登录的 userId(供 layout 触发 hydrate 用) */
  currentUserId: string | null;
}

const QuizCategoryContext = createContext<QuizCategoryContextValue | null>(null);

export function QuizCategoryProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const currentUserId: string | null = user?.id ?? null;
  const [userCategories, setUserCategories] = useState<QuizUserCategory[]>([]);
  const [presetCategories, setPresetCategories] = useState<PresetCategory[]>([]);
  const lastUserIdRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 从 API 加载用户分类
  const loadFromServer = useCallback(async (userId: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/user/quiz-categories', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserCategories(data.categories ?? []);
      }
    } catch (e) {
      console.error('加载题库分类失败:', e);
    }
  }, [token]);

  // 首次挂载时从 API 加载预设分类
  useEffect(() => {
    fetch('/api/quiz-categories/presets')
      .then((res) => res.json())
      .then((data) => {
        if (data.presets) {
          setPresetCategories(data.presets.map((p: { key: string; text: string; emoji: string }) => ({
            key: p.key,
            text: p.text,
            emoji: p.emoji ?? '',
          })));
        }
      })
      .catch(() => {});
  }, []);

  // user 切换时重新加载
  useEffect(() => {
    if (currentUserId) {
      if (lastUserIdRef.current === currentUserId) return;
      lastUserIdRef.current = currentUserId;
      loadFromServer(currentUserId);
    } else {
      if (lastUserIdRef.current !== null) {
        lastUserIdRef.current = null;
        setUserCategories([]);
      }
    }
  }, [currentUserId, loadFromServer]);

  const addUserCategory = useCallback(
    async (name: string): Promise<string> => {
      if (!currentUserId || !token) throw new Error('未登录,不能创建分类');
      setBusy(true);
      try {
        const res = await fetch('/api/user/quiz-categories', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '创建失败');
        // 创建成功后重新加载全量列表（保证 order 一致）
        await loadFromServer(currentUserId);
        return `${PREFIX_USER}${data.category.id}`;
      } finally {
        setBusy(false);
      }
    },
    [currentUserId, token, loadFromServer]
  );

  const removeUserCategory = useCallback(
    async (fullId: string) => {
      if (!currentUserId || !token) return;
      const bare = fullId.startsWith(PREFIX_USER) ? fullId.slice(PREFIX_USER.length) : fullId;
      setBusy(true);
      try {
        const res = await fetch(`/api/user/quiz-categories/${bare}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? '删除失败');
        }
        // 删除成功后重新加载全量列表
        await loadFromServer(currentUserId);
      } catch (e) {
        console.error('删除题库分类失败:', e);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [currentUserId, token, loadFromServer]
  );

  const all = [
    ...presetCategories.map((c) => ({
      id: `${PREFIX_PRESET}${c.key}`,
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
      value={{ presetCategories, all, userCategories, addUserCategory, removeUserCategory, currentUserId }}
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
