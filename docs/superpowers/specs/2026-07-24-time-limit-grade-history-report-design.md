# 答题时间限制 + 批阅 + 历史 + 报告 设计规格

> **日期**: 2026-07-24
> **范围**: 答题流程的 4 项增强
> **目的**: 让答题体验更专业(限时/批阅)、让学习可追溯(历史)、让进步可量化(报告)

---

## 1. 背景与现状

当前答题系统已具备基础能力,但还缺 4 块能力:

| 能力 | 现状 | 本期目标 |
|------|------|----------|
| 答题时间限制 | 数据库字段 `Quiz.timeLimit` 和前端倒计时都已有,但**无用户设置入口** | 用户和 Admin 都能在创建题目时设置 |
| 批阅 | 仅自动批阅,`essay/code/interview` 三种主观题永远 0 分 | AI 自动批评语 + Admin 人工可打分 |
| 保留每次测试的答案 | 同 quiz 只能保存 1 条结果(去重) | 提交历史全部保留(草稿仍 1 份) |
| 分析报告 | 无 | 提交后立即出报告,含总览/维度/知识点/AI 建议 |

---

## 2. 功能 1:答题时间限制

### 2.1 用户场景

- **场景 A — 用户自测**:用户上传一份 50 题的练习题,想模拟"1 小时考试",上传时设置 60 分钟
- **场景 B — 限时挑战**:Admin 出一道限时挑战题(如 10 分钟 5 题),通过文件上传设定
- **场景 C — 不限时**:默认 0 = 不限时,行为保持兼容

### 2.2 设置入口

- **普通用户上传**:`UploadForm` 步骤末尾加「时间限制(分钟)」输入框,默认 0,可选 1~480
- **Admin 创建/编辑**:`admin/quizzes/new/page.tsx` 和 `[id]/edit/page.tsx` 同步加
- 输入框带 placeholder "0 = 不限时",min=0,max=480

### 2.3 答题期间行为(已有,无变化)

- 顶部条右侧显示倒计时(限时)或"⏱ 不限时"标签(无限时)
- 倒计时低于 60 秒:数字红色脉动
- 限时进度条:顶部条下方 2px 渐变进度
- 倒计时归零 → 弹 toast "时间到,自动提交" → 跳过命名对话框 → `doSubmit(true)`

### 2.4 新增提醒(本次增加)

- 倒计时到 `5 分钟` 时(如果题目时长 ≥ 6 分钟):弹一次 toast「还剩 5 分钟」
- 倒计时到 `1 分钟` 时:弹一次 toast「还剩 1 分钟,请注意时间」
- 用 `useRef` 标记已提醒过,避免重复弹

### 2.5 数据流

```
UploadForm / Admin 页
  ↓ 提交 quiz(含 timeLimit 字段)
POST /api/quizzes 或 /api/admin/quizzes
  ↓ 写入 Quiz.timeLimit
GET /api/quizzes/[id]
  ↓ 返回 quiz.timeLimit
前端 quiz 页
  ↓ setRemainingSec(timeLimit * 60)
useEffect 倒计时
  ↓ 到 5min/1min 弹 toast
倒计时归零 → 自动提交
```

### 2.6 错误/边界

- 倒计时归零时若正在提交过程中:不再二次提交(已有 `autoSubmittedRef` 保护)
- 用户中途离开页面再回来:`useEffect` 用 `quiz.timeLimit` 重新计算 remainingSec,但**不重置**(从剩余值继续)。如果时间已到,remainingSec <= 0 立刻触发自动提交
- 旧 quiz 缺 timeLimit 字段:`?? null` 兜底为不限时

---

## 3. 功能 2:AI 批阅 + Admin 人工批阅

### 3.1 双轨分工

| 轨道 | 触发 | 产出 | 是否计分 | 谁批 |
|------|------|------|----------|------|
| AI 自动 | 提交后服务端自动调 | `aiComment`(Markdown 评语) | ❌ 不计分 | 系统 |
| 人工批阅 | Admin 在答卷页点击「人工批阅」 | `manualScore`(0~1)+ `manualComment` | ✅ 覆盖默认分 | Admin 登录态 |

