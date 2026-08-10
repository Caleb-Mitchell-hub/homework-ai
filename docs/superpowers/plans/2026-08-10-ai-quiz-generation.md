# AI 题库生成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/upload` 页面新增「AI 生成」tab，用户输入主题 + 题型数量，AI 流式生成题库，预览后确认保存。积分按固定单价 + token 兜底扣费。

**Architecture:** 前端 AIGenerateForm → SSE 流式 API `/api/ai/generate-quiz` → 服务端构建 prompt + 调 AI + 解析 JSON → 返回题目列表 → AIGeneratePreview 预览 → 复用现有 `POST /api/quizzes` 保存。积分在 API 层事务扣费。

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, Prisma 5 + MySQL, SSE (ReadableStream), Vitest

## Global Constraints

- 排除代码题（6 种题型：single, multiple, boolean, fill, essay, interview）
- 定价表：单选/多选 2 积分、判断 1 积分、填空 3 积分、简答 5 积分、面试 8 积分
- Token 换算：100 tokens = 1 积分，字符估算公式 `ceil(chars / 3.5)`
- 积分不足返回 `InsufficientCreditsError`，前端引导去充值页
- CreditReason 枚举新增 `ai_generate_quiz`
- topic 最长 5000 字符，单题型最多 50 题，总题数 1~100
- temperature = 0.7, jsonMode = true, maxTokens = 16000
- SSE 事件类型：progress / delta / complete / error
- 流式完成后的预览展示题号、题型标签、标题、选项/答案、难度

---

### Task 1: Schema — CreditReason 枚举新增 ai_generate_quiz

**Files:**
- Modify: `prisma/schema.prisma:144-153`

**Interfaces:**
- Produces: `CreditReason` 枚举值 `ai_generate_quiz` 可用于 `CreditLedger.reason`

- [ ] **Step 1: 添加枚举值**

```prisma
enum CreditReason {
  signup
  daily_signin
  topup
  admin_adjust
  ai_explain
  ai_report
  ai_interview_report
  ai_generate_quiz
  refund
}
```

- [ ] **Step 2: 停服、推送 schema、重新生成 Prisma Client、重启**

```bash
# 找到并杀掉 dev server
netstat -ano | grep ":3000" | grep LISTENING
# cmd.exe //c "taskkill /F /PID <pid>"

# 推送 + 生成
npx prisma db push
# 自动生成 Prisma Client

# 重启
npx next dev -p 3000 &
```

- [ ] **Step 3: 验证**

```bash
npx tsc --noEmit 2>&1 | head -20
# 不应有新增 TS 错误
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: CreditReason 新增 ai_generate_quiz"
```

---

### Task 2: 积分定价与扣费逻辑

**Files:**
- Create: `src/lib/credits/generate-cost.ts`
- Create: `src/lib/credits/generate.ts`
- Create: `tests/credits/generate-cost.test.ts`

**Interfaces:**
- Produces: `GENERATE_UNIT_PRICES: Record<string, number>` — 每题型的单价表
- Produces: `estimateGenerateCost(counts: Record<string, number>): number` — 预估积分
- Produces: `computeActualCost(promptChars: number, contentChars: number): number` — 按 token 估实际积分
- Produces: `chargeForGenerate(userId: string, estimatedCost: number, refId?: string): Promise<number>` — 事务扣费，返回新余额
- Produces: `refundForGenerate(userId: string, delta: number, refId?: string): Promise<number>` — 退款，返回新余额
- Produces: `class InsufficientCreditsForGenerateError extends Error` — 积分不足异常

- [ ] **Step 1: 编写测试**

在 `tests/credits/generate-cost.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { estimateGenerateCost, computeActualCost, GENERATE_UNIT_PRICES } from '@/lib/credits/generate-cost';

describe('GENERATE_UNIT_PRICES', () => {
  it('单选题 2 积分/题', () => { expect(GENERATE_UNIT_PRICES.single).toBe(2); });
  it('多选题 2 积分/题', () => { expect(GENERATE_UNIT_PRICES.multiple).toBe(2); });
  it('判断题 1 积分/题', () => { expect(GENERATE_UNIT_PRICES.boolean).toBe(1); });
  it('填空题 3 积分/题', () => { expect(GENERATE_UNIT_PRICES.fill).toBe(3); });
  it('简答题 5 积分/题', () => { expect(GENERATE_UNIT_PRICES.essay).toBe(5); });
  it('面试题 8 积分/题', () => { expect(GENERATE_UNIT_PRICES.interview).toBe(8); });
});

describe('estimateGenerateCost', () => {
  it('5单+3多+2判+0填+2简+1面 = 10+6+2+0+10+8 = 36', () => {
    expect(estimateGenerateCost({ single: 5, multiple: 3, boolean: 2, fill: 0, essay: 2, interview: 1 })).toBe(36);
  });
  it('全部为 0 返回 0', () => {
    expect(estimateGenerateCost({ single: 0, multiple: 0, boolean: 0, fill: 0, essay: 0, interview: 0 })).toBe(0);
  });
  it('缺失的题型视为 0', () => {
    expect(estimateGenerateCost({ single: 3 })).toBe(6);
  });
  it('未知题型不计入', () => {
    expect(estimateGenerateCost({ single: 1, unknown: 100 } as any)).toBe(2);
  });
});

describe('computeActualCost', () => {
  it('prompt 700chars + content 700chars = 1400chars → ~400 tokens → ceil(400/100) = 4', () => {
    expect(computeActualCost(700, 700)).toBe(4);
  });
  it('prompt 3500chars + content 3500chars = 7000chars → ~2000 tokens → 20', () => {
    expect(computeActualCost(3500, 3500)).toBe(20);
  });
  it('最小 1 积分', () => {
    expect(computeActualCost(1, 1)).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/credits/generate-cost.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 3: 实现 generate-cost.ts**

在 `src/lib/credits/generate-cost.ts`：

```typescript
const CHARS_PER_TOKEN = 3.5;
const TOKENS_PER_CREDIT = 100;

