# AI 重新生成 + 记录/笔记导出 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 HomeWork-AI 补齐 AI 重新生成能力（评分/解析/报告，保持追问记录）与答题记录/笔记的 Markdown 导出能力。

**Architecture:** 后端给 4 个 AI 路由加 `force` 参数跳过缓存；新增 1 个记录导出聚合 API 和 1 个笔记批量删除 API。前端抽公共下载工具，新增 `ExportDialog` 勾选组件和两个 Markdown 生成器，改造记录页与笔记页。全部复用现有数据模型，不新增表。

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Prisma(MySQL) + React 19 + Tailwind 4 + vitest + jszip。

**规格文档:** `docs/superpowers/specs/2026-08-14-ai-regenerate-and-export-design.md`

## Global Constraints

- 语言：所有用户可见文案、commit message、注释均为中文；代码标识符用英文。
- commit 规范：`feat:` / `fix:` / `chore:` / `docs:` / `test:` 前缀。
- 重新生成同首次扣积分，点击前必须 `useDialog().confirm` 二次确认（文案标明扣分）。
- 重新解析/评分/报告**绝不**触碰 `AIFollowUp` 表。
- 导出格式固定为 Markdown（`.md`）；批量导出用 `jszip` 打包 `.zip`。
- 无新增 npm 依赖（`jszip` 已在 `dependencies`）。
- 鉴权统一走 `getTokenFromHeaders` + `verifyToken`，越权返回 403。
- 纯函数（`result-to-markdown` / `notes-to-markdown`）必须 TDD，先写失败测试。

## File Structure

**共享基础设施**
- `src/lib/download.ts`（新建）：`sanitizeFilename` / `downloadBlob` / `downloadMarkdown` / `downloadZip`
- `tests/setup.ts`（新建）：vitest 空 setup（`vitest.config.ts` 已引用）

**需求 1：AI 重新生成**
- `src/lib/credits/explain.ts`（改）：`explainQuestion` 加 `force`
- `src/app/api/ai/explain/route.ts`（改）：透传 `force`
- `src/app/api/ai/report/route.ts`（改）：`force` 跳过缓存 + `upsert`
- `src/app/api/ai/interview-report/route.ts`（改）：`force` 跳过缓存 + `upsert`
- `src/components/AIExplainPanel.tsx`（改）：重新解析按钮
- `src/components/AnswerSheet.tsx`（改）：重新评分按钮
- `src/components/ReportView.tsx`（改）：重新生成报告按钮

**需求 2：记录导出**
- `src/app/api/export/result/[id]/route.ts`（新建）：聚合 API
- `src/lib/result-to-markdown.ts`（新建）+ `tests/result-to-markdown.test.ts`
- `src/components/ExportDialog.tsx`（新建）：内容勾选
- `src/components/RecordDetailDrawer.tsx`（改）：单条导出入口
- `src/app/records/page.tsx`（改）：批量导出

**需求 3：笔记 UI + 导出**
- `src/app/api/notes/batch-delete/route.ts`（新建）：批量删除
- `src/lib/notes-to-markdown.ts`（新建）+ `tests/notes-to-markdown.test.ts`
- `src/app/notes/page.tsx`（改）：批量选择/删除、筛选/分组、视觉升级、导出

---

### Task 1: 下载工具 + 测试基础设施

**Files:**
- Create: `src/lib/download.ts`
- Create: `tests/setup.ts`

**Interfaces:**
- Consumes: 无（`jszip` 来自 `dependencies`）
- Produces: `sanitizeFilename(name: string): string`、`downloadBlob(data: string | Blob, filename: string, mime: string): void`、`downloadMarkdown(filename: string, content: string): void`、`downloadZip(filename: string, files: { name: string; content: string }[]): Promise<void>` —— 供 Task 11/12/15 使用。

- [ ] **Step 1: 创建 `tests/setup.ts`**

`vitest.config.ts` 已引用 `./tests/setup.ts`，目录被清理过，需重建。内容为空文件加注释：

```ts
// vitest 全局 setup（当前无额外初始化）
export {};
```

- [ ] **Step 2: 创建 `src/lib/download.ts`**

从 `src/app/banks/page.tsx` 抽公共下载逻辑：

```ts
'use client';

import JSZip from 'jszip';

/** 清理文件名中的非法字符 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || '导出';
}

/** 触发浏览器下载 Blob */
export function downloadBlob(data: string | Blob, filename: string, mime: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 下载单个 Markdown 文件 */
export function downloadMarkdown(filename: string, content: string) {
  downloadBlob(content, `${sanitizeFilename(filename)}.md`, 'text/markdown');
}

/** 打包多个 Markdown 文件为 zip 并下载 */
export async function downloadZip(filename: string, files: { name: string; content: string }[]) {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(`${sanitizeFilename(f.name)}.md`, f.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${sanitizeFilename(filename)}.zip`, 'application/zip');
}
```

- [ ] **Step 3: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错（`jszip` 有类型定义）。

- [ ] **Step 4: Commit**

```bash
git add src/lib/download.ts tests/setup.ts
git commit -m "feat: 抽取公共下载工具(downloadMarkdown/downloadZip)"
```

---

### Task 2: AI 解析支持强制重新生成（后端）

**Files:**
- Modify: `src/lib/credits/explain.ts`
- Modify: `src/app/api/ai/explain/route.ts`

**Interfaces:**
- Consumes: 无
- Produces: `explainQuestion(opts)` 新增可选 `force?: boolean`；`POST /api/ai/explain` body 新增 `force?: boolean`。

- [ ] **Step 1: 修改 `src/lib/credits/explain.ts`**

给 `explainQuestion` 的 `opts` 类型加 `force?: boolean`，并在缓存查询处跳过：

在 `opts` 解构类型（约第 59-68 行）加 `force?: boolean;`。将第 69-88 行的缓存查询块包在 `if (!opts.force)` 内：

```ts
  const userAnswer = opts.userAnswer || '';
  if (!opts.force) {
    const cached = await prisma.aIExplanation.findFirst({
      where: { userId: opts.userId, questionId: opts.questionId, userAnswer },
      orderBy: { createdAt: 'desc' },
    });
    if (cached) {
      if (!cached.content?.trim()) {
        await prisma.aIExplanation.delete({ where: { id: cached.id } });
      } else {
        return {
          content: cached.content,
          cached: true,
          newBalance: await getBalance(opts.userId),
          costCredit: 0,
        };
      }
    }
  }