> 注:前期决定"AI 仅评语不计分",故 AI 不动分数;人工分数走独立字段,可累加入总分。

### 3.2 AI 批阅流程

**触发点**:`POST /api/results`,当 `status='submitted'` 时,服务端在保存结果前对每道主观题 (`essay`/`code`/`interview`) 调 AI。

**Prompt 要点**(`src/lib/ai/grading-prompt.ts`):
- 输入:题目内容、题型、参考答案、用户答案
- 输出(强制 JSON):`{ comment: string }`
- 角色:阅卷老师,要求:指出对错要点、给改进建议、Markdown 格式

**复用基础设施**:
- `AIProviderConfig`(`prisma.aIProviderConfig.findFirst({ where: { isActive: true } })`)
- `decryptApiKey`
- `callChat`(非流式)

**失败处理**:
- 某道题 AI 失败 → 该题不写 aiComment,但不影响其他题
- 整批失败 → 整批不写 aiComment,不阻塞结果保存

**成本**:**免费**。不扣积分、不写 CreditLedger。

### 3.3 人工批阅流程

**入口位置**:答卷/题目详情页内嵌 — 在 `AnswerSheet` 每道 `essay/code/interview` 题下方加「✍️ 人工批阅」折叠面板(默认收起)。

**面板内容**:
- 当前是否已批阅:显示「已批阅 by Admin X at 时间」+「修改」按钮
- 未批阅或修改时:显示
  - 分数输入框(0~1 浮点,如 0.8 表示得 80% 分),默认空
  - 评语 textarea(Markdown)
  - 提交/取消按钮

**API**:`POST /api/admin/results/[id]/grade`
- 路径参数:`id` = QuizResult.id
- 请求体:`{ questionId, manualScore, manualComment }`
- 鉴权:Admin 登录态
- 行为:
  1. 读 QuizResult
  2. 找到对应 questionId 的 result item
  3. 写 `manualScore` / `manualComment` / `manualGradedBy` (=当前 admin userId) / `manualGradedAt` (now)
  4. 重算 totalScore(把 `manualScore ?? 0` 累加)并保存
  5. 返回更新后的 result

**前端组件**:`ManualGradePanel.tsx`
- Props:`questionId`, `result`(当前 item), `resultId`, `canGrade`(bool, = isAdmin)
- 内部 state:editing(bool), score, comment, saving, error
- 仅 `canGrade=true` 时显示入口

### 3.4 总分计算

**`gradeQuiz()` 修改**(`src/lib/checker.ts`):
- 现状:`totalScore` = 题数(每题 1 分),客观题对得 1 分/错得 0 分,主观题始终 0
- 调整:主观题的 `score = manualScore ?? 0`
- `totalScore` 仍是题数(满分)
- 已批阅的主观题纳入分数累计

### 3.5 数据模型变更

`QuizResult.results` 字段(JSON Text)内每项增加:
```ts
{
  // 原有
  questionId, correct, correctAnswer, userAnswer, autoGraded,
  // 新增
  aiComment?: string,         // AI 批语(自动)
  manualScore?: number,       // 人工分数 0~1
  manualComment?: string,     // 人工评语
  manualGradedBy?: string,    // 批阅 admin userId
  manualGradedAt?: string,    // ISO timestamp
}
```

无 Prisma schema 变更(都是 JSON 内部字段)。

### 3.6 边界/失败

- Admin 给 `manualScore > 1` 或 `< 0` → 服务端 clamp 到 [0, 1]
- 同一 Admin 二次批阅 → 覆盖式更新
- 同一 Admin 撤销批阅 → 传 `manualScore: null` 表示清空

---

## 4. 功能 3:保留每次测试的答案

### 4.1 用户场景

- **场景 A — 多次重答同一份题**:用户做了 1 次,想再刷一遍,系统保留两次结果,可在「历史」中切换查看
- **场景 B — 草稿(进行中)**:用户做一半关掉,下次进来能续做。**草稿同时只保留 1 份**

### 4.2 数据模型

保留现有 `QuizResult` 表,调整 upsert 逻辑:
- `status='draft'` → **upsert**(同一 `(userId, quizId)` 永远只有 1 份 draft)
- `status='submitted'` → **insert 新行**(同一 `(userId, quizId)` 可有 N 份 submitted)
- 删除 `pickRecordToUpdate` 中的"draft 优先 + 只留 1 条"逻辑

