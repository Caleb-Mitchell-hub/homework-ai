/**
 * 题库预设分类(服务端硬编码,所有用户共享)。
 *
 * 设计:不存数据库表,而是用代码常量的方式。原因:
 *  1. 预设分类很少(7 个左右),变更频率低
 *  2. 改文案 / 加项需要发版,这是有意的(防止运营乱改)
 *  3. 客户端不需要单独请求就能拿到,可以塞进 layout 初始化
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
