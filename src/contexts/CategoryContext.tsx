'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * 答题记录的分类管理 —— 按用户隔离
 *
 * 设计要点:
 *  - 节点存于 localStorage:key 形如 `homework-ai-categories-v1:<userId>`
 *    旧版单 key `homework-ai-categories-v1`(无 userId 后缀)将在 hydrate 时迁移到当前用户桶
 *  - 系统分类 id 以 `__sys_` 前缀,永远不允许用户编辑/删除
 *  - 支持任意层级(parentId 串成树)
 *  - 答题记录 (QuizResult) 可选地持有 `categoryId`;为空则归到"未分类"系统组
 *  - **userId 切换(登录/登出/换号)时自动重新 hydrate**:
 *    · 登出:状态清空
 *    · 登录新用户:加载该用户的桶;若该用户无数据,继承老 key(若存在)
 */

export type CategoryId = string;

export interface Category {
  id: CategoryId;
  name: string;
  /** 父分类 id;null = 顶级 */
  parentId: CategoryId | null;
  /** 同级排序,小者靠前 */
  order: number;
  /** 仅系统分类可带规则描述(仅供显示) */
  system?: boolean;
  rule?: string;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
  depth: number;
}

/** 老版本(无隔离)的 key —— 仅用于一次性迁移 */
const LEGACY_KEY = 'homework-ai-categories-v1';
/** 新版本:每用户一桶 */
const storageKey = (userId: string) => `homework-ai-categories-v1:${userId}`;
const legacyResultMapKey = 'homework-ai-categories-v1:resultMap'; // 旧版可能拆出 resultMap;忽略

/** 系统分类(不可改、不可删) */
export const SYSTEM_CATEGORIES: Category[] = [
  { id: '__sys_recent', name: '最近', parentId: null, order: 0, system: true, rule: '最近 7 天提交的记录' },
  { id: '__sys_draft', name: '草稿', parentId: null, order: 1, system: true, rule: '暂存未提交的记录' },
  { id: '__sys_uncat', name: '未分类', parentId: null, order: 2, system: true, rule: '未归入任何自定义分类' },
  { id: '__sys_pending', name: '待批改', parentId: null, order: 3, system: true, rule: '含简答/代码题需人工批改' },
];

/** 内置用户分类根("我的题库") */
export const USER_ROOT_ID = '__user_root';

interface CategoryContextValue {
  categories: Category[];
  resultMap: Record<string, CategoryId>;
  /** 折叠状态:哪些分类是展开的(id 集合)—— session 级,不持久化(避免跨账号污染) */
  expanded: Set<CategoryId>;
  toggleExpand: (id: CategoryId) => void;
  /** 工具 */
  getById: (id: CategoryId | null | undefined) => Category | undefined;
  getNodeTree: () => CategoryNode[];
  getChildren: (parentId: CategoryId | null) => Category[];
  /** CRUD(用户分类) */
  createCategory: (name: string, parentId: CategoryId | null) => Category;
  renameCategory: (id: CategoryId, name: string) => void;
  deleteCategory: (id: CategoryId) => void;
  /** 给答题记录分配分类 */
  setResultCategory: (resultId: string, categoryId: CategoryId | null) => void;
  getResultCategory: (resultId: string) => CategoryId | null;
  /** 当前用户 id(已登录) / null(未登录,所有 CRUD 会被忽略) */
  currentUserId: string | null;
}

const CategoryContext = createContext<CategoryContextValue | null>(null);

function genId() {
  return 'c_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

interface Persisted {
  categories: Category[];
  resultMap: Record<string, CategoryId>;
}

function loadFromUserBucket(userId: string): Persisted {
  if (typeof window === 'undefined') return { categories: [], resultMap: {} };
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { categories: [], resultMap: {} };
    const parsed = JSON.parse(raw);
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      resultMap: parsed.resultMap && typeof parsed.resultMap === 'object' ? parsed.resultMap : {},
    };
  } catch {
    return { categories: [], resultMap: {} };
  }
}

function saveToUserBucket(userId: string, data: Persisted) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(data));
  } catch (e) {
    console.error('保存分类失败:', e);
  }
}

/** 给一个用户初始化一份"空但能用"的桶(系统分类 + 用户根) */
function seedFor(userId: string) {
  const seeded: Category[] = [
    ...SYSTEM_CATEGORIES,
    { id: USER_ROOT_ID, name: '我的题库', parentId: null, order: -1 },
  ];
  saveToUserBucket(userId, { categories: seeded, resultMap: {} });
  return seeded;
}

/** 一次性迁移:从老 key 复制到当前用户的桶,然后备份老 key 防止翻车 */
function migrateLegacyToUser(userId: string): Persisted | null {
  if (typeof window === 'undefined') return null;
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw);
    const categories: Category[] = Array.isArray(legacy.categories) ? legacy.categories : [];
    const resultMap: Record<string, CategoryId> =
      legacy.resultMap && typeof legacy.resultMap === 'object' ? legacy.resultMap : {};
    if (categories.length === 0 && Object.keys(resultMap).length === 0) return null;

    // 兜底:确保系统分类与用户根存在
    const hasRoot = categories.some((c) => c.id === USER_ROOT_ID);
    const hasAllSys = SYSTEM_CATEGORIES.every((s) => categories.some((c) => c.id === s.id));
    const finalCategories = hasRoot && hasAllSys
      ? categories
      : [
          ...SYSTEM_CATEGORIES,
          ...(hasRoot ? [] : [{ id: USER_ROOT_ID, name: '我的题库', parentId: null, order: -1 } as Category]),
          ...categories,
        ];

    const migrated: Persisted = { categories: finalCategories, resultMap };
    saveToUserBucket(userId, migrated);
    // 备份老 key,避免回滚后丢失
    localStorage.setItem(`${LEGACY_KEY}:migrated-to:${userId}`, legacyRaw);
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch (e) {
    console.error('分类迁移失败:', e);
    return null;
  }
}