/** 每题型单价（积分/题） */
export const GENERATE_UNIT_PRICES: Record<string, number> = {
  single: 2,
  multiple: 2,
  boolean: 1,
  fill: 3,
  essay: 5,
  interview: 8,
};

/** 按题型数量计算预估积分 */
export function estimateGenerateCost(counts: Record<string, number>): number {
  let total = 0;
  for (const [type, count] of Object.entries(counts)) {
    const unit = GENERATE_UNIT_PRICES[type];
    if (unit && typeof count === 'number' && count > 0) {
      total += unit * count;
    }
  }
  return total;
}

/** 按字符数估算 token 消耗，并换算为积分（ceil） */
export function computeActualCost(promptChars: number, contentChars: number): number {
  const estimatedTokens = Math.ceil(promptChars / CHARS_PER_TOKEN) + Math.ceil(contentChars / CHARS_PER_TOKEN);
  return Math.max(1, Math.ceil(estimatedTokens / TOKENS_PER_CREDIT));
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/credits/generate-cost.test.ts
# Expected: 10 tests PASS
```

- [ ] **Step 5: 实现 generate.ts**

在 `src/lib/credits/generate.ts`：

```typescript
import { prisma } from '@/lib/prisma';

export class InsufficientCreditsForGenerateError extends Error {
  constructor(public required: number, public balance: number) {
    super(`积分不足: 需要 ${required}, 当前 ${balance}`);
    this.name = 'InsufficientCreditsForGenerateError';
  }
}

/**
 * 事务扣费（预估积分）。返回扣费后的余额。
 * 余额不足时抛出 InsufficientCreditsForGenerateError。
 */
export async function chargeForGenerate(
  userId: string,
  estimatedCost: number,
  refId?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    if (!user || user.credits < estimatedCost) {
      throw new InsufficientCreditsForGenerateError(estimatedCost, user?.credits ?? 0);
    }
    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { decrement: estimatedCost } },
      select: { credits: true },
    });
    await tx.creditLedger.create({
      data: {
        userId,
        delta: -estimatedCost,
        reason: 'ai_generate_quiz',
        balance: updated.credits,
        refId: refId ?? null,
      },
    });
    return updated.credits;
  });
}

/**
 * 退款 / 补扣差额（正数=退款回账户，负数=补扣）。
 * 返回操作后的余额。
 */
export async function adjustForGenerate(
  userId: string,
  delta: number, // 正=退款，负=补扣
  refId?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: delta } },
      select: { credits: true },
    });
    await tx.creditLedger.create({
      data: {
        userId,
        delta,
        reason: 'refund',
        balance: updated.credits,
        refId: refId ?? null,
      },
    });
    return updated.credits;
  });
}
```

- [ ] **Step 6: 验证 TypeScript 编译**

```bash
npx tsc --noEmit 2>&1 | grep -v "CategorySelect" | head -20
# 无新增错误
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/credits/generate-cost.ts src/lib/credits/generate.ts tests/credits/generate-cost.test.ts
git commit -m "feat: add quiz generation credit pricing and charge logic"
```

---

### Task 3: AI 生成提示词

**Files:**
- Create: `src/lib/ai/generate-prompt.ts`
- Create: `tests/lib/ai/generate-prompt.test.ts`

**Interfaces:**
- Produces: `buildGenerateSystemPrompt(): string` — system 提示词
- Produces: `buildGenerateUserPrompt(topic: string, counts: Record<string, number>): string` — user 提示词
- Produces: `ALLOWED_GENERATE_TYPES: string[]` — 允许生成的题型列表（不含 code）

- [ ] **Step 1: 编写测试**

在 `tests/lib/ai/generate-prompt.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { buildGenerateSystemPrompt, buildGenerateUserPrompt, ALLOWED_GENERATE_TYPES } from '@/lib/ai/generate-prompt';

describe('ALLOWED_GENERATE_TYPES', () => {
  it('包含 6 种题型不含 code', () => {
    expect(ALLOWED_GENERATE_TYPES).toEqual(['single', 'multiple', 'boolean', 'fill', 'essay', 'interview']);
  });
});

describe('buildGenerateSystemPrompt', () => {
  it('包含核心出题指令', () => {
    const p = buildGenerateSystemPrompt();
    expect(p).toContain('题库出题专家');
    expect(p).toContain('single');
    expect(p).toContain('interview');
    expect(p).toContain('JSON');
    expect(p).not.toContain('code');
  });
});

