# 答题时间限制 + 批阅 + 历史 + 报告 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给答题系统加上 4 项能力:① 答题时间限制(用户可设) ② AI 自动批评语 + Admin 人工批阅可覆盖分 ③ 同题重答保留历史 ④ 提交后自动生成分析报告

**Architecture:** 现有后端 `Quiz.timeLimit` 字段、GradeChecker、前端倒计时都已具备,本次主要补 UI 入口 + AI 批阅集成 + 拆分结果去重逻辑(草稿 upsert / 提交 insert) + 新增 `AIReport` 表承载报告缓存。新增 `CreditReason.ai_report` 让报告 AI 部分独立计费。

**Tech Stack:** Next.js 16 App Router · React 19 · Prisma (MySQL) · JWT auth · OpenAI-compatible AI providers · vitest

---

## 文件结构总览

### 新建文件

```
src/lib/ai/
├── grading-prompt.ts           # AI 批阅 prompt(主观题评语)
└── report-prompt.ts            # 报告 AI prompt(知识点+建议)

src/lib/report/
└── calculator.ts               # 报告维度统计本地计算

src/lib/credits/
└── report.ts                   # 报告 AI 扣分/缓存(仿 explain.ts)

src/app/api/
├── ai/
│   └── report/route.ts         # POST /api/ai/report
└── admin/results/
    └── [id]/grade/route.ts     # POST /api/admin/results/[id]/grade

src/app/result/
└── [id]/report/page.tsx       # 报告详情页

src/components/
├── HistorySwitcher.tsx         # 答题页顶部历史切换器
├── ManualGradePanel.tsx        # 主观题人工批阅折叠面板
├── ReportView.tsx              # 报告 UI
└── ReportBarChart.tsx          # 报告纯 SVG 柱状图

tests/
├── lib/
│   ├── ai/grading-prompt.test.ts
│   ├── ai/report-prompt.test.ts
│   └── report/calculator.test.ts
├── api/
│   ├── ai-report.test.ts
│   └── admin-results-grade.test.ts
└── components/
    ├── history-switcher.test.tsx
    ├── manual-grade-panel.test.tsx
    └── report-view.test.tsx
```

### 修改文件

```
prisma/schema.prisma                                      # +AIReport model, +CreditReason.ai_report
src/lib/results-dedup.ts                                  # 拆 draft upsert / submitted insert
src/lib/checker.ts                                        # 累加 manualScore 进总分
src/app/api/results/route.ts                              # 触发 AI 批阅 + 拆 upsert/insert
src/app/api/quizzes/route.ts                              # 接受 timeLimit
src/components/UploadForm.tsx                             # 加 timeLimit 输入
src/app/quiz/[id]/page.tsx                                # 加历史切换器 + 5min/1min toast + 报告按钮
src/components/AnswerSheet.tsx                            # 集成 ManualGradePanel + 报告按钮
```

---

## Task 1: 数据库迁移 — 加 AIReport 表 + ai_report 枚举

**Files:**
- Modify: `prisma/schema.prisma`
- Migrate: 自动生成

- [ ] **Step 1: 修改 schema 加 AIReport model 和 CreditReason 枚举**

```prisma
// prisma/schema.prisma

// 1) 在 CreditReason enum 里加一项
enum CreditReason {
  signup
  daily_signin
  topup
  admin_adjust
  ai_explain
  ai_report       // <-- 新增
  refund
}

// 2) 在 User model 上加 relation
model User {
  // ... 已有字段 ...
  reports          AIReport[]   // <-- 新增这一行
}

// 3) 在 QuizResult model 上加 relation
model QuizResult {
  // ... 已有字段 ...
  report           AIReport?    // <-- 新增这一行(一份答卷最多一份报告)
}

// 4) 新增 AIReport model
model AIReport {
  id          String     @id @default(cuid())
  resultId    String     @unique
  result      QuizResult @relation(fields: [resultId], references: [id], onDelete: Cascade)
  userId      String
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// 报告完整内容 JSON: { knowledgePoints: [{tag, relatedQuestions}], advice, generatedAt }
  content     String     @db.Text
  /// 本次生成消耗的积分
  costCredit  Int        @default(0)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([userId])
}
```

- [ ] **Step 2: 跑迁移**

```bash
npx prisma format
npx prisma migrate dev --name add_ai_report
```

Expected: 迁移成功,新表 `AIReport` 创建。

- [ ] **Step 3: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add AIReport model and ai_report credit reason"
```

---

## Task 2: AI 批阅 prompt 模块

**Files:**
- Create: `src/lib/ai/grading-prompt.ts`
- Test: `tests/lib/ai/grading-prompt.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/lib/ai/grading-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildGradingPrompt } from '@/lib/ai/grading-prompt';