```

在写缓存（`prisma.aIExplanation.create`，约第 168 行）之前，`force` 时先删旧记录：

```ts
    if (opts.force) {
      await prisma.aIExplanation.deleteMany({
        where: { userId: opts.userId, questionId: opts.questionId, userAnswer },
      });
    }

    await prisma.aIExplanation.create({ ... });
```

- [ ] **Step 2: 修改 `src/app/api/ai/explain/route.ts`**

第 16 行解构加 `force`，第 22 行调用透传：

```ts
  const { questionId, content, type, userAnswer, correctAnswer, options, force } = body || {};
```

```ts
    const result = await explainQuestion({
      userId,
      questionId,
      questionContent: content,
      questionType: type,
      userAnswer,
      correctAnswer,
      options,
      force: !!force,
      signal: request.signal,
    });
```

- [ ] **Step 3: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add src/lib/credits/explain.ts src/app/api/ai/explain/route.ts
git commit -m "feat: AI 解析支持 force 强制重新生成"
```

---

### Task 3: 普通报告支持强制重新生成（后端）

**Files:**
- Modify: `src/app/api/ai/report/route.ts`

**Interfaces:**
- Consumes: 无
- Produces: `POST /api/ai/report` body 新增 `force?: boolean`。

- [ ] **Step 1: 修改 `src/app/api/ai/report/route.ts`**

第 52 行 `body` 解构处加 `force`（当前是 `if (!body?.resultId)`，改为显式取 `const { resultId, force } = body ?? {};` 并保留校验）。第 64-72 行的缓存命中块包在 `if (!force)` 内：

```ts
  const { resultId, force } = body ?? {};
  if (!resultId) {
    return NextResponse.json({ error: '缺少 resultId' }, { status: 400 });
  }
```

```ts
  // 1) 缓存命中 → 直接返回 JSON（force 时跳过）
  if (!force) {
    const existing = await prisma.aIReport.findUnique({ where: { resultId: result.id } });
    if (existing) {
      return NextResponse.json({ content: JSON.parse(existing.content), cached: true });
    }
  }
```

将第 269 行的 `prisma.aIReport.create` 改为 `upsert`（按 `resultId` 唯一）：

```ts
        await prisma.aIReport.upsert({
          where: { resultId: result.id },
          update: {
            userId: payload.userId,
            content: JSON.stringify({ ...content, generatedAt: new Date().toISOString() }),
            costCredit: REPORT_COST,
          },
          create: {
            resultId: result.id,
            userId: payload.userId,
            content: JSON.stringify({ ...content, generatedAt: new Date().toISOString() }),
            costCredit: REPORT_COST,
          },
        });
```

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/report/route.ts
git commit -m "feat: 普通报告支持 force 强制重新生成"
```

---

### Task 4: 面试报告支持强制重新生成（后端）

**Files:**
- Modify: `src/app/api/ai/interview-report/route.ts`

**Interfaces:**
- Consumes: 无
- Produces: `POST /api/ai/interview-report` body 新增 `force?: boolean`。

- [ ] **Step 1: 修改 `src/app/api/ai/interview-report/route.ts`**

第 93-97 行 body 解析处加 `force`：

```ts
  const body = await request.json().catch(() => null);
  const resultId: string | undefined = body?.resultId;
  const force: boolean = !!body?.force;
  if (!resultId || typeof resultId !== 'string') {
    return NextResponse.json({ error: '缺少 resultId' }, { status: 400 });
  }
```

第 111-120 行的缓存命中块包在 `if (!force)` 内：

```ts
  // ---- 3. 缓存命中 → 直接返回 JSON（force 时跳过） ----
  if (!force) {
    const existingReport = await prisma.aIReport.findUnique({ where: { resultId } });
    if (existingReport) {
      try {
        const cached = JSON.parse(existingReport.content);
        return NextResponse.json({ content: cached, cached: true, newBalance: null, costCredit: 0 });
      } catch {
        console.warn('面试报告缓存 JSON 解析失败，将重新生成');
      }
    }
  }
```

将第 489-502 行的 `prisma.aIReport.create`（含 `P2002` catch）替换为 `upsert`：

```ts
        await prisma.aIReport.upsert({
          where: { resultId },
          update: {
            userId: payload.userId,
            content: JSON.stringify({ ...content, generatedAt: new Date().toISOString() }),
            costCredit: INTERVIEW_REPORT_COST,
          },
          create: {
            resultId,
            userId: payload.userId,
            content: JSON.stringify({ ...content, generatedAt: new Date().toISOString() }),
            costCredit: INTERVIEW_REPORT_COST,
          },
        });
```

（删除原 `try { create } catch (saveErr: any) { if (code !== 'P2002') ... }` 结构，`upsert` 天然处理唯一冲突。）

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/interview-report/route.ts
git commit -m "feat: 面试报告支持 force 强制重新生成"
```

---

### Task 5: AI 解析面板加"重新解析"按钮

