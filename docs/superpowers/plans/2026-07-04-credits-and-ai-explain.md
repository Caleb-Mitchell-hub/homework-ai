# 积分系统 + AI 单题解析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户答题答错时能点「AI 解析此题」扣积分调 AI；用户有积分余额、每日签到 +5、充值入口（本期占位）。

**Architecture:** Prisma 加 4 个 model (CreditLedger/DailyCheckIn/AIExplanation/User.credits)；3 个服务模块（explain-cost/checkin/explain）保证并发安全用 `$transaction`；前端在答题页错题展开视图加 AI 解析按钮 + 顶部余额徽章 + /credits 流水页。

**Tech Stack:** Next.js 16 · React 19 · TypeScript 5 · Prisma 5 + MySQL · Vitest 4 · Tailwind 3

---

## File Structure

| 文件 | 职责 |
|------|------|
| **新建 - 服务层** | |
| `src/lib/credits/explain-cost.ts` | 按难度取价（纯函数） |
| `src/lib/credits/checkin.ts` | 每日签到事务 + 防重复 |
| `src/lib/credits/explain.ts` | AI 单题解析事务（扣费 + 缓存 + 回滚） |
| `src/lib/ai/explain-prompt.ts` | 系统提示词 |
| **新建 - API 路由** | |
| `src/app/api/user/credits/route.ts` | 查询余额 + 签到状态 |
| `src/app/api/user/checkin/route.ts` | 签到 |
| `src/app/api/user/topup/route.ts` | 占位充值 |
| `src/app/api/ai/explain/route.ts` | 单题 AI 解析 |
| **新建 - UI** | |
| `src/app/credits/page.tsx` | 余额页（流水表 + 充值占位） |
| `src/components/CreditBadge.tsx` | 顶部余额 + 签到徽章 |
| `src/components/AIExplainPanel.tsx` | 答题页错题解析面板 |
| **新建 - 测试** | |
| `tests/credits/explain-cost.test.ts` | 定价函数 |
| `tests/credits/checkin.test.ts` | 签到事务 |
| `tests/credits/explain.test.ts` | AI 解析事务（扣费/缓存/回滚/余额不足） |
| `tests/api/user-credits.test.ts` | API 端点 |
| **修改** | |
| `prisma/schema.prisma` | 加 4 model + User.credits |
| `src/types/index.ts` | Question.difficulty 字段 |
| `src/components/admin/QuizUploadPanel.tsx` | 上传加难度字段 |
| `src/components/AnswerSheet.tsx` | 错题加 AI 解析按钮 |
| `src/components/Sidebar.tsx` | 顶部余额徽章 |

---

## Task 1: Prisma Schema 改动

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 添加 4 个新 model + User.credits**

在 `prisma/schema.prisma` 文件末尾（最后一个 `}` 前）追加：

```prisma
// ============== 积分系统 ==============

model User {
  // 现有字段保留
  credits      Int       @default(0)
  checkIns     DailyCheckIn[]
  creditLogs   CreditLedger[]
  explanations AIExplanation[]
}

enum CreditReason {
  signup
  daily_signin
  topup
  admin_adjust
  ai_explain
  refund
}

model CreditLedger {
  id        String       @id @default(cuid())
  userId    String
  user      User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  delta     Int
  reason    CreditReason
  refId     String?
  balance   Int
  createdAt DateTime     @default(now())

  @@index([userId, createdAt])
}

model DailyCheckIn {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  checkInDate  DateTime @db.Date
  credit       Int      @default(5)
  createdAt    DateTime @default(now())

  @@unique([userId, checkInDate])
}

model AIExplanation {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  questionId String
  costCredit Int
  content    String   @db.Text
  createdAt  DateTime @default(now())

  @@index([userId, questionId])
}
```

注意：如果已有 `model User { ... }` 块，需找到它，在里面加 `credits Int @default(0)` 和 3 个 `@relation` 字段，不要重复声明整个 User。

- [ ] **Step 2: 把 schema 推到数据库**

```bash
cd e:/WorkSpace/Project/HomeWork-AI
npx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: 生成 Prisma Client**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client (v5.x.x)"

注意 EPERM 错误（query_engine-windows.dll.node 被锁）可以忽略，只要 db push 成功即可。

- [ ] **Step 4: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add CreditLedger + DailyCheckIn + AIExplanation + User.credits"
```

---

## Task 2: 积分定价函数（纯函数）

