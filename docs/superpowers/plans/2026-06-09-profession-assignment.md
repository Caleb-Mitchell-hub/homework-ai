# 职业体系与题库分配系统 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建职业体系，实现用户注册/登录选职业、管理员自定义职业列表、题库按职业分配（大方向+精确到人）

**Architecture:** 新增 Profession 表和 QuizAssignment 关联表；User 加可选 professionId；API 分层（公开/用户/管理员）；前端注册页加职业选择、管理后台加职业管理和题库分配弹窗

**Tech Stack:** Next.js 16 App Router, Prisma + MySQL, Tailwind CSS v4, TypeScript

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/app/api/professions/route.ts` | 公开职业列表 GET |
| `src/app/api/user/profession/route.ts` | 用户更新自己职业 PATCH |
| `src/app/api/admin/professions/route.ts` | 管理员职业列表 GET + 新增 POST |
| `src/app/api/admin/professions/[id]/route.ts` | 管理员删除职业 DELETE |
| `src/app/api/admin/quizzes/[id]/assignments/route.ts` | 题库分配查询 GET + 全量替换 PUT |
| `src/app/admin/professions/page.tsx` | 职业管理页面 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | 新增 Profession、QuizAssignment 模型；User 加 professionId |
| `src/lib/auth.ts` | JWTPayload 加 professionId |
| `src/app/api/auth/register/route.ts` | 入参加 professionId |
| `src/app/api/auth/guest/route.ts` | 入参加 professionId |
| `src/app/api/auth/me/route.ts` | 返回 professionId 和 professionName |
| `src/app/api/quizzes/route.ts` | GET 按 professionId 过滤（通过 QuizAssignment） |
| `src/app/login/page.tsx` | 注册表单加职业选择下拉 |
| `src/app/admin/quizzes/page.tsx` | 每行加「分配」按钮 + 树形分配弹窗 |
| `src/components/AdminSidebar.tsx` | 菜单加「职业管理」入口 |
| `src/contexts/AuthContext.tsx` | User 接口和 auth-changed 事件加 professionId |

---

### Task 1: Prisma Schema 变更 + 数据库迁移

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 更新 schema.prisma**

在 `prisma/schema.prisma` 的 User 模型最后加 `professionId` 字段，文件末尾新增 Profession 和 QuizAssignment 模型：

```prisma
// User 模型新增字段（在 results QuizResult[] 之后、} 之前）:
  professionId String?
  profession   Profession? @relation(fields: [professionId], references: [id])

// 文件末尾新增:
model Profession {
  id          String           @id @default(cuid())
  name        String           @unique
  createdAt   DateTime         @default(now())
  users       User[]
  assignments QuizAssignment[]
}

model QuizAssignment {
  id           String     @id @default(cuid())
  quizId       String
  quiz         Quiz       @relation(fields: [quizId], references: [id], onDelete: Cascade)
  professionId String
  profession   Profession @relation(fields: [professionId], references: [id], onDelete: Cascade)
  userId       String?
  createdAt    DateTime   @default(now())

  @@unique([quizId, professionId, userId])
  @@index([professionId])
  @@index([userId])
}
```

- [ ] **Step 2: 生成 Prisma 迁移**

```bash
npx prisma migrate dev --name add_profession_and_assignment
```

预期：迁移成功，MySQL 中新建 `Profession`、`QuizAssignment` 表，`User` 表新增 `professionId` 列。

- [ ] **Step 3: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Profession and QuizAssignment models with migration"
```

---

### Task 2: 更新 auth 库 — JWTPayload 加 professionId

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: 更新 JWTPayload 接口**

```typescript
// src/lib/auth.ts — 修改 JWTPayload 接口
export interface JWTPayload {
  userId: string;
  username: string;
  isGuest: boolean;
  professionId: string | null;  // 新增
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/lib/auth.ts
git commit -m "feat: add professionId to JWTPayload"
```

---

### Task 3: 更新注册/游客/me API 路由

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/auth/guest/route.ts`
- Modify: `src/app/api/auth/me/route.ts`

- [ ] **Step 1: 注册接口支持 professionId**

在 `src/app/api/auth/register/route.ts` 中：

```typescript
// 解构加上 professionId
const { username, password, securityQuestion, securityAnswer, professionId } = await request.json();

