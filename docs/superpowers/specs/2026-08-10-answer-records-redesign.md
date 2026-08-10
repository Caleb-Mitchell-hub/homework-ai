# 答题记录重设计

## 目标

解决当前答题记录功能的三层混乱：导航混乱（侧栏劫持主区域）、数据混乱（分类存 localStorage）、交互混乱（两套查看模式、无独立页面）。

## 一、数据模型改造

### 新增 ResultCategory 模型

```prisma
model ResultCategory {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String    @db.VarChar(40)
  parentId  String?   // null = 顶级分类
  order     Int       @default(0)
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

### QuizResult 新增字段

```prisma
model QuizResult {
  // ... 现有字段 ...
  categoryId  String?  // 归入分类 id，null = 未分类
}
```

### 系统分类保持虚拟

系统分类（最近/草稿/未分类/待批改）本质是过滤规则，不存数据库：

| 系统分类 | 过滤规则 |
|----------|---------|
| `__sys_recent` | status=submitted, submittedAt >= 7天前 |
| `__sys_draft` | status=draft |
| `__sys_uncat` | categoryId = null |
| `__sys_pending` | results 含 autoGraded=false 的条目 |

### API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/result-categories` | 获取当前用户分类树 |
| POST | `/api/result-categories` | 创建分类 `{ name, parentId? }` |
| PATCH | `/api/result-categories/[id]` | 重命名/移动 `{ name?, parentId? }` |
| DELETE | `/api/result-categories/[id]` | 删除（子分类一并删，记录变未分类） |
| PATCH | `/api/results/[id]/category` | 单条记录改分类 `{ categoryId }` |
| POST | `/api/results/batch-category` | 批量归入 `{ resultIds[], categoryId }` |

### API 改造：GET /api/results

**新增查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | int | 页码，默认 1 |
| `pageSize` | int | 每页条数，默认 20 |
| `search` | string | 模糊匹配题库名、记录名 |
| `categoryId` | string | 用户分类过滤（系统分类用 status 参数） |
| `status` | string | `submitted` / `draft` / `all`，默认 `all` |
| `sort` | string | `recent` / `score_desc` / `score_asc`，默认 `recent` |
| `quizId` | string | 保留，按题库过滤 |

**返回格式：**
```json
{
  "results": [...],
  "total": 150,
  "page": 1,
  "pageSize": 20
}
```

`results` 中每条记录附带 `quiz: { id, title }`（已有），移除完整的 `results` JSON 字段，改为只返回统计摘要：

```json
{
  "id": "...",
  "name": "第3次答题",
  "quizId": "...",
  "quiz": { "id": "...", "title": "题库A" },
  "score": 85,
  "totalScore": 100,
  "status": "submitted",
  "submittedAt": "...",
  "categoryId": "c_xxx",
  "summary": {
    "totalQuestions": 10,
    "objectiveCount": 8,
    "subjectiveCount": 2,
    "correctCount": 7,
    "subjectiveAvgScore": 78
  }
}
```

> 列表接口不再返回完整的 `results` 数组，减少传输量。详情在单独接口获取。

**新增 GET `/api/results/[id]`** — 获取单条记录完整内容（含 results 数组），供详情抽屉使用。

### 迁移策略

1. 首次访问 `/records` 页面时检测 localStorage 中旧版 CategoryContext 数据
2. 若存在旧数据且服务端无分类 → 自动调批量 API 迁移
3. 迁移后设置标记 `result-categories-migrated:{userId}` 防止重复迁移
4. CategoryContext 保留作为过渡期兼容层（读取服务端数据写入 state）

---

## 二、页面架构调整

### Layout.tsx 简化

**删除：**
- `selectedResult` / `quizData` 状态
- `handleSelectResult` / `handleCloseResult`
- 主区域 `selectedResult && quizData ? <ResultCard> : children` 的三元渲染

**改为：** 主区域永远渲染 `children`，不再被侧边栏记录点击劫持。

### ResultCard 删除

- 文件：`src/components/ResultCard.tsx`
- 其标题 + AnswerSheet 组合直接搬到 `/records` 页面的详情抽屉内
- Layout.tsx 中 `import ResultCard` 移除

### 侧边栏记录区改版

- 记录项点击行为：`router.push('/records?id=xxx')`（不再调用 `onSelectResult`）
- 底部新增"查看全部 →"链接指向 `/records`
- 分类树保留但显示简化（仅统计数字，不展示完整记录树）

### 新建 `/records` 页面

路径：`src/app/records/page.tsx`

独立的答题记录管理页，承担全部记录浏览/搜索/筛选/详情功能。

---

## 三、`/records` 页面设计

### 页面结构

```
┌──────────────────────────────────────────────────────────┐
│ ← 返回首页       答题记录          🔍 搜索题库/记录名...  │
├──────────────────────────────────────────────────────────┤
│ [全部 12] [最近 3] [草稿 1] [未分类 4] [待批改 2]        │
│ [+ 我的分类A 3] [+ 我的分类B 1]                           │
│                                                          │
│ 筛选: [全部类型 ▾] [全部时间 ▾]      排序: [最近优先 ▾]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ ┌───────────────────────────────────────┐                │
│ │ 📋 题库A                   85%       │                │
│ │ 第3次答题 · 2026-08-09 14:30        │                │
│ │ ██████████████░░░░ 85/100           │                │
│ │ 主观题均分 78 · 8客观 + 2主观        │                │
│ │ [查看详情]  [查看报告]  [⋮ 更多]     │                │
│ └───────────────────────────────────────┘                │
│                                                          │
│ ┌───────────────────────────────────────┐                │
│ │ 📝 题库B                   草稿       │                │
│ │ 2026-08-08 09:15                     │                │
│ │ 已完成 3/10 题                        │                │
│ │ [继续答题]               [⋮ 更多]     │                │
│ └───────────────────────────────────────┘                │
│                                                          │
│ ┌───────────────────────────────────────┐                │
│ │ 📋 题库A                   62%       │                │
│ │ 第2次答题 · 2026-08-05 16:20        │                │
│ │ ...                                  │                │
│ └───────────────────────────────────────┘                │
│                                                          │
├──────────────────────────────────────────────────────────┤
│               < 1  2  3  ...  8 >   共 150 条            │
└──────────────────────────────────────────────────────────┘
```