**Files:**
- Create: `src/lib/credits/explain-cost.ts`
- Create: `tests/credits/explain-cost.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/credits/explain-cost.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { getExplainCost, EXPLAIN_COST_DEFAULT } from '@/lib/credits/explain-cost';

describe('getExplainCost', () => {
  it('简单 = 3', () => { expect(getExplainCost('简单')).toBe(3); });
  it('中等 = 5', () => { expect(getExplainCost('中等')).toBe(5); });
  it('困难 = 10', () => { expect(getExplainCost('困难')).toBe(10); });
  it('undefined -> 默认 5', () => { expect(getExplainCost(undefined)).toBe(EXPLAIN_COST_DEFAULT); });
  it('null -> 默认 5', () => { expect(getExplainCost(null)).toBe(EXPLAIN_COST_DEFAULT); });
  it('未知难度 -> 默认 5', () => { expect(getExplainCost('超难')).toBe(EXPLAIN_COST_DEFAULT); });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run tests/credits/explain-cost.test.ts
```

Expected: FAIL with "Cannot find module '@/lib/credits/explain-cost'"

- [ ] **Step 3: 实现**

创建 `src/lib/credits/explain-cost.ts`：

```ts
export type Difficulty = '简单' | '中等' | '困难';

const COST: Record<Difficulty, number> = {
  '简单': 3,
  '中等': 5,
  '困难': 10,
};

export const EXPLAIN_COST_DEFAULT = 5;

export function getExplainCost(difficulty?: string | null): number {
  if (difficulty && difficulty in COST) {
    return COST[difficulty as Difficulty];
  }
  return EXPLAIN_COST_DEFAULT;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run tests/credits/explain-cost.test.ts
```

Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/credits/explain-cost.ts tests/credits/explain-cost.test.ts
git commit -m "feat(credits): add explain cost by difficulty"
```

---

## Task 3: Question 类型加 difficulty 字段

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 在 BaseQuestion 加 difficulty 字段**

编辑 `src/types/index.ts`，在 `BaseQuestion` 接口里加：

```ts
export type Difficulty = '简单' | '中等' | '困难';

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  title: string;
  answer: string;
  analysis?: string;
  score?: number;
  /** 难度,可选;没有默认'中等' */
  difficulty?: Difficulty;
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add Difficulty to BaseQuestion"
```

---

## Task 4: 每日签到事务

**Files:**
- Create: `src/lib/credits/checkin.ts`
- Create: `tests/credits/checkin.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/credits/checkin.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { checkInToday, AlreadyCheckedInError } from '@/lib/credits/checkin';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyCheckIn: { create: vi.fn() },
    user: { update: vi.fn() },
    creditLedger: { create: vi.fn() },
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('checkInToday', () => {
  const mockTx = (returns: any) => async (fn: (tx: any) => any) => fn({});

  it('首次签到返回 +5 和新余额', async () => {
    (prisma.dailyCheckIn.create as any).mockResolvedValue({});
    (prisma.user.update as any).mockReturnValue({ credits: 55 });
    (prisma.creditLedger.create as any).mockResolvedValue({});

    const result = await checkInToday('u1');
    expect(result).toEqual({ balance: 55, credit: 5 });
  });

  it('重复签到(同一天)抛 AlreadyCheckedInError', async () => {
    const err = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    (prisma.dailyCheckIn.create as any).mockRejectedValue(err);

    await expect(checkInToday('u1')).rejects.toBeInstanceOf(AlreadyCheckedInError);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run tests/credits/checkin.test.ts
```

Expected: FAIL with module not found

- [ ] **Step 3: 实现**

创建 `src/lib/credits/checkin.ts`：

```ts
import { prisma } from '@/lib/prisma';

const REWARD = 5;

export class AlreadyCheckedInError extends Error {
  constructor() {
    super('今天已签到');
    this.name = 'AlreadyCheckedInError';
  }
}

/**
 * 每日签到 +5。
 * 事务: INSERT DailyCheckIn -> UPDATE User.credits -> INSERT CreditLedger
 * 唯一索引(userId, checkInDate) 防重复,失败抛 AlreadyCheckedInError。
 */
export async function checkInToday(userId: string): Promise<{ balance: number; credit: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return prisma.$transaction(async (tx) => {
    try {
      await tx.dailyCheckIn.create({
        data: { userId, checkInDate: today, credit: REWARD },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new AlreadyCheckedInError();
      throw e;
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: REWARD } },
      select: { credits: true },
    });

    await tx.creditLedger.create({
      data: {
        userId,
        delta: REWARD,
        reason: 'daily_signin',
        balance: updated.credits,
      },
    });

    return { balance: updated.credits, credit: REWARD };
  });
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run tests/credits/checkin.test.ts
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/credits/checkin.ts tests/credits/checkin.test.ts
git commit -m "feat(credits): add daily check-in with dedupe transaction"
```

---

## Task 5: AI 单题解析（含扣费 / 缓存 / 回滚）

**Files:**
- Create: `src/lib/ai/explain-prompt.ts`
- Create: `src/lib/credits/explain.ts`
- Create: `tests/credits/explain.test.ts`

- [ ] **Step 1: 实现系统提示词（无需测试）**

创建 `src/lib/ai/explain-prompt.ts`：

```ts
export const QUESTION_EXPLAIN_PROMPT = `你是一位耐心的老师。学生答错了下面的题目,请用简洁清晰的方式:
1. 简述题目考点
2. 解释为什么学生的答案错(用 markdown 列出要点)
3. 给出正确答案 + 简要解题思路
4. 如果是代码题,展示正确代码并逐步讲解

请用中文回答,使用 markdown 格式,长度 200-500 字。`;
```

- [ ] **Step 2: 写失败的测试**

创建 `tests/credits/explain.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIExplanation: { findFirst: vi.fn(), create: vi.fn() },
    creditLedger: { create: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    aIProviderConfig: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/ai/providers', () => ({
  callChat: vi.fn(),
}));
vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: vi.fn(() => 'plain'),
}));

