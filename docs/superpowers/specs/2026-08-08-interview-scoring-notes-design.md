# 面试题 AI 评分、报告优化、笔记功能 — 设计文档

> **方案**: A — 渐进式增强

## 1. 数据模型

### 1.1 ResultItem 扩展
现有 `results` JSON 每题新增：
- `interviewScore?: number` — AI 打分 0-100
- `interviewFeedback?: { strengths: string[], weaknesses: string[], suggestion: string }`

### 1.2 Note 模型
```prisma
model Note {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        String   @db.VarChar(20)   // "question" | "answer" | "ai_output"
  questionId  String?                     // 关联题目
  quizId      String?                     // 关联测验
  resultId    String?                     // 关联答题结果
  title       String   @db.VarChar(200)
  content     String   @db.Text          // Markdown
  source      String   @default("manual") @db.VarChar(30)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId])
  @@index([userId, quizId])
  @@index([userId, questionId])
  @@index([userId, resultId])
}
```

### 1.3 CreditReason 扩展
新增 `ai_interview_report`

### 1.4 essay→interview 自动归类
AI解析和手动创建时，全部essay → 全部转interview

## 2. API

### 2.1 POST /api/results — 扩展
提交时，对所有 interview 题逐题调 AI 打分，返回 `interviewScore` 和 `interviewFeedback`

### 2.2 POST /api/ai/interview-report — 新增
面试题深度报告，100积分/次，含逐题分析+整体评分+薄弱点详解+建议

### 2.3 POST/GET/PUT/DELETE /api/notes — 新增
笔记CRUD，支持 type/questionId/quizId/resultId 筛选

## 3. 前端组件

### 3.1 AI评分进度条 (ScoreProgressBar)
提交后显示"AI正在打分 2/5..."

### 3.2 面试题评分展示 (InterviewScoreCard)
每题显示0-100分+反馈

### 3.3 笔记侧边面板 (NotePanel)
答题页右侧滑出，记录题目笔记/答题笔记/AI输出

### 3.4 笔记管理页 (/notes)
集中管理所有笔记

### 3.5 面试题报告 (InterviewReportView)
专用报告展示

## 4. 积分
- AI 逐题评分：提交时免费触发
- 面试题 AI 深度总结：100 积分/次