// user.create 的 data 中加上:
professionId: professionId || null,
```

完整改动：找到第 8 行 `const { username, password, securityQuestion, securityAnswer } = await request.json();` 替换为：

```typescript
const { username, password, securityQuestion, securityAnswer, professionId } = await request.json();
```

找到第 46-53 行 `const user = await prisma.user.create({ data: { ... } })`，在 data 对象中加一行：

```typescript
professionId: professionId || null,
```

- [ ] **Step 2: 游客接口支持 professionId**

在 `src/app/api/auth/guest/route.ts` 中，`POST` 函数改为接受可选的 `professionId`：

```typescript
export async function POST(request: Request) {
  try {
    const { professionId } = await request.json().catch(() => ({}));
    // ... 后续 user.create 的 data 中加上:
    professionId: professionId || null,
```

完整改动：`POST()` 函数开头从 `try {` 后插入：

```typescript
const { professionId } = await request.json().catch(() => ({}));
```

在 `prisma.user.create` 的 data 中（两处：新建游客 和 复用已有游客的 fallback 不需要改 data — 因为是查已有用户不创建），只在新建路径的 data 中加：

```typescript
professionId: professionId || null,
```

注意：只有第一个 `prisma.user.create` 需要加，fallback 的 `prisma.user.findFirst` 不创建用户，不需要改。

- [ ] **Step 3: me 接口返回职业信息**

在 `src/app/api/auth/me/route.ts` 中，`prisma.user.findUnique` 的 `select` 加 `professionId` 和 profession 名称：

```typescript
const user = await prisma.user.findUnique({
  where: { id: payload.userId },
  select: {
    id: true,
    username: true,
    isGuest: true,
    disabled: true,
    createdAt: true,
    professionId: true,                              // 新增
    profession: { select: { id: true, name: true } }, // 新增
  },
});
```

return 处改为：

```typescript
return NextResponse.json({
  user: {
    id: user.id,
    username: user.username,
    isGuest: user.isGuest,
    disabled: user.disabled,
    createdAt: user.createdAt,
    professionId: user.professionId ?? null,
    professionName: user.profession?.name ?? null,
  },
});
```

- [ ] **Step 4: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/auth/register/route.ts src/app/api/auth/guest/route.ts src/app/api/auth/me/route.ts
git commit -m "feat: register/guest/me API support professionId"
```

---

### Task 4: 公开职业列表 API + 用户更新职业 API

**Files:**
- Create: `src/app/api/professions/route.ts`
- Create: `src/app/api/user/profession/route.ts`

- [ ] **Step 1: 创建公开职业列表 GET 接口**

```typescript
// src/app/api/professions/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const professions = await prisma.profession.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, _count: { select: { users: true } } },
    });
    return NextResponse.json({
      professions: professions.map((p) => ({
        id: p.id,
        name: p.name,
        userCount: p._count.users,
      })),
    });
  } catch (error) {
    console.error('获取职业列表失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 创建用户更新职业 PATCH 接口**

```typescript
// src/app/api/user/profession/route.ts
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }
    const { professionId } = await request.json();
    // professionId 可为 null（取消职业选择）
    if (professionId !== null && professionId !== undefined) {
      const profession = await prisma.profession.findUnique({ where: { id: professionId } });
      if (!profession) {
        return NextResponse.json({ error: '职业不存在' }, { status: 400 });
      }
    }
    await prisma.user.update({
      where: { id: payload.userId },
      data: { professionId: professionId ?? null },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('更新职业失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 4: 提交**

```bash
git add src/app/api/professions/route.ts src/app/api/user/profession/route.ts
git commit -m "feat: public professions list and user profession update APIs"
```

---

### Task 5: 管理员职业管理 API

**Files:**
- Create: `src/app/api/admin/professions/route.ts`
- Create: `src/app/api/admin/professions/[id]/route.ts`

- [ ] **Step 1: 创建管理员职业列表 + 新增接口**

```typescript
// src/app/api/admin/professions/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

export async function GET(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const professions = await prisma.profession.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, assignments: true } } },
    });
    return NextResponse.json({
      professions: professions.map((p) => ({
        id: p.id,
        name: p.name,
        userCount: p._count.users,
        assignmentCount: p._count.assignments,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error('获取职业列表失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const { name } = await request.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: '职业名称不能为空' }, { status: 400 });
    }
    const trimmed = name.trim();
    if (trimmed.length > 20) {
      return NextResponse.json({ error: '职业名称最长 20 个字符' }, { status: 400 });
    }
    const exists = await prisma.profession.findUnique({ where: { name: trimmed } });
    if (exists) {
      return NextResponse.json({ error: '职业名称已存在' }, { status: 409 });
    }
    const profession = await prisma.profession.create({ data: { name: trimmed } });
    return NextResponse.json({ profession }, { status: 201 });
  } catch (error) {
    console.error('创建职业失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 创建管理员删除职业接口**

```typescript
// src/app/api/admin/professions/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const { id } = await params;
    const profession = await prisma.profession.findUnique({ where: { id } });
    if (!profession) {
      return NextResponse.json({ error: '职业不存在' }, { status: 404 });
    }
    // 将该职业下所有用户的 professionId 置 null
    await prisma.user.updateMany({
      where: { professionId: id },
      data: { professionId: null },
    });
    // 删除职业（级联删除 QuizAssignment）
    await prisma.profession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除职业失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 4: 提交**

```bash
git add src/app/api/admin/professions/
git commit -m "feat: admin professions CRUD API (list/create/delete)"
```

---

### Task 6: 题库分配 API（管理员）

**Files:**
- Create: `src/app/api/admin/quizzes/[id]/assignments/route.ts`

- [ ] **Step 1: 创建分配查询 + 全量替换接口**

```typescript
// src/app/api/admin/quizzes/[id]/assignments/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

// GET: 查询某题库的分配情况 + 所有职业及其用户（供分配弹窗用）
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const { id: quizId } = await params;

    // 现有分配记录
    const assignments = await prisma.quizAssignment.findMany({
      where: { quizId },
      select: { professionId: true, userId: true },
    });

    // 所有职业及其用户
    const professions = await prisma.profession.findMany({
      orderBy: { name: 'asc' },
      include: {
        users: {
          select: { id: true, username: true },
          orderBy: { username: 'asc' },
        },
      },
    });

    return NextResponse.json({
      assignments: assignments.map((a) => ({
        professionId: a.professionId,
        userId: a.userId,
      })),
      professions: professions.map((p) => ({
        id: p.id,
        name: p.name,
        users: p.users.map((u) => ({ id: u.id, username: u.username })),
      })),
    });
  } catch (error) {
    console.error('获取分配信息失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// PUT: 全量替换分配（删旧建新）
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });
  try {
    const { id: quizId } = await params;
    const { assignments } = await request.json();

    if (!Array.isArray(assignments)) {
      return NextResponse.json({ error: 'assignments 必须为数组' }, { status: 400 });
    }

    // 合并大方向分配：同一 professionId 多条 userId=null 合并为一条
    const merged = new Map<string, Set<string>>();
    for (const a of assignments) {
      const pid = a.professionId;
      if (!pid) continue;
      if (!merged.has(pid)) merged.set(pid, new Set());
      if (a.userId) merged.get(pid)!.add(a.userId);
    }

    // 构建写入数据
    const toCreate: { quizId: string; professionId: string; userId: string | null }[] = [];
    for (const [professionId, userIds] of merged) {
      if (userIds.size === 0) {
        // 大方向：该职业全员
        toCreate.push({ quizId, professionId, userId: null });
      } else {
        for (const userId of userIds) {
          toCreate.push({ quizId, professionId, userId });
        }
      }
    }

    // 事务：删旧建新
    await prisma.$transaction(async (tx) => {
      await tx.quizAssignment.deleteMany({ where: { quizId } });
      if (toCreate.length > 0) {
        await tx.quizAssignment.createMany({ data: toCreate });
      }
    });

    return NextResponse.json({ success: true, count: toCreate.length });
  } catch (error) {
    console.error('更新分配失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/app/api/admin/quizzes/
git commit -m "feat: quiz assignment GET/PUT API for admin"
```

---

### Task 7: 更新题库 GET 接口 — 按职业过滤

**Files:**
- Modify: `src/app/api/quizzes/route.ts`

- [ ] **Step 1: 修改 GET 查询逻辑**

在现有 GET 函数的 where 构建之前，加入职业过滤逻辑。关键改动：当用户有 professionId 时，题库显示需通过 QuizAssignment 关联。

在 `src/app/api/quizzes/route.ts` 的 GET 函数中，找到 `let where: any = { OR: [...] }` 部分，替换为：

```typescript
// 构建基础 where：用户自己的题库 + 通过分配获得的题库 + 官方公开题库
const userProfessionId = payload.professionId;

// 查询分配给用户的 quizId（通过职业大方向 或 精确到人）
let assignedQuizIds: string[] = [];
if (userProfessionId) {
  const assignments = await prisma.quizAssignment.findMany({
    where: {
      professionId: userProfessionId,
      OR: [
        { userId: null },            // 大方向分配
        { userId: payload.userId },  // 精确到人
      ],
    },
    select: { quizId: true },
  });
  assignedQuizIds = assignments.map((a) => a.quizId);
}

let where: any;
if (userProfessionId && assignedQuizIds.length > 0) {
  // 有职业且有分配：自己的题库 + 分配的题库 + 官方题库
  where = {
    OR: [
      { userId: payload.userId },
      { id: { in: assignedQuizIds } },
      { isOfficial: true },
    ],
  };
} else if (userProfessionId) {
  // 有职业但无分配：自己的题库 + 官方题库
  where = {
    OR: [
      { userId: payload.userId },
      { isOfficial: true },
    ],
  };
} else {
  // 无职业：仅自己的题库 + 官方公开题库（无分配的）
  where = {
    OR: [
      { userId: payload.userId },
      { isOfficial: true },
    ],
  };
}
```

注意：保留原有的 category 过滤逻辑，它用 `AND: [where, { categoryId }]` 包裹。

- [ ] **Step 2: 处理游客选职业的情况**

游客的职业来自 localStorage（通过 URL 参数 `professionId` 传入）。在 GET 函数开头加：

```typescript
const url = new URL(request.url);
const categoryFilter = url.searchParams.get('category');
const queryProfessionId = url.searchParams.get('professionId'); // 新增：游客传参
// 游客：用 queryProfessionId；登录用户：用 payload.professionId
const effectiveProfessionId = payload.isGuest
  ? (queryProfessionId || payload.professionId)
  : payload.professionId;
```

然后将上面 Step 1 中的 `userProfessionId` 替换为 `effectiveProfessionId`。

游客限量：在 `findMany` 之前判断，如果是游客且有职业：

```typescript
const isGuest = payload.isGuest;
const takeLimit = isGuest && effectiveProfessionId ? 5 : undefined;
```

在 `findMany` 的配置中加 `take: takeLimit`（当 `undefined` 时 Prisma 忽略）。

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 4: 提交**

```bash
git add src/app/api/quizzes/route.ts
git commit -m "feat: filter quizzes by profession via QuizAssignment"
```

---

### Task 8: AuthContext 更新 — 加 professionId

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: User 接口加 professionId**

```typescript
// src/contexts/AuthContext.tsx — 修改 User 接口
interface User {
  id: string;
  username: string;
  isGuest: boolean;
  professionId?: string | null;  // 新增
}
```

login 函数中的 `newUser` 参数类型已是 `User`，无需改动。

`localStorage.setItem('user', JSON.stringify(newUser))` 会自然存储 professionId（因为 newUser 来自 API 返回，Step 2 会确保 API 返回包含它）。

- [ ] **Step 2: 页面中调用 login 时确保传 professionId**

在 [src/app/login/page.tsx](src/app/login/page.tsx) 的登录/注册成功后调用 `auth.login(token, data.user)` 时，确保 `data.user` 已经包含 professionId（API 已在 Task 3 更新返回）。

无需额外代码改动 — 只需确保 API 返回中包含该字段（Task 3 已完成）。

- [ ] **Step 3: 提交**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: add professionId to AuthContext User interface"
```

---

### Task 9: AdminSidebar 加「职业管理」菜单

**Files:**
- Modify: `src/components/AdminSidebar.tsx`

- [ ] **Step 1: 在 NAV_ITEMS 数组中添加职业管理菜单项**

在 `src/components/AdminSidebar.tsx` 的 `NAV_ITEMS` 数组中，在 `users` 项之前插入：

```typescript
{
  key: 'professions',
  label: '职业管理',
  path: '/admin/professions',
  icon: (
    <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
},
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/components/AdminSidebar.tsx
git commit -m "feat: add profession management menu item to admin sidebar"
```

---

### Task 10: 管理员职业管理页面

**Files:**
- Create: `src/app/admin/professions/page.tsx`

- [ ] **Step 1: 创建职业管理页面**

```typescript
// src/app/admin/professions/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import AdminSidebar from '@/components/AdminSidebar';
import Toast from '@/components/Toast';
import { useDialog } from '@/components/DialogProvider';

interface Profession {
  id: string;
  name: string;
  userCount: number;
  assignmentCount: number;
  createdAt: string;
}

export default function AdminProfessionsPage() {
  const { admin, loading: adminLoading } = useAdminAuth();
  const dialog = useDialog();
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
  };

  const fetchProfessions = useCallback(async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    try {
      const res = await fetch('/api/admin/professions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setProfessions(data.professions || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (adminLoading) return;
    const token = localStorage.getItem('adminToken');
    if (!token || !admin) {
      window.location.href = '/admin/login';
      return;
    }
    fetchProfessions();
  }, [admin, adminLoading, fetchProfessions]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { showToast('请输入职业名称'); return; }
    if (name.length > 20) { showToast('职业名称最长 20 个字符'); return; }
    setAdding(true);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch('/api/admin/professions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || '创建失败'); return; }
      setNewName('');
      showToast('职业已创建');
      fetchProfessions();
    } catch { showToast('网络错误'); }
    finally { setAdding(false); }
  };

  const handleDelete = async (profession: Profession) => {
    const ok = await dialog.confirm({
      title: '删除职业',
      message: `确定要删除职业「${profession.name}」吗？\n该职业下有 ${profession.userCount} 个用户，${profession.assignmentCount} 个分配记录将被清理。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(profession.id);
    const token = localStorage.getItem('adminToken');
    try {
      const res = await fetch(`/api/admin/professions/${profession.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const data = await res.json(); showToast(data.error || '删除失败'); return; }
      showToast('职业已删除');
      fetchProfessions();
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
              Profession Management
            </div>
            <h2 className="text-[28px] leading-tight text-slate-800 mb-1.5"
              style={{ fontFamily: "'Fraunces', 'Songti SC', serif", fontWeight: 500, fontStyle: 'italic' }}>
              职业管理
            </h2>
            <p className="text-slate-500 text-sm">管理系统职业列表，用户注册时可选择职业</p>
          </div>

          {/* 新增职业 */}
          <div className="flex items-center gap-3 mb-5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="输入新职业名称…"
              className="flex-1 max-w-sm px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 text-sm"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white text-sm font-medium rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md shadow-indigo-200 disabled:opacity-50 transition-all"
            >
              {adding ? '创建中…' : '新增职业'}
            </button>
          </div>

          {/* 列表 */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full" />
            </div>
          ) : professions.length === 0 ? (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-12 text-center">
              <p className="text-slate-400">暂无职业，请添加</p>
            </div>
          ) : (
            <div className="bg-white/80 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200/60 bg-slate-50/50 text-slate-500 text-[12px] uppercase tracking-wider">
                    <th className="text-left px-6 py-3 font-medium">职业名称</th>
                    <th className="text-left px-6 py-3 font-medium">用户数</th>
                    <th className="text-left px-6 py-3 font-medium">分配题库数</th>
                    <th className="text-left px-6 py-3 font-medium">创建时间</th>
                    <th className="text-right px-6 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {professions.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100/60 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-slate-800 font-medium text-[13.5px]">{p.name}</td>
                      <td className="px-6 py-4 text-slate-600 text-[13px] tabular-nums">{p.userCount}</td>
                      <td className="px-6 py-4 text-slate-600 text-[13px] tabular-nums">{p.assignmentCount}</td>
                      <td className="px-6 py-4 text-slate-400 text-[12px]">
                        {new Date(p.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={deletingId === p.id}
                          className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-[12.5px] transition-colors disabled:opacity-50"
                        >
                          {deletingId === p.id ? '删除中…' : '删除'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/app/admin/professions/
git commit -m "feat: admin profession management page"
```

---

### Task 11: 注册页加职业选择下拉

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: 在注册表单中添加职业选择**

在 [src/app/login/page.tsx](src/app/login/page.tsx) 注册 tab（mode === 'register'）的密码字段后、密保问题前，插入职业选择：

```tsx
{/* 职业选择 - 仅注册模式 */}
{mode === 'register' && (
  <div>
    <label className="block text-sm text-slate-600 mb-2 ml-1 font-medium">职业（可选）</label>
    <select
      value={professionId}
      onChange={(e) => setProfessionId(e.target.value)}
      className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
    >
      <option value="">请选择职业</option>
      {professions.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  </div>
)}
```

需要在组件顶部添加状态和加载逻辑：

```typescript
// 新增 state
const [professionId, setProfessionId] = useState('');
const [professions, setProfessions] = useState<{ id: string; name: string }[]>([]);

// 新增 useEffect — 加载职业列表
useEffect(() => {
  fetch('/api/professions')
    .then((res) => res.json())
    .then((data) => { if (data.professions) setProfessions(data.professions); })
    .catch(() => {});
}, []);
```

注册/游客登录的 fetch body 中加上 `professionId`：

```typescript
// register body 加:
professionId: professionId || null,

// guest body 加:
professionId: professionId || null,
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 3: 提交**

```bash
git add src/app/login/page.tsx
git commit -m "feat: add profession selector to registration form"
```

---

### Task 12: 管理员题库页 — 加「分配」按钮 + 弹窗

**Files:**
- Modify: `src/app/admin/quizzes/page.tsx`

- [ ] **Step 1: 在题库列表每行加「分配」按钮**

在 [src/app/admin/quizzes/page.tsx](src/app/admin/quizzes/page.tsx) 操作列（现有「查看」「删除」旁边）加「分配」按钮：

```tsx
<button
  onClick={() => openAssignDialog(quiz)}
  className="px-3 py-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg text-[12.5px] transition-colors"
>
  分配
</button>
```

- [ ] **Step 2: 添加分配弹窗组件逻辑**

在文件顶部添加接口和状态：

```typescript
interface ProfessionNode {
  id: string;
  name: string;
  users: { id: string; username: string }[];
}

// 选定状态：professionId → Set<userId>（空 Set = 大方向全选，有 userId = 精确到人）
type SelectionMap = Map<string, Set<string>>;

// 新增 state
const [assignTarget, setAssignTarget] = useState<AdminQuiz | null>(null);
const [assignProfessions, setAssignProfessions] = useState<ProfessionNode[]>([]);
const [assignSelection, setAssignSelection] = useState<SelectionMap>(new Map());
const [assignExpanded, setAssignExpanded] = useState<Set<string>>(new Set());
const [assignSaving, setAssignSaving] = useState(false);

// 打开分配弹窗
const openAssignDialog = async (quiz: AdminQuiz) => {
  setAssignTarget(quiz);
  const token = localStorage.getItem('adminToken');
  try {
    const res = await fetch(`/api/admin/quizzes/${quiz.id}/assignments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setAssignProfessions(data.professions || []);
    // 初始化 selection：从现有 assignments 反推
    const sel: SelectionMap = new Map();
    for (const a of (data.assignments || [])) {
      if (!sel.has(a.professionId)) sel.set(a.professionId, new Set());
      if (a.userId) sel.get(a.professionId)!.add(a.userId);
    }
    setAssignSelection(sel);
  } catch { /* ignore */ }
};

// 切换职业选择
const toggleProfession = (professionId: string) => {
  setAssignSelection((prev) => {
    const next = new Map(prev);
    if (next.has(professionId)) {
      // 已全选 → 取消
      next.delete(professionId);
    } else {
      // 未选 → 全选（空 Set）
      next.set(professionId, new Set());
    }
    return next;
  });
};

// 切换用户选择
const toggleUser = (professionId: string, userId: string) => {
  setAssignSelection((prev) => {
    const next = new Map(prev);
    let userSet = next.get(professionId);
    if (!userSet) {
      // 当前是大方向全选 → 先展开所有用户
      const profession = assignProfessions.find((p) => p.id === professionId);
      userSet = new Set(profession?.users.map((u) => u.id) || []);
      next.set(professionId, userSet);
    }
    if (userSet.has(userId)) {
      userSet.delete(userId);
      if (userSet.size === 0) {
        next.delete(professionId);
      }
    } else {
      userSet.add(userId);
    }
    return next;
  });
};

// 保存分配
const handleAssignSave = async () => {
  if (!assignTarget) return;
  setAssignSaving(true);
  const token = localStorage.getItem('adminToken');
  const assignments: { professionId: string; userId: string | null }[] = [];
  for (const [professionId, userIds] of assignSelection) {
    if (userIds.size === 0) {
      assignments.push({ professionId, userId: null });
    } else {
      for (const uid of userIds) {
        assignments.push({ professionId, userId: uid });
      }
    }
  }
  try {
    const res = await fetch(`/api/admin/quizzes/${assignTarget.id}/assignments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ assignments }),
    });
    if (res.ok) {
      setAssignTarget(null);
    }
  } catch { /* ignore */ }
  finally { setAssignSaving(false); }
};

// 职业选择状态
const getProfessionState = (professionId: string): 'none' | 'all' | 'partial' => {
  const sel = assignSelection.get(professionId);
  if (!sel) return 'none';
  if (sel.size === 0) return 'all';
  return 'partial';
};
```

- [ ] **Step 3: 分配弹窗 UI（modal）**

在 return 的 JSX 末尾（`</div>` 之前）加入分配弹窗：

```tsx
{/* 分配弹窗 */}
{assignTarget && (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50"
    onClick={() => setAssignTarget(null)}>
    <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto shadow-2xl"
      onClick={(e) => e.stopPropagation()}>
      <h3 className="text-slate-800 text-lg font-bold mb-1">分配题库</h3>
      <p className="text-slate-500 text-sm mb-4">「{assignTarget.title}」→ 选择目标职业和用户</p>

      {/* 职业树 */}
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {assignProfessions.map((p) => {
          const state = getProfessionState(p.id);
          const expanded = assignExpanded.has(p.id);
          return (
            <div key={p.id}>
              {/* 职业节点 */}
              <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                <CheckboxState
                  state={state}
                  onChange={() => toggleProfession(p.id)}
                />
                <span className="flex-1 text-[13px] text-slate-700 font-medium">{p.name}</span>
                <span className="text-[11px] text-slate-400">{p.users.length} 人</span>
                <button
                  onClick={() => setAssignExpanded((prev) => {
                    const next = new Set(prev);
                    next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                    return next;
                  })}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </label>

              {/* 用户子节点 */}
              {expanded && p.users.length > 0 && (
                <div className="ml-6 space-y-0.5">
                  {p.users.map((u) => {
                    const checked = state === 'all' || assignSelection.get(p.id)?.has(u.id);
                    return (
                      <label key={u.id}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!checked}
                          onChange={() => toggleUser(p.id, u.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
                        />
                        <span className="text-[12.5px] text-slate-600">{u.username}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {assignProfessions.length === 0 && (
          <p className="text-slate-400 text-sm text-center py-4">暂无职业，请先在「职业管理」中添加</p>
        )}
      </div>

      {/* 按钮 */}
      <div className="flex gap-3 mt-6">
        <button onClick={() => setAssignTarget(null)}
          className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors text-sm">
          取消
        </button>
        <button onClick={handleAssignSave} disabled={assignSaving}
          className="flex-1 py-2.5 bg-gradient-to-r from-indigo-400 to-pink-400 text-white rounded-xl hover:from-indigo-500 hover:to-pink-500 shadow-md disabled:opacity-50 transition-all text-sm">
          {assignSaving ? '保存中…' : '保存分配'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: 三态复选框组件**

在文件底部或文件内添加：

```tsx
function CheckboxState({ state, onChange }: { state: 'none' | 'all' | 'partial'; onChange: () => void }) {
  return (
    <button onClick={onChange} className="w-4 h-4 flex items-center justify-center flex-shrink-0">
      {state === 'all' ? (
        <svg className="w-4 h-4 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      ) : state === 'partial' ? (
        <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-2 10H7v-2h10v2z" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 5: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 6: 提交**

```bash
git add src/app/admin/quizzes/page.tsx
git commit -m "feat: add quiz assignment dialog with profession-user tree selector"
```

---

### Task 13: 游客职业切换 UI + 首页职业提示

**Files:**
- Modify: 首页组件（游客顶部导航栏所在的 layout 或 header 组件）

- [ ] **Step 1: 找到首页/布局文件**

先确认首页和导航栏组件的位置：

```bash
grep -r "游客" src/ --include="*.tsx" -l
```

预期找到游客相关 UI 所在的文件。通常是 `src/app/page.tsx` 或 `src/components/` 下的导航组件。

- [ ] **Step 2: 游客模式下添加职业切换下拉**

在游客可见的顶部区域（导航栏或首页顶部）加职业选择下拉。核心代码：

```tsx
// 新增 state
const [guestProfessionId, setGuestProfessionId] = useState<string>(
  typeof window !== 'undefined' ? localStorage.getItem('guestProfessionId') || '' : ''
);
const [professions, setProfessions] = useState<{ id: string; name: string }[]>([]);

// 加载职业列表
useEffect(() => {
  fetch('/api/professions')
    .then((r) => r.json())
    .then((d) => { if (d.professions) setProfessions(d.professions); })
    .catch(() => {});
}, []);

// 切换职业时存 localStorage + 刷新题库
const handleProfessionChange = (professionId: string) => {
  setGuestProfessionId(professionId);
  if (professionId) {
    localStorage.setItem('guestProfessionId', professionId);
  } else {
    localStorage.removeItem('guestProfessionId');
  }
  // 触发题库列表刷新（通过 router.refresh 或 state 更新）
  window.dispatchEvent(new CustomEvent('guest-profession-changed', { detail: professionId }));
};

// JSX — 仅游客显示
{user?.isGuest && (
  <div className="flex items-center gap-2">
    <span className="text-[11px] text-slate-400">当前职业：</span>
    <select
      value={guestProfessionId}
      onChange={(e) => handleProfessionChange(e.target.value)}
      className="text-[12px] px-3 py-1.5 bg-white/80 border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:border-sky-400"
    >
      <option value="">未选择</option>
      {professions.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  </div>
)}
```

题库列表组件需监听 `guest-profession-changed` 事件，带上 `professionId` 参数重新请求 `GET /api/quizzes?professionId=xxx`。

- [ ] **Step 3: 题库列表组件适配**

如果首页/题库列表已有 fetch quizzes 逻辑，修改 `fetchQuizzes` 函数加上 professionId 参数：

```typescript
const fetchQuizzes = async () => {
  const guestProfId = localStorage.getItem('guestProfessionId') || '';
  const params = new URLSearchParams();
  if (guestProfId) params.set('professionId', guestProfId);
  const url = `/api/quizzes${params.toString() ? '?' + params.toString() : ''}`;
  // ... fetch(url)
};
```

并监听事件重新刷新：

```typescript
useEffect(() => {
  const handler = () => fetchQuizzes();
  window.addEventListener('guest-profession-changed', handler);
  return () => window.removeEventListener('guest-profession-changed', handler);
}, []);
```

- [ ] **Step 4: 登录用户职业未选提示**

登录用户且 `user.professionId` 为空时，在首页显示引导：

```tsx
{user && !user.isGuest && !user.professionId && (
  <div className="mb-4 p-3 bg-sky-50 border border-sky-200 rounded-xl text-[12.5px] text-sky-700">
    暂未选择职业，部分题库可能不可见。
    <button onClick={openProfessionPicker} className="ml-2 underline font-medium">
      选择职业
    </button>
  </div>
)}
```

`openProfessionPicker` 可复用上面的职业下拉，调用 `PATCH /api/user/profession` 保存后更新 AuthContext。

- [ ] **Step 5: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 6: 提交**

```bash
git add src/
git commit -m "feat: guest profession switcher and user profession prompt on home page"
```

---

### Task 14: 最终验证

- [ ] **Step 1: 类型检查**

```bash
npx tsc --noEmit
```

预期：0 错误。

- [ ] **Step 2: 数据库迁移确认**

```bash
npx prisma migrate status
```

预期：所有迁移已应用。

- [ ] **Step 3: 端到端验证清单**

启动服务并逐项验证：

1. 管理员登录 → 侧栏出现「职业管理」→ 添加职业「前端工程师」「后端工程师」
2. 题库管理页 → 点击题库行的「分配」→ 弹窗显示职业树 → 勾选「前端工程师」→ 保存
3. 用户注册 → 表单出现职业下拉 → 选择「前端工程师」→ 注册成功
4. 用该用户登录 → 首页题库列表包含分配给「前端工程师」的题库
5. 游客访问 → 选择职业 → 看到该职业的少量官方题库
6. 管理员删除职业 → 用户 professionId 置 null，分配记录清除

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "feat: complete profession and assignment system"
```