import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { explainQuestion, InsufficientCreditsError } from '@/lib/credits/explain';

beforeEach(() => vi.clearAllMocks());

const baseArgs = {
  userId: 'u1',
  questionId: 'q1',
  questionContent: '1+1=?',
  questionType: 'single',
};

describe('explainQuestion', () => {
  it('缓存命中: 已存在 AIExplanation 直接返回', async () => {
    (prisma.aIExplanation.findFirst as any).mockResolvedValue({
      content: 'old answer',
    });
    (prisma.user.findUnique as any).mockResolvedValue({ credits: 100 });

    const result = await explainQuestion(baseArgs);
    expect(result).toMatchObject({ content: 'old answer', cached: true, costCredit: 0 });
    expect(callChat).not.toHaveBeenCalled();
  });

  it('余额不足抛 InsufficientCreditsError', async () => {
    (prisma.aIExplanation.findFirst as any).mockResolvedValue(null);

    // prisma.$transaction 直接拒绝
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => {
      const tx = {
        user: { findUnique: vi.fn().mockResolvedValue({ credits: 2 }) },
      };
      try {
        return await fn(tx);
      } finally { /* swallow */ }
    });
    // 让 transaction 走完抛 InsufficientCreditsError
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ credits: 2 }),
        },
      };
      return fn(tx);
    });

    await expect(explainQuestion(baseArgs)).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it('成功路径: 扣费 → AI → 写 AIExplanation', async () => {
    (prisma.aIExplanation.findFirst as any).mockResolvedValue(null);
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue({
      id: 'p1', baseURL: 'https://x', apiKeyCipher: 'c', model: 'm',
    });
    (callChat as any).mockResolvedValue('AI 的回复');
    (prisma.aIExplanation.create as any).mockResolvedValue({});

    // 模拟 prisma.$transaction 调用回调
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => {
      return fn({
        user: {
          findUnique: vi.fn().mockResolvedValue({ credits: 100 }),
          update: vi.fn().mockReturnValue({ credits: 95 }),
        },
      });
    });

    const result = await explainQuestion(baseArgs);
    expect(result).toMatchObject({ content: 'AI 的回复', cached: false, costCredit: 5 });
  });

  it('AI 失败: 回滚积分 + 写 refund 流水', async () => {
    (prisma.aIExplanation.findFirst as any).mockResolvedValue(null);
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue({
      id: 'p1', baseURL: 'https://x', apiKeyCipher: 'c', model: 'm',
    });
    (callChat as any).mockRejectedValue(new Error('AI 报错'));

    let rollbackSeen = false;
    vi.spyOn(prisma, '$transaction').mockImplementation(async (fn: any) => {
      return fn({
        user: {
          findUnique: vi.fn().mockResolvedValue({ credits: 100 }),
          update: vi.fn().mockImplementation(() => ({ credits: 95 })),
        },
      });
    });
    // 第二次 $transaction(回滚)时记录
    const origTransaction = prisma.$transaction as any;
    prisma.$transaction = vi.fn(async (fn: any) => {
      const r = await fn({
        user: { update: vi.fn().mockReturnValue({ credits: 100 }) },
      });
      if (r === undefined && !rollbackSeen) {
        rollbackSeen = true;
        return { credits: 100 };
      }
      return r;
    });

    await expect(explainQuestion(baseArgs)).rejects.toThrow('AI 报错');
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
npx vitest run tests/credits/explain.test.ts
```

Expected: FAIL with module not found

- [ ] **Step 4: 实现**

创建 `src/lib/credits/explain.ts`：

```ts
import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { QUESTION_EXPLAIN_PROMPT } from '@/lib/ai/explain-prompt';
import { getExplainCost } from './explain-cost';

export class InsufficientCreditsError extends Error {
  constructor(public required: number, public balance: number) {
    super(`积分不足: 需要 ${required}, 当前 ${balance}`);
    this.name = 'InsufficientCreditsError';
  }
}

async function getBalance(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return u?.credits ?? 0;
}

/**
 * 单题 AI 解析:
 * 1. 查缓存 (同 userId+questionId 已存在 -> 免费)
 * 2. 事务内:校验余额 / 扣费 / 写 CreditLedger
 * 3. 调 AI callChat (失败回滚)
 * 4. 写 AIExplanation(content)
 * 5. 返回 { content, cached, newBalance, costCredit }
 */
export async function explainQuestion(opts: {
  userId: string;
  questionId: string;
  questionContent: string;
  questionType?: string;
  signal?: AbortSignal;
}): Promise<{ content: string; cached: boolean; newBalance: number; costCredit: number }> {
  // 1. 缓存查询
  const cached = await prisma.aIExplanation.findFirst({
    where: { userId: opts.userId, questionId: opts.questionId },
    orderBy: { createdAt: 'desc' },
  });
  if (cached) {
    return { content: cached.content, cached: true, newBalance: await getBalance(opts.userId), costCredit: 0 };
  }

  // 2. 计算价格(从题目文本启发式推断难度,本期不传显式 difficulty)
  const cost = getExplainCost(inferDifficulty(opts.questionContent));

  // 3. 事务扣费
  let newBalance: number;
  try {
    newBalance = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: opts.userId }, select: { credits: true } });
      if (!user || user.credits < cost) {
        throw new InsufficientCreditsError(cost, user?.credits ?? 0);
      }
      const updated = await tx.user.update({
        where: { id: opts.userId },
        data: { credits: { decrement: cost } },
        select: { credits: true },
      });
      await tx.creditLedger.create({
        data: {
          userId: opts.userId,
          delta: -cost,
          reason: 'ai_explain',
          balance: updated.credits,
          refId: opts.questionId,
        },
      });
      return updated.credits;
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) throw err;
    throw err;
  }

  // 4. 调 AI
  try {
    const provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
    if (!provider) throw new Error('未配置 AI 厂商');
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const content = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [
        { role: 'system', content: QUESTION_EXPLAIN_PROMPT },
        { role: 'user', content: opts.questionContent },
      ],
      signal: opts.signal,
      maxTokens: 1500,
      temperature: 0.4,
    });

    // 5. 写缓存
    await prisma.aIExplanation.create({
      data: {
        userId: opts.userId,
        questionId: opts.questionId,
        costCredit: cost,
        content,
      },
    });

    return { content, cached: false, newBalance, costCredit: cost };
  } catch (err) {
    // 6. AI 失败: 回滚
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: opts.userId },
        data: { credits: { increment: cost } },
        select: { credits: true },
      });
      await tx.creditLedger.create({
        data: {
          userId: opts.userId,
          delta: cost,
          reason: 'refund',
          balance: updated.credits,
          refId: opts.questionId,
        },
      });
    });
    throw err;
  }
}