describe('buildGradingPrompt', () => {
  it('包含题目内容、题型、参考答案', () => {
    const p = buildGradingPrompt({
      questionContent: '请解释闭包',
      questionType: 'essay',
      referenceAnswer: '闭包是指...',
      userAnswer: '闭包是函数',
    });
    expect(p).toContain('请解释闭包');
    expect(p).toContain('essay');
    expect(p).toContain('闭包是指...');
    expect(p).toContain('闭包是函数');
  });

  it('包含输出 JSON 格式约束', () => {
    const p = buildGradingPrompt({
      questionContent: 'test',
      questionType: 'essay',
      referenceAnswer: 'r',
      userAnswer: 'u',
    });
    expect(p).toContain('JSON');
    expect(p).toContain('comment');
  });

  it('代码题时包含代码相关引导', () => {
    const p = buildGradingPrompt({
      questionContent: '实现两数之和',
      questionType: 'code',
      referenceAnswer: 'def add(a,b): return a+b',
      userAnswer: 'def add(a,b): pass',
      language: 'python',
    });
    expect(p).toContain('python');
    expect(p).toContain('代码');
  });

  it('面试题时引导关注要点', () => {
    const p = buildGradingPrompt({
      questionContent: '自我介绍',
      questionType: 'interview',
      referenceAnswer: '建议突出技术栈',
      userAnswer: '你好,我是张三',
    });
    expect(p).toContain('面试');
    expect(p).toContain('要点');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- tests/lib/ai/grading-prompt.test.ts
```

Expected: FAIL — 模块找不到。

- [ ] **Step 3: 实现 grading-prompt**

```ts
// src/lib/ai/grading-prompt.ts
export interface GradingPromptOpts {
  questionContent: string;
  questionType: 'essay' | 'code' | 'interview';
  referenceAnswer: string;
  userAnswer: string;
  language?: string;
}

/**
 * AI 批阅(主观题)system prompt
 * 要求输出 JSON: { comment: string } — Markdown 格式的评语
 */
export function buildGradingPrompt(opts: GradingPromptOpts): string {
  const typeGuide: Record<typeof opts.questionType, string> = {
    essay: '本题是简答题。请关注:① 是否答到核心要点 ② 论述是否清晰 ③ 是否需要补充',
    code: `本题是代码题(${opts.language ?? '代码语言未指定'})。请关注:① 逻辑是否正确 ② 边界条件 ③ 代码风格`,
    interview: '本题是面试题。请关注:① 是否切中要点 ② 表达是否清晰 ③ 是否有亮点',
  };

  return [
    '你是一位严谨的阅卷老师,负责为学生的作答写一份简短的批阅评语(不计分)。',
    '',
    '【题目】',
    opts.questionContent,
    '',
    '【题目类型】',
    opts.questionType,
    '',
    typeGuide[opts.questionType],
    '',
    '【参考答案】',
    opts.referenceAnswer || '（无）',
    '',
    '【学生答案】',
    opts.userAnswer || '（未作答）',
    '',
    '【输出要求】',
    '请用 Markdown 写一段 80~200 字的评语,包含:',
    '1. 学生答得好的部分',
    '2. 不足或遗漏的关键点',
    '3. 如何改进',
    '',
    '严格输出为 JSON: { "comment": "<Markdown 文本>" }',
  ].join('\n');
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npm test -- tests/lib/ai/grading-prompt.test.ts
```

Expected: 4/4 通过。

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/grading-prompt.ts tests/lib/ai/grading-prompt.test.ts
git commit -m "feat(ai): add AI grading prompt builder"
```

---

## Task 3: 修改 checker.ts — 累加 manualScore

**Files:**
- Modify: `src/lib/checker.ts`

- [ ] **Step 1: 改 gradeQuiz 累加 manualScore**

```ts
// src/lib/checker.ts 修改 gradeQuiz 函数
export function gradeQuiz(questions: Question[], answers: Answer[]): QuizResult {
  let totalScore = 0;
  const totalMaxScore = questions.length;
  const results: CheckResult[] = [];

  for (const question of questions) {
    const answer = answers.find(a => a.questionId === question.id);
    const userAnswer = answer?.answer || '';
    const result = checkAnswer(question, userAnswer);
    results.push(result);
    // 修改:这里用 result.score,主观题的 score 由调用方根据 manualScore 重算后传入
    // 或保持现状 —— score 已是自动分数(客观题 0/1,主观题 0)
    totalScore += result.score;
  }

  return {
    quizId: questions[0]?.id || '',
    answers,
    score: totalScore,
    totalScore: totalMaxScore,
    results: results.map(r => ({ ...r, score: undefined })) as QuizResult['results'],
    submittedAt: Date.now()
  } as QuizResult;
}
```

> 注:`gradeQuiz()` 服务端在 `results/route.ts` 里调用,后接一个 **重算步骤**:遍历 results,若 `manualScore != null`,把 `score` 字段从原 0 改为 manualScore,并加到 totalScore 上。提交时 `manualScore` 是 undefined,行为不变(向后兼容)。

- [ ] **Step 2: 提交**

```bash
git add src/lib/checker.ts
git commit -m "refactor(checker): no change; manual score handled at results route"
```

> 这个任务实际只是确认 checker 不动,后面 Task 9 的"Admin 改分时重算总分"是关键。

---

## Task 4: 拆 results-dedup.ts — draft upsert / submitted insert

**Files:**
- Modify: `src/lib/results-dedup.ts`

- [ ] **Step 1: 新增 upsertDraftRecord 函数**

```ts
// src/lib/results-dedup.ts 新增

export interface UpsertDraftInput {
  userId: string;
  quizId: string;
  name: string;
  score: number;
  totalScore: number;
  results: string;          // JSON
  defaultName?: string;
  defaultCategoryId?: string;
}

/**
 * 草稿(draft)同 (userId, quizId) 只保留 1 份
 * - 有则 update,无则 create
 * - 调用方负责 Prisma 事务
 */
export function buildDraftUpsertData(input: UpsertDraftInput, existingId: string | null) {
  if (existingId) {
    return {
      operation: 'update' as const,
      where: { id: existingId },
      data: {
        name: input.name,
        score: input.score,
        totalScore: input.totalScore,
        results: input.results,
      },
    };
  }
  return {
    operation: 'create' as const,
    data: {
      userId: input.userId,
      quizId: input.quizId,
      name: input.name,
      score: input.score,
      totalScore: input.totalScore,
      results: input.results,
      status: 'draft',
    },
  };
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/results-dedup.ts
git commit -m "feat(dedup): add draft upsert helper"
```

---

## Task 5: POST /api/results 触发 AI 批阅 + 拆分草稿/提交

**Files:**
- Modify: `src/app/api/results/route.ts`

- [ ] **Step 1: 在 POST handler 引入 AI 批阅**

> 现状:`POST /api/results` 已经做了 dedup。本次只动:
> - 拆 draft upsert / submitted insert(用 Task 4 的 helper)
> - 当 status='submitted' 时,对 essay/code/interview 调 AI 拿 aiComment 写回 results JSON

```ts
// src/app/api/results/route.ts —— POST handler 关键修改

// 在 handler 顶部 imports 加:
import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { buildGradingPrompt } from '@/lib/ai/grading-prompt';

// 在 handler 内部,准备 results JSON 之后、写入数据库之前:

async function gradeOneQuestion(
  q: any,
  userAnswer: string,
  refAnswer: string,
): Promise<string | undefined> {
  const prompt = buildGradingPrompt({
    questionContent: q.title,
    questionType: q.type,
    referenceAnswer: refAnswer,
    userAnswer,
    language: q.language,
  });
  const provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
  if (!provider) return undefined;
  try {
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const content = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [{ role: 'system', content: prompt }],
      jsonMode: true,
      maxTokens: 800,
      temperature: 0.4,
    });
    // 期望 JSON: { comment: string }
    try {
      const parsed = JSON.parse(content);
      return typeof parsed.comment === 'string' ? parsed.comment : undefined;
    } catch {
      return undefined;
    }
  } catch {
    return undefined;
  }
}

// 在主 POST handler 中,当 status === 'submitted' 时:
let enrichedResults: any[] = parsedResults;
if (body.status === 'submitted') {
  // 串行 AI 批阅(题少,不必并发;失败单题降级)
  enrichedResults = await Promise.all(
    parsedResults.map(async (r: any) => {
      const q = quiz.questions.find((qq: any) => qq.id === r.questionId);
      if (!q) return r;
      if (!['essay', 'code', 'interview'].includes(q.type)) return r;
      const refAnswer =
        q.type === 'essay' || q.type === 'interview'
          ? q.referenceAnswer ?? ''
          : '';
      const comment = await gradeOneQuestion(q, r.userAnswer ?? '', refAnswer);
      return comment ? { ...r, aiComment: comment } : r;
    }),
  );
}

// 然后用 enrichedResults 走 dedup + 写入
```

- [ ] **Step 2: 拆 draft upsert / submitted insert**

```ts
// 同文件,替换现有 pickRecordToUpdate 调用为:

if (body.status === 'draft') {
  // 同 (userId, quizId) 草稿 upsert
  const existingDraft = await prisma.quizResult.findFirst({
    where: { userId: payload.userId, quizId: body.quizId, status: 'draft' },
  });
  const enriched = await enrichResultsDraft(parsedResults);
  const finalResults = body.status === 'submitted' ? enrichedResults : enriched;
  const saved = existingDraft
    ? await prisma.quizResult.update({
        where: { id: existingDraft.id },
        data: { name, score, totalScore, results: JSON.stringify(finalResults) },
      })
    : await prisma.quizResult.create({
        data: {
          userId: payload.userId,
          quizId: body.quizId,
          name,
          score,
          totalScore,
          results: JSON.stringify(finalResults),
          status: 'draft',
        },
      });
  // ... defaultName/defaultCategoryId 回写 ...
} else {
  // submitted: 直接 insert 新行
  const saved = await prisma.quizResult.create({
    data: {
      userId: payload.userId,
      quizId: body.quizId,
      name,
      score,
      totalScore,
      results: JSON.stringify(enrichedResults),
      status: 'submitted',
      submittedAt: new Date(),
    },
  });
  // ... defaultName/defaultCategoryId 回写 ...
}
```

> 注:`enrichResultsDraft` 是占位函数(draft 状态下主观题 aiComment 为 undefined),实际写时直接用 `parsedResults`。

- [ ] **Step 3: 测试现有行为不破**

```bash
npm test -- tests/api/results
```

Expected: 现有 results 路由测试全部通过(若没有,先 `npm test` 看是否有 break)。

- [ ] **Step 4: 提交**

```bash
git add src/app/api/results/route.ts
git commit -m "feat(results): trigger AI grading on submit + split draft upsert"
```

---

## Task 6: AnswerSheet 顶部加「📊 查看报告」按钮 + 集成 ManualGradePanel 占位

**Files:**
- Modify: `src/components/AnswerSheet.tsx`

- [ ] **Step 1: 在顶部加报告按钮**

```tsx
// src/components/AnswerSheet.tsx
// 在顶部工具条 <div className="flex items-center justify-between mb-4"> 内追加按钮:

import { useRouter } from 'next/navigation';
const router = useRouter();

// 在按钮组里加:
<button
  onClick={() => router.push(`/result/${result.id}/report`)}
  className="text-[11px] text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded border border-emerald-200 hover:border-emerald-300 bg-emerald-50/50 transition-colors"
>
  📊 查看报告
</button>
```

- [ ] **Step 2: 提交**

```bash
git add src/components/AnswerSheet.tsx
git commit -m "feat(answersheet): add report link in toolbar"
```

---

## Task 7: 时间限制 — UploadForm 加输入 + API 接受

**Files:**
- Modify: `src/components/UploadForm.tsx`
- Modify: `src/app/api/quizzes/route.ts`

- [ ] **Step 1: UploadForm 加 timeLimit 输入**

```tsx
// src/components/UploadForm.tsx
// 1) 加 state(在已有 useState 区域附近)
const [timeLimit, setTimeLimit] = useState<number>(0);

// 2) 在表单顶部(题目预览之后、上传按钮之前)插入 UI 块:
<div className="bg-white/80 border border-slate-200 rounded-xl p-4">
  <label className="block text-[13px] font-medium text-slate-700 mb-2">
    答题时长(可选)
  </label>
  <div className="flex items-center gap-2">
    <input
      type="number"
      min="0"
      max="480"
      value={timeLimit}
      onChange={(e) => setTimeLimit(Math.max(0, parseInt(e.target.value) || 0))}
      placeholder="0"
      className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
    />
    <span className="text-[13px] text-slate-500">分钟</span>
  </div>
  <div className="text-[11px] text-slate-400 mt-1">0 = 不限时,1~480 分钟可选</div>
  {/* 快速选择 */}
  <div className="flex gap-2 mt-2">
    {[10, 20, 30, 60].map((m) => (
      <button
        key={m}
        type="button"
        onClick={() => setTimeLimit(m)}
        className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
          timeLimit === m
            ? 'bg-sky-100 border-sky-300 text-sky-700'
            : 'bg-white border-slate-200 text-slate-500 hover:border-sky-300'
        }`}
      >
        {m} 分钟
      </button>
    ))}
  </div>
</div>

// 3) 在两个 fetch('/api/quizzes', ...) body 里都加 timeLimit:
//    body: JSON.stringify({ title, questions, fileKey, timeLimit })
```

- [ ] **Step 2: 改 /api/quizzes 接受 timeLimit**

```ts
// src/app/api/quizzes/route.ts POST handler
// 解构时加 timeLimit:
const { title, questions, fileKey, timeLimit } = await request.json();

// 在 prisma.quiz.create 的 data 里加:
const quiz = await prisma.quiz.create({
  data: {
    title,
    questions: JSON.stringify(normalized),
    fileKey: fileKey ?? null,
    userId: payload.userId,
    timeLimit: typeof timeLimit === 'number' && timeLimit > 0 ? timeLimit : 0,
  },
});
```

- [ ] **Step 3: 测试**

```bash
npm test
```

Expected: 现有测试全通过。

- [ ] **Step 4: 提交**

```bash
git add src/components/UploadForm.tsx src/app/api/quizzes/route.ts
git commit -m "feat(upload): add timeLimit input + api support"
```

---

## Task 8: 答题页 — 历史切换器 + 5min/1min 提醒

**Files:**
- Create: `src/components/HistorySwitcher.tsx`
- Create: `tests/components/history-switcher.test.tsx`
- Modify: `src/app/quiz/[id]/page.tsx`

- [ ] **Step 1: 写 HistorySwitcher 测试**

```tsx
// tests/components/history-switcher.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import HistorySwitcher from '@/components/HistorySwitcher';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HistorySwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无历史时不显示按钮', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    render(<HistorySwitcher quizId="q1" onSelect={() => {}} />);
    // 等异步 fetch 完成
    await new Promise(r => setTimeout(r, 10));
    expect(screen.queryByText(/历史/)).toBeNull();
  });

  it('有 1 份 submitted 历史时显示 [📚 1 次]', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 'r1', status: 'submitted', score: 80, totalScore: 100, submittedAt: '2026-07-24T01:00:00Z', name: 'test' },
        ],
      }),
    });
    render(<HistorySwitcher quizId="q1" onSelect={() => {}} />);
    await new Promise(r => setTimeout(r, 10));
    expect(screen.getByText(/1 次/)).toBeTruthy();
  });

  it('点击展开下拉,显示历史条目', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: 'r1', status: 'submitted', score: 80, totalScore: 100, submittedAt: '2026-07-24T01:00:00Z', name: '提交1' },
          { id: 'r2', status: 'submitted', score: 90, totalScore: 100, submittedAt: '2026-07-23T01:00:00Z', name: '提交2' },
        ],
      }),
    });
    render(<HistorySwitcher quizId="q1" onSelect={() => {}} />);
    await new Promise(r => setTimeout(r, 10));
    fireEvent.click(screen.getByText(/2 次/));
    expect(screen.getByText('提交1')).toBeTruthy();
    expect(screen.getByText('提交2')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- tests/components/history-switcher.test.tsx
```

Expected: FAIL。

- [ ] **Step 3: 实现 HistorySwitcher**

```tsx
// src/components/HistorySwitcher.tsx
'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface HistoryItem {
  id: string;
  name: string;
  status: string;
  score: number;
  totalScore: number;
  submittedAt: string;
}

