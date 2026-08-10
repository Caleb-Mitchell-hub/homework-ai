/**
 * localStorage → 服务端 分类迁移脚本
 *
 * 将 localStorage 中存储的用户自定义分类迁移到服务端 ResultCategory 表。
 * 迁移完成后写入标记键,避免重复迁移。
 * 旧数据备份到独立键,防止数据丢失。
 */

const MIGRATED_KEY_PREFIX = 'result-categories-migrated:';
const LEGACY_CATEGORIES_KEY = 'homework-ai-categories-v1';

interface LegacyCategory {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  system?: boolean;
}

interface LegacyPersisted {
  categories: LegacyCategory[];
  resultMap: Record<string, string>;
}

export async function migrateCategoriesIfNeeded(
  userId: string,
  token: string
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 已迁移过,跳过
  if (localStorage.getItem(`${MIGRATED_KEY_PREFIX}${userId}`)) {
    return false;
  }

  // 读取旧数据
  let legacy: LegacyPersisted | null = null;
  try {
    // 先尝试老版全局 key,再尝试新版用户桶 key
    const raw = localStorage.getItem(LEGACY_CATEGORIES_KEY);
    if (raw) {
      legacy = JSON.parse(raw);
    } else {
      const userRaw = localStorage.getItem(`homework-ai-categories-v1:${userId}`);
      if (userRaw) {
        legacy = JSON.parse(userRaw);
      }
    }
  } catch {
    // 解析失败,标记已迁移避免无限重试
    localStorage.setItem(`${MIGRATED_KEY_PREFIX}${userId}`, 'true');
    return false;
  }

  if (!legacy || !legacy.categories?.length) {
    // 无旧数据
    localStorage.setItem(`${MIGRATED_KEY_PREFIX}${userId}`, 'true');
    return false;
  }

  // 只迁移用户自定义分类(排除系统分类和 USER_ROOT)
  const userCategories = legacy.categories.filter(
    (c) => !c.id.startsWith('__sys_') && c.id !== '__user_root'
  );

  if (userCategories.length === 0 && Object.keys(legacy.resultMap ?? {}).length === 0) {
    localStorage.setItem(`${MIGRATED_KEY_PREFIX}${userId}`, 'true');
    return false;
  }

  // 按层级创建分类(先顶级后子级),记录旧 ID → 新 ID 映射
  const idMap = new Map<string, string>();

  // 排序:顶级在前,同级按 order 排序
  const sorted = [...userCategories].sort((a, b) => {
    if (!a.parentId && b.parentId) return -1;
    if (a.parentId && !b.parentId) return 1;
    return a.order - b.order;
  });

  for (const cat of sorted) {
    try {
      const parentId = cat.parentId ? (idMap.get(cat.parentId) ?? null) : null;
      const res = await fetch('/api/result-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: cat.name, parentId }),
      });
      if (res.ok) {
        const data = await res.json();
        idMap.set(cat.id, data.category.id);
      }
    } catch {
      // 单个分类迁移失败不阻塞其他分类
    }
  }

  // 迁移 resultMap(记录 → 分类的映射),分批处理
  const resultMap = legacy.resultMap ?? {};
  const entries = Object.entries(resultMap);
  if (entries.length > 0) {
    for (let i = 0; i < entries.length; i += 50) {
      const batch = entries.slice(i, i + 50);
      const updates: { resultId: string; categoryId: string }[] = [];
      for (const [resultId, oldCatId] of batch) {
        const newCatId = idMap.get(oldCatId);
        if (newCatId) {
          updates.push({ resultId, categoryId: newCatId });
        }
      }
      if (updates.length > 0) {
        try {
          await fetch('/api/results/batch-category', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              resultIds: updates.map((u) => u.resultId),
              categoryId: updates[0].categoryId,
            }),
          });
        } catch {
          // 单批失败不阻塞
        }
      }
    }
  }

  // 标记已迁移
  localStorage.setItem(`${MIGRATED_KEY_PREFIX}${userId}`, 'true');

  // 备份旧数据
  try {
    localStorage.setItem(`${LEGACY_CATEGORIES_KEY}:backup-${userId}`, JSON.stringify(legacy));
  } catch {
    // 备份失败不影响迁移结果
  }

  return true;
}