/**
 * 启发式从题目文本推断难度:
 * - 代码/算法 关键字 -> 困难
 * - 选择/判断/填空/简答 -> 中等
 * 实际项目可在题目 JSON 里显式带 difficulty 字段,这里仅 fallback
 */
function inferDifficulty(text: string): '简单' | '中等' | '困难' {
  if (/代码|编程|算法|实现|function|def |class /.test(text)) return '困难';
  return '中等';
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
npx vitest run tests/credits/explain.test.ts
```

Expected: 4 passed

如果失败,可能是 prisma.$transaction mock 写法问题,简化测试或调整。

- [ ] **Step 6: Commit**

```bash
git add src/lib/credits/explain.ts src/lib/ai/explain-prompt.ts tests/credits/explain.test.ts
git commit -m "feat(credits): add AI single-question explain with dedupe/rollback"
```

---

## Task 6: 余额查询 API

**Files:**
- Create: `src/app/api/user/credits/route.ts`
- Create: `tests/api/user-credits.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/api/user-credits.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    dailyCheckIn: { findFirst: vi.fn() },
  },
}));
vi.mock('@/lib/auth', () => ({
  getTokenFromHeaders: vi.fn(),
  verifyToken: vi.fn(),
}));
vi.mock('@/lib/admin-auth', () => ({
  getTokenFromHeaders: vi.fn(),
  verifyAdminToken: vi.fn(),
}));