export default function HistorySwitcher({
  quizId,
  onSelect,
  disabled,
}: {
  quizId: string;
  onSelect: (item: HistoryItem) => void;
  disabled?: boolean;
}) {
  const { token } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/results?quizId=${quizId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      const submitted = (data.results ?? []).filter(
        (r: HistoryItem) => r.status === 'submitted',
      );
      setItems(submitted);
    })();
    return () => { cancelled = true; };
  }, [quizId, token]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/80 border border-slate-200 text-slate-600 hover:border-sky-300 text-[12px]"
      >
        📚 {items.length} 次
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 max-h-80 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg z-20">
          {items.map((item) => {
            const date = new Date(item.submittedAt);
            return (
              <button
                key={item.id}
                onClick={() => { onSelect(item); setOpen(false); }}
                className="block w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
              >
                <div className="text-[13px] font-medium text-slate-700">{item.name}</div>
                <div className="text-[11px] text-slate-400 flex items-center justify-between mt-0.5">
                  <span>{date.toLocaleString('zh-CN')}</span>
                  <span className="font-mono">{item.score}/{item.totalScore}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- tests/components/history-switcher.test.tsx
```

Expected: 3/3 通过。

- [ ] **Step 5: 提交**

```bash
git add src/components/HistorySwitcher.tsx tests/components/history-switcher.test.tsx
git commit -m "feat(quiz): add HistorySwitcher for past submissions"
```

- [ ] **Step 6: 集成到答题页**

```tsx
// src/app/quiz/[id]/page.tsx 修改:
// 1) 加 import:
import HistorySwitcher from '@/components/HistorySwitcher';

// 2) 在顶部 sticky bar(已有)的「进度环」前插入:
{/* 历史切换器(在有 ≥1 份 submitted 时显示) */}
<HistorySwitcher
  quizId={quiz.id}
  onSelect={async (item) => {
    const res = await fetch(`/api/results?quizId=${quiz.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const target = (data.results ?? []).find((r: any) => r.id === item.id);
    if (target) {
      if (typeof target.results === 'string') {
        try { target.results = JSON.parse(target.results); } catch { target.results = []; }
      }
      setResult(target);
      setSubmitted(true);
    }
  }}
/>
```

- [ ] **Step 7: 提交**

```bash
git add src/app/quiz/[id]/page.tsx
git commit -m "feat(quiz): integrate HistorySwitcher in top bar"
```

---

## Task 9: 答题页 — 5min/1min 提醒 toast

**Files:**
- Modify: `src/app/quiz/[id]/page.tsx`

- [ ] **Step 1: 加 5min/1min 提醒 useEffect**

```tsx
// src/app/quiz/[id]/page.tsx 修改倒计时 useEffect(已有,在 setTimeout 那块附近):

// 顶部加 ref:
const warned5minRef = useRef(false);
const warned1minRef = useRef(false);

// 在已有的倒计时 useEffect 内,setTimeout 之前:
useEffect(() => {
  if (remainingSec == null || submitted) return;
  // 5 分钟提醒(只在原时长 ≥ 6 分钟时提醒)
  if (
    quiz?.timeLimit && quiz.timeLimit >= 6 &&
    remainingSec === 300 && !warned5minRef.current
  ) {
    warned5minRef.current = true;
    showToast('还剩 5 分钟');
  }
  // 1 分钟提醒
  if (remainingSec === 60 && !warned1minRef.current) {
    warned1minRef.current = true;
    showToast('还剩 1 分钟,请注意时间');
  }
  // 原倒计时逻辑保留(超时自动提交)
  if (remainingSec <= 0) {
    if (!autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      showToast('时间到,自动提交');
      doSubmit(true);
    }
    return;
  }
  const t = setTimeout(() => setRemainingSec((s) => (s == null ? s : s - 1)), 1000);
  return () => clearTimeout(t);
}, [remainingSec, submitted, quiz]);
```

- [ ] **Step 2: 跑测试**

```bash
npm test
```

Expected: 现有测试全通过。

- [ ] **Step 3: 提交**

```bash
git add src/app/quiz/[id]/page.tsx
git commit -m "feat(quiz): add 5min/1min countdown reminders"
```

---

## Task 10: 人工批阅 — API 路由

**Files:**
- Create: `src/app/api/admin/results/[id]/grade/route.ts`
- Create: `tests/api/admin-results-grade.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/api/admin-results-grade.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    quizResult: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    admin: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/auth', () => ({
  verifyAdminToken: vi.fn(),
  getTokenFromHeaders: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/auth';
import { POST } from '@/app/api/admin/results/[id]/grade/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTokenFromHeaders).mockImplementation((req: any) => {
    const h = req.headers.get('authorization');
    return h ? h.replace('Bearer ', '') : null;
  });
  vi.mocked(verifyAdminToken).mockReturnValue({ userId: 'admin1' });
});

function buildReq(body: any): Request {
  return new Request('http://localhost/api/admin/results/r1/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/results/[id]/grade', () => {
  it('非 admin token 返回 403', async () => {
    vi.mocked(verifyAdminToken).mockReturnValue(null);
    const req = new Request('http://localhost/api/admin/results/r1/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer user-token' },
      body: JSON.stringify({ questionId: 'q1', manualScore: 0.8 }),
    });
    const res = await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(403);
  });

  it('结果不存在返回 404', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValueOnce(null);
    const req = buildReq({ questionId: 'q1', manualScore: 0.8 });
    const res = await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });
    expect(res.status).toBe(404);
  });

  it('manualScore 超 [0,1] 范围 clamp', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValueOnce({
      id: 'r1',
      results: JSON.stringify([{ questionId: 'q1', userAnswer: 'a', correct: false }]),
      score: 5,
      totalScore: 10,
    } as any);
    vi.mocked(prisma.quizResult.update).mockResolvedValueOnce({} as any);

    const req = buildReq({ questionId: 'q1', manualScore: 1.5, manualComment: 'good' });
    await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });

    expect(prisma.quizResult.update).toHaveBeenCalled();
    const updateArg = vi.mocked(prisma.quizResult.update).mock.calls[0][0];
    const parsed = JSON.parse(updateArg.data.results);
    expect(parsed[0].manualScore).toBe(1);   // clamp 到 1
    expect(parsed[0].manualComment).toBe('good');
  });

  it('写入 manualScore 后总分被重算', async () => {
    // 已有总分 5(5 道客观题对 5 道,主观题 0 分)
    // 现给一道主观题打 0.8 分 → 新总分 = 5 + 0.8 = 5.8
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValueOnce({
      id: 'r1',
      results: JSON.stringify([
        { questionId: 'q1', userAnswer: 'a', correct: true },
        { questionId: 'q2', userAnswer: 'b', correct: true },
        { questionId: 'q3', userAnswer: 'c', correct: true },
        { questionId: 'q4', userAnswer: 'd', correct: true },
        { questionId: 'q5', userAnswer: 'e', correct: true },
        { questionId: 'q6', userAnswer: 'essay answer', correct: false, autoGraded: false },
      ]),
      score: 5,
      totalScore: 6,
    } as any);
    vi.mocked(prisma.quizResult.update).mockResolvedValueOnce({} as any);

    const req = buildReq({ questionId: 'q6', manualScore: 0.8, manualComment: 'good' });
    await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });

    const updateArg = vi.mocked(prisma.quizResult.update).mock.calls[0][0];
    expect(updateArg.data.score).toBe(5.8);
    expect(updateArg.data.totalScore).toBe(6);
  });

  it('manualScore=null 表示清空', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValueOnce({
      id: 'r1',
      results: JSON.stringify([
        { questionId: 'q1', userAnswer: 'a', correct: false, manualScore: 0.5 },
      ]),
      score: 0.5,
      totalScore: 1,
    } as any);
    vi.mocked(prisma.quizResult.update).mockResolvedValueOnce({} as any);

    const req = buildReq({ questionId: 'q1', manualScore: null });
    await POST(req as any, { params: Promise.resolve({ id: 'r1' }) });

    const updateArg = vi.mocked(prisma.quizResult.update).mock.calls[0][0];
    const parsed = JSON.parse(updateArg.data.results);
    expect(parsed[0].manualScore).toBeUndefined();
    expect(updateArg.data.score).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- tests/api/admin-results-grade.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现路由**

```ts
// src/app/api/admin/results/[id]/grade/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/auth';

interface ResultItem {
  questionId: string;
  correct: boolean;
  correctAnswer?: string;
  userAnswer: string;
  autoGraded: boolean;
  aiComment?: string;
  manualScore?: number;
  manualComment?: string;
  manualGradedBy?: string;
  manualGradedAt?: string;
}

function clampScore(n: any): number | undefined {
  if (n === null) return undefined;
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(v)) return undefined;
  return Math.max(0, Math.min(1, v));
}

function recalcTotalScore(items: ResultItem[]): number {
  let s = 0;
  for (const it of items) {
    if (typeof it.manualScore === 'number') s += it.manualScore;
    else if (it.correct) s += 1;
  }
  return s;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyAdminToken(token) : null;
  if (!payload) return NextResponse.json({ error: '需要管理员登录' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || !body.questionId) {
    return NextResponse.json({ error: '缺少 questionId' }, { status: 400 });
  }

  const existing = await prisma.quizResult.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: '结果不存在' }, { status: 404 });

  const items: ResultItem[] = JSON.parse(existing.results || '[]');
  const idx = items.findIndex((it) => it.questionId === body.questionId);
  if (idx === -1) return NextResponse.json({ error: '题目不存在' }, { status: 404 });

  const next: ResultItem = { ...items[idx] };
  const score = clampScore(body.manualScore);
  if (score === undefined && body.manualScore !== null) {
    return NextResponse.json({ error: 'manualScore 格式错误' }, { status: 400 });
  }
  if (body.manualScore === null) {
    delete next.manualScore;
    delete next.manualGradedBy;
    delete next.manualGradedAt;
  } else {
    next.manualScore = score;
    next.manualComment = typeof body.manualComment === 'string' ? body.manualComment : next.manualComment;
    next.manualGradedBy = payload.userId;
    next.manualGradedAt = new Date().toISOString();
  }
  items[idx] = next;
  const newTotal = recalcTotalScore(items);

  const updated = await prisma.quizResult.update({
    where: { id },
    data: {
      results: JSON.stringify(items),
      score: newTotal,
      totalScore: existing.totalScore,
    },
  });

  return NextResponse.json({ result: updated });
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- tests/api/admin-results-grade.test.ts
```

Expected: 5/5 通过。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/admin/results/[id]/grade/route.ts tests/api/admin-results-grade.test.ts
git commit -m "feat(admin): manual grade endpoint with score clamp + total recompute"
```

---

## Task 11: 人工批阅 — ManualGradePanel 组件

**Files:**
- Create: `src/components/ManualGradePanel.tsx`
- Create: `tests/components/manual-grade-panel.test.tsx`

- [ ] **Step 1: 写测试**

```tsx
// tests/components/manual-grade-panel.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import ManualGradePanel from '@/components/ManualGradePanel';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', isAdmin: true }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ManualGradePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未批阅时显示折叠面板入口', () => {
    render(
      <ManualGradePanel
        resultId="r1"
        questionId="q1"
        item={{ questionId: 'q1', userAnswer: 'u', correct: false, autoGraded: false }}
      />,
    );
    expect(screen.getByText(/人工批阅/)).toBeTruthy();
  });

  it('展开后可见分数输入和评语框', () => {
    render(
      <ManualGradePanel
        resultId="r1"
        questionId="q1"
        item={{ questionId: 'q1', userAnswer: 'u', correct: false, autoGraded: false }}
      />,
    );
    fireEvent.click(screen.getByText(/人工批阅/));
    expect(screen.getByPlaceholderText(/分数/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/评语/)).toBeTruthy();
  });

  it('已批阅时显示「已批阅 by ...」+ 修改按钮', () => {
    render(
      <ManualGradePanel
        resultId="r1"
        questionId="q1"
        item={{
          questionId: 'q1',
          userAnswer: 'u',
          correct: false,
          autoGraded: false,
          manualScore: 0.8,
          manualComment: 'good',
          manualGradedBy: 'admin1',
          manualGradedAt: '2026-07-24T01:00:00Z',
        }}
      />,
    );
    expect(screen.getByText(/已批阅/)).toBeTruthy();
    expect(screen.getByText('good')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- tests/components/manual-grade-panel.test.tsx
```

Expected: FAIL。

- [ ] **Step 3: 实现 ManualGradePanel**

```tsx
// src/components/ManualGradePanel.tsx
'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Item {
  questionId: string;
  userAnswer: string;
  correct: boolean;
  autoGraded: boolean;
  manualScore?: number;
  manualComment?: string;
  manualGradedBy?: string;
  manualGradedAt?: string;
}

export default function ManualGradePanel({
  resultId,
  questionId,
  item,
}: {
  resultId: string;
  questionId: string;
  item: Item;
}) {
  const { token, isAdmin } = useAuth();
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState<string>(
    typeof item.manualScore === 'number' ? String(item.manualScore) : '',
  );
  const [comment, setComment] = useState<string>(item.manualComment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyGraded =
    typeof item.manualScore === 'number' || !!item.manualComment;

  if (!isAdmin) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/results/${resultId}/grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questionId,
          manualScore: score === '' ? null : parseFloat(score),
          manualComment: comment,
        }),
      });
      if (!res.ok) throw new Error(`保存失败(${res.status})`);
      // 成功后刷新页面(简化:刷新当前页)
      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-50/40 border border-slate-200 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] tracking-[0.2em] uppercase text-slate-400">
          ✍️ 人工批阅
        </div>
        {alreadyGraded && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-slate-500 hover:text-sky-500"
          >
            修改
          </button>
        )}
      </div>
      {alreadyGraded && !editing ? (
        <div className="mt-2 text-[12px] text-slate-600">
          <div>
            <span className="text-slate-400">分数:</span>
            <span className="ml-1 font-mono">{item.manualScore}</span>
          </div>
          {item.manualComment && (
            <div className="mt-1 text-slate-700">{item.manualComment}</div>
          )}
          <div className="mt-1 text-[10.5px] text-slate-400">
            by {item.manualGradedBy} at {item.manualGradedAt?.slice(0, 16).replace('T', ' ')}
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <button
            onClick={() => setEditing((e) => !e)}
            className="text-[11px] text-sky-500 hover:text-sky-700"
          >
            {editing ? '收起' : '展开评分'}
          </button>
          {editing && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="分数(0~1)"
                  className="w-24 px-2 py-1 border border-slate-200 rounded text-[12px]"
                />
                <span className="text-[11px] text-slate-400">0~1</span>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="评语"
                rows={3}
                className="w-full px-2 py-1 border border-slate-200 rounded text-[12px]"
              />
              {error && <div className="text-[11px] text-rose-500">{error}</div>}
              <div className="flex gap-2">
                <button
                  onClick={submit}
                  disabled={saving}
                  className="px-3 py-1 bg-sky-400 text-white text-[12px] rounded hover:bg-sky-500 disabled:opacity-50"
                >
                  {saving ? '保存中...' : '提交'}
                </button>
                <button
                  onClick={() => { setEditing(false); setScore(''); setComment(''); }}
                  className="px-3 py-1 bg-slate-100 text-slate-600 text-[12px] rounded hover:bg-slate-200"
                >
                  取消
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- tests/components/manual-grade-panel.test.tsx
```

Expected: 3/3 通过。

- [ ] **Step 5: 提交**

```bash
git add src/components/ManualGradePanel.tsx tests/components/manual-grade-panel.test.tsx
git commit -m "feat(grade): add ManualGradePanel collapsible"
```

---

## Task 12: AnswerSheet 集成 ManualGradePanel

**Files:**
- Modify: `src/components/AnswerSheet.tsx`

- [ ] **Step 1: 在主观题下挂 ManualGradePanel**

```tsx
// src/components/AnswerSheet.tsx
// 1) 加 import:
import ManualGradePanel from '@/components/ManualGradePanel';

// 2) 在每道题展开区的「AI 解析 - 仅错题显示」块之后(或 AI 追问之前),加:
{/* 人工批阅 - 仅主观题 + 已是 submitted 结果 */}
{(q.type === 'essay' || q.type === 'code' || q.type === 'interview') && result?.id && (
  <ManualGradePanel
    resultId={result.id}
    questionId={q.id}
    item={{
      questionId: q.id,
      userAnswer: userAnswer,
      correct: !!correct,
      autoGraded: false,
      manualScore: r?.manualScore,
      manualComment: r?.manualComment,
      manualGradedBy: r?.manualGradedBy,
      manualGradedAt: r?.manualGradedAt,
    }}
  />
)}
```

> 注:AnswerSheet 拿到的 `r`(`getRecord(q.id)` 返回的 item)需要包含 manual 字段。检查 `result.results` 字段类型,在 `src/types/index.ts` 给 `QuizResult.results[]` 项加可选字段(`manualScore?`、`manualComment?` 等)。

- [ ] **Step 2: 更新 types**

```ts
// src/types/index.ts 修改 QuizResult.results 项类型
results: {
  questionId: string;
  correct: boolean;
  correctAnswer: string;
  userAnswer: string;
  autoGraded: boolean;
  // 新增:
  aiComment?: string;
  manualScore?: number;
  manualComment?: string;
  manualGradedBy?: string;
  manualGradedAt?: string;
}[];
```

- [ ] **Step 3: 跑测试**

```bash
npm test
```

Expected: 全通过。

- [ ] **Step 4: 提交**

```bash
git add src/components/AnswerSheet.tsx src/types/index.ts
git commit -m "feat(answersheet): integrate ManualGradePanel for subjective questions"
```

---

## Task 13: 报告 — calculator 模块

**Files:**
- Create: `src/lib/report/calculator.ts`
- Create: `tests/lib/report/calculator.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/lib/report/calculator.test.ts
import { describe, it, expect } from 'vitest';
import { calcReportStats } from '@/lib/report/calculator';

describe('calcReportStats', () => {
  it('计算总览:得分、正确率、对/错/未答', () => {
    const stats = calcReportStats({
      totalScore: 10,
      results: [
        { questionId: 'q1', correct: true, userAnswer: 'A', autoGraded: true },
        { questionId: 'q2', correct: true, userAnswer: 'B', autoGraded: true },
        { questionId: 'q3', correct: false, userAnswer: 'X', autoGraded: true },
        { questionId: 'q4', correct: false, userAnswer: '', autoGraded: true },
      ],
      questions: [
        { id: 'q1', type: 'single' as any, difficulty: '简单' as any },
        { id: 'q2', type: 'multiple' as any, difficulty: '简单' as any },
        { id: 'q3', type: 'single' as any, difficulty: '中等' as any },
        { id: 'q4', type: 'single' as any, difficulty: '困难' as any },
      ],
    });
    expect(stats.overview.score).toBe(2);
    expect(stats.overview.totalScore).toBe(4);
    expect(stats.overview.correctRate).toBeCloseTo(0.5);
    expect(stats.overview.correctCount).toBe(2);
    expect(stats.overview.wrongCount).toBe(1);
    expect(stats.overview.unansweredCount).toBe(1);
  });

  it('按题型分组,含正确率', () => {
    const stats = calcReportStats({
      totalScore: 0,
      results: [
        { questionId: 'q1', correct: true, userAnswer: 'A', autoGraded: true },
        { questionId: 'q2', correct: true, userAnswer: 'B', autoGraded: true },
        { questionId: 'q3', correct: false, userAnswer: 'X', autoGraded: true },
        { questionId: 'q4', correct: true, userAnswer: 'true', autoGraded: true },
      ],
      questions: [
        { id: 'q1', type: 'single' as any },
        { id: 'q2', type: 'single' as any },
        { id: 'q3', type: 'single' as any },
        { id: 'q4', type: 'boolean' as any },
      ],
    });
    const single = stats.byType['single'];
    expect(single.total).toBe(3);
    expect(single.correct).toBe(2);
    expect(single.correctRate).toBeCloseTo(2 / 3);
    const bool = stats.byType['boolean'];
    expect(bool.total).toBe(1);
    expect(bool.correct).toBe(1);
  });

  it('按难度分组,无难度的不计入', () => {
    const stats = calcReportStats({
      totalScore: 0,
      results: [
        { questionId: 'q1', correct: true, userAnswer: 'A', autoGraded: true },
        { questionId: 'q2', correct: false, userAnswer: 'B', autoGraded: true },
        { questionId: 'q3', correct: true, userAnswer: 'C', autoGraded: true },
      ],
      questions: [
        { id: 'q1', type: 'single' as any, difficulty: '简单' as any },
        { id: 'q2', type: 'single' as any, difficulty: '中等' as any },
        { id: 'q3', type: 'single' as any }, // 无难度
      ],
    });
    expect(stats.byDifficulty['简单'].total).toBe(1);
    expect(stats.byDifficulty['中等'].total).toBe(1);
    expect(stats.byDifficulty['困难']).toBeUndefined();
    expect(stats.byDifficulty.noDifficultyCount).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- tests/lib/report/calculator.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 calculator**

```ts
// src/lib/report/calculator.ts
import { Question, QuestionType } from '@/types';

export interface ResultItemLite {
  questionId: string;
  correct: boolean;
  userAnswer: string;
  autoGraded: boolean;
}

export interface ReportStats {
  overview: {
    score: number;
    totalScore: number;
    correctRate: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
  };
  byType: Record<string, { total: number; correct: number; correctRate: number }>;
  byDifficulty: {
    简单?: { total: number; correct: number; correctRate: number };
    中等?: { total: number; correct: number; correctRate: number };
    困难?: { total: number; correct: number; correctRate: number };
    noDifficultyCount: number;
  };
}

export function calcReportStats(input: {
  totalScore: number;
  results: ResultItemLite[];
  questions: Question[];
}): ReportStats {
  const correctCount = input.results.filter(r => r.correct).length;
  const wrongCount = input.results.filter(r => !r.correct && r.userAnswer).length;
  const unansweredCount = input.results.filter(r => !r.userAnswer).length;
  const totalAnswered = correctCount + wrongCount;
  const correctRate = totalAnswered > 0 ? correctCount / totalAnswered : 0;

  // byType
  const byType: ReportStats['byType'] = {};
  for (const q of input.questions) {
    if (!byType[q.type]) byType[q.type] = { total: 0, correct: 0, correctRate: 0 };
    byType[q.type].total += 1;
    const r = input.results.find(rr => rr.questionId === q.id);
    if (r?.correct) byType[q.type].correct += 1;
  }
  for (const k of Object.keys(byType)) {
    const t = byType[k];
    t.correctRate = t.total > 0 ? t.correct / t.total : 0;
  }

  // byDifficulty
  const byDifficulty: ReportStats['byDifficulty'] = { noDifficultyCount: 0 };
  for (const q of input.questions) {
    const r = input.results.find(rr => rr.questionId === q.id);
    const correct = r?.correct ?? false;
    if (!q.difficulty) {
      byDifficulty.noDifficultyCount += 1;
      continue;
    }
    if (!byDifficulty[q.difficulty]) {
      byDifficulty[q.difficulty] = { total: 0, correct: 0, correctRate: 0 };
    }
    byDifficulty[q.difficulty]!.total += 1;
    if (correct) byDifficulty[q.difficulty]!.correct += 1;
  }
  for (const k of ['简单', '中等', '困难'] as const) {
    const v = byDifficulty[k];
    if (v) v.correctRate = v.total > 0 ? v.correct / v.total : 0;
  }

  return {
    overview: {
      score: input.totalScore,
      totalScore: input.questions.length,
      correctRate,
      correctCount,
      wrongCount,
      unansweredCount,
    },
    byType,
    byDifficulty,
  };
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- tests/lib/report/calculator.test.ts
```

Expected: 3/3 通过。

- [ ] **Step 5: 提交**

```bash
git add src/lib/report/calculator.ts tests/lib/report/calculator.test.ts
git commit -m "feat(report): add local stats calculator"
```

---

## Task 14: 报告 — AI prompt 模块

**Files:**
- Create: `src/lib/ai/report-prompt.ts`
- Create: `tests/lib/ai/report-prompt.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/lib/ai/report-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildReportPrompt } from '@/lib/ai/report-prompt';

describe('buildReportPrompt', () => {
  it('包含分数、总览、错题列表', () => {
    const p = buildReportPrompt({
      quizTitle: '前端小测',
      score: 8,
      totalScore: 10,
      byType: { single: { total: 3, correct: 2, correctRate: 0.67 } },
      wrongQuestions: [
        { index: 3, title: '什么是闭包', type: 'essay', userAnswer: '...', correctAnswer: '...' },
      ],
    });
    expect(p).toContain('前端小测');
    expect(p).toContain('8');
    expect(p).toContain('闭包');
    expect(p).toContain('essay');
  });

  it('包含输出 JSON 约束(knowledgePoints + advice)', () => {
    const p = buildReportPrompt({
      quizTitle: 't',
      score: 0,
      totalScore: 1,
      byType: {},
      wrongQuestions: [],
    });
    expect(p).toContain('knowledgePoints');
    expect(p).toContain('advice');
  });

  it('空错题列表时仍能生成合理 prompt', () => {
    const p = buildReportPrompt({
      quizTitle: '满分卷',
      score: 10,
      totalScore: 10,
      byType: {},
      wrongQuestions: [],
    });
    expect(p).toContain('满分卷');
    expect(p).toContain('10');
    expect(p).toContain('下一步');  // 引导 AI 给出"继续保持"建议
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- tests/lib/ai/report-prompt.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现 report-prompt**

```ts
// src/lib/ai/report-prompt.ts
export interface WrongQuestion {
  index: number;
  title: string;
  type: string;
  userAnswer: string;
  correctAnswer: string;
}

export interface ReportPromptOpts {
  quizTitle: string;
  score: number;
  totalScore: number;
  byType: Record<string, { total: number; correct: number; correctRate: number }>;
  wrongQuestions: WrongQuestion[];
}

export function buildReportPrompt(opts: ReportPromptOpts): string {
  const typeLines = Object.entries(opts.byType)
    .map(([t, s]) => `  - ${t}: ${s.correct}/${s.total} (${Math.round(s.correctRate * 100)}%)`)
    .join('\n');

  const wrongLines = opts.wrongQuestions.length > 0
    ? opts.wrongQuestions
        .map((w, i) =>
          `  ${i + 1}. [${w.type}] 第 ${w.index} 题: ${w.title}\n     学生答: ${w.userAnswer.slice(0, 100) || '(未作答)'}\n     参考: ${w.correctAnswer.slice(0, 100)}`,
        )
        .join('\n')
    : '  （无错题,满分）';

  return [
    '你是一位资深学习顾问。请基于以下答题数据,给出知识点分析与下一步学习建议。',
    '',
    '【试卷】',
    opts.quizTitle,
    '',
    '【本次得分】',
    `${opts.score} / ${opts.totalScore}`,
    '',
    '【按题型正确率】',
    typeLines || '  （无）',
    '',
    '【错题列表】',
    wrongLines,
    '',
    '【输出要求】',
    '严格输出 JSON,无多余文字:',
    '{',
    '  "knowledgePoints": [',
    '    { "tag": "知识点名", "relatedQuestions": [题号数组] },',
    '    ... 3~6 个',
    '  ],',
    '  "advice": "200~400 字 Markdown 文本,包含下一步应该学什么、学习路径建议、资源方向"',
    '}',
    '',
    '若无错题,knowledgePoints 给空数组,advice 给出保持性建议。',
  ].join('\n');
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- tests/lib/ai/report-prompt.test.ts
```

Expected: 3/3 通过。

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/report-prompt.ts tests/lib/ai/report-prompt.test.ts
git commit -m "feat(ai): add report prompt builder"
```

---

## Task 15: 报告 — 扣分与缓存模块

**Files:**
- Create: `src/lib/credits/report.ts`

- [ ] **Step 1: 实现**

```ts
// src/lib/credits/report.ts
import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { buildReportPrompt, WrongQuestion } from '@/lib/ai/report-prompt';

export const REPORT_COST = 5;

export class InsufficientCreditsForReportError extends Error {
  constructor(public required: number, public balance: number) {
    super('积分不足');
  }
}

/**
 * 生成(或复用)报告
 * - 缓存命中 → 直接返回,不再扣分
 * - 缓存未命中 → 扣 REPORT_COST 积分,调 AI,写 AIReport,失败回滚
 */
export async function generateReport(opts: {
  userId: string;
  resultId: string;
  quizTitle: string;
  score: number;
  totalScore: number;
  byType: Record<string, { total: number; correct: number; correctRate: number }>;
  wrongQuestions: WrongQuestion[];
}): Promise<{ content: any; cached: boolean; newBalance: number; costCredit: number }> {
  // 1) 缓存命中?
  const existing = await prisma.aIReport.findUnique({ where: { resultId: opts.resultId } });
  if (existing) {
    return {
      content: JSON.parse(existing.content),
      cached: true,
      newBalance: 0,  // 调用方不需要因为缓存而变化
      costCredit: 0,
    };
  }

  // 2) 扣分(事务)
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { credits: true },
  });
  if (!user || user.credits < REPORT_COST) {
    throw new InsufficientCreditsForReportError(REPORT_COST, user?.credits ?? 0);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: opts.userId },
      data: { credits: { decrement: REPORT_COST } },
    });
    await tx.creditLedger.create({
      data: {
        userId: opts.userId,
        delta: -REPORT_COST,
        reason: 'ai_report',
        refId: opts.resultId,
        balance: user.credits - REPORT_COST,
      },
    });
  });

  // 3) 调 AI
  let content: any;
  try {
    const provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
    if (!provider) throw new Error('没有激活的 AI 厂商');
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const prompt = buildReportPrompt({
      quizTitle: opts.quizTitle,
      score: opts.score,
      totalScore: opts.totalScore,
      byType: opts.byType,
      wrongQuestions: opts.wrongQuestions,
    });
    const raw = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [{ role: 'system', content: prompt }],
      jsonMode: true,
      maxTokens: 1500,
      temperature: 0.5,
    });
    content = JSON.parse(raw);
    if (!content || typeof content.advice !== 'string' || !Array.isArray(content.knowledgePoints)) {
      throw new Error('AI 返回格式不正确');
    }
  } catch (e) {
    // 4) 失败回滚
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: opts.userId },
        data: { credits: { increment: REPORT_COST } },
      });
      await tx.creditLedger.create({
        data: {
          userId: opts.userId,
          delta: REPORT_COST,
          reason: 'refund',
          refId: opts.resultId,
          balance: user.credits,
        },
      });
    });
    throw e;
  }

  // 5) 写缓存
  const created = await prisma.aIReport.create({
    data: {
      resultId: opts.resultId,
      userId: opts.userId,
      content: JSON.stringify({ ...content, generatedAt: new Date().toISOString() }),
      costCredit: REPORT_COST,
    },
  });

  return {
    content,
    cached: false,
    newBalance: user.credits - REPORT_COST,
    costCredit: REPORT_COST,
  };
}
```

- [ ] **Step 2: 提交**

```bash
git add src/lib/credits/report.ts
git commit -m "feat(credits): report generation with cache + rollback"
```

---

## Task 16: 报告 — API 路由

**Files:**
- Create: `src/app/api/ai/report/route.ts`
- Create: `tests/api/ai-report.test.ts`

- [ ] **Step 1: 写测试**

```ts
// tests/api/ai-report.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    quizResult: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    aIReport: { findUnique: vi.fn(), create: vi.fn() },
    aIProviderConfig: { findFirst: vi.fn() },
    $transaction: vi.fn((fn: any) => fn({})),
  },
}));
vi.mock('@/lib/auth', () => ({
  verifyToken: vi.fn(),
  getTokenFromHeaders: vi.fn(),
}));
vi.mock('@/lib/ai/providers', () => ({ callChat: vi.fn() }));
vi.mock('@/lib/ai/crypto', () => ({ decryptApiKey: vi.fn(() => 'k') }));

