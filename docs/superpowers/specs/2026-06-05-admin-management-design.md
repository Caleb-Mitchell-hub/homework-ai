# 后台管理功能设计

**日期**: 2026-06-05
**状态**: 已确认

## 目标

为在线答题系统增加后台管理功能：
1. 管理员可看数据大屏
2. 管理员可发布题目
3. 用户可自增题目，权限归用户
4. 管理员发布的题目只有管理员能删除

## 数据模型变更

### User 表
新增字段：
- `lastActiveAt: DateTime?` - 最后活跃时间，用于在线统计

### Admin 表（新增）
- `id: String @id @default(cuid())`
- `userId: String @unique`
- `user: User @relation(fields: [userId], references: [id], onDelete: Cascade)`
- `createdAt: DateTime @default(now())`

### Quiz 表
新增字段：
- `isOfficial: Boolean @default(false)` - 标识管理员发布的题目

### Question 表（新增，从 Quiz.questions JSON 拆分）
- `id: String @id @default(cuid())`
- `quizId: String`
- `quiz: Quiz @relation(fields: [quizId], references: [id], onDelete: Cascade)`
- `type: String` - 题型（single/multiple/judge/fill/essay/code）
- `content: String @db.Text` - 题干
- `options: String? @db.Text` - 选项 JSON
- `answer: String @db.Text` - 答案
- `analysis: String? @db.Text` - 解析
- `score: Int @default(10)` - 分值
- `order: Int @default(0)` - 排序

## 管理员账号

启动时自动检查：
- 读取环境变量 `ADMIN_USERNAME`、`ADMIN_PASSWORD`
- 如果 Admin 表为空：
  - 创建 User（isGuest=false）
  - 创建 Admin 关联
  - 密码使用 bcrypt 加密

默认环境变量值：
- `ADMIN_USERNAME=admin`
- `ADMIN_PASSWORD=admin123`

## 在线统计

判定逻辑：
- 用户每次调用受保护 API 时更新 `lastActiveAt`
- 在线数 = `lastActiveAt > now - 5min` 的用户数
- 简化实现：每次登录、每次上传/答题/查看记录时更新

## 路由结构

### 用户端（不变）
- `/` - 上传文件
- `/login` - 登录
- `/quiz/[id]` - 答题

### 管理后台
- `/admin/login` - 管理员登录
- `/admin/dashboard` - 数据大屏
- `/admin/quizzes` - 题库列表
- `/admin/quizzes/new` - 发布题目
- `/admin/quizzes/[id]/edit` - 编辑题目

## API 端点

### 管理员认证
- `POST /api/admin/auth/login` - 管理员登录
- `POST /api/admin/auth/logout` - 退出
- `GET /api/admin/auth/me` - 获取当前管理员

### 数据大屏
- `GET /api/admin/stats` - 统计数据
  - totalUsers: 用户总数
  - registeredUsers: 注册用户数
  - guestUsers: 游客数
  - onlineUsers: 在线数

### 题库管理
- `GET /api/admin/quizzes` - 列出所有题库
- `POST /api/admin/quizzes` - 创建题库（官方题库）
- `GET /api/admin/quizzes/[id]` - 查看题库
- `PUT /api/admin/quizzes/[id]` - 更新题库
- `DELETE /api/admin/quizzes/[id]` - 删除题库

### 用户题目管理
- `POST /api/quizzes` - 创建题库（用户题目）
- `GET /api/quizzes` - 列出我的题库
- `DELETE /api/quizzes/[id]` - 删除题库（仅自己创建的或管理员）

## 权限控制

| 操作 | 普通用户 | 管理员 |
|------|---------|--------|
| 上传/创建题库 | ✅（isOfficial=false） | ✅（isOfficial=true） |
| 查看自己的题库 | ✅ | ✅（所有） |
| 删除自己的题库 | ✅ | ✅ |
| 删除官方题库 | ❌ | ✅ |
| 编辑官方题库 | ❌ | ✅ |
| 查看数据大屏 | ❌ | ✅ |
| 发布官方题库 | ❌ | ✅ |

## 界面设计

### 管理后台布局
- 顶部导航：数据大屏 | 题库管理 | 退出
- 侧边栏可选
- 复用暗色主题

### 数据大屏
- 4 个数据卡片：用户总数、注册用户数、游客数、在线数
- 大数字 + 渐变色块 + 图标
- 自动刷新（每 30 秒）

### 题库管理
- 列表展示：题库标题、创建者、官方标识、题目数、创建时间
- 操作：编辑、删除
- 管理员可看到所有题库，包括 `isOfficial=true` 的
- 普通用户只看到自己创建的题库

## 启动流程

1. 项目启动时执行 `initAdmin()`：
   - 检查 `Admin` 表
   - 如果为空，读取环境变量
   - 创建默认管理员账号

2. 用户登录后正常访问用户端

3. 管理员通过 `/admin/login` 访问管理后台

## 文件结构变更

```
src/
├── app/
│   ├── admin/
│   │   ├── login/page.tsx
│   │   ├── dashboard/page.tsx
│   │   └── quizzes/
│   │       ├── page.tsx
│   │       ├── new/page.tsx
│   │       └── [id]/edit/page.tsx
│   ├── api/
│   │   ├── admin/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts
│   │   │   │   ├── logout/route.ts
│   │   │   │   └── me/route.ts
│   │   │   ├── stats/route.ts
│   │   │   └── quizzes/
│   │   │       ├── route.ts
│   │   │       └── [id]/route.ts
│   │   └── quizzes/
│   │       ├── route.ts
│   │       └── [id]/route.ts
│   └── login/page.tsx
├── lib/
│   ├── prisma.ts
│   ├── auth.ts
│   ├── admin-auth.ts
│   └── init-admin.ts
└── components/
    ├── UploadForm.tsx (增加手动新增题目按钮)
    └── admin/
        ├── AdminLayout.tsx
        ├── StatCard.tsx
        └── QuizEditor.tsx
```

## 实现步骤

1. 更新 Prisma schema
2. 运行数据库迁移
3. 创建管理员认证库
4. 实现 init-admin 启动逻辑
5. 创建管理员 API 路由
6. 创建管理后台页面
7. 修改用户端支持手动新增题目
8. 完善权限控制
9. 测试

## 测试要点

- 默认管理员账号可登录
- 数据大屏数字正确
- 管理员可发布题目
- 管理员可删除任何题目
- 用户可创建自己的题目
- 用户不能删除管理员的题目
- 题目数据隔离正确