### 4.3 API 调整

`POST /api/results` 行为分流:

```ts
if (body.status === 'draft') {
  // 1. 查现有 draft → 有则 update / 无则 create
  const existing = await prisma.quizResult.findFirst({
    where: { userId, quizId, status: 'draft' }
  });
  if (existing) update; else create;
} else {
  // 2. submitted → 直接 create 新行
  create;
}
```

`GET /api/results?quizId=X` 返回该 quiz 的**所有**结果(草稿 1 + 提交 N),前端按 `submittedAt desc` 排序。

### 4.4 前端:历史切换器

**位置**:`quiz/[id]/page.tsx` 顶部条(已有 sticky bar)右侧,在「进度」数字前加按钮:

```
[←]  题目标题              ⏱ 09:32   [📚 3 次]  8/10 ▓▓▓
                                          ^^^^^^
                                          切换器
```

**交互**:
- 点击 → 弹出下拉面板,列出该 quiz 所有 submitted 结果(按时间倒序,新→旧)
- 每条:`时间` `分数` `状态`;hover 高亮;点击 → 切换到该历史(加载其 results 作为 `result` state)
- 当前正在进行的答卷若已有 draft,会显示「进行中」作为第一条(不切换,仅展示)

**新建组件**:`src/components/HistorySwitcher.tsx`
- Props:`quizId`, `currentResultId?`, `onSelect(result)`, `disabled?`
- 内部:fetch `/api/results?quizId=X` → 过滤 submitted → 渲染下拉

### 4.5 数据流

```
用户进入 /quiz/[id]
  ↓
GET /api/results?quizId=X
  ↓
[{ status: 'draft', ... }, { status: 'submitted', ... }, { status: 'submitted', ... }]
  ↓
- draft → setAnswers(还原进行中)
- 历史数 > 0 → 顶部条显示 [📚 N 次] 切换器
  ↓
用户答题 → 自动本地草稿
  ↓
点提交 → POST /api/results status=submitted → 新行
  ↓
顶部条历史数 +1
```

### 4.6 边界

- 草稿 upsert 失败:返回 500,前端 toast「暂存失败」
- 历史切换时若正在答:警告用户「切换会丢弃本次未保存的修改」→ 确认后切换
- 历史记录可以删除吗:**本期不做**(后续可加)

---

## 5. 功能 4:分析报告

### 5.1 报告形态

- **路由**:`/result/[id]/report`
- **入口**:答卷页(AnswerSheet)顶部加「📊 查看报告」按钮
- **查看权限**:仅本人 + Admin 可看
- **加载状态**:
  - 维度统计(总览/题型柱状图/难度柱状图)→ 本地计算,立即显示
  - 知识点分析 + AI 建议 → 按钮「🔮 AI 生成报告」手动触发,扣 5 积分

### 5.2 报告内容

#### 模块 1:总览(本地计算,立即显示)

```
┌──────────────────────────────────┐
│  本次得分 80 / 100               │
│  正确率 80%   用时 ~12 分钟       │
│  ✓ 8  ✗ 2  ⊘ 0(未答)             │
└──────────────────────────────────┘
```

#### 模块 2:题型维度柱状图(本地计算)

```
单选题    ▓▓▓▓▓▓▓▓ 100% (3/3)
多选题    ▓▓▓▓▓▓░░  67% (2/3)
判断题    ▓▓▓▓▓▓▓▓ 100% (2/2)
填空题    ▓▓▓▓▓▓▓░  75% (3/4)
简答题    ░░░░░░░░   0% (0/2) [AI 评语]
代码题    --         --  (无)
面试题    --         --  (无)
```

按 7 种题型各算正确率(已作答中对的占比);未出现或全 0 显示「—」。

#### 模块 3:难度维度柱状图(本地计算)

```
简单  ▓▓▓▓▓▓▓▓ 100% (3/3)
中等  ▓▓▓▓▓▓░░  60% (3/5)
困难  ▓▓▓▓░░░░  50% (1/2)
```

无难度的题不计入分母(展示 `共 N 题,无难度标记`)。