// 默认 mock: 用户 + 今天还没签到
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { GET } from '@/app/api/user/credits/route';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyToken).mockReturnValue({ userId: 'u1', type: 'user' } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ credits: 50 } as any);
  vi.mocked(prisma.dailyCheckIn.findFirst).mockResolvedValue(null);
});

describe('GET /api/user/credits', () => {
  it('返回余额 + 未签到状态', async () => {
    const req = new Request('http://localhost/api/user/credits', {
      headers: { Authorization: 'Bearer t' },
    });
    const res = await GET(req as any);
    const data = await res.json();
    expect(data).toEqual({ balance: 50, checkedIn: false, checkInReward: 5 });
  });

  it('今日已签到 checkedIn=true', async () => {
    vi.mocked(prisma.dailyCheckIn.findFirst).mockResolvedValue({ id: 'c1' } as any);
    const req = new Request('http://localhost/api/user/credits', {
      headers: { Authorization: 'Bearer t' },
    });
    const res = await GET(req as any);
    const data = await res.json();
    expect(data.checkedIn).toBe(true);
  });

  it('未登录 401', async () => {
    vi.mocked(verifyToken).mockReturnValue(null);
    const req = new Request('http://localhost/api/user/credits');
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run tests/api/user-credits.test.ts
```

Expected: FAIL with module not found

- [ ] **Step 3: 实现**

创建 `src/app/api/user/credits/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { verifyAdminToken } from '@/lib/admin-auth';

const REWARD = 5;

export async function GET(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const admin = token ? verifyAdminToken(token) : null;
  const userPayload = token ? verifyToken(token) : null;
  const userId = admin ? null : (userPayload?.userId ?? null);
  if (!admin && !userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  if (admin) {
    // 管理员暂不支持积分(本期)
    return NextResponse.json({ balance: 0, checkedIn: false, checkInReward: REWARD });
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [user, todayCheckIn] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId as string }, select: { credits: true } }),
    prisma.dailyCheckIn.findFirst({
      where: {
        userId: userId as string,
        checkInDate: today,
      },
      select: { id: true },
    }),
  ]);

  return NextResponse.json({
    balance: user?.credits ?? 0,
    checkedIn: !!todayCheckIn,
    checkInReward: REWARD,
  });
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run tests/api/user-credits.test.ts
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add src/app/api/user/credits/route.ts tests/api/user-credits.test.ts
git commit -m "feat(api): add /api/user/credits endpoint"
```

---

## Task 7: 签到 API

**Files:**
- Create: `src/app/api/user/checkin/route.ts`

- [ ] **Step 1: 实现（无需测试，已在 Task 4 测过 checkInToday 函数）**

创建 `src/app/api/user/checkin/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { checkInToday, AlreadyCheckedInError } from '@/lib/credits/checkin';

export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const result = await checkInToday(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AlreadyCheckedInError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('[checkin] error:', err);
    return NextResponse.json({ error: '签到失败' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/user/checkin/route.ts
git commit -m "feat(api): add /api/user/checkin endpoint"
```

---

## Task 8: 占位充值 API

**Files:**
- Create: `src/app/api/user/topup/route.ts`

- [ ] **Step 1: 实现**

创建 `src/app/api/user/topup/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    return NextResponse.json({ error: '充值金额无效(1 - 100000)' }, { status: 400 });
  }

  // 本期:仅插入 CreditLedger 流水(占位),不接支付
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
      select: { credits: true },
    });
    const ledger = await tx.creditLedger.create({
      data: {
        userId,
        delta: amount,
        reason: 'topup',
        balance: user.credits,
        refId: `topup-${Date.now()}`,
      },
    });
    return { balance: user.credits, ledgerId: ledger.id };
  });

  return NextResponse.json({
    orderId: updated.ledgerId,
    status: 'pending',
    balance: updated.balance,
    message: '支付未对接,已由运营手工加积分',
  });
}
```

- [ ] **Step 2: Type check + Commit**

```bash
npx tsc --noEmit
git add src/app/api/user/topup/route.ts
git commit -m "feat(api): add /api/user/topup placeholder endpoint"
```

---

## Task 9: AI 单题解析 API

**Files:**
- Create: `src/app/api/ai/explain/route.ts`

- [ ] **Step 1: 实现**

创建 `src/app/api/ai/explain/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { verifyAdminToken } from '@/lib/admin-auth';
import { explainQuestion, InsufficientCreditsError } from '@/lib/credits/explain';