### 卡片设计

**已提交记录卡片：**
- 题库名 + 第 N 次答题标签
- 提交时间
- 得分进度条（颜色：≥80% 绿 / ≥60% 黄 / <60% 红）
- 主观题均分（仅当有主观题时显示）
- 主客观题数拆分
- 操作：查看详情（打开抽屉）| 查看报告（跳转）| 更多（删除 / 归入分类）

**草稿卡片：**
- 题库名 + 草稿标签（琥珀色）
- 保存时间
- 完成题数 / 总题数
- 操作：继续答题（跳转 quiz 页）| 更多（删除）

### 详情抽屉

点击"查看详情"或 URL 带 `?id=xxx` 时，右侧滑出抽屉：

```
┌──────────┐  ┌──────────────────────────────────┐
│ 记录列表  │  │ × 关闭                            │
│          │  │                                  │
│ █ 题库A   │  │ 题库A · 第3次答题                  │
│   85%    │  │ 2026-08-09 14:30                 │
│          │  │ 得分 85/100 (85%)                │
│   题库A   │  │                                  │
│   62%    │  │ [查看完整报告 →]   [导出 Markdown] │
│          │  │                                  │
│   题库B   │  │ ━━━ AnswerSheet ━━━              │
│   草稿    │  │ 题目1 ✓ 正确                     │
│          │  │ 题目2 ✗ 错误                     │
│          │  │ ...                              │
└──────────┘  └──────────────────────────────────┘
```

行为：
- URL `?id=xxx` → 自动打开对应记录的抽屉
- 关闭抽屉 → `router.replace('/records')` 清除 URL 参数
- 侧边栏点记录 → `router.push('/records?id=xxx')` → 打开抽屉

### 搜索筛选

| 筛选维度 | 实现 |
|---------|------|
| 搜索框 | 前端 300ms 防抖，调 API `search` 参数 |
| 分类 tab | 系统分类 + 用户自定义分类，横向滚动 |
| 题型下拉 | 全部 / 仅客观题 / 含主观题（前端过滤 summary） |
| 时间下拉 | 全部 / 近7天 / 近30天 / 近3个月 |
| 排序下拉 | 最近优先 / 得分最高 / 得分最低 |

### 状态管理

页面内部 state：
- `searchQuery` — 搜索文本
- `activeCategory` — 当前激活的分类 tab
- `statusFilter` — all/draft/submitted
- `sortBy` — recent/score_desc/score_asc
- `page` — 当前页码
- `selectedId` — 当前打开抽屉的记录 id（从 URL `?id=` 读取）

---

## 四、文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **新建** | `prisma/migrations/*` | ResultCategory 表 + QuizResult.categoryId |
| **新建** | `src/app/api/result-categories/route.ts` | 分类 CRUD（GET 列表 + POST 创建） |
| **新建** | `src/app/api/result-categories/[id]/route.ts` | 分类 PATCH/DELETE |
| **新建** | `src/app/api/results/[id]/route.ts` | 单条记录详情（GET）+ 改分类（PATCH） |
| **新建** | `src/app/api/results/batch-category/route.ts` | 批量归入分类 |
| **新建** | `src/app/records/page.tsx` | 独立记录页面 |
| **新建** | `src/components/RecordDetailDrawer.tsx` | 详情抽屉（内嵌 AnswerSheet） |
| **新建** | `src/components/RecordCard.tsx` | 记录卡片组件 |
| **修改** | `prisma/schema.prisma` | 新增 ResultCategory + QuizResult.categoryId |
| **修改** | `src/app/api/results/route.ts` | GET 增加分页/搜索/筛选参数，返回摘要 |
| **修改** | `src/components/Sidebar.tsx` | 记录区改版：点击跳转 /records，加"查看全部" |
| **修改** | `src/components/Layout.tsx` | 删除 ResultCard 劫持逻辑 |
| **修改** | `src/components/CategoryTree.tsx` | 适配服务端分类数据 |
| **修改** | `src/contexts/CategoryContext.tsx` | 改为从服务端读写，localStorage 作为本地缓存 |
| **修改** | `src/app/quiz/[id]/page.tsx` | 提交/暂存弹窗的分类选择改用服务端 API |
| **删除** | `src/components/ResultCard.tsx` | 功能合并到 RecordDetailDrawer |

---

### 侧边栏统计轻量接口

侧边栏不再需要全量拉取记录内容，只需各分类的计数。新增：

**GET `/api/results/counts`** — 返回各系统分类 + 用户分类的记录数：

```json
{
  "total": 12,
  "recent": 3,
  "draft": 1,
  "uncat": 4,
  "pending": 2,
  "byUserCategory": { "c_xxx": 3, "c_yyy": 1 }
}
```

Sidebar 中旧的 5 秒轮询 `/api/results` 改为轮询此接口（响应极小），记录列表不再在侧边栏展示。

---

## 六、不在本次范围的改动

- QuizResult 表结构不变（除新增 categoryId 外），不拆分不迁移旧数据
- answer-sheet-helpers / calculator / ReportView 不动
- 管理端答题记录不变
- 移动端单独适配不在此次范围