#### 模块 4:知识点分析(AI,扣 5 积分)

AI 基于所有错题归纳出 3~6 个主要薄弱知识点标签:
- 例:`['闭包', '事件循环', '原型链', '异步编程']`
- 每个标签列出涉及题目序号
- Markdown 排版

#### 模块 5:AI 建议(AI,扣 5 积分)

AI 基于错题和知识点输出 200~400 字 Markdown 建议:
- 「下一步应该学什么」
- 「推荐学习路径」
- 「学习资源方向」

### 5.3 AI 调用

**端点**:`POST /api/ai/report`
- 请求:`{ resultId }`
- 流程:
  1. 查 QuizResult,验证归属
  2. 查 AIReport 表(按 resultId 唯一)→ 有则直接返回缓存
  3. 无则:
     - 扣 5 积分(走现有积分扣减流程,CreditReason 新加 `ai_report`)
     - 失败 → 返回 402
     - 成功 → 调 AI → 解析 JSON → 写 AIReport → 返回
  4. 失败回滚(积分原路返回,CreditReason 走 `refund`)

**Prompt**(`src/lib/report/prompt.ts`):
- 输入:总分、各题型正确率、错题列表(题号+题干+用户答+参考答+难度)
- 角色:资深学习顾问
- 输出 JSON:`{ knowledgePoints: [{ tag, relatedQuestions: number[] }], advice: string }`

**缓存策略**:同一 resultId 第二次进入,直接复用 `AIReport.content`,不再扣积分(给用户「刷新」按钮重新生成 — 可选,本期不实现,数据恒定)。

### 5.4 数据模型

```prisma
model AIReport {
  id          String     @id @default(cuid())
  resultId    String     @unique
  result      QuizResult @relation(fields: [resultId], references: [id], onDelete: Cascade)
  userId      String
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// 完整报告 JSON: { knowledgePoints, advice, generatedAt }
  content     String     @db.Text
  /// 本次生成消耗的积分
  costCredit  Int        @default(0)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  @@index([userId])
}
```

### 5.5 改动文件清单

**新建**:
- `src/lib/report/calculator.ts` — 维度统计本地计算
- `src/lib/report/prompt.ts` — AI 报告 prompt
- `src/app/api/ai/report/route.ts` — 报告 AI 端点(扣积分)
- `src/app/result/[id]/report/page.tsx` — 报告页
- `src/components/ReportView.tsx` — 报告 UI 组件
- `src/components/ReportBarChart.tsx` — 柱状图(纯 CSS / SVG,无依赖)
- `tests/lib/report/calculator.test.ts` — 报告计算测试
- `tests/api/ai-report.test.ts` — 报告 API 测试

**修改**:
- `prisma/schema.prisma` — 加 AIReport model + CreditReason 加 `ai_report` 枚举
- `src/lib/checker.ts` — 累加 manualScore
- `src/app/api/results/route.ts` — draft upsert / submitted insert + 触发 AI 批阅
- `src/app/quiz/[id]/page.tsx` — 顶部条加历史切换器 + 5min/1min toast
- `src/components/AnswerSheet.tsx` — 顶部加「📊 查看报告」按钮 + ManualGradePanel 集成
- `src/components/ManualGradePanel.tsx` (新建) — 人工批阅折叠面板
- `src/components/HistorySwitcher.tsx` (新建) — 历史切换器
- `src/lib/credits/explain.ts` — 加 ai_report 原因支持(若已有通用扣减函数则不需要)

### 5.6 边界/失败

- 报告 AI 失败 → 扣的 5 积分回滚
- 报告 AI 返回的 JSON 解析失败 → 返回 502,前端提示「生成失败,请稍后再试」
- 同 resultId 已存在报告 → 直接返回缓存,不扣积分
- 报告页面被非本人访问 → 404

---

## 6. 端到端流程图

