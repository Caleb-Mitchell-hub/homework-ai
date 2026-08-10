# 预置题库分类管理 — 设计文档

> **状态：** 待实施 | **日期：** 2026-08-10

## 背景

当前预置题库分类（MySQL、Redis、Linux 等 9 个）硬编码在 `src/lib/quizCategories.ts` 的 `PRESET_CATEGORIES` 数组中。新增/修改/删除分类需要改代码并发版，运营无法自主管理。

## 目标

管理员可在后台对预置题库分类进行完整 CRUD 管理（新增、编辑、删除、列表查看、排序）。

## 全局约束

- 所有 UI 文案使用中文
- 遵循现有管理后台的代码风格（`professions/page.tsx` 作为 UI 模板参考）
- 公共 API 兼容：已有 `GET /api/quiz-categories/presets` 继续可用，前端消费方无需改动
- `Quiz.categoryId` 格式不变（`"preset:<key>"`），已有数据零迁移
- 删除预置分类不影响已有题库（`categoryId` 是松散字符串引用）

---

## 架构

```
┌──────────────────────────────────────────────────────┐
│  管理后台 UI                                          │
│  src/app/admin/categories/page.tsx                   │
│  (表格 + 新增/编辑弹窗)                                │
└──────────────────────┬───────────────────────────────┘
                       │ Bearer token
┌──────────────────────▼───────────────────────────────┐
│  管理端 API                                           │
│  src/app/api/admin/quiz-categories/presets/           │
│  GET (列表) / POST (新增) / PATCH [id] (编辑)          │
│  / DELETE [id] (删除)                                  │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│  服务层                                               │
│  src/lib/quizCategories.ts                            │
│  PRESET_CATEGORIES (同步模块变量) + load/refresh        │
│  parseCategoryId() / getCategoryDisplay() 签名不变     │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│  数据库                                               │
│  PresetQuizCategory 表                                 │
│  (id, key, text, emoji, order, createdAt, updatedAt)  │
└──────────────────────────────────────────────────────┘

公共 API (兼容):
  GET /api/quiz-categories/presets → 从 getPresetCategories() 读取
```

---

## 数据模型

新增 `PresetQuizCategory`：

```prisma
model PresetQuizCategory {
  id        String   @id @default(cuid())
  key       String   @unique @db.VarChar(40)
  text      String   @db.VarChar(40)
  emoji     String?  @db.VarChar(10)
  order     Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- `key` 用于生成 `categoryId = "preset:<key>"`，与现有 `Quiz.categoryId` 兼容
- `order` 升序排列，管理员可调整
- 不设外键关联 Quiz 表 — `categoryId` 是松散字符串引用，删除预设不级联

### 迁移

`loadPresetCategories()` 首次调用时，检测 `PresetQuizCategory` 表是否为空 → 自动将 `PRESET_CATEGORIES` 的默认值导入数据库。

---

## API

### 管理端

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/admin/quiz-categories/presets` | 列表（含每题类下的题目数 `quizCount`） |
| `POST` | `/api/admin/quiz-categories/presets` | 新增 `{ key, text, emoji?, order? }` |
| `PATCH` | `/api/admin/quiz-categories/presets/[id]` | 编辑 `{ text?, emoji?, order? }` |
| `DELETE` | `/api/admin/quiz-categories/presets/[id]` | 删除（不影响已有题库） |

所有接口需 `Authorization: Bearer <adminToken>`。

### 公共

`GET /api/quiz-categories/presets` — 行为不变，改为先调用 `loadPresetCategories()` 确保已初始化，然后返回 `PRESET_CATEGORIES`。

---

## 前端

### 新页面 `src/app/admin/categories/page.tsx`

参考 `src/app/admin/professions/page.tsx` 的布局和代码风格：

- 页面标题：「分类管理」
- 新增表单：输入 key（英文标识）、名称、emoji（可选）、排序号
- 表格列：图标 | 名称 | key | 题目数量 | 排序 | 操作（编辑 / 删除）
- 编辑弹窗：可修改名称、emoji、排序（key 不可改，因为是 categoryId 的一部分）
- 删除弹窗：确认框，提示已有题库的分类标记将变为"未分类"

### 侧边栏 `src/components/AdminSidebar.tsx`

新增导航项：

