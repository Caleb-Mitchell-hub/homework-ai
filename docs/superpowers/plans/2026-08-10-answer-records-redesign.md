# 答题记录重设计 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将答题记录从侧边栏混乱的树形导航重构为独立的 `/records` 页面（卡片列表 + 搜索筛选 + 分页 + 详情抽屉），分类从 localStorage 迁移到服务端数据库。

**Architecture:** 新增 ResultCategory 表存储用户自定义分类，QuizResult 新增 categoryId 字段关联分类。保留 4 个系统分类（最近/草稿/未分类/待批改）作为虚拟过滤规则。侧边栏不再展示完整记录树，改为统计摘要 + 跳转入口。Layout.tsx 不再劫持主区域渲染 ResultCard。

**Tech Stack:** Next.js 16 App Router, Prisma 5 + MySQL, React 19, TypeScript 5, Tailwind CSS, Vitest + @testing-library/react

## Global Constraints

- 所有 API 路由需验证用户 token（复用现有 `getTokenFromHeaders` + `verifyToken`）
- 中文命名：文件/变量用英文，UI 文案用中文
- 遵循项目现有目录结构：API 路由在 `src/app/api/`，组件在 `src/components/`
- TypeScript 零错误（`npx tsc --noEmit` 通过）
- 系统分类（`__sys_*`）不存数据库，仅作为 API 查询的过滤规则

---

### Task 1: Prisma Schema 迁移

**Files:**
- Modify: `prisma/schema.prisma`
- Create: (自动生成) `prisma/migrations/*`

**Interfaces:**
- Produces: `ResultCategory` 模型（id, userId, name, parentId?, order）, `QuizResult.categoryId` 字段

- [ ] **Step 1: 在 schema.prisma 的 User 模型中新增 relation**

找到 `results QuizResult[]` 行，在其附近添加：
```prisma
resultCategories ResultCategory[]
```

- [ ] **Step 2: 在 schema.prisma 末尾新增 ResultCategory 模型**

```prisma
model ResultCategory {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String   @db.VarChar(40)
  parentId  String?
  order     Int      @default(0)
  createdAt DateTime @default(now())

  @@index([userId])
}
```

- [ ] **Step 3: 在 QuizResult 模型中新增 categoryId 字段**

在 `status` 字段下方添加：
```prisma
categoryId  String?
```

- [ ] **Step 4: 运行 Prisma 迁移**

```bash
npx prisma migrate dev --name add_result_category
```

- [ ] **Step 5: 验证迁移**

