# 预置题库分类管理 — 实施计划

> **对于执行者：** 推荐使用 superpowers:subagent-driven-development 逐任务实施。步骤使用 `- [ ]` 复选框跟踪。

**目标：** 管理员可在后台对预置题库分类进行完整 CRUD 管理

**架构：** 新建 `PresetQuizCategory` 数据库表替代硬编码常量，`PRESET_CATEGORIES` 保持同步导出（原地替换数组内容），已有消费文件零改动

**技术栈：** Next.js 16 App Router + Prisma + TypeScript + React

## 全局约束

- 所有 UI 文案使用中文
- 遵循现有管理后台代码风格（参考 `professions/page.tsx`）
- `Quiz.categoryId` 格式不变（`"preset:<key>"`）
- 删除预置分类不影响已有题库
- Next.js 16：params 为 `Promise<{ id: string }>` 类型，必须 await

---

### 任务 1：数据库模型

**文件：**
- 修改：`prisma/schema.prisma`（新增 PresetQuizCategory 模型）

**产出：**
- `PresetQuizCategory` 表：`id, key (@unique), text, emoji?, order, createdAt, updatedAt`

- [ ] **步骤 1：在 schema.prisma 中新增模型**

在 `model ResultCategory` 之后添加：

```prisma
/// 预置题库分类（管理员配置，全局共享）
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

- [ ] **步骤 2：推送 schema 到数据库**

```bash
npx prisma db push
```

预期：输出 "Your database is now in sync with your schema."

- [ ] **步骤 3：验证 TypeScript 编译通过**

```bash
npx tsc --noEmit 2>&1 | head -20
```

预期：无新增错误（可能有已有的无关错误）

- [ ] **步骤 4：提交**

```bash
git add prisma/schema.prisma
git commit -m "feat: 新增 PresetQuizCategory 数据模型"
```

---

### 任务 2：服务层改造

**文件：**
- 修改：`src/lib/quizCategories.ts`（新增 `loadPresetCategories()` 和 `refreshPresetCategories()`）

**接口：**
- 产出：`export async function loadPresetCategories(): Promise<void>` — 从 DB 加载分类，原地替换 `PRESET_CATEGORIES`，首次调用时自动迁移默认数据
- 产出：`export async function refreshPresetCategories(): Promise<void>` — 管理端 CUD 后调用，重新加载

- [ ] **步骤 1：实现 loadPresetCategories 和 refreshPresetCategories**

在 `src/lib/quizCategories.ts` 的 `PRESET_CATEGORIES` 定义之后，`KEY_TO_TEXT` 之前添加：

```typescript
import { prisma } from './prisma';