import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { callChat } from '@/lib/ai/providers';
import { POST } from '@/app/api/ai/report/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTokenFromHeaders).mockImplementation((req: any) => {
    const h = req.headers.get('authorization');
    return h ? h.replace('Bearer ', '') : null;
  });
  vi.mocked(verifyToken).mockReturnValue({ userId: 'u1' } as any);
  // 默认用户积分足够
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ credits: 100 } as any);
  vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValue({
    baseURL: 'https://x', model: 'm', apiKeyCipher: 'c',
  } as any);
});

function buildReq(body: any): Request {
  return new Request('http://localhost/api/ai/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/report', () => {
  it('未登录返回 401', async () => {
    vi.mocked(verifyToken).mockReturnValue(null);
    const req = new Request('http://localhost/api/ai/report', {
      method: 'POST',
      body: JSON.stringify({ resultId: 'r1' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('积分不足返回 400(由 handler 捕获)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ credits: 0 } as any);
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValue({
      id: 'r1', userId: 'u1', quizId: 'q1', score: 0, totalScore: 10,
      results: JSON.stringify([]),
    } as any);
    const req = buildReq({ resultId: 'r1' });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.required).toBe(5);
    expect(data.balance).toBe(0);
  });

  it('缓存命中直接返回,不调 AI', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValue({
      id: 'r1', userId: 'u1', quizId: 'q1',
      results: JSON.stringify([]),
    } as any);
    vi.mocked(prisma.aIReport.findUnique).mockResolvedValue({
      content: JSON.stringify({ knowledgePoints: [{ tag: 'a', relatedQuestions: [1] }], advice: 'hi' }),
    } as any);
    const req = buildReq({ resultId: 'r1' });
    const res = await POST(req as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.cached).toBe(true);
    expect(callChat).not.toHaveBeenCalled();
  });

  it('成功生成返回 content + newBalance', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValue({
      id: 'r1', userId: 'u1', quizId: 'q1',
      results: JSON.stringify([]),
    } as any);
    vi.mocked(prisma.aIReport.findUnique).mockResolvedValue(null);
    vi.mocked(callChat).mockResolvedValueOnce(
      JSON.stringify({ knowledgePoints: [], advice: 'study harder' }),
    );
    const req = buildReq({ resultId: 'r1' });
    const res = await POST(req as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.cached).toBe(false);
    expect(data.newBalance).toBe(95);
    expect(data.costCredit).toBe(5);
  });

  it('非本人结果返回 404', async () => {
    vi.mocked(prisma.quizResult.findUnique).mockResolvedValue({
      id: 'r1', userId: 'other', quizId: 'q1', results: '[]',
    } as any);
    const req = buildReq({ resultId: 'r1' });
    const res = await POST(req as any);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- tests/api/ai-report.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现路由**

```ts
// src/app/api/ai/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import {
  generateReport,
  REPORT_COST,
  InsufficientCreditsForReportError,
} from '@/lib/credits/report';

export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  if (!payload) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.resultId) return NextResponse.json({ error: '缺少 resultId' }, { status: 400 });

  const result = await prisma.quizResult.findUnique({ where: { id: body.resultId } });
  if (!result || result.userId !== payload.userId) {
    return NextResponse.json({ error: '结果不存在' }, { status: 404 });
  }

  // 计算 byType + wrongQuestions(从 result + quiz 读)
  const quiz = await prisma.quiz.findUnique({ where: { id: result.quizId } });
  const questions = JSON.parse(quiz?.questions ?? '[]');
  const items = JSON.parse(result.results || '[]');
  const byType: Record<string, { total: number; correct: number; correctRate: number }> = {};
  const wrongQuestions: any[] = [];
  items.forEach((r: any, i: number) => {
    const q = questions.find((qq: any) => qq.id === r.questionId);
    if (!q) return;
    if (!byType[q.type]) byType[q.type] = { total: 0, correct: 0, correctRate: 0 };
    byType[q.type].total += 1;
    if (r.correct) byType[q.type].correct += 1;
    if (!r.correct && r.userAnswer) {
      wrongQuestions.push({
        index: i + 1,
        title: q.title,
        type: q.type,
        userAnswer: r.userAnswer,
        correctAnswer: r.correctAnswer ?? '',
      });
    }
  });
  for (const k of Object.keys(byType)) {
    const t = byType[k];
    t.correctRate = t.total > 0 ? t.correct / t.total : 0;
  }

  try {
    const gen = await generateReport({
      userId: payload.userId,
      resultId: result.id,
      quizTitle: quiz?.title ?? '',
      score: result.score,
      totalScore: result.totalScore,
      byType,
      wrongQuestions,
    });
    return NextResponse.json({
      content: gen.content,
      cached: gen.cached,
      newBalance: gen.newBalance,
      costCredit: gen.costCredit,
    });
  } catch (e: any) {
    if (e instanceof InsufficientCreditsForReportError) {
      return NextResponse.json(
        { error: '积分不足', required: REPORT_COST, balance: e.balance },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: e?.message ?? '生成失败' }, { status: 502 });
  }
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- tests/api/ai-report.test.ts
```

Expected: 5/5 通过。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/ai/report/route.ts tests/api/ai-report.test.ts
git commit -m "feat(report): AI report endpoint with credit deduction + cache"
```

---

## Task 17: 报告页 — ReportBarChart 组件

**Files:**
- Create: `src/components/ReportBarChart.tsx`

- [ ] **Step 1: 实现**

```tsx
// src/components/ReportBarChart.tsx
'use client';

export interface BarItem {
  label: string;
  value: number;        // 0~1
  display: string;      // 例 "3/4 (75%)"
}

export default function ReportBarChart({ items }: { items: BarItem[] }) {
  if (items.length === 0) {
    return <div className="text-[12px] text-slate-400 italic">（无数据）</div>;
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3 text-[12px]">
          <span className="w-16 text-slate-500 flex-shrink-0">{it.label}</span>
          <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
            <div
              className={`h-full transition-all ${
                it.value >= 0.8
                  ? 'bg-gradient-to-r from-emerald-300 to-emerald-400'
                  : it.value >= 0.5
                  ? 'bg-gradient-to-r from-sky-300 to-sky-400'
                  : 'bg-gradient-to-r from-rose-300 to-rose-400'
              }`}
              style={{ width: `${Math.round(it.value * 100)}%` }}
            />
          </div>
          <span className="w-24 text-slate-600 text-right font-mono flex-shrink-0">
            {it.display}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/ReportBarChart.tsx
git commit -m "feat(report): add simple bar chart component"
```

---

## Task 18: 报告页 — ReportView 组件

**Files:**
- Create: `src/components/ReportView.tsx`
- Create: `tests/components/report-view.test.tsx`

- [ ] **Step 1: 写测试**

```tsx
// tests/components/report-view.test.tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportView from '@/components/ReportView';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('无 AI 报告时显示「生成报告」按钮', () => {
    render(<ReportView resultId="r1" stats={{ overview: { score: 5, totalScore: 10, correctRate: 0.5, correctCount: 5, wrongCount: 5, unansweredCount: 0 }, byType: {}, byDifficulty: { noDifficultyCount: 0 } }} quizTitle="测试" />);
    expect(screen.getByText(/AI 生成报告/)).toBeTruthy();
  });

  it('有 cached report 时直接显示 advice + knowledgePoints', () => {
    render(
      <ReportView
        resultId="r1"
        stats={{ overview: { score: 5, totalScore: 10, correctRate: 0.5, correctCount: 5, wrongCount: 5, unansweredCount: 0 }, byType: {}, byDifficulty: { noDifficultyCount: 0 } }}
        quizTitle="测试"
        initialReport={{ knowledgePoints: [{ tag: '闭包', relatedQuestions: [1] }], advice: '学学闭包' }}
      />,
    );
    expect(screen.getByText('闭包')).toBeTruthy();
    expect(screen.getByText(/学学闭包/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- tests/components/report-view.test.tsx
```

Expected: FAIL。

- [ ] **Step 3: 实现 ReportView**

```tsx
// src/components/ReportView.tsx
'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ReportStats } from '@/lib/report/calculator';
import ReportBarChart from '@/components/ReportBarChart';
import MarkdownView from '@/components/MarkdownView';

interface AIReportContent {
  knowledgePoints: { tag: string; relatedQuestions: number[] }[];
  advice: string;
  generatedAt?: string;
}

export default function ReportView({
  resultId,
  stats,
  quizTitle,
  initialReport,
}: {
  resultId: string;
  stats: ReportStats;
  quizTitle: string;
  initialReport?: AIReportContent;
}) {
  const { token } = useAuth();
  const [report, setReport] = useState<AIReportContent | undefined>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState<number | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resultId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.required && data.balance != null) {
          setError(`积分不足:需要 ${data.required},当前 ${data.balance}`);
        } else {
          setError(data.error ?? '生成失败');
        }
        return;
      }
      setReport(data.content);
      setNewBalance(data.newBalance);
    } catch (e: any) {
      setError(e?.message ?? '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const typeItems = Object.entries(stats.byType).map(([t, v]) => ({
    label: t,
    value: v.correctRate,
    display: `${v.correct}/${v.total} (${Math.round(v.correctRate * 100)}%)`,
  }));
  const diffItems = (['简单', '中等', '困难'] as const)
    .filter(k => stats.byDifficulty[k])
    .map(k => {
      const v = stats.byDifficulty[k]!;
      return { label: k, value: v.correctRate, display: `${v.correct}/${v.total} (${Math.round(v.correctRate * 100)}%)` };
    });

  return (
    <div className="space-y-6">
      <h2 className="text-[22px] text-slate-800 font-semibold">📊 答题报告</h2>

      {/* 模块 1:总览 */}
      <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
        <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-3">
          总览 · {quizTitle}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-[10.5px] text-slate-400">得分</div>
            <div className="text-[24px] font-bold text-sky-500 tabular-nums">
              {stats.overview.score}<span className="text-slate-300 text-[16px]"> / {stats.overview.totalScore}</span>
            </div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-400">正确率</div>
            <div className="text-[24px] font-bold text-emerald-500 tabular-nums">
              {Math.round(stats.overview.correctRate * 100)}%
            </div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-400">对 / 错 / 未答</div>
            <div className="text-[16px] font-medium text-slate-700 tabular-nums">
              ✓ {stats.overview.correctCount} &nbsp; ✗ {stats.overview.wrongCount} &nbsp; ⊘ {stats.overview.unansweredCount}
            </div>
          </div>
        </div>
      </section>

      {/* 模块 2:题型维度 */}
      <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
        <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-3">
          按题型
        </h3>
        <ReportBarChart items={typeItems} />
      </section>

      {/* 模块 3:难度维度 */}
      {diffItems.length > 0 && (
        <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
          <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-3">
            按难度{stats.byDifficulty.noDifficultyCount > 0 ? ` (另有 ${stats.byDifficulty.noDifficultyCount} 题无难度标记)` : ''}
          </h3>
          <ReportBarChart items={diffItems} />
        </section>
      )}

      {/* 模块 4+5:知识点 + AI 建议 */}
      <section className="bg-white/80 border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400">
            AI 分析 · 知识点 + 建议(扣 5 积分)
          </h3>
          {!report && (
            <button
              onClick={generate}
              disabled={loading}
              className="px-3 py-1.5 bg-gradient-to-r from-sky-400 to-emerald-400 text-white text-[12px] rounded-lg hover:from-sky-500 hover:to-emerald-500 disabled:opacity-50"
            >
              {loading ? '生成中...' : '🔮 AI 生成报告'}
            </button>
          )}
        </div>
        {error && (
          <div className="text-[12px] text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
            {error}
          </div>
        )}
        {report && (
          <div className="space-y-4">
            {report.knowledgePoints.length > 0 && (
              <div>
                <div className="text-[12px] text-slate-500 mb-2">薄弱知识点</div>
                <div className="flex flex-wrap gap-2">
                  {report.knowledgePoints.map((kp, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[11.5px] rounded-md"
                      title={`相关题目: ${kp.relatedQuestions.join(', ')}`}
                    >
                      {kp.tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="text-[12px] text-slate-500 mb-2">下一步建议</div>
              <MarkdownView content={report.advice} size="base" />
            </div>
            {newBalance !== null && !report.generatedAt && (
              <div className="text-[11px] text-slate-400">
                本次扣 5 积分,剩余 {newBalance} 积分
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 跑测试**

```bash
npm test -- tests/components/report-view.test.tsx
```

Expected: 2/2 通过。

- [ ] **Step 5: 提交**

```bash
git add src/components/ReportView.tsx tests/components/report-view.test.tsx
git commit -m "feat(report): ReportView component with stats + AI section"
```

---

## Task 19: 报告页路由

**Files:**
- Create: `src/app/result/[id]/report/page.tsx`

- [ ] **Step 1: 实现**

```tsx
// src/app/result/[id]/report/page.tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { calcReportStats, ReportStats } from '@/lib/report/calculator';
import ReportView from '@/components/ReportView';

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const resultId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    quizTitle: string;
    stats: ReportStats;
    initialReport?: any;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/result-detail?id=${resultId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        // 如该接口不存在,降级到 /api/results 查找
        if (!res.ok) {
          const fallback = await fetch(`/api/results`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!fallback.ok) throw new Error('无法加载结果');
          const all = await fallback.json();
          const found = (all.results ?? []).find((r: any) => r.id === resultId);
          if (!found) throw new Error('结果不存在');
          // 还需要拉 quiz 数据
          const quizRes = await fetch(`/api/quizzes/${found.quizId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const quizData = await quizRes.json();
          // 防御性 parse
          if (typeof found.results === 'string') {
            try { found.results = JSON.parse(found.results); } catch { found.results = []; }
          }
          const stats = calcReportStats({
            totalScore: found.score,
            results: found.results ?? [],
            questions: quizData.quiz?.questions ?? [],
          });
          if (!cancelled) setData({ quizTitle: quizData.quiz?.title ?? '', stats });
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        const stats = calcReportStats({
          totalScore: json.result.score,
          results: json.result.results ?? [],
          questions: json.questions ?? [],
        });
        setData({
          quizTitle: json.quizTitle ?? '',
          stats,
          initialReport: json.report?.content
            ? (typeof json.report.content === 'string' ? JSON.parse(json.report.content) : json.report.content)
            : undefined,
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [resultId, token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-rose-500 mb-3">{error}</div>
          <button onClick={() => router.push('/')} className="text-sky-500 underline">返回首页</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 pb-12">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] text-slate-500 hover:text-slate-800 hover:bg-white/70 rounded-lg transition-all mb-4"
        >
          ← 返回
        </button>
        <ReportView
          resultId={resultId}
          stats={data.stats}
          quizTitle={data.quizTitle}
          initialReport={data.initialReport}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 跑测试**

```bash
npm test
```

Expected: 全通过。

- [ ] **Step 3: 提交**

```bash
git add src/app/result/[id]/report/page.tsx
git commit -m "feat(report): report detail page"
```

---

## Task 20: 端到端验证 — 跑全部测试 + 类型检查

**Files:** N/A(验证任务)

- [ ] **Step 1: 类型检查**

```bash
npx tsc --noEmit
```

Expected: 0 错误。

- [ ] **Step 2: 跑全部测试**

```bash
npm test
```

Expected: 全通过(原有 200 + 新增 ~22 = ~222)。

- [ ] **Step 3: 手动验证清单(在 dev server 上)**

```bash
npm run dev
```

打开 `http://localhost:3000`,逐项验证:
1. 上传题目时勾选「60 分钟」→ 答题页显示倒计时,5min/1min 时弹 toast,归零自动提交
2. 同一题重答 2 次 → 顶部条「📚 2 次」切换器显示,下拉里 2 条历史
3. 提交含主观题的题目 → AnswerSheet 显示 AI 评语
4. Admin 账号登录,在用户答卷页给主观题打 0.8 分 → 总分增加 0.8
5. 在答卷页点「📊 查看报告」→ 报告页加载,前 3 个模块显示数据
6. 点「🔮 AI 生成报告」→ 扣 5 积分,显示知识点 + 建议

- [ ] **Step 4: 提交(若有 lint 修复)**

```bash
git add -u
git commit -m "chore: final lint and type fixes"
```

---

## Self-Review Checklist

✅ Spec coverage:
- 1 时间限制:Task 7(UploadForm + API)、Task 9(5min/1min toast)
- 2 AI 批阅:Task 2(prompt)、Task 5(集成)、Task 11 + 12(人工批阅 UI)
- 3 历史保留:Task 4 + 5(后端 dedup)、Task 8(切换器)
- 4 分析报告:Task 1(schema)、Task 13-16(后端)、Task 17-19(前端)

✅ Placeholder scan: 无 TBD/TODO/伪步骤。

✅ Type consistency: `manualScore`/`manualComment`/`manualGradedBy`/`manualGradedAt`/`aiComment` 在所有文件使用一致;`byType` / `byDifficulty` 与 calculator 类型一致。

✅ Schema migration: Task 1 单独处理,新增 `AIReport` + `CreditReason.ai_report`。

---

## 预计总耗时

| Task | 描述 | 估时 |
|------|------|------|
| 1 | DB 迁移 | 5min |
| 2 | AI 批阅 prompt | 5min |
| 3 | checker 备注 | 1min |
| 4 | dedup helper | 5min |
| 5 | results API 拆 + AI 触发 | 15min |
| 6 | AnswerSheet 顶部按钮 | 3min |
| 7 | UploadForm timeLimit | 10min |
| 8 | HistorySwitcher | 15min |
| 9 | 5min/1min toast | 5min |
| 10 | 人工批阅 API | 15min |
| 11 | ManualGradePanel | 15min |
| 12 | AnswerSheet 集成 | 5min |
| 13 | 报告 calculator | 10min |
| 14 | 报告 prompt | 5min |
| 15 | 报告 credits | 10min |
| 16 | 报告 API | 10min |
| 17 | 柱状图 | 5min |
| 18 | ReportView | 15min |
| 19 | 报告页路由 | 10min |
| 20 | 端到端验证 | 10min |
| **合计** | | **~180min** |

---

## 执行模式

**Plan complete and saved to `docs/superpowers/plans/2026-07-24-time-limit-grade-history-report.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 每个 Task 派遣独立 subagent,带 spec + 代码两层审阅,迭代最快

**2. Inline Execution** - 在当前会话顺序执行,带 checkpoint 检查点

**选哪种?**