```typescript
{
  key: 'categories',
  label: '分类管理',
  path: '/admin/categories',
  icon: <svg>...</svg>,
}
```

插入到「题库管理」和「发布新题库」之间。

---

## 服务层改造 `src/lib/quizCategories.ts`

**策略：模块变量原地更新（零破坏性）**

`PRESET_CATEGORIES` 保持同步导出，8 个已有消费文件无需改动。

```typescript
import { prisma } from './prisma';

export interface PresetCategory {
  key: string;
  text: string;
  emoji?: string;
}

// 默认值：与旧硬编码一致，保证 DB 不可用时也能工作
export const PRESET_CATEGORIES: PresetCategory[] = [
  { key: 'mysql',   text: 'MySQL',      emoji: '🐬' },
  { key: 'redis',   text: 'Redis',      emoji: '🟥' },
  { key: 'linux',   text: 'Linux',      emoji: '🐧' },
  { key: 'network', text: '计算机网络', emoji: '🌐' },
  { key: 'os',      text: '操作系统',    emoji: '⚙️' },
  { key: 'algo',    text: '算法与数据结构', emoji: '🧮' },
  { key: 'frontend',text: '前端',       emoji: '🎨' },
  { key: 'backend', text: '后端',       emoji: '🛠️' },
  { key: 'other',   text: '其他',       emoji: '📚' },
];

/** 从 DB 加载预设分类，替换 PRESET_CATEGORIES 数组内容（原地替换，保持引用不变）。仅在服务端调用。 */
export async function loadPresetCategories(): Promise<void> {
  try {
    let rows = await prisma.presetQuizCategory.findMany({ orderBy: { order: 'asc' } });
    if (rows.length === 0) {
      // 首次迁移：导入默认 9 个分类
      await prisma.presetQuizCategory.createMany({
        data: PRESET_CATEGORIES.map((c, i) => ({ key: c.key, text: c.text, emoji: c.emoji ?? '', order: i })),
      });
      rows = await prisma.presetQuizCategory.findMany({ orderBy: { order: 'asc' } });
    }
    // 原地替换数组内容（保持引用不变，消费方无需改动）
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
```

**关键点：**
- `PRESET_CATEGORIES` 保持同步导出，**8 个已有消费文件零改动**
- `loadPresetCategories()` 在首次需要时调用（API route、getCategoryDisplay 等），原地替换数组
- `refreshPresetCategories()` 供管理 API 在 CUD 操作后调用
- DB 不可用时降级使用默认硬编码值，不影响基本功能

---

## 错误处理

- **key 重复**：返回 409 `{ error: '分类标识已存在' }`
- **key 格式非法**：返回 400 `{ error: '分类标识只能包含小写字母、数字和下划线' }`
- **删除不存在的预设**：返回 404
- **DB 查询失败**：`loadPresetCategories()` 降级保留 `PRESET_CATEGORIES` 默认值

---

## 测试要点

- `tests/lib/quizCategories.test.ts`：测试 `loadPresetCategories()` 首次迁移逻辑、`parseCategoryId()` 兼容性
- `tests/api/admin/preset-categories.test.ts`：测试 CRUD 各接口、权限校验、key 重复处理

---

## 受影响的文件

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | 新增 `PresetQuizCategory` 模型 |
| `src/lib/quizCategories.ts` | 新增 `loadPresetCategories()` / `refreshPresetCategories()`，保持 `PRESET_CATEGORIES` 导出不变 |
| `src/app/api/quiz-categories/presets/route.ts` | 调用 `loadPresetCategories()` 确保已初始化 |
| `src/app/api/admin/quiz-categories/presets/route.ts` | **新建** — 管理员列表 + 新增 |
| `src/app/api/admin/quiz-categories/presets/[id]/route.ts` | **新建** — 编辑 + 删除 |
| `src/app/admin/categories/page.tsx` | **新建** — 管理页面 |
| `src/components/AdminSidebar.tsx` | 新增「分类管理」导航项 |

**无需改动的文件（8 个）：** `QuizCategoryContext.tsx`、`banks/page.tsx`、`page.tsx`、`admin/quizzes/[id]/edit/page.tsx`、`api/quizzes/route.ts`、`api/quizzes/[id]/route.ts` — `PRESET_CATEGORIES` 导入和使用保持原样。
