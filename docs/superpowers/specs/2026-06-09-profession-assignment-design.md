# 职业体系与题库分配系统 — 设计文档

**日期**: 2026-06-09
**状态**: 待实施
**范围**: 职业体系（A）+ 内容按职业展示（B）+ 管理员分配题库（C）

---

## 一、目标

1. 用户注册时可选填职业
2. 登录后/游客选职业后，题库按职业过滤展示
3. 管理员可自定义职业列表
4. 管理员可将题库分配给指定职业（大方向）或指定职业下的指定用户（精确到人）
5. 管理员的分配界面支持树形层级：职业 → 用户，全选/单选/多选/不选

---

## 二、数据模型

### 2.1 新增表

```prisma
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
  userId       String?    // null = 大方向分配(该职业全员可见); 有值 = 精确到人
  createdAt    DateTime   @default(now())

  @@unique([quizId, professionId, userId])
  @@index([professionId])
  @@index([userId])
}
```

### 2.2 修改表

```prisma
model User {
  // ...现有字段不变: id, username, password, isGuest, disabled, ...
  professionId String?
  profession   Profession? @relation(fields: [professionId], references: [id])
}
```

### 2.3 关键设计决策

| 决策 | 说明 |
|------|------|
| `userId` 可为 null | null = 大方向分配；有值 = 精确到人 |
| `@@unique([quizId, professionId, userId])` | MySQL 中 null 不参与唯一约束比较，业务层需防重复 |
| User.professionId 可选 | 注册时选填，游客可临时选择 |
| 删除 Profession 级联 | 删除职业时同步删除 `QuizAssignment` 记录，用户 `professionId` 置 null |

---

## 三、API 设计

### 3.1 职业管理（管理员）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/api/admin/professions` | admin | 返回 `{ professions: Profession[] }` + 每个职业下用户数 |
| `POST` | `/api/admin/professions` | admin | 入参 `{ name }`，返回新建的职业对象 |
| `DELETE` | `/api/admin/professions/[id]` | admin | 删除职业，级联删除分配记录，用户 professionId 置 null |

### 3.2 题库分配（管理员）

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/api/admin/quizzes/[id]/assignments` | admin | 返回 `{ assignments: { professionId, userId? }[] }` + 职业树+用户列表 |
| `PUT` | `/api/admin/quizzes/[id]/assignments` | admin | 入参 `{ assignments: { professionId, userId? }[] }`，全量替换 |

PUT 设计理由：一次提交完整分配列表，后端删旧建新，避免前端维护增量状态。

### 3.3 用户侧公开接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| `GET` | `/api/professions` | 无 | 返回职业列表（注册/登录/游客用） |
| `PATCH` | `/api/user/profession` | user | 入参 `{ professionId }`，更新当前用户职业 |

### 3.4 注册/登录调整

- `POST /api/auth/register` 入参新增 `professionId?: string`
- `POST /api/auth/guest` 入参新增 `professionId?: string`
- `GET /api/auth/me` 返回新增 `professionId` 和 `professionName` 字段

### 3.5 题库查询调整

- `GET /api/quizzes` 新增查询参数 `professionId`，后端根据 `quizId` 查 `QuizAssignment` 匹配：
  - 有职业时：返回 `QuizAssignment.professionId = 用户职业 AND (userId IS NULL OR userId = 当前用户)` 的题库
  - 无职业时：返回未分配任何职业的官方公开题库
  - 游客选职业后：返回该职业的官方题库（限量，默认 5 个）

---

## 四、前端改动

### 4.1 注册页 [src/app/login/page.tsx](src/app/login/page.tsx)

在注册表单密码字段后、密保问题前，新增职业下拉：

- 数据源：`GET /api/professions`
- 组件：`<select>` 或自定义下拉，placeholder 为"请选择职业（可选）"
- 行为：选填，不选也可注册

### 4.2 首页/题库列表

- 登录用户有职业 → 自动按 professionId 过滤题库列表
- 登录用户无职业 → 显示未分配的官方公开题库
- 游客选职业 → 显示该职业的少量官方题库（限量 5 个，带"登录后查看全部"引导）

### 4.3 游客顶部职业切换

- 游客模式下顶部导航栏增加职业切换下拉按钮
- 选择后即时刷新题库列表

### 4.4 管理员新增页面

**职业管理页** `src/app/admin/professions/page.tsx`：
- 表格展示所有职业及用户数
- 顶部输入框 + 新增按钮
- 每行删除按钮（有用户时弹出确认）
- 侧栏菜单新增「职业管理」入口

### 4.5 题库分配弹窗

在 [src/app/admin/quizzes/page.tsx](src/app/admin/quizzes/page.tsx) 每行增加「分配」按钮。

点击后打开分配弹窗，内容为树形选择器：

```
职业 → 展开/折叠 → 用户列表
```

交互：
- 勾选职业节点 → 全选该职业下所有用户（大方向分配）
- 取消职业节点 → 取消该职业下所有用户
- 展开后单独勾选/取消用户 → 精确到人分配
- 部分用户选中 → 职业节点半选状态
- 保存时调用 `PUT /api/admin/quizzes/[id]/assignments`

### 4.6 侧栏菜单调整

[src/components/AdminSidebar.tsx](src/components/AdminSidebar.tsx) 新增菜单项：
- 「职业管理」→ `/admin/professions`

---

## 五、技术约定

- 所有新增文件遵循项目现有模式（'use client'、Tailwind CSS、indigo/pink 主题色）
- API 路由遵循 Next.js 16 App Router 约定
- 分配数据全量替换策略（PUT），避免增量同步的复杂度
- 游客职业选择存 localStorage（`guestProfessionId`）

---

## 六、不在本轮范围

- 订阅制度（D）
- 游客职业自动识别
- 批量导入职业
- 职业图标/描述等扩展字段
- 题库分配的历史记录/审计日志

---

## 七、关键文件清单

### 新建文件

| 文件 | 用途 |
|------|------|
| `prisma/migrations/*` | Prisma 迁移文件 |
| `src/app/api/admin/professions/route.ts` | 职业列表 + 新增 |
| `src/app/api/admin/professions/[id]/route.ts` | 删除职业 |
| `src/app/api/admin/quizzes/[id]/assignments/route.ts` | 题库分配 GET + PUT |
| `src/app/api/professions/route.ts` | 公开职业列表 |
| `src/app/api/user/profession/route.ts` | 用户更新职业 |
| `src/app/admin/professions/page.tsx` | 职业管理页 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | 新增 Profession、QuizAssignment；User 加 professionId |
| `src/lib/auth.ts` | JWTPayload 加 professionId |
| `src/app/api/auth/register/route.ts` | 入参加 professionId |
| `src/app/api/auth/guest/route.ts` | 入参加 professionId |
| `src/app/api/auth/me/route.ts` | 返回 professionId, professionName |
| `src/app/api/quizzes/route.ts` | 按 professionId 过滤 |
| `src/app/login/page.tsx` | 注册表单加职业选择 |
| `src/app/admin/quizzes/page.tsx` | 每行加「分配」按钮 + 弹窗 |
| `src/components/AdminSidebar.tsx` | 菜单加「职业管理」 |
| `src/contexts/AuthContext.tsx` | token payload 加 professionId |