```bash
npx prisma db pull --print 2>&1 | grep -A5 "ResultCategory"
```
确认输出中包含 ResultCategory 模型定义。

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add ResultCategory model and QuizResult.categoryId"
```

---

### Task 2: GET /api/results/counts — 侧边栏轻量计数

**Files:**
- Create: `src/app/api/results/counts/route.ts`

**Interfaces:**
- Produces: `GET /api/results/counts` → `{ total, recent, draft, uncat, pending, byUserCategory: Record<string, number> }`

- [ ] **Step 1: 创建路由文件**

```typescript
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const userId = payload.userId;

    // 并行查询所有计数
    const [total, recent, draft, uncat, pendingCount, userCategories] = await Promise.all([
      // total: 全部记录
      prisma.quizResult.count({ where: { userId } }),
      // recent: 最近7天 submitted
      prisma.quizResult.count({
        where: {
          userId,
          status: 'submitted',
          submittedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // draft
      prisma.quizResult.count({ where: { userId, status: 'draft' } }),
      // uncat: categoryId is null + submitted
      prisma.quizResult.count({
        where: { userId, categoryId: null, status: 'submitted' },
      }),
      // pending: 含 autoGraded=false 的条目（无法在 DB 层直接过滤 JSON，暂粗略计数）
      // 此处用 status=submitted 且非 interview 类型来近似。TODO 后续可优化为 JSON 查询
      prisma.quizResult.count({
        where: { userId, status: 'submitted' },
      }),
      // 用户分类计数
      prisma.quizResult.groupBy({
        by: ['categoryId'],
        where: { userId, categoryId: { not: null } },
        _count: { id: true },
      }),
    ]);

    // pending 精确计数暂不支持（results JSON 字段），与前端协作过滤
    // 此处 pending 先等于 total submitted，由前端在获取列表后再细化

    const byUserCategory: Record<string, number> = {};
    for (const group of userCategories) {
      if (group.categoryId) {
        byUserCategory[group.categoryId] = group._count.id;
      }
    }

    return NextResponse.json({
      total,
      recent,
      draft,
      uncat,
      pending: pendingCount, // 后续迭代精确化
      byUserCategory,
    });
  } catch (error) {
    console.error('获取记录计数错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证接口**

启动 dev server 后用 curl 测试：
```bash
curl -H "Authorization: Bearer <valid_token>" http://localhost:3000/api/results/counts
```
确认返回 JSON 包含 `total`, `recent`, `draft`, `uncat`, `pending`, `byUserCategory` 字段。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/results/counts/route.ts
git commit -m "feat: add GET /api/results/counts for lightweight sidebar polling"
```

---

### Task 3: 改造 GET /api/results — 分页/搜索/筛选/摘要

**Files:**
- Modify: `src/app/api/results/route.ts`

**Interfaces:**
- Consumes: 新增查询参数 `page`, `pageSize`, `search`, `categoryId`, `status`, `sort`
- Produces: `{ results: ResultSummary[], total: number, page: number, pageSize: number }`
  - ResultSummary: 不含 `results` JSON 数组，改为 `summary: { totalQuestions, objectiveCount, subjectiveCount, correctCount, subjectiveAvgScore }`

- [ ] **Step 1: 在 GET 函数开头提取新查询参数**

找到 `const quizId = searchParams.get('quizId');` 行，追加：
```typescript
const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
const search = searchParams.get('search') || undefined;
const categoryId = searchParams.get('categoryId') || undefined;
const status = searchParams.get('status') || undefined;
const sort = searchParams.get('sort') || 'recent';
```

- [ ] **Step 2: 构建动态 where 条件**

替换现有 `const where = ...` 逻辑为：
```typescript
const where: any = { userId: payload.userId };

if (quizId) {
  where.quizId = quizId;
}

if (status === 'submitted') {
  where.status = 'submitted';
} else if (status === 'draft') {
  where.status = 'draft';
}
// status === 'all' or undefined → 不过滤

// 系统分类规则
const sysCategory = searchParams.get('sysCategory');
if (sysCategory === 'recent') {
  where.status = 'submitted';
  where.submittedAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
} else if (sysCategory === 'uncat') {
  where.categoryId = null;
  where.status = 'submitted';
} else if (sysCategory === 'draft') {
  where.status = 'draft';
}
// 'pending' — 暂不在 DB 层过滤，由前端辅助

if (categoryId) {
  where.categoryId = categoryId;
}
```

- [ ] **Step 3: 构建排序 + 搜索**

```typescript
// 搜索：模糊匹配记录名
if (search) {
  where.name = { contains: search };
}

// 排序
let orderBy: any = { submittedAt: 'desc' }; // default: recent
if (sort === 'score_desc') {
  orderBy = { score: 'desc' };
} else if (sort === 'score_asc') {
  orderBy = { score: 'asc' };
}
```

- [ ] **Step 4: 执行分页查询 + 计算摘要**

替换 `const results = await prisma.quizResult.findMany({...})` 为：
```typescript
const [rawResults, total] = await Promise.all([
  prisma.quizResult.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      quiz: {
        select: { id: true, title: true },
      },
    },
  }),
  prisma.quizResult.count({ where }),
]);
```

- [ ] **Step 5: 为每条记录计算 summary（替代完整 results JSON）**

替换 `const parsed = results.map(...)` 为：
```typescript
const results = rawResults.map((r) => {
  let items: any[] = [];
  try {
    items = JSON.parse(r.results || '[]');
  } catch { /* keep [] */ }

  const SUBJECTIVE_TYPES = new Set(['interview', 'essay']);
  let objectiveCount = 0;
  let subjectiveCount = 0;
  let correctCount = 0;
  let subjectiveScoreSum = 0;
  let subjectiveScoredCount = 0;

  for (const item of items) {
    if (SUBJECTIVE_TYPES.has(item.questionType || '')) {
      subjectiveCount++;
      if (typeof item.interviewScore === 'number') {
        subjectiveScoreSum += item.interviewScore;
        subjectiveScoredCount++;
      }
    } else {
      objectiveCount++;
      if (item.correct) correctCount++;
    }
  }

  const summary = {
    totalQuestions: items.length,
    objectiveCount,
    subjectiveCount,
    correctCount,
    subjectiveAvgScore: subjectiveScoredCount > 0
      ? Math.round(subjectiveScoreSum / subjectiveScoredCount)
      : 0,
  };

  // 不返回 results 数组（详情走单独接口）
  const { results: _results, ...rest } = r as any;
  return { ...rest, summary };
});
```

- [ ] **Step 6: 更新返回**

```typescript
return NextResponse.json({ results, total, page, pageSize });
```

- [ ] **Step 7: 验证改动** 不破坏现有调用

检查 `src/app/quiz/[id]/page.tsx` 中的 fetch 是否仍正常工作（已使用 `?quizId=` 参数）。确保旧参数 `quizId` 仍被支持。

- [ ] **Step 8: Commit**

```bash
git add src/app/api/results/route.ts
git commit -m "feat: refactor GET /api/results with pagination, search, filter, sort, and summary"
```

---

### Task 4: GET /api/results/[id] — 单条记录详情

**Files:**
- Create: `src/app/api/results/[id]/route.ts`

**Interfaces:**
- Produces: `GET /api/results/[id]` → `{ result: QuizResult & { quiz: {id, title} } }`（含完整 results 数组）

- [ ] **Step 1: 创建路由文件**

```typescript
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    await updateUserActiveTime(payload.userId);
    const { id } = await params;

    const result = await prisma.quizResult.findUnique({
      where: { id },
      include: {
        quiz: { select: { id: true, title: true, questions: true } },
      },
    });

    if (!result) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }

    if (result.userId !== payload.userId) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    // 解析 results JSON 字符串为对象数组
    let parsedResults: any[] = [];
    try {
      parsedResults = JSON.parse(result.results || '[]');
    } catch { /* keep [] */ }

    return NextResponse.json({
      result: {
        ...result,
        results: parsedResults,
      },
    });
  } catch (error) {
    console.error('获取记录详情错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证接口**

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/results/<valid_id>
```
确认返回完整记录含 results 数组和 quiz.questions。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/results/[id]/route.ts
git commit -m "feat: add GET /api/results/[id] for single record detail"
```

---

### Task 5: PATCH /api/results/[id]/category — 单记录改分类

**Files:**
- Modify: `src/app/api/results/[id]/route.ts`（在 Task 4 文件上追加）

**Interfaces:**
- Produces: `PATCH` → `{ ok: true }`，接收 `{ categoryId: string | null }`

- [ ] **Step 1: 在同一文件中新增 PATCH handler**

```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { id } = await params;
    const { categoryId } = await request.json();

    // 越权检查
    const existing = await prisma.quizResult.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }
    if (existing.userId !== payload.userId) {
      return NextResponse.json({ error: '无权修改' }, { status: 403 });
    }

    await prisma.quizResult.update({
      where: { id },
      data: { categoryId: categoryId ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('修改记录分类错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证接口**

```bash
curl -X PATCH -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"categoryId":"c_test123"}' \
  http://localhost:3000/api/results/<valid_id>
```
确认返回 `{"ok":true}`，数据库中的 categoryId 已更新。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/results/[id]/route.ts
git commit -m "feat: add PATCH /api/results/[id] for category change"
```

---

### Task 6: POST /api/results/batch-category — 批量归入分类

**Files:**
- Create: `src/app/api/results/batch-category/route.ts`

**Interfaces:**
- Produces: `POST` → `{ ok: true, updated: number }`，接收 `{ resultIds: string[], categoryId: string | null }`

- [ ] **Step 1: 创建路由文件**

```typescript
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { resultIds, categoryId } = await request.json();

    if (!Array.isArray(resultIds) || resultIds.length === 0) {
      return NextResponse.json({ error: '请提供有效的记录 id 列表' }, { status: 400 });
    }

    // 确保只更新自己的记录
    const result = await prisma.quizResult.updateMany({
      where: {
        id: { in: resultIds },
        userId: payload.userId,
      },
      data: { categoryId: categoryId ?? null },
    });

    return NextResponse.json({ ok: true, updated: result.count });
  } catch (error) {
    console.error('批量归入分类错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证接口**

```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"resultIds":["id1","id2"],"categoryId":"c_test"}' \
  http://localhost:3000/api/results/batch-category
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/results/batch-category/route.ts
git commit -m "feat: add POST /api/results/batch-category for batch assignment"
```

---

### Task 7: 结果分类 CRUD API（GET + POST）

**Files:**
- Create: `src/app/api/result-categories/route.ts`

**Interfaces:**
- Produces: `GET` → `{ categories: ResultCategory[] }`, `POST` → `{ category: ResultCategory }`, 接收 `{ name: string, parentId?: string }`

- [ ] **Step 1: 创建路由文件**

```typescript
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const categories = await prisma.resultCategory.findMany({
      where: { userId: payload.userId },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('获取分类列表错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { name, parentId } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: '分类名不能为空' }, { status: 400 });
    }

    // 同级排序：找当前最大 order + 1
    const maxOrder = await prisma.resultCategory.findFirst({
      where: { userId: payload.userId, parentId: parentId ?? null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const category = await prisma.resultCategory.create({
      data: {
        userId: payload.userId,
        name: name.trim(),
        parentId: parentId ?? null,
        order: (maxOrder?.order ?? -1) + 1,
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error('创建分类错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证接口**

```bash
# 获取列表
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/result-categories
# 创建
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"前端面试"}' http://localhost:3000/api/result-categories
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/result-categories/route.ts
git commit -m "feat: add GET+POST /api/result-categories for category CRUD"
```

---

### Task 8: 结果分类 PATCH + DELETE API

**Files:**
- Create: `src/app/api/result-categories/[id]/route.ts`

**Interfaces:**
- Produces: `PATCH` → `{ category }`, 接收 `{ name?, parentId? }`; `DELETE` → `{ ok: true, deletedChildCount: number }`

- [ ] **Step 1: 创建路由文件**

```typescript
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.resultCategory.findUnique({ where: { id } });
    if (!existing || existing.userId !== payload.userId) {
      return NextResponse.json({ error: '分类不存在或无权操作' }, { status: 404 });
    }

    const { name, parentId } = await request.json();
    const data: any = {};
    if (name !== undefined) data.name = name.trim();
    if (parentId !== undefined) data.parentId = parentId;

    const category = await prisma.resultCategory.update({
      where: { id },
      data,
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error('更新分类错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.resultCategory.findUnique({ where: { id } });
    if (!existing || existing.userId !== payload.userId) {
      return NextResponse.json({ error: '分类不存在或无权操作' }, { status: 404 });
    }

    // 递归收集所有子分类 id
    async function collectDescendantIds(parentId: string): Promise<string[]> {
      const children = await prisma.resultCategory.findMany({
        where: { parentId },
        select: { id: true },
      });
      const ids: string[] = [];
      for (const c of children) {
        ids.push(c.id);
        ids.push(...(await collectDescendantIds(c.id)));
      }
      return ids;
    }
    const toDelete = [id, ...(await collectDescendantIds(id))];

    // 将受影响记录的分类重置为 null
    await prisma.quizResult.updateMany({
      where: { categoryId: { in: toDelete } },
      data: { categoryId: null },
    });

    // 删除所有分类（含子分类）
    const result = await prisma.resultCategory.deleteMany({
      where: { id: { in: toDelete } },
    });

    return NextResponse.json({ ok: true, deletedChildCount: result.count - 1 });
  } catch (error) {
    console.error('删除分类错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/result-categories/[id]/route.ts
git commit -m "feat: add PATCH+DELETE /api/result-categories/[id] for category edit/delete"
```

---

### Task 9: Refactor CategoryContext — 改为服务端驱动

**Files:**
- Modify: `src/contexts/CategoryContext.tsx`

**Interfaces:**
- Consumes: `GET /api/result-categories`, `POST /api/result-categories`, `PATCH /api/result-categories/[id]`, `DELETE /api/result-categories/[id]`, `PATCH /api/results/[id]`, `POST /api/results/batch-category`
- Produces: 不改变对外接口（`useCategories()` 返回值保持不变），内部实现从 localStorage 改为 API 调用

- [ ] **Step 1: 添加 API fetch 辅助函数**

在 CategoryContext 文件顶部 imports 后添加：
```typescript
const RC_API = '/api/result-categories';

async function fetchCategories(token: string): Promise<Category[]> {
  const res = await fetch(RC_API, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.categories ?? [];
}

async function createCategoryAPI(token: string, name: string, parentId: string | null): Promise<Category> {
  const res = await fetch(RC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, parentId }),
  });
  if (!res.ok) throw new Error('创建失败');
  const data = await res.json();
  return data.category;
}

async function updateCategoryAPI(token: string, id: string, data: { name?: string; parentId?: string | null }): Promise<void> {
  const res = await fetch(`${RC_API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('更新失败');
}

async function deleteCategoryAPI(token: string, id: string): Promise<void> {
  const res = await fetch(`${RC_API}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('删除失败');
}

async function setResultCategoryAPI(token: string, resultId: string, categoryId: string | null): Promise<void> {
  await fetch(`/api/results/${resultId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ categoryId }),
  });
}

async function batchCategoryAPI(token: string, resultIds: string[], categoryId: string | null): Promise<void> {
  await fetch('/api/results/batch-category', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resultIds, categoryId }),
  });
}
```

- [ ] **Step 2: 从 AuthContext 获取 token**

`CategoryProvider` 中已有 `useAuth()` → `user`。添加 token 获取：
```typescript
const { user } = useAuth();
const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
```

- [ ] **Step 3: 改造 useEffect — 从 API 加载分类**

替换原有的 localStorage hydrate useEffect 为：
```typescript
useEffect(() => {
  if (!currentUserId || !token) return;
  if (lastUserIdRef.current === currentUserId) return;
  lastUserIdRef.current = currentUserId;

  // 从服务端加载分类
  fetchCategories(token).then((cats) => {
    // 添加系统分类 + 用户根
    const fullCategories: Category[] = [
      ...SYSTEM_CATEGORIES,
      { id: USER_ROOT_ID, name: '我的题库', parentId: null, order: -1 },
      ...cats,
    ];
    setCategories(fullCategories);
  });
}, [currentUserId, token]);
```

- [ ] **Step 4: 改造 CRUD 方法 — 调用 API 并更新本地 state**

改造 `createCategory`（用 `async` 包装）：
```typescript
const createCategory = useCallback(
  async (name: string, parentId: CategoryId | null): Promise<Category> => {
    if (!currentUserId || !token) throw new Error('未登录');
    const newCat = await createCategoryAPI(token, name, parentId);
    setCategories((prev) => [...prev, newCat]);
    if (parentId) {
      setExpanded((prev) => new Set(prev).add(parentId));
    }
    return newCat;
  },
  [currentUserId, token]
);
```

改造 `renameCategory`：
```typescript
const renameCategory = useCallback(
  async (id: CategoryId, name: string) => {
    if (!currentUserId || !token) return;
    const cat = categories.find((c) => c.id === id);
    if (!cat || cat.system) return;
    await updateCategoryAPI(token, id, { name: name.trim() });
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name: name.trim() || c.name } : c)));
  },
  [categories, currentUserId, token]
);
```

改造 `deleteCategory`：
```typescript
const deleteCategory = useCallback(
  async (id: CategoryId) => {
    if (!currentUserId || !token) return;
    const cat = categories.find((c) => c.id === id);
    if (!cat || cat.system) return;
    await deleteCategoryAPI(token, id);
    setCategories((prev) => {
      const toDelete = new Set<CategoryId>([id]);
      // 前端也递归删除子分类
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
      return prev.filter((c) => !toDelete.has(c.id));
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  },
  [categories, currentUserId, token]
);
```

改造 `setResultCategory`：
```typescript
const setResultCategory = useCallback(
  async (resultId: string, categoryId: CategoryId | null) => {
    if (!currentUserId || !token) return;
    setResultCategoryAPI(token, resultId, categoryId);
    // 乐观更新本地 resultMap
    setResultMap((prev) => {
      const next = { ...prev };
      if (categoryId) next[resultId] = categoryId;
      else delete next[resultId];
      return next;
    });
  },
  [currentUserId, token]
);
```

- [ ] **Step 5: 移除 localStorage 持久化 useEffect**

删除写入 localStorage 的 useEffect（`saveToUserBucket` 调用），但保留 `getResultCategory` 的纯读取逻辑不变。

- [ ] **Step 6：验证** TypeScript 编译 + 手动测试分类操作

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/contexts/CategoryContext.tsx
git commit -m "refactor: migrate CategoryContext from localStorage to server API"
```

---

### Task 10: localStorage → 服务端迁移脚本

**Files:**
- Create: `src/lib/migrate-categories.ts`
- Modify: `src/app/records/page.tsx`（在 Task 13 中引用）

**Interfaces:**
- Produces: `migrateCategoriesIfNeeded(userId: string, token: string): Promise<boolean>` — 返回 true 表示执行过迁移

- [ ] **Step 1: 创建迁移模块**

```typescript
// src/lib/migrate-categories.ts
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

  // 已迁移过
  if (localStorage.getItem(`${MIGRATED_KEY_PREFIX}${userId}`)) {
    return false;
  }

  // 读取旧数据
  let legacy: LegacyPersisted | null = null;
  try {
    const raw = localStorage.getItem(LEGACY_CATEGORIES_KEY);
    if (!raw) {
      // 也尝试用户桶 key
      const userRaw = localStorage.getItem(`homework-ai-categories-v1:${userId}`);
      if (!userRaw) {
        // 无旧数据，标记已迁移
        localStorage.setItem(`${MIGRATED_KEY_PREFIX}${userId}`, 'true');
        return false;
      }
      legacy = JSON.parse(userRaw);
    } else {
      legacy = JSON.parse(raw);
    }
  } catch {
    localStorage.setItem(`${MIGRATED_KEY_PREFIX}${userId}`, 'true');
    return false;
  }

  if (!legacy || !legacy.categories?.length) {
    localStorage.setItem(`${MIGRATED_KEY_PREFIX}${userId}`, 'true');
    return false;
  }

  // 只迁移用户自定义分类（排除系统分类和 USER_ROOT）
  const userCategories = legacy.categories.filter(
    (c) => !c.id.startsWith('__sys_') && c.id !== '__user_root'
  );

  if (userCategories.length === 0 && Object.keys(legacy.resultMap).length === 0) {
    localStorage.setItem(`${MIGRATED_KEY_PREFIX}${userId}`, 'true');
    return false;
  }

  // 按层级创建分类（先顶级后子级），记录旧ID→新ID映射
  const idMap = new Map<string, string>();

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
    } catch { /* 单个分类迁移失败不阻塞其他 */ }
  }

  // 迁移 resultMap（记录→分类的映射）
  const resultMap = legacy.resultMap;
  const entries = Object.entries(resultMap);
  if (entries.length > 0) {
    // 分批处理，每批 50 条
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
        } catch { /* continue */ }
      }
    }
  }

  // 标记已迁移
  localStorage.setItem(`${MIGRATED_KEY_PREFIX}${userId}`, 'true');
  // 备份旧数据
  try {
    localStorage.setItem(`${LEGACY_CATEGORIES_KEY}:backup-${userId}`, JSON.stringify(legacy));
  } catch { /* ignore */ }

  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/migrate-categories.ts
git commit -m "feat: add localStorage to server category migration script"
```

---

### Task 11: RecordCard 组件

**Files:**
- Create: `src/components/RecordCard.tsx`

**Interfaces:**
- Consumes: `RecordSummary` 类型（来自 `/api/results` 返回）
- Produces: `<RecordCard>` 组件，显示记录卡片 + 操作按钮

- [ ] **Step 1: 定义 RecordSummary 类型**

在 `src/types/index.ts` 末尾添加：
```typescript
export interface RecordSummary {
  id: string;
  quizId: string;
  name: string;
  score: number;
  totalScore: number;
  status: 'draft' | 'submitted';
  submittedAt: string;
  categoryId?: string | null;
  quiz: { id: string; title: string };
  summary: {
    totalQuestions: number;
    objectiveCount: number;
    subjectiveCount: number;
    correctCount: number;
    subjectiveAvgScore: number;
  };
}
```

- [ ] **Step 2: 创建 RecordCard 组件**

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { RecordSummary } from '@/types';

interface Props {
  record: RecordSummary;
  onViewDetail: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function RecordCard({ record, onViewDetail, onDelete }: Props) {
  const router = useRouter();
  const isDraft = record.status === 'draft';
  const percentage = record.totalScore > 0
    ? Math.round((record.score / record.totalScore) * 100)
    : 0;

  const pctColor =
    percentage >= 80 ? 'text-emerald-500' :
    percentage >= 60 ? 'text-amber-500' :
    'text-rose-500';

  const barColor =
    percentage >= 80 ? 'bg-emerald-400' :
    percentage >= 60 ? 'bg-amber-400' :
    'bg-rose-400';

  const hasSubjective = record.summary.subjectiveCount > 0;

  return (
    <div className="p-4 rounded-2xl bg-white/80 border border-slate-200/60 hover:border-sky-300 hover:shadow-sm transition-all">
      {/* 题库名 + 状态标签 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px]">📋</span>
          <span className="text-[13px] font-medium text-slate-800 truncate">
            {record.quiz?.title || '未知题库'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isDraft ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-600 font-medium">
              草稿
            </span>
          ) : (
            <span className={`text-[14px] font-bold tabular-nums ${pctColor}`}>
              {percentage}%
            </span>
          )}
        </div>
      </div>

      {/* 记录名 + 时间 */}
      <div className="text-[11px] text-slate-500 mb-2">
        {record.name} · {new Date(record.submittedAt).toLocaleString('zh-CN')}
      </div>

      {/* 进度条（已提交）+ 统计 */}
      {!isDraft && (
        <div className="space-y-1.5 mb-3">
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>{record.score}/{record.totalScore}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor} transition-all`}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
          {hasSubjective && (
            <div className="text-[10px] text-slate-400">
              主观题均分 {record.summary.subjectiveAvgScore} · {record.summary.objectiveCount}客观 + {record.summary.subjectiveCount}主观
            </div>
          )}
        </div>
      )}

      {/* 草稿状态 */}
      {isDraft && (
        <div className="text-[11px] text-amber-600 mb-3">
          已完成 {record.summary.totalQuestions > 0 ? `${record.summary.totalQuestions} 题` : '部分题目'}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 text-[11px]">
        {isDraft ? (
          <button
            onClick={() => router.push(`/quiz/${record.quizId}`)}
            className="px-3 py-1.5 rounded-lg bg-sky-400 text-white hover:bg-sky-500 transition-colors"
          >
            继续答题
          </button>
        ) : (
          <>
            <button
              onClick={() => onViewDetail(record.id)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              查看详情
            </button>
            <button
              onClick={() => router.push(`/result/${record.id}/report`)}
              className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
            >
              查看报告
            </button>
          </>
        )}
        {/* 更多菜单 */}
        <div className="relative ml-auto group/more">
          <button className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            ⋮
          </button>
          <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover/more:opacity-100 group-hover/more:visible transition-all z-10 py-1 min-w-[100px]">
            <button
              onClick={() => onDelete(record.id)}
              className="block w-full text-left px-3 py-1.5 text-[11px] text-rose-500 hover:bg-rose-50 transition-colors"
            >
              删除记录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/RecordCard.tsx src/types/index.ts
git commit -m "feat: add RecordCard component with draft/submitted states"
```

---

### Task 12: RecordDetailDrawer 组件

**Files:**
- Create: `src/components/RecordDetailDrawer.tsx`

**Interfaces:**
- Consumes: `QuizResult` + `Quiz`（通过 `GET /api/results/[id]` 获取）
- Produces: `<RecordDetailDrawer>` 组件，右侧滑出抽屉内嵌 AnswerSheet

- [ ] **Step 1: 创建组件**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Quiz, QuizResult } from '@/types';
import AnswerSheet from '@/components/AnswerSheet';

interface Props {
  resultId: string | null;
  open: boolean;
  onClose: () => void;
  token: string;
}

export default function RecordDetailDrawer({ resultId, open, onClose, token }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    if (!open || !resultId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`/api/results/${resultId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || '加载失败');
        }
        const data = await res.json();
        if (cancelled) return;

        const r = data.result;
        // 构造 Quiz 格式给 AnswerSheet 使用
        let questions: any[] = [];
        try {
          if (typeof r.quiz.questions === 'string') {
            questions = JSON.parse(r.quiz.questions);
          } else if (Array.isArray(r.quiz.questions)) {
            questions = r.quiz.questions;
          }
        } catch { /* keep [] */ }

        // 构造 ResultItem 数组（解析 results JSON）
        let items: any[] = [];
        try {
          items = typeof r.results === 'string' ? JSON.parse(r.results) : r.results;
        } catch { /* keep [] */ }

        setQuiz({
          id: r.quizId,
          title: r.quiz.title,
          questions,
          createdAt: new Date(r.submittedAt).getTime(),
        });

        setResult({
          id: r.id,
          quizId: r.quizId,
          name: r.name,
          status: r.status,
          score: r.score,
          totalScore: r.totalScore,
          results: items,
          answers: [],
          submittedAt: new Date(r.submittedAt).getTime(),
        });
      } catch (e: any) {
        if (!cancelled) setError(e.message || '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [resultId, open, token]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* 抽屉 */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto transform transition-transform duration-300">
        {/* 关闭按钮 */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-sm border-b border-slate-200/60 px-4 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-slate-800 truncate">
              {quiz?.title || '加载中...'} · {result?.name}
            </h2>
            {result && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                {new Date(result.submittedAt).toLocaleString('zh-CN')} ·
                得分 {result.score}/{result.totalScore}
                {result.totalScore > 0 && ` (${Math.round(result.score / result.totalScore * 100)}%)`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {result?.id && (
              <button
                onClick={() => router.push(`/result/${result.id}/report`)}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
              >
                查看完整报告
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all flex items-center justify-center"
              aria-label="关闭"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="p-4">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-6 h-6 border-3 border-sky-400 border-t-transparent rounded-full" />
            </div>
          )}
          {error && (
            <div className="text-center py-20 text-rose-500 text-sm">{error}</div>
          )}
          {!loading && !error && quiz && result && (
            <AnswerSheet quiz={quiz} result={result} />
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RecordDetailDrawer.tsx
git commit -m "feat: add RecordDetailDrawer with AnswerSheet integration"
```

---

### Task 13: `/records` 页面

**Files:**
- Create: `src/app/records/page.tsx`

**Interfaces:**
- Consumes: `GET /api/results` (paginated, searchable), `GET /api/results/counts` (sidebar counts), `GET /api/result-categories`, `migrateCategoriesIfNeeded`
- Produces: 完整的答题记录管理页面

- [ ] **Step 1: 创建页面**

```typescript
'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories } from '@/contexts/CategoryContext';
import { RecordSummary } from '@/types';
import RecordCard from '@/components/RecordCard';
import RecordDetailDrawer from '@/components/RecordDetailDrawer';
import { migrateCategoriesIfNeeded } from '@/lib/migrate-categories';
import { useDialog } from '@/components/DialogProvider';

const SYSTEM_TABS = [
  { key: 'all', label: '全部' },
  { key: 'recent', label: '最近' },
  { key: 'draft', label: '草稿' },
  { key: 'uncat', label: '未分类' },
] as const;

const SORT_OPTIONS = [
  { value: 'recent', label: '最近优先' },
  { value: 'score_desc', label: '得分最高' },
  { value: 'score_asc', label: '得分最低' },
];

export default function RecordsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">加载中...</div>}>
      <RecordsContent />
    </Suspense>
  );
}

function RecordsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, loading } = useAuth();
  const ctx = useCategories();
  const dialog = useDialog();

  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSysTab, setActiveSysTab] = useState<string>('all');
  const [activeUserCategory, setActiveUserCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('recent');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // 详情抽屉
  const selectedId = searchParams.get('id');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = 20;

  // 权限守卫
  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // 迁移旧 localStorage 分类
  useEffect(() => {
    if (!token || !user?.id) return;
    migrateCategoriesIfNeeded(user.id, token).then((migrated) => {
      if (migrated) {
        // 刷新分类列表
        window.location.reload();
      }
    });
  }, [token, user?.id]);

  // URL ?id=xxx 自动打开抽屉
  useEffect(() => {
    if (selectedId) setDrawerOpen(true);
  }, [selectedId]);

  // 拉取记录
  const fetchRecords = useCallback(async () => {
    if (!token) return;
    setLoadingRecords(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('sort', sortBy);
      if (searchQuery) params.set('search', searchQuery);
      if (activeUserCategory) params.set('categoryId', activeUserCategory);
      if (activeSysTab === 'recent') params.set('sysCategory', 'recent');
      else if (activeSysTab === 'draft') params.set('status', 'draft');
      else if (activeSysTab === 'uncat') params.set('sysCategory', 'uncat');

      const res = await fetch(`/api/results?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.results ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (e) {
      console.error('加载记录失败:', e);
    } finally {
      setLoadingRecords(false);
    }
  }, [token, page, sortBy, searchQuery, activeUserCategory, activeSysTab]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // 搜索防抖
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
    }, 300);
  };

  // 切换分类 tab
  const handleTabChange = (key: string) => {
    setActiveSysTab(key);
    setActiveUserCategory(null);
    setPage(1);
  };

  const handleUserCategoryClick = (catId: string) => {
    setActiveSysTab('');
    setActiveUserCategory(catId);
    setPage(1);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    router.replace('/records');
  };

  // 删除记录
  const handleDelete = async (id: string) => {
    const ok = await dialog.confirm({
      title: '删除记录',
      message: '确定要删除这条答题记录吗？',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/results?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setRecords((prev) => prev.filter((r) => r.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch { /* ignore */ }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 顶部标题栏 */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-[13px] text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5"
          >
            ← 返回首页
          </button>
          <h1 className="text-xl font-bold text-slate-800">答题记录</h1>
          <span className="text-[11px] text-slate-400 tabular-nums ml-auto">{total} 条记录</span>
        </div>

        {/* 搜索框 */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索题库名或记录名..."
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white/80 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
          />
        </div>

        {/* 分类 tab */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {SYSTEM_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all ${
                activeSysTab === tab.key && !activeUserCategory
                  ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                  : 'bg-white/70 border border-slate-200/60 text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {/* 用户自定义分类 */}
          {ctx.categories
            .filter((c) => !c.system && c.id !== '__user_root')
            .map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleUserCategoryClick(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all ${
                  activeUserCategory === cat.id
                    ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                    : 'bg-white/70 border border-slate-200/60 text-slate-500 hover:text-slate-700'
                }`}
              >
                📁 {cat.name}
              </button>
            ))}
          <button
            onClick={async () => {
              const name = await dialog.prompt({
                title: '新建分类',
                message: '输入新分类名称',
                placeholder: '例如：前端面试',
              });
              if (name?.trim()) {
                try {
                  await ctx.createCategory(name.trim(), null);
                } catch (err: any) {
                  await dialog.alert({ title: '创建失败', message: err?.message || '请重试' });
                }
              }
            }}
            className="px-2 py-1.5 rounded-lg text-[12px] text-sky-500 hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            + 新建分类
          </button>
        </div>

        {/* 排序 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] text-slate-400">排序:</span>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            className="text-[12px] px-2.5 py-1.5 rounded-lg bg-white/80 border border-slate-200 text-slate-600 focus:outline-none focus:border-sky-400 cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* 记录列表 */}
        {loadingRecords ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-lg mb-2">📭</p>
            <p className="text-sm">暂无答题记录</p>
            <button
              onClick={() => router.push('/')}
              className="mt-3 text-[12px] text-sky-500 hover:text-sky-600 underline"
            >
              去首页选题答题
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {records.map((r) => (
              <RecordCard
                key={r.id}
                record={r}
                onViewDetail={(id) => {
                  router.push(`/records?id=${id}`);
                  setDrawerOpen(true);
                }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const p = i + 1; // 简化分页，后续迭代加省略号逻辑
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-[12px] font-medium transition-all ${
                    p === page
                      ? 'bg-sky-400 text-white shadow-sm'
                      : 'bg-white/70 border border-slate-200/60 text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <span className="text-[11px] text-slate-400 ml-2">共 {total} 条</span>
          </div>
        )}
      </div>

      {/* 详情抽屉 */}
      {token && (
        <RecordDetailDrawer
          resultId={selectedId}
          open={drawerOpen}
          onClose={handleCloseDrawer}
          token={token}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/records/page.tsx
git commit -m "feat: add /records page with search, filter, pagination, and detail drawer"
```

---

### Task 14: Sidebar 记录区改版

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/results/counts` 替代 `GET /api/results`
- Produces: 简化后的侧边栏记录区（统计数字 + 分类 tab + "查看全部"链接）

- [ ] **Step 1: 替换数据获取逻辑**

找到 `fetchResults` 函数和 5 秒轮询 useEffect，替换为：
```typescript
const [counts, setCounts] = useState<{
  total: number;
  recent: number;
  draft: number;
  uncat: number;
  byUserCategory: Record<string, number>;
} | null>(null);

useEffect(() => {
  if (!token) return;
  const fetchCounts = async () => {
    try {
      const res = await fetch('/api/results/counts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCounts(data);
      }
    } catch (e) {
      console.error('获取记录计数失败:', e);
    }
  };
  fetchCounts();
  const interval = setInterval(fetchCounts, 30000); // 30秒轮询（代替 5 秒）
  return () => clearInterval(interval);
}, [token]);
```

- [ ] **Step 2: 删除旧的 results state + 批量操作 state**

```typescript
// 删除：
// const [results, setResults] = useState<any[]>([]);
// const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
// const [selectMode, setSelectMode] = useState(false);
// 以及 handleDelete, handleBatchDelete, toggleSelect, selectAll, handleBatchAssign
// 但保留 CategoryTree 用于展示分类结构（非记录列表）
```

- [ ] **Step 3: 替换记录区 UI**

找到 `{/* 答题记录 —— 折叠分类树 */}` 区块，替换为：
```tsx
{/* 答题记录 */}
{user && (
  <div className="px-3 mt-3">
    <SectionLabel>
      Records · 答题记录
    </SectionLabel>

    {counts ? (
      <div className="space-y-0.5 mt-1 mb-2">
        <button
          onClick={() => { onClose(); router.push('/records'); }}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11.5px] text-slate-700 hover:bg-white/60 transition-colors"
        >
          <span>📋 全部记录</span>
          <span className="text-[10px] text-slate-400 tabular-nums">{counts.total}</span>
        </button>
        <button
          onClick={() => { onClose(); router.push('/records?sysCategory=recent'); }}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11.5px] text-sky-600 hover:bg-sky-50/60 transition-colors"
        >
          <span>🕐 最近 7 天</span>
          <span className="text-[10px] text-sky-400 tabular-nums">{counts.recent}</span>
        </button>
        <button
          onClick={() => { onClose(); router.push('/records?status=draft'); }}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11.5px] text-amber-600 hover:bg-amber-50/60 transition-colors"
        >
          <span>📝 草稿</span>
          <span className="text-[10px] text-amber-400 tabular-nums">{counts.draft}</span>
        </button>
        <button
          onClick={() => { onClose(); router.push('/records?sysCategory=uncat'); }}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11.5px] text-slate-500 hover:bg-white/60 transition-colors"
        >
          <span>📂 未分类</span>
          <span className="text-[10px] text-slate-400 tabular-nums">{counts.uncat}</span>
        </button>
      </div>
    ) : (
      <p className="text-slate-400 text-[11px] px-1 py-2">加载中...</p>
    )}

    <button
      onClick={() => { onClose(); router.push('/records'); }}
      className="w-full text-center py-1.5 text-[11px] text-sky-500 hover:text-sky-600 hover:bg-sky-50/60 rounded-lg transition-colors"
    >
      查看全部 →
    </button>
  </div>
)}
```

- [ ] **Step 4: 清理不再使用的 import**

删除对 CategoryTree 的 import（如果不再使用），以及 `useCategories` 中不再需要的部分。

> 注意：CategoryTree 仍被 `ctx.getNodeTree()` 调用（题库分类导航），那个导航区保留不变。只删除记录区中的 CategoryTree 渲染。

- [ ] **Step 5: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "refactor: simplify sidebar record section with counts + link to /records"
```

---

### Task 15: Layout.tsx 简化 + 删除 ResultCard

**Files:**
- Modify: `src/components/Layout.tsx`
- Delete: `src/components/ResultCard.tsx`

**Interfaces:**
- Produces: Layout 不再劫持主区域，永远渲染 `children`

- [ ] **Step 1: 编辑 Layout.tsx**

删除以下内容：
- `import ResultCard` 行
- `const [selectedResult, setSelectedResult] = useState<any>(null);`
- `const [quizData, setQuizData] = useState<any>(null);`
- `const handleSelectResult = ...`
- `const handleCloseResult = ...`
- `activeResultId={selectedResult?.id ?? null}` 改为不传或 `null`
- 三元渲染 `selectedResult && quizData ? <ResultCard ...> : children` 改为永远渲染 `{children}`

最终 Layout.tsx 主区域部分：
```tsx
<main id="main-content" className="flex-1 overflow-y-auto relative">
  {children}
</main>
```

Sidebar props 中移除不再需要的：
- `onSelectResult` — 删除（记录点击改为在 Sidebar 内部 `router.push`）
- `activeResultId` — 删除

Sidebar 中 `onSelectResult` prop 也一并移除。

- [ ] **Step 2: 删除 ResultCard.tsx**

```bash
rm src/components/ResultCard.tsx
```

- [ ] **Step 3: 更新 Sidebar Props 类型**

找到 `interface Props` 删除 `onSelectResult` 和 `activeResultId` 字段。同时更新 Layout.tsx 中 Sidebar 的调用。

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Layout.tsx
git rm src/components/ResultCard.tsx
git commit -m "refactor: simplify Layout to always render children, remove ResultCard"
```

---

### Task 16: 更新 quiz/[id]/page.tsx 分类选择

**Files:**
- Modify: `src/app/quiz/[id]/page.tsx`

**Interfaces:**
- Consumes: CategoryContext 的新版 API（from Task 9）

- [ ] **Step 1: 检查并更新 CategorySelect 相关逻辑**

在 quiz 页面中，找到暂存/提交弹窗中使用 `cat.setResultCategory` 的位置，确保调用的是异步版本（从 Task 9 开始改为 async）。

由于 `setResultCategory` 现在是 async 的，调用处可能需要 `await`。

搜索 `cat.setResultCategory` 和 `ctx.setResultCategory` 的使用位置，确保兼容。

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/quiz/[id]/page.tsx
git commit -m "fix: ensure quiz page category select works with server-backed CategoryContext"
```

---

### Task 17: 收尾 — 全量验证

- [ ] **Step 1: TypeScript 编译**

```bash
npx tsc --noEmit
```
确保零错误。

- [ ] **Step 2: 运行现有测试**

```bash
npx vitest run
```
确保现有测试不被破坏。注意：预存失败的测试（ParseChoiceDialog/ParseProgressDialog 等）可忽略。

- [ ] **Step 3: 手动验证清单**

1. 访问 `/records` → 页面加载，显示"暂无答题记录"或记录列表
2. 搜索框输入关键词 → 300ms 后过滤
3. 点击分类 tab（全部/最近/草稿/未分类）→ 列表更新
4. 创建用户分类 → 显示在 tab 栏
5. 点击记录的"查看详情"→ 右侧抽屉滑出，显示 AnswerSheet
6. 关闭抽屉 → URL 恢复 `/records`
7. 点击"查看报告"→ 跳转到 `/result/[id]/report`
8. 删除记录 → 确认弹窗 → 列表更新
9. 侧边栏记录区显示统计数字 → 点击跳转 `/records`
10. 侧边栏"查看全部"→ 跳转 `/records`
11. 答题提交后 → 暂存/提交弹窗分类选择正常
12. 首页记录区不受影响

- [ ] **Step 4: Commit（如有修正）**

```bash
git add -A
git commit -m "chore: final verification fixes for records redesign"
```