```
┌─────────────────────────────────────────────────────────────┐
│  用户上传/Admin 创建题目                                     │
│   - timeLimit 字段(0=不限时)                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  答题页                                                      │
│   - 顶部条:倒计时 / 历史切换 / 进度                         │
│   - 5min/1min 提醒 toast                                     │
│   - 超时自动提交                                             │
└─────────────────────────────────────────────────────────────┘
                          ↓ 提交
┌─────────────────────────────────────────────────────────────┐
│  POST /api/results(服务端)                                  │
│   - gradeQuiz() 计算客观题分数                              │
│   - 主观题 → 调 AI 拿 aiComment(免费)                       │
│   - status=draft → upsert(同 quizId 只 1 份)               │
│   - status=submitted → insert 新行                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  AnswerSheet(每道主观题下)                                   │
│   - AI 评语展示                                             │
│   - [✍️ 人工批阅] 折叠面板(Admin 可见,可改分)              │
│   - 顶部 [📊 查看报告] 按钮                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓ Admin 改分
┌─────────────────────────────────────────────────────────────┐
│  POST /api/admin/results/[id]/grade                        │
│   - 写 manualScore / manualComment                          │
│   - 重算 totalScore 并写回 QuizResult                       │
└─────────────────────────────────────────────────────────────┘
                          ↓ 用户查报告
┌─────────────────────────────────────────────────────────────┐
│  /result/[id]/report                                        │
│   - 总览 / 题型柱状图 / 难度柱状图(立即显示)                │
│   - [🔮 AI 生成报告] 按钮(扣 5 积分)                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  POST /api/ai/report(扣积分 + 调 AI + 缓存到 AIReport)     │
│   - 知识点分析 + AI 建议                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 测试策略

| 模块 | 单元测试 | 集成测试 | 端到端 |
|------|----------|----------|--------|
| 时间限制 | - | 倒计时归零触发提交 | 模拟 1 分钟限时题,验证自动提交 |
| AI 批阅 | `grading-prompt.test.ts` | `ai-grade.test.ts`(mock callChat) | 提交主观题,验证 aiComment 出现 |
| 人工批阅 | - | `admin-grade.test.ts`(admin token) | Admin 改分后总分更新 |
| 历史保留 | `results-dedup.test.ts` | `results-submit-twice.test.ts` | 同题重答 2 次,验证 2 条 submitted |
| 报告 | `report/calculator.test.ts` | `ai-report.test.ts` | 报告页加载,扣分,生成,缓存复用 |

---

## 8. 上线/迁移

- DB 迁移:`npx prisma migrate dev --name add_time_limit_grade_history_report`
  - 新增 `AIReport` 表
  - CreditReason enum 加 `ai_report`
  - 旧 `QuizResult.results` JSON 字段向后兼容(新增字段缺失时按 undefined 处理)
- 不需要数据回填
- 配置层面:无需

---

## 9. 风险与权衡

| 风险 | 缓解 |
|------|------|
| 提交时同步调 AI 批阅会增加接口延迟 | 限制 AI 调用的并发数(=主观题数 ≤ 5 通常),超时(8s)跳过该题;前端可加 loading |
| 人工批阅覆盖 AI 默认分 — 容易误操作 | 二次确认弹窗;记录 manualGradedBy/At 可审计 |
| 报告 AI 调用成本 | 5 积分/次 + 按 resultId 缓存,避免重复生成 |
| 报告柱状图自己实现 vs 引图表库 | 用纯 CSS+SVG 简单柱状图,无新依赖 |

---

## 10. 决策清单(本设计明确)

1. ✅ 时间限制入口:用户上传 + Admin 创建
2. ✅ 超时处理:自动提交,空题 0 分
3. ✅ 提醒策略:60s 红+脉动 + 5min/1min toast
4. ✅ 批阅方式:AI 自动(评语不计分)+ Admin 人工(可覆盖分)
5. ✅ 触发时机:提交后自动 AI 批
6. ✅ 人工批阅入口:答卷页内嵌折叠面板
7. ✅ 人工分数机制:覆盖默认分,纳入总分
8. ✅ 历史保留:同题重答全部保留(草稿 1 份)
9. ✅ 历史查看:答卷页顶部切换器
10. ✅ 报告受众:普通用户本人
11. ✅ 报告触发:提交后立即生成(AI 部分手动按钮触发)
12. ✅ 报告内容:总览 + 题型维度 + 难度维度 + 知识点 + AI 建议
13. ✅ AI 部分扣分:5 积分
14. ✅ 维度分析:题型 + 难度都有