/** 从数据库加载预置分类到 PRESET_CATEGORIES（原地替换数组内容，保持引用不变）。仅在服务端调用。 */
export async function loadPresetCategories(): Promise<void> {
  try {
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
```

- [ ] **步骤 2：验证 TypeScript 编译通过**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **步骤 3：提交**

```bash
git add src/lib/quizCategories.ts
git commit -m "feat: quizCategories 新增 loadPresetCategories / refreshPresetCategories"
```

---

### 任务 3：公共 API 更新

**文件：**
- 修改：`src/app/api/quiz-categories/presets/route.ts`

**接口：**
- 消费：`loadPresetCategories` from `@/lib/quizCategories`

- [ ] **步骤 1：修改 GET 处理器，调用 loadPresetCategories 确保初始化**

将 `src/app/api/quiz-categories/presets/route.ts` 改为：

```typescript
import { NextResponse } from 'next/server';
import { PRESET_CATEGORIES, loadPresetCategories } from '@/lib/quizCategories';

export async function GET() {
  await loadPresetCategories();
  return NextResponse.json({
    presets: PRESET_CATEGORIES.map((c) => ({
      id: `preset:${c.key}`,
      key: c.key,
      text: c.text,
      emoji: c.emoji ?? '',
    })),
  });
}
```

- [ ] **步骤 2：验证 TypeScript 编译通过**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **步骤 3：提交**

```bash
git add src/app/api/quiz-categories/presets/route.ts
git commit -m "feat: 公共预设分类 API 改为从数据库加载"
```

---

### 任务 4：管理端 API — 列表 + 新增

**文件：**
- 新建：`src/app/api/admin/quiz-categories/presets/route.ts`

**接口：**
- 消费：`prisma` from `@/lib/prisma`、`verifyAdminToken, getTokenFromHeaders` from `@/lib/admin-auth`、`refreshPresetCategories` from `@/lib/quizCategories`
- 产出：`GET /api/admin/quiz-categories/presets` → `{ presets: [...] }`（含 quizCount）
- 产出：`POST /api/admin/quiz-categories/presets` → `{ preset: {...} }`（201）

- [ ] **步骤 1：新建路由文件**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { refreshPresetCategories } from '@/lib/quizCategories';

const KEY_RE = /^[a-z][a-z0-9_]*$/;

/** GET — 预置分类列表（含每个分类下的题目数量） */
export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const presets = await prisma.presetQuizCategory.findMany({
      orderBy: { order: 'asc' },
    });

    // 统计每个预设分类下的题目数量
    const quizCounts = await prisma.quiz.groupBy({
      by: ['categoryId'],
      _count: { id: true },
    });
    const countMap = new Map(quizCounts.map((g) => [g.categoryId, g._count.id]));

    return NextResponse.json({
      presets: presets.map((p) => ({
        id: p.id,
        key: p.key,
        text: p.text,
        emoji: p.emoji ?? '',
        order: p.order,
        quizCount: countMap.get(`preset:${p.key}`) ?? 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error('获取预置分类列表失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** POST — 新增预置分类 */
export async function POST(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const body = await request.json();
    const key = (body?.key ?? '').trim();
    const text = (body?.text ?? '').trim();
    const emoji = (body?.emoji ?? '').trim().slice(0, 10) || null;
    const order = typeof body?.order === 'number' ? body.order : 0;

    if (!key || !text) {
      return NextResponse.json({ error: '分类标识和名称不能为空' }, { status: 400 });
    }
    if (key.length > 40 || text.length > 40) {
      return NextResponse.json({ error: '分类标识和名称最长 40 个字符' }, { status: 400 });
    }
    if (!KEY_RE.test(key)) {
      return NextResponse.json({ error: '分类标识只能包含小写字母、数字和下划线，且必须以字母开头' }, { status: 400 });
    }

    const exists = await prisma.presetQuizCategory.findUnique({ where: { key } });
    if (exists) {
      return NextResponse.json({ error: '分类标识已存在' }, { status: 409 });
    }

    const preset = await prisma.presetQuizCategory.create({
      data: { key, text, emoji, order },
    });

    // 刷新内存中的 PRESET_CATEGORIES
    await refreshPresetCategories();

    return NextResponse.json({ preset }, { status: 201 });
  } catch (error) {
    console.error('创建预置分类失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **步骤 2：验证 TypeScript 编译通过**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **步骤 3：提交**

```bash
git add src/app/api/admin/quiz-categories/
git commit -m "feat: 管理端预置分类列表和新增 API"
```

---

### 任务 5：管理端 API — 编辑 + 删除

**文件：**
- 新建：`src/app/api/admin/quiz-categories/presets/[id]/route.ts`

**接口：**
- 消费：`refreshPresetCategories` from `@/lib/quizCategories`
- 产出：`PATCH .../[id]` → `{ preset: {...} }`
- 产出：`DELETE .../[id]` → `{ success: true }`

- [ ] **步骤 1：新建 [id] 路由文件**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { refreshPresetCategories } from '@/lib/quizCategories';

/** PATCH — 编辑预置分类 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.presetQuizCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '分类不存在' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.text !== undefined) {
      const text = (body.text ?? '').trim();
      if (!text) return NextResponse.json({ error: '分类名称不能为空' }, { status: 400 });
      if (text.length > 40) return NextResponse.json({ error: '分类名称最长 40 个字符' }, { status: 400 });
      data.text = text;
    }
    if (body.emoji !== undefined) {
      data.emoji = (body.emoji ?? '').trim().slice(0, 10) || null;
    }
    if (body.order !== undefined) {
      const order = Number(body.order);
      if (!Number.isFinite(order) || order < 0) {
        return NextResponse.json({ error: '排序序号必须是非负整数' }, { status: 400 });
      }
      data.order = order;
    }

    const preset = await prisma.presetQuizCategory.update({
      where: { id },
      data,
    });

    await refreshPresetCategories();

    return NextResponse.json({ preset });
  } catch (error) {
    console.error('编辑预置分类失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/** DELETE — 删除预置分类（不影响已有题库的 categoryId） */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const { id } = await params;

    const existing = await prisma.presetQuizCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '分类不存在' }, { status: 404 });
    }

    await prisma.presetQuizCategory.delete({ where: { id } });

    await refreshPresetCategories();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除预置分类失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **步骤 2：验证 TypeScript 编译通过**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **步骤 3：提交**

```bash
git add src/app/api/admin/quiz-categories/presets/[id]/
git commit -m "feat: 管理端预置分类编辑和删除 API"
```

---

### 任务 6：管理后台页面

**文件：**
- 新建：`src/app/admin/categories/page.tsx`

**接口：**
- 消费：管理端 API `GET/POST /api/admin/quiz-categories/presets`、`PATCH/DELETE /api/admin/quiz-categories/presets/[id]`
- 参考：`src/app/admin/professions/page.tsx` 的布局和代码风格

- [ ] **步骤 1：新建页面完整代码**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import Toast from '@/components/Toast';
import { useDialog } from '@/components/DialogProvider';

interface PresetCategory {
  id: string;
  key: string;
  text: string;
  emoji: string;
  order: number;
  quizCount: number;
  createdAt: string;
}

export default function AdminCategoriesPage() {
  const { admin, loading: adminLoading } = useAdminAuth();
  const dialog = useDialog();
  const [categories, setCategories] = useState<PresetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 新增表单
  const [newKey, setNewKey] = useState('');
  const [newText, setNewText] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [newOrder, setNewOrder] = useState(0);
  const [adding, setAdding] = useState(false);

  // 编辑弹窗
  const [editing, setEditing] = useState<PresetCategory | null>(null);
  const [editText, setEditText] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editOrder, setEditOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  // 删除状态
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
  };

  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  const fetchCategories = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/admin/quiz-categories/presets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setCategories(data.presets || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (adminLoading) return;
    if (!token || !admin) {
      window.location.href = '/admin/login';
      return;
    }
    fetchCategories();
  }, [admin, adminLoading, fetchCategories, token]);

  const handleAdd = async () => {
    const key = newKey.trim();
    const text = newText.trim();
    if (!key || !text) { showToast('请输入分类标识和名称'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/quiz-categories/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key, text, emoji: newEmoji.trim() || undefined, order: newOrder }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || '创建失败'); return; }
      setNewKey(''); setNewText(''); setNewEmoji(''); setNewOrder(0);
      showToast('分类已创建');
      fetchCategories();
    } catch { showToast('网络错误'); }
    finally { setAdding(false); }
  };

  const openEdit = (cat: PresetCategory) => {
    setEditing(cat);
    setEditText(cat.text);
    setEditEmoji(cat.emoji || '');
    setEditOrder(cat.order);
  };

  const handleEdit = async () => {
    if (!editing) return;
    const text = editText.trim();
    if (!text) { showToast('分类名称不能为空'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/quiz-categories/presets/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, emoji: editEmoji.trim() || null, order: editOrder }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || '编辑失败'); return; }
      setEditing(null);
      showToast('分类已更新');
      fetchCategories();
    } catch { showToast('网络错误'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (cat: PresetCategory) => {
    const ok = await dialog.confirm({
      title: '删除分类',
      message: `确定要删除分类「${cat.text}」吗？\n已有 ${cat.quizCount} 个题库的分类标记将变为"未分类"，题库本身不受影响。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(cat.id);
    try {
      const res = await fetch(`/api/admin/quiz-categories/presets/${cat.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const data = await res.json(); showToast(data.error || '删除失败'); return; }
      showToast('分类已删除');
      fetchCategories();
    } catch { showToast('网络错误'); }
    finally { setDeletingId(null); }
  };

  if (adminLoading || !admin) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-pink-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-pink-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-6">
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1.5">
              Category Management
            </div>
            <h2 className="text-[28px] leading-tight text-slate-800 mb-1.5"
              style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}>
              分类管理
            </h2>
            <p className="text-slate-500 text-sm">管理预置题库分类，用户可在题库列表中按分类筛选</p>
          </div>

          {/* 新增表单 */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="分类标识（英文）"
              className="w-32 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="分类名称"
              className="w-36 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <input
              type="text"
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="图标 emoji"
              className="w-32 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <input
              type="number"
              value={newOrder}
              onChange={(e) => setNewOrder(Number(e.target.value) || 0)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="排序"
              className="w-20 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newKey.trim() || !newText.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-sm font-medium rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md shadow-indigo-200 disabled:opacity-50 transition-all"
            >
              {adding ? '创建中…' : '新增分类'}
            </button>
          </div>

          {/* 列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full" />
            </div>
          ) : categories.length === 0 ? (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-12 text-center">
              <p className="text-slate-400">暂无预置分类，请添加</p>
            </div>
          ) : (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200/60 bg-slate-50/50 text-slate-500 text-[12px] uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-medium">图标</th>
                    <th className="text-left px-6 py-3 font-medium">名称</th>
                    <th className="text-left px-6 py-3 font-medium">标识</th>
                    <th className="text-left px-6 py-3 font-medium">题目数量</th>
                    <th className="text-left px-6 py-3 font-medium">排序</th>
                    <th className="text-right px-6 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => (
                    <tr key={cat.id} className="border-b border-slate-100/60 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-lg">{cat.emoji || '📘'}</td>
                      <td className="px-6 py-4 text-slate-800 font-medium text-[13.5px]">{cat.text}</td>
                      <td className="px-6 py-4 text-slate-400 text-[12.5px] font-mono">{cat.key}</td>
                      <td className="px-6 py-4 text-slate-600 text-[13px] tabular-nums">{cat.quizCount}</td>
                      <td className="px-6 py-4 text-slate-600 text-[13px] tabular-nums">{cat.order}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => openEdit(cat)}
                            className="px-3 py-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg text-[12.5px] transition-colors"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(cat)}
                            disabled={deletingId === cat.id}
                            className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-[12.5px] transition-colors disabled:opacity-50"
                          >
                            {deletingId === cat.id ? '删除中…' : '删除'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 编辑弹窗 */}
      {editing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setEditing(null)}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-slate-800 text-lg font-bold mb-4">编辑分类「{editing.text}」</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">分类标识（不可修改）</label>
                <input type="text" value={editing.key} disabled
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 text-sm" />
              </div>
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">名称</label>
                <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm" />
              </div>
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">图标 emoji</label>
                <input type="text" value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm" />
              </div>
              <div>
                <label className="block text-[12px] text-slate-500 mb-1">排序</label>
                <input type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)}
                className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-sm">
                取消
              </button>
              <button onClick={handleEdit} disabled={saving}
                className="flex-1 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md disabled:opacity-50 transition-all text-sm">
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </div>
  );
}
```

- [ ] **步骤 2：验证 TypeScript 编译通过**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **步骤 3：提交**

```bash
git add src/app/admin/categories/
git commit -m "feat: 管理后台分类管理页面"
```

---

### 任务 7：侧边栏导航

**文件：**
- 修改：`src/components/AdminSidebar.tsx`

- [ ] **步骤 1：在 NAV_ITEMS 数组中「题库管理」之后插入「分类管理」导航项**

在 `src/components/AdminSidebar.tsx` 的 `NavItem` 数组中，`key: 'quizzes'` 之后、`key: 'quizzes-new'` 之前插入：

```typescript
{
  key: 'categories',
  label: '分类管理',
  path: '/admin/categories',
  icon: (
    <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 7h-1a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-1m-2.5-9.5a2.121 2.121 0 013 3L13 15l-4 1 1-4 5.5-5.5z" />
    </svg>
  ),
},
```

- [ ] **步骤 2：验证 TypeScript 编译通过**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **步骤 3：提交**

```bash
git add src/components/AdminSidebar.tsx
git commit -m "feat: 侧边栏新增分类管理导航"
```

---

### 任务 8：端到端验证

- [ ] **步骤 1：重启开发服务器并测试完整流程**

```bash
# 1. 访问 http://localhost:3000/admin/categories
# 2. 确认 9 个默认分类已显示
# 3. 测试新增分类：key=test, 名称=测试分类, emoji=🧪, 排序=10
# 4. 测试编辑：修改名称为"测试分类已编辑"
# 5. 测试删除：删除刚创建的分类
# 6. 访问 http://localhost:3000/api/quiz-categories/presets 确认公共 API 正常
# 7. 访问前台首页确认分类列表正常显示
```

- [ ] **步骤 2：完成**