describe('buildGenerateUserPrompt', () => {
  it('包含主题和题型数量', () => {
    const p = buildGenerateUserPrompt('计算机网络', { single: 3, multiple: 0, boolean: 0, fill: 0, essay: 0, interview: 0 });
    expect(p).toContain('计算机网络');
    expect(p).toContain('单选题');
    expect(p).toContain('3 题');
  });
  it('数量为 0 的题型提示"不要生成"', () => {
    const p = buildGenerateUserPrompt('test', { single: 0, multiple: 0, boolean: 0, fill: 0, essay: 0, interview: 1 });
    expect(p).toContain('不要生成');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run tests/lib/ai/generate-prompt.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 3: 实现 generate-prompt.ts**

在 `src/lib/ai/generate-prompt.ts`：

```typescript
export const ALLOWED_GENERATE_TYPES = ['single', 'multiple', 'boolean', 'fill', 'essay', 'interview'] as const;

const TYPE_LABELS: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  boolean: '判断题',
  fill: '填空题',
  essay: '简答题',
  interview: '面试题',
};

export function buildGenerateSystemPrompt(): string {
  return `你是一位专业的题库出题专家。根据用户提供的主题或内容，严格按照指定的题型和数量生成高质量题目。

出题规则：
- 单选题：必须包含 4 个选项，标注 correctAnswer（单个字母 A/B/C/D）
- 多选题：必须包含 4 个选项，correctAnswer 为多个字母如 "AC"
- 判断题：correctAnswer 为 "true" 或 "false"
- 填空题：blanks 为空格数，correctAnswer 为正确答案
- 简答题：需给出 referenceAnswer（参考答案要点）
- 面试题：需给出 referenceAnswer（参考答案要点），可选 subQuestions

质量要求：
- 难度分布：简单 30%、中等 50%、困难 20%
- 题目之间不能重复或相互暗示答案
- 题目表述清晰准确，无歧义
- 答案必须正确无误

请严格按以下 JSON 格式输出，不要包含任何其他文字：
{
  "questions": [
    {
      "type": "single",
      "title": "题目标题",
      "difficulty": "简单",
      "options": ["选项A","选项B","选项C","选项D"],
      "correctAnswer": "A"
    }
  ]
}`;
}

export function buildGenerateUserPrompt(topic: string, counts: Record<string, number>): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const lines: string[] = [];
  for (const type of ALLOWED_GENERATE_TYPES) {
    const count = counts[type] || 0;
    if (count > 0) {
      lines.push(`- ${TYPE_LABELS[type]}：${count} 题`);
    }
  }
  const zeroTypeLines = ALLOWED_GENERATE_TYPES
    .filter((t) => !counts[t])
    .map((t) => TYPE_LABELS[t])
    .join('、');

  return `【主题/内容】
${topic}

【题目要求】
请生成以下题型和数量（共计 ${total} 题）：
${lines.join('\n')}

${zeroTypeLines ? `以下题型不要生成：${zeroTypeLines}` : ''}
题目内容请围绕上述主题展开，确保覆盖核心知识点，难度递进合理。`;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run tests/lib/ai/generate-prompt.test.ts
# Expected: 5 tests PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/generate-prompt.ts tests/lib/ai/generate-prompt.test.ts
git commit -m "feat: add quiz generation prompt builder"
```

---

### Task 4: SSE 流式生成 API

**Files:**
- Create: `src/app/api/ai/generate-quiz/route.ts`

**Interfaces:**
- Consumes: `buildGenerateSystemPrompt`, `buildGenerateUserPrompt` from `@/lib/ai/generate-prompt`
- Consumes: `estimateGenerateCost`, `computeActualCost` from `@/lib/credits/generate-cost`
- Consumes: `chargeForGenerate`, `adjustForGenerate`, `InsufficientCreditsForGenerateError` from `@/lib/credits/generate`
- Consumes: `callChatStream` from `@/lib/ai/providers`
- Consumes: `extractJson` from `@/lib/ai/json-extractor`
- Consumes: `normalizeAIOutputToQuestions` from `@/lib/ai/normalize`
- Produces: `POST /api/ai/generate-quiz` SSE endpoint

- [ ] **Step 1: 创建 SSE 路由**

在 `src/app/api/ai/generate-quiz/route.ts`：

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/ai/crypto';
import { callChatStream } from '@/lib/ai/providers';
import { buildGenerateSystemPrompt, buildGenerateUserPrompt, ALLOWED_GENERATE_TYPES } from '@/lib/ai/generate-prompt';
import { estimateGenerateCost, computeActualCost } from '@/lib/credits/generate-cost';
import { chargeForGenerate, adjustForGenerate, InsufficientCreditsForGenerateError } from '@/lib/credits/generate';
import { extractJson } from '@/lib/ai/json-extractor';
import { normalizeAIOutputToQuestions, autoConvertEssayToInterview } from '@/lib/ai/normalize';

const MAX_TOPIC_CHARS = 5000;
const MAX_PER_TYPE = 50;
const MAX_TOTAL = 100;

function genId(): string {
  return 'q_' + Math.random().toString(36).slice(2, 12);
}

/** 校验 counts 参数 */
function validateCounts(counts: unknown): { valid: boolean; error?: string; total: number; cleaned: Record<string, number> } {
  const cleaned: Record<string, number> = {};
  let total = 0;
  if (!counts || typeof counts !== 'object') {
    return { valid: false, error: 'counts 必须是一个对象', total: 0, cleaned };
  }
  const raw = counts as Record<string, unknown>;
  for (const type of ALLOWED_GENERATE_TYPES) {
    const v = raw[type];
    if (v === undefined || v === null || v === '') {
      cleaned[type] = 0;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return { valid: false, error: `${type} 数量必须是非负整数`, total: 0, cleaned };
    }
    const clamped = Math.min(n, MAX_PER_TYPE);
    cleaned[type] = clamped;
    total += clamped;
  }
  if (total === 0) {
    return { valid: false, error: '至少需要指定一种题型的数量', total: 0, cleaned };
  }
  if (total > MAX_TOTAL) {
    return { valid: false, error: `总题目数不能超过 ${MAX_TOTAL} 题`, total, cleaned };
  }
  return { valid: true, total, cleaned };
}

function sendSSE(controller: ReadableStreamDefaultController, enc: TextEncoder, data: object): void {
  controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function POST(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  if (!token) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: '无效的token' }, { status: 401 });
  }
  if (payload.isGuest) {
    return NextResponse.json({ error: '游客暂不支持 AI 生成题库，请登录后使用' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const topic: string = (body?.topic ?? '').trim().slice(0, MAX_TOPIC_CHARS);
  if (!topic) {
    return NextResponse.json({ error: '主题/内容不能为空' }, { status: 400 });
  }

  const { valid, error: countError, total, cleaned } = validateCounts(body?.counts);
  if (!valid) {
    return NextResponse.json({ error: countError }, { status: 400 });
  }

  // 1. 查 AI 厂商
  const provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
  if (!provider) {
    return NextResponse.json({ error: '没有可用的 AI 服务商，请联系管理员配置' }, { status: 500 });
  }

  // 2. 预估积分 + 扣费
  const estimatedCost = estimateGenerateCost(cleaned!);
  let chargedBalance: number;
  try {
    chargedBalance = await chargeForGenerate(payload.userId, estimatedCost);
  } catch (err) {
    if (err instanceof InsufficientCreditsForGenerateError) {
      return NextResponse.json(
        { error: `积分不足：需要 ${err.required} 积分，当前 ${err.balance} 积分`, required: err.required, balance: err.balance },
        { status: 400 },
      );
    }
    throw err;
  }

  // 3. SSE 流
  const systemPrompt = buildGenerateSystemPrompt();
  const userPrompt = buildGenerateUserPrompt(topic, cleaned!);
  const fullPrompt = systemPrompt + '\n\n' + userPrompt;
  const apiKey = decryptApiKey(provider.apiKeyCipher);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let aborted = false;
      let fullContent = '';

      const send = (data: object) => {
        if (aborted || req.signal.aborted) { aborted = true; throw new Error('aborted'); }
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { aborted = true; throw new Error('aborted'); }
      };

      try {
        send({ type: 'progress', stage: 'prompt', message: '正在构建提示词…', progress: 10 });

        if (req.signal.aborted) throw new Error('aborted');
        send({ type: 'progress', stage: 'generating', message: 'AI 正在生成题目…', progress: 20 });

        const generator = callChatStream({
          baseURL: provider.baseURL,
          apiKey,
          model: provider.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          jsonMode: true,
          maxTokens: 16000,
          temperature: 0.7,
          signal: req.signal,
        });

        for await (const chunk of generator) {
          if (req.signal.aborted) throw new Error('aborted');
          if (chunk.delta) {
            fullContent += chunk.delta;
            send({ type: 'delta', text: chunk.delta });
          }
        }

        if (req.signal.aborted) throw new Error('aborted');
        send({ type: 'progress', stage: 'parsing', message: '正在解析题目格式…', progress: 85 });

        // 4. 解析 JSON
        let parsed: { questions?: any[] };
        try {
          parsed = extractJson<{ questions?: any[] }>(fullContent);
        } catch {
          // JSON 解析失败 → 退款
          await adjustForGenerate(payload.userId, estimatedCost);
          send({ type: 'error', message: 'AI 返回格式异常，积分已退还，请重试', code: 'PARSE_FAILED' });
          return;
        }

        if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
          await adjustForGenerate(payload.userId, estimatedCost);
          send({ type: 'error', message: 'AI 未生成有效题目，积分已退还，请修改提示词重试', code: 'EMPTY_RESULT' });
          return;
        }

        // 5. 标准化题目
        const questions = autoConvertEssayToInterview(
          normalizeAIOutputToQuestions(parsed.questions, genId),
        );

        // 6. 计算实际积分消耗 + 调整差额
        const actualCost = computeActualCost(fullPrompt.length, fullContent.length);
        const diff = estimatedCost - actualCost; // 正=需退款，负=需补扣
        if (diff !== 0) {
          await adjustForGenerate(payload.userId, diff);
        }

        // 7. 校验题型数量偏差
        let warning: string | undefined;
        const expectedTotal = total!;
        if (questions.length < expectedTotal * 0.8 || questions.length > expectedTotal * 1.2) {
          warning = `AI 生成了 ${questions.length} 题（期望 ${expectedTotal} 题），数量有偏差，请检查题目内容`;
        }

        send({
          type: 'complete',
          questions,
          usage: {
            estimatedCost,
            actualCost: estimatedCost - diff,
            questionCount: questions.length,
          },
          warning,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'aborted') {
          // 客户端断开，不退积分（AI 调用已发生）
        } else {
          // 异常 → 退款
          try { await adjustForGenerate(payload.userId, estimatedCost); } catch {}
          try {
            controller.enqueue(enc.encode(
              `data: ${JSON.stringify({ type: 'error', message: '生成失败: ' + (err instanceof Error ? err.message : '未知错误'), code: 'UNKNOWN' })}\n\n`
            ));
          } catch {}
        }
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit 2>&1 | grep -v "CategorySelect" | head -20
# 无新增错误
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/generate-quiz/route.ts
git commit -m "feat: add SSE streaming quiz generation API endpoint"
```

---

### Task 5: AI 生成表单组件

**Files:**
- Create: `src/components/AIGenerateForm.tsx`

**Interfaces:**
- Consumes: `GENERATE_UNIT_PRICES`, `estimateGenerateCost` from `@/lib/credits/generate-cost`
- Produces: `AIGenerateForm` — 主题输入 + 6 种题型数量输入 + 预估积分展示 + 两个操作按钮
- Props: `{ onGenerate: (topic: string, counts: Record<string, number>) => void; onCopyPrompt: (topic: string, counts: Record<string, number>) => void; disabled: boolean }`

- [ ] **Step 1: 创建组件**

在 `src/components/AIGenerateForm.tsx`：

```tsx
'use client';

import { useState, useMemo } from 'react';
import { estimateGenerateCost } from '@/lib/credits/generate-cost';

interface Props {
  onGenerate: (topic: string, counts: Record<string, number>) => void;
  onCopyPrompt: (topic: string, counts: Record<string, number>) => void;
  disabled?: boolean;
}

interface TypeConfig { key: string; label: string; }

const TYPES: TypeConfig[] = [
  { key: 'single', label: '单选题' },
  { key: 'multiple', label: '多选题' },
  { key: 'boolean', label: '判断题' },
  { key: 'fill', label: '填空题' },
  { key: 'essay', label: '简答题' },
  { key: 'interview', label: '面试题' },
];

export default function AIGenerateForm({ onGenerate, onCopyPrompt, disabled }: Props) {
  const [topic, setTopic] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({
    single: 5, multiple: 3, boolean: 2, fill: 0, essay: 2, interview: 1,
  });

  const estimatedCost = useMemo(() => estimateGenerateCost(counts), [counts]);
  const allZero = useMemo(() => Object.values(counts).every((v) => v === 0), [counts]);
  const canGenerate = topic.trim().length > 0 && !allZero && !disabled;

  function updateCount(type: string, value: number) {
    setCounts((prev) => ({ ...prev, [type]: Math.max(0, Math.min(50, value || 0)) }));
  }

  return (
    <div className="space-y-6">
      {/* 主题输入 */}
      <div>
        <label className="block text-[13px] font-medium text-slate-700 mb-2">
          主题/内容 <span className="text-rose-500">*</span>
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="例如：计算机网络OSI七层模型相关面试题&#10;也可以粘贴一段文本让AI基于内容出题"
          rows={4}
          maxLength={5000}
          className="w-full p-4 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 text-sm resize-none"
        />
        <div className="text-[11px] text-slate-400 mt-1 text-right">{topic.length}/5000</div>
      </div>

      {/* 题型与数量 */}
      <div>
        <label className="block text-[13px] font-medium text-slate-700 mb-3">
          题型与数量
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TYPES.map((t) => (
            <div key={t.key} className="flex items-center gap-2 bg-white/70 border border-slate-200 rounded-xl px-3 py-2.5">
              <span className="text-[13px] text-slate-600 flex-1">{t.label}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateCount(t.key, (counts[t.key] || 0) - 1)}
                  className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={counts[t.key] || 0}
                  onChange={(e) => updateCount(t.key, parseInt(e.target.value) || 0)}
                  className="w-10 text-center text-[13px] font-medium text-slate-700 bg-transparent border-none outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() => updateCount(t.key, (counts[t.key] || 0) + 1)}
                  className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm"
                >
                  +
                </button>
              </div>
              <span className="text-[11px] text-slate-400 w-4">题</span>
            </div>
          ))}
        </div>
        {allZero && (
          <p className="text-[11px] text-amber-500 mt-1.5">请至少选择一种题型并设置数量</p>
        )}
      </div>

      {/* 预估积分 + 操作按钮 */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="text-[13px] text-slate-600">
          预估消耗：<span className="font-bold text-sky-600">⚡ {estimatedCost} 积分</span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onCopyPrompt(topic, counts)}
            disabled={!canGenerate}
            className="px-4 py-2.5 text-[13px] bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            📋 复制提示词
          </button>
          <button
            type="button"
            onClick={() => onGenerate(topic, counts)}
            disabled={!canGenerate}
            className="px-6 py-2.5 text-[13px] bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-sky-200"
          >
            ✨ 生成题库
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit 2>&1 | grep -v "CategorySelect" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AIGenerateForm.tsx
git commit -m "feat: add AI quiz generation form component"
```

---

### Task 6: 进度弹窗与题目预览组件

**Files:**
- Create: `src/components/AIGenerateDialog.tsx`
- Create: `src/components/AIGeneratePreview.tsx`

**Interfaces:**
- `AIGenerateDialog` Props: `{ open: boolean; topic: string; counts: Record<string, number>; token: string; onComplete: (questions: any[]) => void; onError: (msg: string) => void; onCancel: () => void }`
- `AIGeneratePreview` Props: `{ questions: any[]; topic: string; onSave: () => void; onRegenerate: () => void; onCopyPrompt: () => void; saving: boolean }`

- [ ] **Step 1: 创建 AIGenerateDialog（SSE 消费 + 进度展示）**

在 `src/components/AIGenerateDialog.tsx`：

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  topic: string;
  counts: Record<string, number>;
  token: string | null;
  onComplete: (questions: any[], usage?: any) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}

export default function AIGenerateDialog({ open, topic, counts, token, onComplete, onError, onCancel }: Props) {
  const [stage, setStage] = useState('');
  const [message, setMessage] = useState('准备中…');
  const [streamContent, setStreamContent] = useState('');
  const [progress, setProgress] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    completedRef.current = false;
    setStage('');
    setMessage('准备中…');
    setStreamContent('');
    setProgress(0);

    const ctrl = new AbortController();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    (async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      try {
        const res = await fetch('/api/ai/generate-quiz', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify({ topic, counts }),
          signal: ctrl.signal,
        });

        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({}));
          const msg = errData.error ?? `HTTP ${res.status}`;
          if (errData.required != null) {
            onError(`积分不足：需要 ${errData.required} 积分，当前 ${errData.balance} 积分。请前往充值`);
          } else {
            onError(msg);
          }
          return;
        }

        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.trim();
            if (!line) continue;
            const data = line.replace(/^data: /, '').trim();
            try {
              const evt = JSON.parse(data);
              if (evt.type === 'delta') {
                setStreamContent((prev) => prev + (evt.text ?? ''));
              } else if (evt.type === 'progress') {
                setStage(evt.stage ?? '');
                setMessage(evt.message ?? '');
                setProgress(evt.progress ?? progress);
              } else if (evt.type === 'complete') {
                if (!completedRef.current) {
                  completedRef.current = true;
                  setProgress(100);
                  onComplete(evt.questions ?? [], evt.usage);
                }
                await reader.cancel().catch(() => {});
                return;
              } else if (evt.type === 'error') {
                if (!completedRef.current) {
                  completedRef.current = true;
                  onError(evt.message ?? '生成失败');
                }
                await reader.cancel().catch(() => {});
                return;
              }
            } catch { /* ignore malformed events */ }
          }
        }

        if (!completedRef.current) {
          completedRef.current = true;
          onError('生成中断');
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!completedRef.current) {
          completedRef.current = true;
          onError(err instanceof Error ? err.message : '网络异常');
        }
      } finally {
        if (reader) reader.cancel().catch(() => {});
      }
    })();

    return () => {
      ctrl.abort();
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full p-6 ${streamContent ? 'max-w-xl' : 'max-w-md'}`}>
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          ✨ AI 正在生成题库
          <span className="text-[11px] text-slate-400 font-normal">{progress}%</span>
        </h3>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2" role="progressbar" aria-valuenow={progress}>
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <p className="text-[12px] text-slate-500 min-h-[1.25rem]">{message}</p>

        {streamContent && (
          <div className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-slate-900 p-3">
            <pre className="text-[11px] text-green-400 whitespace-pre-wrap break-all font-mono leading-relaxed">
              {streamContent}
            </pre>
          </div>
        )}

        <button onClick={onCancel} className="mt-3 text-[12px] text-slate-500 hover:text-slate-700">
          取消
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 AIGeneratePreview（题目预览 + 操作）**

在 `src/components/AIGeneratePreview.tsx`：

```tsx
'use client';

import type { Question } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  single: '单选', multiple: '多选', boolean: '判断', fill: '填空', essay: '简答', interview: '面试',
};

const TYPE_COLORS: Record<string, string> = {
  single: 'bg-sky-100 text-sky-700', multiple: 'bg-blue-100 text-blue-700',
  boolean: 'bg-amber-100 text-amber-700', fill: 'bg-violet-100 text-violet-700',
  essay: 'bg-pink-100 text-pink-700', interview: 'bg-indigo-100 text-indigo-700',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  '简单': 'bg-emerald-100 text-emerald-700', '中等': 'bg-amber-100 text-amber-700', '困难': 'bg-rose-100 text-rose-700',
};

interface Props {
  questions: Question[];
  topic: string;
  onSave: () => void;
  onRegenerate: () => void;
  onCopyPrompt: () => void;
  saving: boolean;
}

export default function AIGeneratePreview({ questions, topic, onSave, onRegenerate, onCopyPrompt, saving }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex-shrink-0">
          <h3 className="font-semibold text-slate-800 text-lg">题目预览</h3>
          <p className="text-[12px] text-slate-500 mt-0.5">
            共 {questions.length} 题 · 主题: {topic.length > 30 ? topic.slice(0, 30) + '…' : topic}
          </p>
        </div>

        {/* Question list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {questions.map((q, i) => (
            <div key={q.id ?? i} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${TYPE_COLORS[q.type] ?? 'bg-slate-100 text-slate-600'}`}>
                  {TYPE_LABELS[q.type] ?? q.type}
                </span>
                {(q as any).difficulty && (
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${DIFFICULTY_COLORS[(q as any).difficulty] ?? ''}`}>
                    {(q as any).difficulty}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-slate-700 leading-relaxed">{q.title}</p>
              {/* 选项 */}
              {(q.type === 'single' || q.type === 'multiple') && Array.isArray((q as any).options) && (
                <div className="mt-2 space-y-1">
                  {((q as any).options as string[]).map((opt: string, idx: number) => {
                    const letter = String.fromCharCode(65 + idx);
                    const isCorrect = String((q as any).correctAnswer ?? '').toUpperCase().includes(letter);
                    return (
                      <div key={letter} className={`text-[12px] px-2 py-0.5 rounded ${isCorrect ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-500'}`}>
                        {letter}. {opt} {isCorrect ? '✓' : ''}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 判断 */}
              {q.type === 'boolean' && (
                <p className="text-[12px] text-emerald-600 mt-1">答案: {(q as any).correctAnswer === 'true' ? '正确 ✓' : '错误 ✗'}</p>
              )}
              {/* 填空 */}
              {q.type === 'fill' && (
                <p className="text-[12px] text-emerald-600 mt-1">答案: {(q as any).correctAnswer}</p>
              )}
              {/* 简答/面试 */}
              {(q.type === 'essay' || q.type === 'interview') && (q as any).referenceAnswer && (
                <div className="mt-2 text-[12px] text-slate-500 bg-white rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-400">参考答案: </span>
                  {(q as any).referenceAnswer.length > 100
                    ? (q as any).referenceAnswer.slice(0, 100) + '…'
                    : (q as any).referenceAnswer}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-slate-100 flex-shrink-0 flex items-center justify-between">
          <button
            onClick={onCopyPrompt}
            className="px-4 py-2.5 text-[13px] bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
          >
            📋 复制提示词
          </button>
          <div className="flex gap-3">
            <button
              onClick={onRegenerate}
              className="px-4 py-2.5 text-[13px] bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
            >
              重新生成
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-6 py-2.5 text-[13px] bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 disabled:opacity-50 transition-all shadow-md shadow-sky-200"
            >
              {saving ? '保存中…' : '确认保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit 2>&1 | grep -v "CategorySelect" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/components/AIGenerateDialog.tsx src/components/AIGeneratePreview.tsx
git commit -m "feat: add quiz generation progress dialog and preview components"
```

---

### Task 7: /upload 页面集成

**Files:**
- Modify: `src/app/upload/page.tsx`

**Interfaces:**
- Consumes: `AIGenerateForm` from `@/components/AIGenerateForm`
- Consumes: `AIGenerateDialog` from `@/components/AIGenerateDialog`
- Consumes: `AIGeneratePreview` from `@/components/AIGeneratePreview`
- Consumes: `buildGenerateUserPrompt`, `buildGenerateSystemPrompt` from `@/lib/ai/generate-prompt`
- Produces: Tab 切换 + 完整生成流程串联

- [ ] **Step 1: 改造 upload/page.tsx**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import UploadForm from '@/components/UploadForm';
import AIGenerateForm from '@/components/AIGenerateForm';
import AIGenerateDialog from '@/components/AIGenerateDialog';
import AIGeneratePreview from '@/components/AIGeneratePreview';
import Toast from '@/components/Toast';
import { buildGenerateSystemPrompt, buildGenerateUserPrompt } from '@/lib/ai/generate-prompt';

type Tab = 'upload' | 'generate';

export default function UploadPage() {
  const router = useRouter();
  const { user, loading, token } = useAuth();
  const [tab, setTab] = useState<Tab>('upload');

  // AI 生成状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState<any[] | null>(null);
  const [genTopic, setGenTopic] = useState('');
  const [genCounts, setGenCounts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  function handleGenerate(topic: string, counts: Record<string, number>) {
    setGenTopic(topic);
    setGenCounts(counts);
    setDialogOpen(true);
  }

  function handleCopyPrompt(topic: string, counts: Record<string, number>) {
    const systemPrompt = buildGenerateSystemPrompt();
    const userPrompt = buildGenerateUserPrompt(topic, counts);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    navigator.clipboard.writeText(fullPrompt).then(
      () => { setToastMessage('提示词已复制到剪贴板'); setToastVisible(true); },
      () => { setToastMessage('复制失败，请手动复制'); setToastVisible(true); },
    );
  }

  function handleComplete(questions: any[]) {
    setDialogOpen(false);
    setPreviewQuestions(questions);
  }

  function handleDialogError(msg: string) {
    setDialogOpen(false);
    setToastMessage(msg);
    setToastVisible(true);
  }

  async function handleSave() {
    if (!previewQuestions || !token) return;
    setSaving(true);
    try {
      const title = genTopic.slice(0, 50) || 'AI 生成题库';
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, questions: previewQuestions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '保存失败');
      router.push(`/quiz/${data.quiz.id}`);
    } catch (err) {
      setToastMessage('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
      setToastVisible(true);
    } finally {
      setSaving(false);
    }
  }

  function handleRegenerate() {
    setPreviewQuestions(null);
    handleGenerate(genTopic, genCounts);
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header + Tab */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回首页
          </button>
          <div className="text-center">
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-sky-500/80 font-medium mb-1">
              {tab === 'upload' ? 'Upload' : 'AI Generate'}
            </div>
            <h1
              className="text-[22px] leading-tight text-slate-800"
              style={{ fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic', fontWeight: 500 }}
            >
              {tab === 'upload' ? '上传题库' : 'AI 生成题库'}
            </h1>
          </div>
          <div className="w-20" />
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-8 bg-white/50 p-1 rounded-xl border border-slate-200/60 w-fit">
          <button
            onClick={() => setTab('upload')}
            className={`px-5 py-2 rounded-lg text-[13.5px] font-medium transition-all ${
              tab === 'upload' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            上传文件
          </button>
          <button
            onClick={() => setTab('generate')}
            className={`px-5 py-2 rounded-lg text-[13.5px] font-medium transition-all ${
              tab === 'generate' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            AI 生成
          </button>
        </div>

        {/* 内容区 */}
        {tab === 'upload' ? (
          <UploadForm />
        ) : (
          <AIGenerateForm
            onGenerate={handleGenerate}
            onCopyPrompt={handleCopyPrompt}
          />
        )}

        {/* AI 生成进度弹窗 */}
        <AIGenerateDialog
          open={dialogOpen}
          topic={genTopic}
          counts={genCounts}
          token={token}
          onComplete={handleComplete}
          onError={handleDialogError}
          onCancel={() => setDialogOpen(false)}
        />

        {/* 题目预览弹窗 */}
        {previewQuestions && (
          <AIGeneratePreview
            questions={previewQuestions}
            topic={genTopic}
            onSave={handleSave}
            onRegenerate={handleRegenerate}
            onCopyPrompt={() => handleCopyPrompt(genTopic, genCounts)}
            saving={saving}
          />
        )}

        <Toast message={toastMessage} visible={toastVisible} onHide={() => setToastVisible(false)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译和现有功能**

```bash
npx tsc --noEmit 2>&1 | grep -v "CategorySelect" | head -20
# 无新增错误

# 确认 UploadForm 仍然在 "上传文件" tab 下正常工作
```

- [ ] **Step 3: Commit**

```bash
git add src/app/upload/page.tsx
git commit -m "feat: integrate AI quiz generation tab into /upload page"
```

---

### Task 8: 端到端测试与收尾

**Files:**
- Create: `tests/api/generate-quiz.test.ts`

- [ ] **Step 1: 编写 API 测试**

在 `tests/api/generate-quiz.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { estimateGenerateCost } from '@/lib/credits/generate-cost';
import { buildGenerateSystemPrompt, buildGenerateUserPrompt } from '@/lib/ai/generate-prompt';

describe('generate-quiz integration sanity', () => {
  it('完整提示词构建 + 积分预估 端到端验证', () => {
    const topic = '计算机网络OSI七层模型';
    const counts = { single: 3, multiple: 2, boolean: 1, fill: 0, essay: 1, interview: 1 };

    // 提示词能正常构建
    const system = buildGenerateSystemPrompt();
    const user = buildGenerateUserPrompt(topic, counts);
    expect(system.length).toBeGreaterThan(100);
    expect(user).toContain(topic);
    expect(user).toContain('单选题');
    expect(user).toContain('3 题');

    // 积分预估正确
    const cost = estimateGenerateCost(counts);
    expect(cost).toBe(3 * 2 + 2 * 2 + 1 * 1 + 0 + 1 * 5 + 1 * 8); // 6+4+1+0+5+8 = 24
    expect(cost).toBe(24);
  });

  it('全部为 0 时提示词不包含该题型', () => {
    const user = buildGenerateUserPrompt('test', { single: 5, multiple: 0, boolean: 0, fill: 0, essay: 0, interview: 0 });
    expect(user).toContain('单选题');
    expect(user).toContain('5 题');
    expect(user).toContain('不要生成');
  });
});
```

- [ ] **Step 2: 运行所有相关测试**

```bash
npx vitest run tests/api/generate-quiz.test.ts tests/credits/generate-cost.test.ts tests/lib/ai/generate-prompt.test.ts
# Expected: all PASS
```

- [ ] **Step 3: 整体验证**

```bash
# TypeScript 编译
npx tsc --noEmit 2>&1 | grep -v "CategorySelect" | head -20

# 确认无新增 TS 错误
```

- [ ] **Step 4: Commit**

```bash
git add tests/api/generate-quiz.test.ts
git commit -m "test: add quiz generation integration tests"
```

---

## 实施检查清单

完成所有 Task 后，逐项验证：

- [ ] `/upload` 页默认显示「上传文件」tab
- [ ] 切换到「AI 生成」tab 显示表单
- [ ] 所有题型数量为 0 时按钮置灰
- [ ] 修改数量时预估积分实时更新
- [ ] 输入主题 + 设置数量 → 点「生成题库」→ 进度弹窗显示流式文字
- [ ] 生成完成 → 题目预览弹窗展示所有题目（含选项、答案、难度）
- [ ] 预览中可点「确认保存」→ 创建题库 → 跳转答题页
- [ ] 预览中可点「重新生成」→ 重新调 API
- [ ] 预览中可点「复制提示词」→ prompt 复制到剪贴板
- [ ] 积分不足时弹窗提示并引导充值
- [ ] AI 失败时积分正确退还
- [ ] `creditLedger` 表有 `ai_generate_quiz` 记录