**Files:**
- Modify: `src/components/AIExplainPanel.tsx`

**Interfaces:**
- Consumes: `useDialog().confirm`（返回 `Promise<boolean>`）、`/api/ai/explain` 的 `force` 参数（Task 2）。
- Produces: 无对外新接口。

- [ ] **Step 1: 修改 `ask` 函数支持 force**

`ask` 改为接受 `force = false` 参数，body 带上 `force`（第 41-45 行附近）：

```ts
  const ask = async (force = false) => {
    if (!token) return;
    if (user?.isGuest) {
      await dialog.alert({ title: '游客受限', message: '游客功能暂未开通，请登录使用 AI 解析' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ questionId, content: questionContent, type: questionType, userAnswer, correctAnswer, options, force }),
      });
      // ...其余不变
```

错误分支里 `onClick={ask}` 改为 `onClick={() => ask()}`（保持原语义）。

- [ ] **Step 2: 在 `done` 状态加"重新解析"按钮**

在 `done` 分支（第 84-105 行）"AI 解析完成"那行右侧加按钮：

```tsx
  if (state.status === 'done') {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="text-[11px] text-emerald-600 flex items-center gap-1 justify-between">
          <span className="flex items-center gap-1">
            <span>✓</span>
            <span>AI 解析完成</span>
          </span>
          <button
            onClick={async () => {
              const ok = await dialog.confirm({
                title: '重新解析',
                message: '将重新生成 AI 解析并扣除对应积分，是否继续？',
                confirmText: '重新解析',
              });
              if (ok) ask(true);
            }}
            className="text-[11px] text-indigo-500 hover:text-indigo-700 underline"
          >
            🔄 重新解析
          </button>
        </div>
        {/* 原内容展示不变 */}
```

- [ ] **Step 3: 验证类型检查与构建**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add src/components/AIExplainPanel.tsx
git commit -m "feat: AI 解析面板加重新解析按钮"
```

---

### Task 6: 答题面板加"重新评分"按钮

**Files:**
- Modify: `src/components/AnswerSheet.tsx`

**Interfaces:**
- Consumes: `triggerGrade(questionId)`（本文件内已有）、`useDialog().confirm`。
- Produces: 无对外新接口。

- [ ] **Step 1: 加带确认的重新评分函数**

在 `triggerGrade` 附近新增（复用现有逻辑）：

```ts
  async function retriggerGrade(questionId: string) {
    const ok = await dialog.confirm({
      title: '重新评分',
      message: '将重新调用 AI 对该题评分，是否继续？',
      confirmText: '重新评分',
    });
    if (ok) await triggerGrade(questionId);
  }
```

- [ ] **Step 2: 在已评分结果卡片加按钮**

在 AI 评分 `done` 展示块（第 393-435 行 `if (typeof score === 'number')` 分支内，分数 `</span>` 之后）加按钮：

```tsx
                            <button
                              onClick={(e) => { e.stopPropagation(); retriggerGrade(q.id); }}
                              disabled={gradingQids.has(q.id)}
                              className="text-[11px] text-indigo-500 hover:text-indigo-700 underline disabled:opacity-50"
                            >
                              {gradingQids.has(q.id) ? '评分中…' : '🔄 重新评分'}
                            </button>
```

- [ ] **Step 3: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add src/components/AnswerSheet.tsx
git commit -m "feat: 答题面板加重新评分按钮"
```

---

### Task 7: 报告页加"重新生成报告"按钮

**Files:**
- Modify: `src/components/ReportView.tsx`

**Interfaces:**
- Consumes: 本文件 `generate()` / `generateInterviewReport()`（约第 83/166 行）、`/api/ai/report` 与 `/api/ai/interview-report` 的 `force`（Task 3/4）。
- Produces: 无对外新接口。

- [ ] **Step 1: 给两个生成函数加 force 参数**

`generate` 与 `generateInterviewReport` 改为 `async (force = false)`，body 加 `force`：

```ts
  const generate = async (force = false) => {
    ...
      const res = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resultId, force }),
      });
```

```ts
  const generateInterviewReport = async (force = false) => {
    ...
      const res = await fetch('/api/ai/interview-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resultId, force }),
      });
```

- [ ] **Step 2: 加重新生成按钮**

在报告已有内容（`report` 非空）且非加载态时，于导出报告按钮旁（第 411 行 `📥 导出报告` 附近）加按钮。确认用哪个生成函数：普通报告用 `generate(true)`，面试报告用 `generateInterviewReport(true)`（依据当前报告的来源/类型判断，若组件有 `reportType` prop 则用其区分，否则按是否存在面试字段判断——实现时以现有 props 为准）：

```tsx
  {report && (
    <button
      onClick={async () => {
        const ok = await dialog.confirm({
          title: '重新生成报告',
          message: '将重新生成报告并扣除对应积分，是否继续？',
          confirmText: '重新生成',
        });
        if (!ok) return;
        if (isInterview) await generateInterviewReport(true);
        else await generate(true);
      }}
      disabled={loading}
      className="text-sm text-indigo-600 hover:text-indigo-800 px-3 py-1 rounded-lg border border-indigo-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50"
    >
      🔄 重新生成报告
    </button>
  )}
```