export function CategoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const currentUserId: string | null = user?.id ?? null;

  const [categories, setCategories] = useState<Category[]>([]);
  const [resultMap, setResultMap] = useState<Record<string, CategoryId>>({});
  const [expanded, setExpanded] = useState<Set<CategoryId>>(new Set([USER_ROOT_ID, '__sys_recent']));

  // 记录上次 hydrate 的 userId,避免重复初始化
  const lastUserIdRef = useRef<string | null>(null);

  // user 切换时重新 hydrate
  useEffect(() => {
    // 已登录 → 加载 / 初始化 / 迁移
    if (currentUserId) {
      if (lastUserIdRef.current === currentUserId) return;
      lastUserIdRef.current = currentUserId;

      let data = loadFromUserBucket(currentUserId);
      // 该用户桶为空 → 尝试从老 key 迁移,迁移不到则 seed 一份空桶
      if (data.categories.length === 0) {
        const migrated = migrateLegacyToUser(currentUserId);
        if (migrated) {
          data = migrated;
        } else {
          const seeded = seedFor(currentUserId);
          data = { categories: seeded, resultMap: {} };
        }
      }
      setCategories(data.categories);
      setResultMap(data.resultMap);
      setExpanded(new Set([USER_ROOT_ID, '__sys_recent']));
    } else {
      // 登出:清空内存,避免显示上个用户的分类
      if (lastUserIdRef.current !== null) {
        lastUserIdRef.current = null;
        setCategories([]);
        setResultMap({});
        setExpanded(new Set());
      }
    }
  }, [currentUserId]);

  // 持久化(每用户一桶)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentUserId) return;
    // 跳过初始空状态(登出态)
    if (categories.length === 0 && Object.keys(resultMap).length === 0) return;
    saveToUserBucket(currentUserId, { categories, resultMap });
  }, [categories, resultMap, currentUserId]);

  const getById = useCallback(
    (id: CategoryId | null | undefined) => {
      if (!id) return undefined;
      return categories.find((c) => c.id === id);
    },
    [categories]
  );

  const getChildren = useCallback(
    (parentId: CategoryId | null) =>
      categories.filter((c) => c.parentId === parentId).sort((a, b) => a.order - b.order),
    [categories]
  );

  const getNodeTree = useCallback((): CategoryNode[] => {
    const build = (parentId: CategoryId | null, depth: number): CategoryNode[] => {
      return getChildren(parentId).map((c) => ({
        ...c,
        depth,
        children: build(c.id, depth + 1),
      }));
    };
    return build(null, 0);
  }, [getChildren]);

  const toggleExpand = useCallback((id: CategoryId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const createCategory = useCallback(
    (name: string, parentId: CategoryId | null): Category => {
      if (!currentUserId) throw new Error('未登录,不能创建分类');
      const siblings = categories.filter((c) => c.parentId === parentId);
      const order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
      const newCat: Category = {
        id: genId(),
        name: name.trim() || '未命名',
        parentId,
        order,
      };
      setCategories((prev) => [...prev, newCat]);
      if (parentId) {
        setExpanded((prev) => new Set(prev).add(parentId));
      }
      return newCat;
    },
    [categories, currentUserId]
  );

  const renameCategory = useCallback(
    (id: CategoryId, name: string) => {
      if (!currentUserId) return;
      const cat = categories.find((c) => c.id === id);
      if (!cat || cat.system) return;
      setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)));
    },
    [categories, currentUserId]
  );

  const deleteCategory = useCallback(
    (id: CategoryId) => {
      if (!currentUserId) return;
      const cat = categories.find((c) => c.id === id);
      if (!cat || cat.system) return;
      setCategories((prev) => {
        const toDelete = new Set<CategoryId>([id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const c of prev) {
            if (c.parentId && toDelete.has(c.parentId) && !toDelete.has(c.id)) {
              toDelete.add(c.id);
              changed = true;
            }
          }
        }
        setResultMap((rm) => {
          const next: Record<string, CategoryId> = {};
          for (const [rid, cid] of Object.entries(rm)) {
            if (!toDelete.has(cid)) next[rid] = cid;
          }
          return next;
        });
        return prev.filter((c) => !toDelete.has(c.id));
      });
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [categories, currentUserId]
  );

  const setResultCategory = useCallback(
    (resultId: string, categoryId: CategoryId | null) => {
      if (!currentUserId) return;
      setResultMap((prev) => {
        const next = { ...prev };
        if (categoryId) next[resultId] = categoryId;
        else delete next[resultId];
        return next;
      });
    },
    [currentUserId]
  );

  const getResultCategory = useCallback(
    (resultId: string) => resultMap[resultId] ?? null,
    [resultMap]
  );

  return (
    <CategoryContext.Provider
      value={{
        categories,
        resultMap,
        expanded,
        toggleExpand,
        getById,
        getNodeTree,
        getChildren,
        createCategory,
        renameCategory,
        deleteCategory,
        setResultCategory,
        getResultCategory,
        currentUserId,
      }}
    >
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategories() {
  const ctx = useContext(CategoryContext);
  if (!ctx) throw new Error('useCategories must be used within CategoryProvider');
  return ctx;
}
