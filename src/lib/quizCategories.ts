/**
 * 题库预设分类（管理员可在后台管理，数据库存储 + 内存缓存）。
 *
 * id 前缀规范:
 *  - "preset:<key>"   系统预设
 *  - "user:<id>"      用户私有(localStorage,后端不感知)
 *  - null / undefined  未分类
 */

export interface PresetCategory {
  key: string;          // 用于 "preset:<key>"
  text: string;         // 中文名
  emoji?: string;        // 列表前的 emoji(可选,纯展示)
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  { key: 'mysql',   text: 'MySQL',   emoji: '🐬' },
  { key: 'redis',   text: 'Redis',   emoji: '🟥' },
  { key: 'linux',   text: 'Linux',   emoji: '🐧' },
  { key: 'network', text: '计算机网络', emoji: '🌐' },
  { key: 'os',      text: '操作系统', emoji: '⚙️' },
  { key: 'algo',    text: '算法与数据结构', emoji: '🧮' },
  { key: 'frontend', text: '前端',  emoji: '🎨' },
  { key: 'backend',  text: '后端',  emoji: '🛠️' },
  { key: 'other',    text: '其他',  emoji: '📚' },
];

/** 从数据库加载预置分类到 PRESET_CATEGORIES（原地替换数组内容，保持引用不变）。仅在服务端调用。 */
export async function loadPresetCategories(): Promise<void> {
  try {
    // 动态导入避免客户端组件引用本文件时触发服务端依赖链
    const { prisma } = await import('./prisma');
    let rows = await prisma.presetQuizCategory.findMany({ orderBy: { order: 'asc' } });
    if (rows.length === 0) {
      // 首次迁移：将默认值写入数据库
      await prisma.presetQuizCategory.createMany({
        data: PRESET_CATEGORIES.map((c, i) => ({
          key: c.key,
          text: c.text,
          emoji: c.emoji ?? '',
          order: i,
        })),
      });
      rows = await prisma.presetQuizCategory.findMany({ orderBy: { order: 'asc' } });
    }
    // 原地替换数组内容
    PRESET_CATEGORIES.length = 0;
    for (const r of rows) {
      PRESET_CATEGORIES.push({ key: r.key, text: r.text, emoji: r.emoji ?? '' });
    }
  } catch (err) {
    console.error('加载预置分类失败，使用默认值:', err);
  }
}

/** 管理端增删改后调用，刷新内存中的 PRESET_CATEGORIES */
export async function refreshPresetCategories(): Promise<void> {
  await loadPresetCategories();
}

const KEY_TO_TEXT: Record<string, string> = Object.fromEntries(
  PRESET_CATEGORIES.map((c) => [c.key, c.text])
);

const KEY_TO_EMOJI: Record<string, string> = Object.fromEntries(
  PRESET_CATEGORIES.map((c) => [c.key, c.emoji ?? ''])
);

export const PREFIX_PRESET = 'preset:';
export const PREFIX_USER = 'user:';

/** 把 categoryId 拆成 {kind, key/id}。返回 null 当作"未分类" */
export function parseCategoryId(raw: string | null | undefined): {
  kind: 'preset' | 'user';
  key: string;
} | null {
  if (!raw) return null;
  if (raw.startsWith(PREFIX_PRESET)) {
    return { kind: 'preset', key: raw.slice(PREFIX_PRESET.length) };
  }
  if (raw.startsWith(PREFIX_USER)) {
    return { kind: 'user', key: raw.slice(PREFIX_USER.length) };
  }
  // 老数据(无前缀)→ 视为 "preset:<原值>" 兜底
  return { kind: 'preset', key: raw };
}

export function getCategoryDisplay(raw: string | null | undefined): {
  text: string;
  emoji: string;
  kind: 'preset' | 'user' | 'none';
} {
  if (!raw) return { text: '未分类', emoji: '📂', kind: 'none' };
  const parsed = parseCategoryId(raw);
  if (!parsed) return { text: '未分类', emoji: '📂', kind: 'none' };
  if (parsed.kind === 'preset') {
    return {
      kind: 'preset',
      text: KEY_TO_TEXT[parsed.key] ?? parsed.key,
      emoji: KEY_TO_EMOJI[parsed.key] ?? '📘',
    };
  }
  // user 类只显示 id(实际名字在客户端 localStorage 里有)
  return { kind: 'user', text: parsed.key, emoji: '🏷️' };
}