- [ ] **Step 3: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add src/components/ReportView.tsx
git commit -m "feat: 报告页加重新生成报告按钮"
```

---

### Task 8: 记录导出聚合 API

**Files:**
- Create: `src/app/api/export/result/[id]/route.ts`

**Interfaces:**
- Consumes: `getTokenFromHeaders` / `verifyToken` / `updateUserActiveTime`（`@/lib/auth`）、`prisma`。
- Produces: `GET /api/export/result/[id]` 返回聚合 JSON（供 Task 11/12 使用）：

```ts
{
  result: { id, name, score, totalScore, status, submittedAt, items: ResultItem[] },
  quiz: { id, title, questions: Question[] },
  explanations: Record<string, { content: string; createdAt: string }[]>,
  followups: Record<string, { role: string; content: string; createdAt: string }[]>,
  notes: Note[],
  report: { knowledgePoints?: { tag: string; relatedQuestions: number[] }[]; advice?: string } | null
}
```

- [ ] **Step 1: 创建路由文件**

```ts
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken, updateUserActiveTime } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '无效的token' }, { status: 401 });

    await updateUserActiveTime(payload.userId);
    const { id } = await params;

    const result = await prisma.quizResult.findUnique({
      where: { id },
      include: { quiz: { select: { id: true, title: true, questions: true } } },
    });
    if (!result) return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    if (result.userId !== payload.userId) return NextResponse.json({ error: '无权访问' }, { status: 403 });

    let items: any[] = [];
    try { items = JSON.parse(result.results || '[]'); } catch { /* keep [] */ }
    let questions: any[] = [];
    try { questions = JSON.parse(result.quiz?.questions || '[]'); } catch { /* keep [] */ }

    const questionIds = questions.map((q: any) => q.id);

    const [explanations, followups, notes, report] = await Promise.all([
      prisma.aIExplanation.findMany({ where: { userId: payload.userId, questionId: { in: questionIds } } }),
      prisma.aIFollowUp.findMany({ where: { userId: payload.userId, questionId: { in: questionIds } }, orderBy: { createdAt: 'asc' } }),
      prisma.note.findMany({ where: { userId: payload.userId, OR: [{ resultId: id }, { quizId: result.quizId }] } }),
      prisma.aIReport.findUnique({ where: { resultId: id } }),
    ]);

    const explanationsByQ: Record<string, { content: string; createdAt: string }[]> = {};
    for (const e of explanations) {
      (explanationsByQ[e.questionId] ||= []).push({ content: e.content, createdAt: e.createdAt.toISOString() });
    }
    const followupsByQ: Record<string, { role: string; content: string; createdAt: string }[]> = {};
    for (const f of followups) {
      (followupsByQ[f.questionId] ||= []).push({ role: f.role, content: f.content, createdAt: f.createdAt.toISOString() });
    }

    let reportContent: any = null;
    if (report) {
      try { reportContent = JSON.parse(report.content); } catch { reportContent = null; }
    }

    return NextResponse.json({
      result: { id: result.id, name: result.name, score: result.score, totalScore: result.totalScore, status: result.status, submittedAt: result.submittedAt, items },
      quiz: { id: result.quizId, title: result.quiz?.title || '', questions },
      explanations: explanationsByQ,
      followups: followupsByQ,
      notes,
      report: reportContent,
    });
  } catch (error) {
    console.error('导出聚合错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/export/result/[id]/route.ts
git commit -m "feat: 新增记录导出聚合 API"
```

---

### Task 9: 记录 Markdown 生成器（TDD）

**Files:**
- Create: `src/lib/result-to-markdown.ts`
- Test: `tests/result-to-markdown.test.ts`

**Interfaces:**
- Consumes: `Question` / `Note` / `ResultItem` 类型（`@/types`），`getReferenceAnswer`（`@/lib/answer-sheet-helpers`）。
- Produces: `export type ExportSections = { question: boolean; userAnswer: boolean; correctAnswer: boolean; aiScore: boolean; aiExplain: boolean; notes: boolean; followups: boolean; report: boolean }`；`resultToMarkdown(opts): string` —— 供 Task 11/12 使用。

- [ ] **Step 1: 写失败测试**

创建 `tests/result-to-markdown.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resultToMarkdown, ALL_SECTIONS } from '@/lib/result-to-markdown';

const questions = [
  { id: 'q1', type: 'single', title: '1+1=?', options: ['1', '2'], difficulty: '简单', correctAnswer: 'B', referenceAnswer: '', answer: '' },
] as any;

const items = [
  { questionId: 'q1', correct: true, correctAnswer: 'B', userAnswer: 'B', autoGraded: true },
] as any;

describe('resultToMarkdown', () => {
  it('包含标题、得分与用户答案', () => {
    const md = resultToMarkdown({
      result: { name: '测试记录', score: 5, totalScore: 5, submittedAt: new Date('2026-08-14').toISOString(), items },
      quiz: { title: '测试题库', questions },
      explanations: {}, followups: {}, notes: [], report: null,
      sections: ALL_SECTIONS,
    });
    expect(md).toContain('# 测试记录');
    expect(md).toContain('5/5');
    expect(md).toContain('你的答案');
    expect(md).toContain('B');
  });

  it('sections 关闭后不输出对应块', () => {
    const md = resultToMarkdown({
      result: { name: 'r', score: 0, totalScore: 5, submittedAt: '', items },
      quiz: { title: 't', questions },
      explanations: {}, followups: {}, notes: [], report: null,
      sections: { question: true, userAnswer: false, correctAnswer: false, aiScore: false, aiExplain: false, notes: false, followups: false, report: false },
    });
    expect(md).not.toContain('你的答案');
    expect(md).toContain('1+1=?');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/result-to-markdown.test.ts`
Expected: FAIL，报"无法解析 `@/lib/result-to-markdown`"。

- [ ] **Step 3: 实现 `src/lib/result-to-markdown.ts`**

```ts
import type { Question, Note, ResultItem } from '@/types';
import { getReferenceAnswer } from '@/lib/answer-sheet-helpers';

export type ExportSections = {
  question: boolean;
  userAnswer: boolean;
  correctAnswer: boolean;
  aiScore: boolean;
  aiExplain: boolean;
  notes: boolean;
  followups: boolean;
  report: boolean;
};

export const ALL_SECTIONS: ExportSections = {
  question: true, userAnswer: true, correctAnswer: true, aiScore: true,
  aiExplain: true, notes: true, followups: true, report: true,
};

/** 格式化正确答案：客观题输出"字母. 选项文本"，主观题输出参考答案/解析 */
function formatCorrectAnswer(q: Question): string {
  const options = (q as any).options as string[] | undefined;
  if (options?.length) {
    const letters = String((q as any).correctAnswer ?? '')
      .split(/[,，]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const parts = letters.map((L) => {
      const idx = L.charCodeAt(0) - 65;
      const text = options[idx];
      return text != null ? `${L}. ${text}` : L;
    });
    return parts.join('；') || '（无）';
  }
  return getReferenceAnswer(q) || '（无）';
}

type ExplanationRec = { content: string; createdAt: string };
type FollowupRec = { role: string; content: string; createdAt: string };

export function resultToMarkdown(opts: {
  result: { name: string; score: number; totalScore: number; submittedAt: string; items: ResultItem[] };
  quiz: { title: string; questions: Question[] };
  explanations: Record<string, ExplanationRec[]>;
  followups: Record<string, FollowupRec[]>;
  notes: Note[];
  report: { knowledgePoints?: { tag: string; relatedQuestions: number[] }[]; advice?: string } | null;
  sections: ExportSections;
}): string {
  const { result, quiz, explanations, followups, notes, report, sections } = opts;
  const lines: string[] = [];

  lines.push(`# ${result.name}`);
  lines.push('');
  const meta = [`得分 ${result.score}/${result.totalScore}`];
  if (result.submittedAt) meta.push(`提交时间 ${result.submittedAt.slice(0, 19).replace('T', ' ')}`);
  lines.push(`> ${meta.join(' | ')}`);
  lines.push('');

  quiz.questions.forEach((q, i) => {
    const item = result.items.find((it) => it.questionId === q.id);
    lines.push(`## ${i + 1}. ${q.title}`);
    lines.push('');

    if (sections.question && q.options?.length) {
      lines.push('### 选项');
      lines.push('');
      (q as any).options.forEach((opt: string, idx: number) => {
        lines.push(`${String.fromCharCode(65 + idx)}. ${opt}`);
      });
      lines.push('');
    }

    if (sections.userAnswer) {
      lines.push('### 你的答案');
      lines.push('');
      lines.push(item?.userAnswer || '（未作答）');
      lines.push('');
    }

    if (sections.correctAnswer) {
      lines.push('### 正确答案');
      lines.push('');
      lines.push(formatCorrectAnswer(q));
      lines.push('');
    }

    if (sections.aiScore && typeof item?.interviewScore === 'number') {
      lines.push('### AI 评分');
      lines.push('');
      lines.push(`**${item.interviewScore}/100**`);
      const fb = item.interviewFeedback;
      if (fb?.strengths?.length) lines.push(`- 亮点：${fb.strengths.join('；')}`);
      if (fb?.weaknesses?.length) lines.push(`- 不足：${fb.weaknesses.join('；')}`);
      if (fb?.suggestion) lines.push(`- 建议：${fb.suggestion}`);
      lines.push('');
    }

    if (sections.aiExplain && explanations[q.id]?.length) {
      lines.push('### AI 解析');
      lines.push('');
      lines.push(explanations[q.id][explanations[q.id].length - 1].content);
      lines.push('');
    }

    if (sections.notes && notes.length) {
      const qNotes = notes.filter((n) => n.questionId === q.id);
      if (qNotes.length) {
        lines.push('### 笔记');
        lines.push('');
        qNotes.forEach((n) => lines.push(`- **${n.title}**：${n.content}`));
        lines.push('');
      }
    }

    if (sections.followups && followups[q.id]?.length) {
      lines.push('### 追问');
      lines.push('');
      followups[q.id].forEach((m) => lines.push(`${m.role === 'user' ? '**学生**' : '**AI**'}：${m.content}`));
      lines.push('');
    }
  });

  if (sections.report && report) {
    lines.push('## 答题报告');
    lines.push('');
    if (report.knowledgePoints?.length) {
      report.knowledgePoints.forEach((kp) => lines.push(`- **${kp.tag}**（相关题目 ${kp.relatedQuestions.join(', ')}）`));
      lines.push('');
    }
    if (report.advice) {
      lines.push(report.advice);
      lines.push('');
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/result-to-markdown.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/result-to-markdown.ts tests/result-to-markdown.test.ts
git commit -m "feat: 记录 Markdown 生成器(含内容勾选)"
```

---

### Task 10: 导出内容勾选组件

**Files:**
- Create: `src/components/ExportDialog.tsx`

**Interfaces:**
- Consumes: `ExportSections`（Task 9）、`useDialog` 之外的受控弹窗（用本组件自身 state + 遮罩）。
- Produces: `ExportDialog`，props `{ open: boolean; onClose: () => void; onConfirm: (sections: ExportSections) => void }` —— 供 Task 11/12 使用。

- [ ] **Step 1: 创建组件**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { ExportSections } from '@/lib/result-to-markdown';
import { ALL_SECTIONS } from '@/lib/result-to-markdown';

const OPTIONS: { key: keyof ExportSections; label: string }[] = [
  { key: 'question', label: '题目（题干+选项）' },
  { key: 'userAnswer', label: '你的答案' },
  { key: 'correctAnswer', label: '正确答案' },
  { key: 'aiScore', label: 'AI 评分' },
  { key: 'aiExplain', label: 'AI 解析' },
  { key: 'notes', label: '笔记' },
  { key: 'followups', label: '追问记录' },
  { key: 'report', label: '答题报告' },
];

export default function ExportDialog({ open, onClose, onConfirm }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (sections: ExportSections) => void;
}) {
  const [sections, setSections] = useState<ExportSections>({ ...ALL_SECTIONS });

  useEffect(() => {
    if (open) setSections({ ...ALL_SECTIONS });
  }, [open]);

  if (!open) return null;

  const toggle = (key: keyof ExportSections) => setSections((s) => ({ ...s, [key]: !s[key] }));
  const allChecked = OPTIONS.every((o) => sections[o.key]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-slate-800 mb-1">导出内容</h3>
        <p className="text-xs text-slate-400 mb-4">勾选要包含的内容</p>
        <div className="space-y-2 mb-4">
          {OPTIONS.map((o) => (
            <label key={o.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={sections[o.key]} onChange={() => toggle(o.key)} className="accent-indigo-600" />
              {o.label}
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setSections(allChecked ? { question: false, userAnswer: false, correctAnswer: false, aiScore: false, aiExplain: false, notes: false, followups: false, report: false } : { ...ALL_SECTIONS })}
            className="text-xs text-indigo-600 hover:underline"
          >
            {allChecked ? '全不选' : '全选'}
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">取消</button>
          <button onClick={() => onConfirm(sections)} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">导出</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git add src/components/ExportDialog.tsx
git commit -m "feat: 导出内容勾选组件"
```

---

### Task 11: 记录详情抽屉加导出入口

**Files:**
- Modify: `src/components/RecordDetailDrawer.tsx`

**Interfaces:**
- Consumes: `/api/export/result/[id]`（Task 8）、`resultToMarkdown`（Task 9）、`ExportDialog`（Task 10）、`downloadMarkdown`（Task 1）。
- Produces: 无对外新接口。

- [ ] **Step 1: 引入依赖与状态**

在文件顶部加 import，组件内加导出状态：

```tsx
import ExportDialog from '@/components/ExportDialog';
import { resultToMarkdown, type ExportSections } from '@/lib/result-to-markdown';
import { downloadMarkdown } from '@/lib/download';
```

```tsx
  const [exportOpen, setExportOpen] = useState(false);
```

- [ ] **Step 2: 加导出按钮与导出逻辑**

在头部栏"查看完整报告"按钮旁（第 120-127 行）加导出按钮：

```tsx
            {result?.id && (
              <button
                onClick={() => setExportOpen(true)}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-600 hover:bg-sky-100 transition-colors"
              >
                ⬇ 导出
              </button>
            )}
```

在组件返回末尾（`</>` 前）挂 `ExportDialog`，确认回调里拉数据并下载：

```tsx
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onConfirm={async (sections: ExportSections) => {
          setExportOpen(false);
          try {
            const res = await fetch(`/api/export/result/${resultId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error('导出数据加载失败');
            const data = await res.json();
            const md = resultToMarkdown({
              result: { name: data.result.name, score: data.result.score, totalScore: data.result.totalScore, submittedAt: data.result.submittedAt, items: data.result.items },
              quiz: data.quiz,
              explanations: data.explanations,
              followups: data.followups,
              notes: data.notes,
              report: data.report,
              sections,
            });
            downloadMarkdown(data.result.name, md);
          } catch {
            alert('导出失败，请重试');
          }
        }}
      />
```

- [ ] **Step 3: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
git add src/components/RecordDetailDrawer.tsx
git commit -m "feat: 记录详情抽屉加导出入口"
```

---

### Task 12: 记录列表页批量导出

**Files:**
- Modify: `src/app/records/page.tsx`

**Interfaces:**
- Consumes: `RecordSummary`（已有）、`/api/export/result/[id]`（Task 8）、`resultToMarkdown`（Task 9）、`ExportDialog`（Task 10）、`downloadZip`（Task 1）。
- Produces: 无对外新接口。

- [ ] **Step 1: 加多选与导出状态**

在 `RecordsContent` 内加状态与 import：

```tsx
import ExportDialog from '@/components/ExportDialog';
import { resultToMarkdown, type ExportSections } from '@/lib/result-to-markdown';
import { downloadZip } from '@/lib/download';
```

```tsx
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
```

- [ ] **Step 2: 加批量导出工具栏**

在顶部标题栏下方加工具栏（`selectMode` 时显示）：

```tsx
        {selectMode && (
          <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-white/70 border border-slate-200/60 rounded-xl">
            <span className="text-[12px] text-slate-600">已选 {selectedIds.size} 条</span>
            <button
              onClick={() => setSelectedIds(records.length === selectedIds.size ? new Set() : new Set(records.map((r) => r.id)))}
              className="text-[12px] text-sky-500 hover:underline"
            >
              {records.length === selectedIds.size ? '取消全选' : '全选'}
            </button>
            <button
              onClick={() => { if (selectedIds.size) setExportOpen(true); }}
              disabled={!selectedIds.size}
              className="text-[12px] text-indigo-600 hover:underline disabled:opacity-40"
            >
              批量导出
            </button>
            <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} className="text-[12px] text-slate-500 hover:underline ml-auto">
              退出多选
            </button>
          </div>
        )}
```

在排序栏附近加"进入多选"入口：

```tsx
        <button onClick={() => setSelectMode(true)} className="text-[12px] text-sky-500 hover:underline">批量导出</button>
```

- [ ] **Step 3: 卡片勾选 + 导出逻辑**

`RecordCard` 外层（`records.map` 里）根据 `selectMode` 包一个可点勾选的容器，或在卡片左上角加勾选框。简化做法：`selectMode` 时点卡片切换选中，并高亮：

```tsx
            {records.map((r) => (
              <div
                key={r.id}
                onClick={selectMode ? () => setSelectedIds((prev) => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; }) : undefined}
                className={selectMode ? `${selectedIds.has(r.id) ? 'ring-2 ring-indigo-400 rounded-lg' : ''} cursor-pointer` : ''}
              >
                <RecordCard
                  record={r}
                  onViewDetail={(id) => { router.push(`/records?id=${id}`); setDrawerOpen(true); }}
                  onDelete={handleDelete}
                />
              </div>
            ))}
```

挂 `ExportDialog`，确认回调并发拉取并打包：

```tsx
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onConfirm={async (sections: ExportSections) => {
          setExportOpen(false);
          setExporting(true);
          try {
            const files: { name: string; content: string }[] = [];
            await Promise.all([...selectedIds].map(async (id) => {
              const res = await fetch(`/api/export/result/${id}`, { headers: { Authorization: `Bearer ${token}` } });
              if (!res.ok) return;
              const data = await res.json();
              const md = resultToMarkdown({
                result: { name: data.result.name, score: data.result.score, totalScore: data.result.totalScore, submittedAt: data.result.submittedAt, items: data.result.items },
                quiz: data.quiz,
                explanations: data.explanations,
                followups: data.followups,
                notes: data.notes,
                report: data.report,
                sections,
              });
              files.push({ name: data.result.name, content: md });
            }));
            await downloadZip(`答题记录导出_${new Date().toISOString().slice(0, 10)}`, files);
          } finally {
            setExporting(false);
            setSelectMode(false);
            setSelectedIds(new Set());
          }
        }}
      />
```

- [ ] **Step 4: 验证类型检查与构建**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 5: Commit**

```bash
git add src/app/records/page.tsx
git commit -m "feat: 记录列表页批量导出"
```

---

### Task 13: 笔记批量删除 API

**Files:**
- Create: `src/app/api/notes/batch-delete/route.ts`

**Interfaces:**
- Consumes: `getTokenFromHeaders` / `verifyToken`（`@/lib/auth`）、`prisma`。
- Produces: `POST /api/notes/batch-delete`，body `{ ids: string[] }`，返回 `{ count: number }`。

- [ ] **Step 1: 创建路由**

```ts
import { NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '无效的token' }, { status: 401 });

    const { ids } = await request.json().catch(() => ({}));
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids 不能为空' }, { status: 400 });
    }

    const result = await prisma.note.deleteMany({
      where: { userId: payload.userId, id: { in: ids } },
    });

    return NextResponse.json({ count: result.count });
  } catch (error) {
    console.error('批量删除笔记错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: 验证类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notes/batch-delete/route.ts
git commit -m "feat: 笔记批量删除 API"
```

---

### Task 14: 笔记 Markdown 生成器（TDD）

**Files:**
- Create: `src/lib/notes-to-markdown.ts`
- Test: `tests/notes-to-markdown.test.ts`

**Interfaces:**
- Consumes: `Note` 类型（`@/types`）。
- Produces: `notesToMarkdown(notes: Note[]): string` —— 供 Task 15 使用。

- [ ] **Step 1: 写失败测试**

创建 `tests/notes-to-markdown.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { notesToMarkdown } from '@/lib/notes-to-markdown';

const note = {
  id: 'n1', userId: 'u1', type: 'answer', questionId: null, quizId: null, resultId: null,
  title: '我的笔记', content: '这是内容', source: 'manual', createdAt: 0, updatedAt: 0,
};

describe('notesToMarkdown', () => {
  it('包含标题与内容', () => {
    const md = notesToMarkdown([note as any]);
    expect(md).toContain('## 我的笔记');
    expect(md).toContain('这是内容');
  });

  it('多篇笔记之间用分隔线隔开', () => {
    const md = notesToMarkdown([note as any, { ...note, id: 'n2', title: '第二篇' } as any]);
    expect(md).toContain('---');
    expect(md).toContain('## 第二篇');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/notes-to-markdown.test.ts`
Expected: FAIL，报"无法解析 `@/lib/notes-to-markdown`"。

- [ ] **Step 3: 实现 `src/lib/notes-to-markdown.ts`**

```ts
import type { Note } from '@/types';

const TYPE_LABEL: Record<string, string> = { question: '题目笔记', answer: '答题笔记', ai_output: 'AI输出' };
const SOURCE_LABEL: Record<string, string> = { manual: '手动记录', ai_explain: 'AI解析', reference_answer: '标准答案', ai_report: 'AI报告' };

export function notesToMarkdown(notes: Note[]): string {
  const lines: string[] = [];
  lines.push('# 笔记导出');
  lines.push('');
  notes.forEach((n, i) => {
    if (i > 0) { lines.push(''); lines.push('---'); lines.push(''); }
    lines.push(`## ${n.title}`);
    lines.push('');
    const tags = [TYPE_LABEL[n.type] || n.type, SOURCE_LABEL[n.source] || n.source];
    lines.push(`> ${tags.join(' | ')}`);
    lines.push('');
    lines.push(n.content);
    lines.push('');
  });
  return lines.join('\n');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/notes-to-markdown.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/notes-to-markdown.ts tests/notes-to-markdown.test.ts
git commit -m "feat: 笔记 Markdown 生成器"
```

---

### Task 15: 笔记页 UI 优化 + 导出

**Files:**
- Modify: `src/app/notes/page.tsx`

**Interfaces:**
- Consumes: `/api/notes/batch-delete`（Task 13）、`notesToMarkdown`（Task 14）、`downloadMarkdown` / `downloadZip`（Task 1）。
- Produces: 无对外新接口。

- [ ] **Step 1: 加状态与 import**

在组件内加状态：

```tsx
import { downloadMarkdown, downloadZip } from '@/lib/download';
import { notesToMarkdown } from '@/lib/notes-to-markdown';
```

```tsx
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<NoteSource | 'all'>('all');
  const [groupByTime, setGroupByTime] = useState(false);
```

- [ ] **Step 2: 来源筛选 + 时间分组开关**

在筛选栏（第 150-171 行）加来源下拉和分组开关：

```tsx
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as NoteSource | 'all')}
          className="text-sm border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:border-indigo-400"
        >
          <option value="all">全部来源</option>
          <option value="manual">手动记录</option>
          <option value="ai_explain">AI解析</option>
          <option value="reference_answer">标准答案</option>
          <option value="ai_report">AI报告</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={groupByTime} onChange={(e) => setGroupByTime(e.target.checked)} className="accent-indigo-600" />
          按时间分组
        </label>
```

`filtered` 逻辑加来源过滤：

```tsx
  const filtered = notes.filter((n) => {
    if (filter !== 'all' && n.type !== filter) return false;
    if (sourceFilter !== 'all' && n.source !== sourceFilter) return false;
    if (search && !n.title.includes(search) && !n.content.includes(search)) return false;
    return true;
  });
```

- [ ] **Step 3: 多选模式 + 批量操作工具栏**

头部"新建笔记"旁加"多选"按钮；`selectMode` 时显示工具栏：

```tsx
        <button
          onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
          className="text-sm text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg border border-slate-200"
        >
          {selectMode ? '退出多选' : '多选'}
        </button>
```

```tsx
      {selectMode && (
        <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl">
          <span className="text-sm text-indigo-700">已选 {selectedIds.size} 条</span>
          <button
            onClick={() => setSelectedIds(filtered.length === selectedIds.size ? new Set() : new Set(filtered.map((n) => n.id)))}
            className="text-sm text-indigo-600 hover:underline"
          >
            {filtered.length === selectedIds.size ? '取消全选' : '全选'}
          </button>
          <button
            onClick={async () => {
              if (!selectedIds.size) return;
              const ok = confirm(`确定删除 ${selectedIds.size} 条笔记吗？`);
              if (!ok) return;
              await fetch('/api/notes/batch-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ids: [...selectedIds] }),
              });
              setSelectedIds(new Set());
              setSelectMode(false);
              await loadNotes();
            }}
            className="text-sm text-red-600 hover:underline"
          >
            批量删除
          </button>
          <button
            onClick={async () => {
              const chosen = notes.filter((n) => selectedIds.has(n.id));
              if (chosen.length === 0) return;
              if (chosen.length === 1) {
                downloadMarkdown(chosen[0].title, notesToMarkdown(chosen));
              } else {
                await downloadZip(`笔记导出_${new Date().toISOString().slice(0, 10)}`, chosen.map((n) => ({ name: n.title, content: notesToMarkdown([n]) })));
              }
            }}
            disabled={!selectedIds.size}
            className="text-sm text-indigo-600 hover:underline disabled:opacity-40"
          >
            导出
          </button>
        </div>
      )}
```

- [ ] **Step 4: 列表项加勾选框 + 时间分组渲染**

笔记列表项加勾选（`selectMode` 时），并实现时间分组（`groupByTime` 时按 `updatedAt` 归入「今天/昨天/近7天/更早」）：

```tsx
  function timeBucket(ts: number): string {
    const now = new Date();
    const d = new Date(ts);
    const dayMs = 24 * 60 * 60 * 1000;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfToday - startOfDay) / dayMs);
    if (diffDays <= 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays <= 7) return '近 7 天';
    return '更早';
  }