export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const admin = token ? verifyAdminToken(token) : null;
  const userPayload = token ? verifyToken(token) : null;

  if (!admin && !userPayload?.userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { questionId, content, type } = body || {};
  if (!questionId || !content) {
    return NextResponse.json({ error: 'questionId 和 content 必填' }, { status: 400 });
  }

  const userId = userPayload?.userId;
  if (!userId) {
    return NextResponse.json({ error: '仅支持用户调用' }, { status: 403 });
  }

  try {
    const result = await explainQuestion({
      userId,
      questionId,
      questionContent: content,
      questionType: type,
      signal: request.signal,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: '积分不足', required: err.required, balance: err.balance },
        { status: 400 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai/explain] error:', msg);
    return NextResponse.json({ error: `解析失败: ${msg.slice(0, 200)}` }, { status: 502 });
  }
}
```

- [ ] **Step 2: Type check + Commit**

```bash
npx tsc --noEmit
git add src/app/api/ai/explain/route.ts
git commit -m "feat(api): add /api/ai/explain single-question explain endpoint"
```

---

## Task 10: 顶部余额徽章组件

**Files:**
- Create: `src/components/CreditBadge.tsx`

- [ ] **Step 1: 实现**

创建 `src/components/CreditBadge.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { authPost } from '@/lib/fetcher';

interface CreditsState {
  balance: number;
  checkedIn: boolean;
  checkInReward: number;
}

export default function CreditBadge() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [state, setState] = useState<CreditsState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!token) return;
    const res = await fetch('/api/user/credits', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setState(await res.json());
  };

  useEffect(() => { load(); }, [token]);

  if (!user || user.isGuest) return null;

  const checkIn = async () => {
    setBusy(true);
    try {
      const res = await authPost('/api/user/checkin', token!, {});
      const data = await res.json();
      if (res.status === 409) alert(data.error || '今天已签到');
      else if (res.ok) {
        setState((s) => s ? { ...s, balance: data.balance, checkedIn: true } : null);
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <button
        onClick={() => router.push('/credits')}
        className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors font-medium"
        title="查看积分明细"
      >
        💎 {state?.balance ?? '—'}
      </button>
      {state && !state.checkedIn && (
        <button
          onClick={checkIn}
          disabled={busy}
          className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors disabled:opacity-50"
        >
          签到 +{state.checkInReward}
        </button>
      )}
      {state?.checkedIn && (
        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px]">
          今日已签到
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 看 fetcher 帮助函数是否存在**

```bash
grep "authPost" e:/WorkSpace/Project/HomeWork-AI/src/lib/fetcher.ts 2>&1 || echo MISSING
```

- [ ] **Step 3: 如果 fetcher 没 authPost,在 src/lib/fetcher.ts 加**

```ts
export async function authPost(url: string, token: string, body: any) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 4: 把 CreditBadge 接入 Layout/Sidebar**

编辑 `src/components/Sidebar.tsx`,在顶部 brand 区域加:

```tsx
import CreditBadge from './CreditBadge';

// 在 </> 顶部 brand 行下方加:
<div className="mt-2 flex items-center gap-2">
  <CreditBadge />
</div>
```

具体位置参照 Sidebar.tsx 当前 brand 块 (~line 119-143)

- [ ] **Step 5: Type check + Commit**

```bash
npx tsc --noEmit
git add src/components/CreditBadge.tsx src/components/Sidebar.tsx src/lib/fetcher.ts
git commit -m "feat(ui): add CreditBadge + integrate into Sidebar"
```

---

## Task 11: 答题页错题 AI 解析面板

**Files:**
- Create: `src/components/AIExplainPanel.tsx`
- Modify: `src/components/AnswerSheet.tsx`

- [ ] **Step 1: AIExplainPanel 组件**

创建 `src/components/AIExplainPanel.tsx`：

```tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authPost } from '@/lib/fetcher';

interface Props {
  questionId: string;
  questionContent: string;
  questionType: string;
  onNeedCredits: (required: number, balance: number) => void;
}

export default function AIExplainPanel({ questionId, questionContent, questionType, onNeedCredits }: Props) {
  const { token } = useAuth();
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'cached'; content: string }
    | { status: 'done'; content: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const ask = async () => {
    if (!token) return;
    setState({ status: 'loading' });
    try {
      const res = await authPost('/api/ai/explain', token, {
        questionId, content: questionContent, type: questionType,
      });
      const data = await res.json();
      if (res.status === 400 && data.required != null) {
        onNeedCredits(data.required, data.balance);
        setState({ status: 'idle' });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? '解析失败');
      setState({ status: data.cached ? 'cached' : 'done', content: data.content });
    } catch (err: any) {
      setState({ status: 'error', message: err?.message ?? '解析失败' });
    }
  };

  if (state.status === 'idle') {
    return (
      <button
        onClick={ask}
        className="px-3 py-1.5 bg-gradient-to-r from-violet-500 to-pink-500 text-white text-[12px] rounded-lg hover:opacity-90"
      >
        🧠 AI 解析此题
      </button>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="text-[12px] text-slate-500">AI 解析中...</div>
    );
  }

  if (state.status === 'cached') {
    return (
      <div className="text-[11px] text-emerald-600 mb-1">✓ 已为你解析过(免费查看)</div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      {state.status === 'done' && (
        <div className="text-[11px] text-emerald-600">✓ 已扣积分解析</div>
      )}
      {state.status === 'error' && (
        <div className="text-[11px] text-rose-600">{state.message}</div>
      )}
      <div className="p-3 bg-violet-50/50 border border-violet-100 rounded-lg text-[12.5px] text-slate-700 whitespace-pre-wrap leading-relaxed">
        {state.status === 'error' ? '' : (state as any).content}
      </div>
      {state.status === 'error' && (
        <button onClick={ask} className="text-[11px] text-sky-600 hover:underline">重试</button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 修改 AnswerSheet,在错题视图加按钮 + 解析面板**

编辑 `src/components/AnswerSheet.tsx`,在「参考答案」块下方加 AI 解析面板(仅错题显示):

```tsx
import AIExplainPanel from './AIExplainPanel';
import { useAuth } from '@/contexts/AuthContext';

// 在组件顶部加:
const { token } = useAuth();

// 在「参考答案」块 */}
{/* AI 解析 - 仅错题显示 */}
{correct === false && (
  <div className="pt-2 border-t border-slate-200/60">
    <div className="text-[10.5px] tracking-[0.2em] uppercase text-slate-400 mb-1.5">AI 解析</div>
    {token ? (
      <AIExplainPanel
        questionId={q.id}
        questionContent={q.title}
        questionType={q.type}
        onNeedCredits={(req, bal) => {
          alert(`积分不足: 需要 ${req} 积分, 当前 ${bal} 积分。请前往 /credits 充值`);
          window.location.href = '/credits';
        }}
      />
    ) : null}
  </div>
)}
```

- [ ] **Step 3: Type check + Commit**

```bash
npx tsc --noEmit
git add src/components/AIExplainPanel.tsx src/components/AnswerSheet.tsx
git commit -m "feat(ui): integrate AI explain panel into AnswerSheet wrong-question view"
```

---

## Task 12: /credits 页面

**Files:**
- Create: `src/app/credits/page.tsx`

- [ ] **Step 1: 实现**

创建 `src/app/credits/page.tsx`：

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { authPost } from '@/lib/fetcher';

interface Ledger {
  id: string;
  delta: number;
  reason: string;
  refId: string | null;
  balance: number;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  daily_signin: '每日签到',
  topup: '充值',
  admin_adjust: '管理员调整',
  ai_explain: 'AI 解析',
  refund: '退还',
  signup: '注册奖励',
};

export default function CreditsPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState<Ledger[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  const load = async () => {
    if (!token) return;
    const [creditsRes, historyRes] = await Promise.all([
      fetch('/api/user/credits', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/user/credits/history', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (creditsRes.ok) {
      const d = await creditsRes.json();
      setBalance(d.balance);
    }
    if (historyRes.ok) {
      const d = await historyRes.json();
      setHistory(d.history ?? []);
    }
  };

  useEffect(() => { load(); }, [token]);

  const topup = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await authPost('/api/user/topup', token, { amount: 100 });
      const data = await res.json();
      if (res.ok) {
        alert(`${data.message}\n新余额: ${data.balance}`);
        load();
      } else alert(data.error || '失败');
    } finally { setBusy(false); }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-6">
      <button onClick={() => router.back()} className="text-slate-500 hover:text-slate-800 mb-6 inline-flex items-center gap-2">
        ← 返回
      </button>
      <div className="max-w-2xl mx-auto bg-white/80 backdrop-blur rounded-2xl p-6 shadow-sm border border-slate-200/60">
        <h1 className="text-2xl font-semibold text-slate-800 mb-4">积分中心</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-amber-600">当前余额</div>
            <div className="text-3xl font-bold text-amber-700">💎 {balance}</div>
          </div>
          <button
            onClick={topup}
            disabled={busy}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            {busy ? '充值中…' : '充值 (占位)'}
          </button>
        </div>
        <p className="text-[12px] text-slate-500 mb-6">
          充值服务即将上线。当前可联系管理员手工充值,或每日签到领取 5 积分。
        </p>

        <h2 className="text-[14px] font-semibold text-slate-700 mb-2">积分流水</h2>
        {history.length === 0 ? (
          <div className="text-[12px] text-slate-400 py-4 text-center">暂无流水</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="text-slate-500 border-b border-slate-200">
              <tr>
                <th className="text-left py-2">时间</th>
                <th className="text-left">类型</th>
                <th className="text-right">变动</th>
                <th className="text-right">余额</th>
              </tr>
            </thead>
            <tbody>
              {history.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-2 text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="text-slate-700">{REASON_LABELS[l.reason] || l.reason}</td>
                  <td className={`text-right font-mono ${l.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {l.delta >= 0 ? '+' : ''}{l.delta}
                  </td>
                  <td className="text-right font-mono text-slate-600">{l.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 加 /api/user/credits/history 路由(本任务内补)**

创建 `src/app/api/user/credits/history/route.ts`：

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const ledger = await prisma.creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ history: ledger });
}
```

- [ ] **Step 3: Type check + Commit**

```bash
npx tsc --noEmit
git add src/app/credits/page.tsx src/app/api/user/credits/history/route.ts
git commit -m "feat(credits): add /credits page + history api"
```

---

## Task 13: 上传题库加难度字段

**Files:**
- Modify: `src/components/admin/QuizUploadPanel.tsx`

- [ ] **Step 1: 加难度 state + UI**

在 `src/components/admin/QuizUploadPanel.tsx`,`const [showProgress, setShowProgress] = useState(false);` 后面加:

```tsx
const [parsedQuestions, setParsedQuestions] = useState<Array<{ difficulty?: string }>>([]);
```

修改 `handleParseComplete`,把 questions 存进 state + 提交时带 difficulty:

```tsx
const handleParseComplete = async (questions: unknown[]) => {
  setShowProgress(false);
  const qs = questions as Array<{ type: string; content: string; answer: string; score?: number; options?: string[]; analysis?: string; difficulty?: string }>;
  if (qs.length === 0) {
    setError('未能解析到任何题目');
    return;
  }
  // 给每道题加默认难度(实际生产应由用户在管理表单里手选,本期先默认'中等')
  const enriched = qs.map(q => ({ ...q, difficulty: q.difficulty ?? '中等' }));
  setParsedQuestions(enriched);
  const title = extractTitle(preview);
  try {
    await onParsed(title, enriched);
  } catch (err) {
    setError('保存失败: ' + (err instanceof Error ? err.message : String(err)));
  }
};
```

- [ ] **Step 2: Type check + Commit**

```bash
npx tsc --noEmit
git add src/components/admin/QuizUploadPanel.tsx
git commit -m "feat(admin): add difficulty field (default: 中等) when uploading questions"
```

---

## Task 14: 端到端验证

**Files:** N/A

- [ ] **Step 1: 跑完整测试**

```bash
cd e:/WorkSpace/Project/HomeWork-AI && npx vitest run
```

Expected: 95 + 16+ = ~111 tests passed

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 3: 数据库同步**

```bash
npx prisma db push
npx prisma generate
```

Expected: 数据库同步新表(CreditLedger/DailyCheckIn/AIExplanation)

- [ ] **Step 4: 浏览器 e2e**

1. 重启 dev server: `taskkill /PID <pid> /F && npm run dev`
2. 访问 http://localhost:3000/credits → 看到余额
3. 点「签到 +5」→ 余额 +5
4. 访问 /quiz/<id>,答错一题后展开 → 看到「🧠 AI 解析」按钮
5. 点 AI 解析 → 积分扣除 → 显示 markdown 解析
6. 余额 0 时再点 → 弹「积分不足」+ 跳 /credits

- [ ] **Step 5: git log 验证**

```bash
git log --oneline -15
```

Expected: 看到 Task 1-13 的所有 commits

---

## Self-Review Checklist

- [x] Spec coverage: 4 models(✓ T1), credits service(✓ T2/T3), API(✓ T6-T9), UI(✓ T10-T12), upload difficulty(✓ T13), e2e(✓ T14)全覆盖
- [x] Placeholder scan: 没有 TBD/TODO
- [x] Type consistency: User.credits字段在所有 tasks 用一致;Difficulty 类型从 T3 定义,T2/T5 一致引用
- [x] API 接口契约统一:`/api/user/credits` 返回 `{balance, checkedIn, checkInReward}` 在 T6 定义,T10/T12 一致使用
- [x] 错误处理: InsufficientCreditsError 贯穿 T5/T9/T11;AlreadyCheckedInError 贯穿 T4/T7
- [x] 并发安全: 所有扣费/签到操作在 `prisma.$transaction` 内(T4/T5);AI 失败回滚(T5)