```

渲染时，`groupByTime` 则按 bucket 分组渲染，否则平铺；列表项在 `selectMode` 时显示勾选框并点击切换选中。

- [ ] **Step 5: 单条导出按钮**

在笔记详情区（`selected` 分支，第 248-278 行）的"编辑/删除"旁加导出：

```tsx
                  <button
                    onClick={() => downloadMarkdown(selected.title, notesToMarkdown([selected]))}
                    className="text-sm text-sky-600 hover:text-sky-800 px-3 py-1 rounded-lg hover:bg-sky-50 transition-colors"
                  >
                    ⬇ 导出
                  </button>
```

- [ ] **Step 6: 视觉升级（彩色标签）**

列表项类型标签改为彩色（第 192-196 行附近），用映射色：

```tsx
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                      note.type === 'question' ? 'bg-violet-50 text-violet-600' :
                      note.type === 'answer' ? 'bg-emerald-50 text-emerald-600' :
                      'bg-sky-50 text-sky-600'
                    }`}>
                      {typeLabels[note.type]}
                    </span>
```

- [ ] **Step 7: 验证类型检查与构建**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 8: Commit**

```bash
git add src/app/notes/page.tsx
git commit -m "feat: 笔记页批量管理/筛选分组/导出与视觉升级"
```

---

## 完成后的整体验证

- [ ] Run: `npx tsc --noEmit`（无报错）
- [ ] Run: `npm run lint`（无新增错误）
- [ ] Run: `npx vitest run`（两个测试文件通过）
- [ ] Run: `npm run build`（构建成功）
- [ ] 手动验证：
  1. 答题记录详情 → AI 解析完成后出现"重新解析"，点击弹确认框，确认后重新生成。
  2. 面试题评分后出现"重新评分"。
  3. 报告页出现"重新生成报告"，确认后重新生成（覆盖旧报告）。
  4. 记录详情导出：勾选内容 → 下载 `.md`，内容符合勾选。
  5. 记录列表批量导出：勾选多条 → 下载 `.zip`，解压后每条一个 `.md`。
  6. 笔记页：多选批量删除、来源筛选、时间分组、单条/批量导出。
  7. 重新解析/评分/报告后，追问记录仍在（未被清空）。
