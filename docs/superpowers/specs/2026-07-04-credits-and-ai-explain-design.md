# 积分系统 + AI 单题解析 设计

**日期**: 2026-07-04
**项目**: HomeWork-AI (Next.js 16 + Prisma 5 + MySQL)
**状态**: 设计稿,等待用户审阅

---

## 1. 目标与背景

### 1.1 痛点

1. AI 厂商每次解析整套题库(40 题)成本较高,大部分用户只对个别题有疑问,白白消耗了大量 token。
2. 没有激励用户每日回访的机制,留存差。
3. 没有任何「变现」路径,服务器/AI 厂商持续烧钱。

### 1.2 目标

- 答题页提供「单题 AI 解析」入口,**只解析用户答错的题**,按难度收积分。
- 用户表 + CreditLedger(流水) + DailyCheckIn(签到) + AIExplanation(解析缓存)。
- 每日签到送 5 积分,鼓励回访。
- 「充值」入口先 UI 占位(运营手工加积分),后续对接支付宝/微信。

### 1.3 决策记录(已与用户确认)

| 决策点 | 值 |
|--------|----|
| 积分单价 | 简单 3 / 中等 5 / 困难 10 credit |
| 默认余额 | 0(需充值或签到获取) |
| 充值 | UI 占位,本期不接支付(后续 PR) |
| 每日签到 | +5(每天 1 次) |
| AI 解析触发 | 答题页仅对「错题」显示按钮(单题) |
| AI 模型 | 复用现有 AI 厂商配置 |
| 难度粒度 | 3 档:简单 / 中等 / 困难 |

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  ① 数据库层: User.credits + CreditLedger + DailyCheckIn     │
│               + AIExplanation                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ② 服务层 src/lib/credits/                                   │
│     explain-cost.ts    按难度取价                              │
│     checkin.ts         每日签到 + 防重复                       │
│     explain.ts         AI 单题解析事务 + 扣费 + 缓存          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ③ API 路由                                                    │
│     GET  /api/user/credits                                  │
│     POST /api/user/checkin                                  │
│     POST /api/user/topup   (占位)                             │
│     POST /api/ai/explain                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ④ 前端 UI                                                     │
│     Layout 余额徽章 + 签到按钮                                 │
│     /credits 页 (充值占位 + 流水)                             │
│     答题页错题「AI 解析此题」按钮                             │
│     题库管理上传加难度字段                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 数据模型

### 3.1 Prisma Schema 改动

```prisma
// src/prisma/schema.prisma (追加)

model User {
  // ... 现有字段
  credits      Int       @default(0)  // 当前可用积分
  checkIns     DailyCheckIn[]
  creditLogs   CreditLedger[]
  explanations AIExplanation[]
}

enum CreditReason {
  signup           // 注册奖励(可选)
  daily_signin     // 每日签到 +5
  topup            // 充值
  admin_adjust     // 管理员手工调整
  ai_explain       // AI 解析扣费
  refund           // 退还(预留)
}

model CreditLedger {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  delta     Int       // +N 收入 / -N 支出
  reason    CreditReason
  refId     String?   // 关联订单 / 解析 id
  balance   Int       // 变更后余额
  createdAt DateTime  @default(now())

  @@index([userId, createdAt])
}

model DailyCheckIn {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  checkInDate  DateTime @db.Date       // 按 UTC 日期
  credit       Int      @default(5)
  createdAt    DateTime @default(now())

  @@unique([userId, checkInDate])
}

model AIExplanation {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  questionId String
  costCredit Int                          // 扣掉的积分
  content    String   @db.Text            // AI 返回 markdown 解析
  createdAt  DateTime @default(now())

  @@index([userId, questionId])          // 用于"同题已解析则免费"查询
}
```

### 3.2 Question 字段(在 Prisma 里加,**不破坏现有 JSON data**)

数据库存的题目 JSON 已经有 `difficulty` 字段(若有),没有则默认 `中等`。Question 类型:

```ts
// src/types/index.ts
export type Difficulty = '简单' | '中等' | '困难';
export interface BaseQuestion {
  // ... 现有字段
  difficulty?: Difficulty; // 可选;没有视作'中等'
}
```

数据库 schema 没有对应字段(题目 content 是 JSON string 里)。不需要数据库迁移——解析时 fallback 即可。

### 3.3 初始数据

- 默认余额:0(用户首次注册时仍是 0)
- 签到每用户每天最多 1 次

---

## 4. 服务层设计

### 4.1 积分定价 src/lib/credits/explain-cost.ts

```ts
import type { Difficulty } from '@/types';

const COST: Record<Difficulty | 'default', number> = {
  '简单': 3,
  '中等': 5,
  '困难': 10,
  default: 5,
};

export function getExplainCost(difficulty?: Difficulty | string | null): number {
  if (difficulty && difficulty in COST) return COST[difficulty as Difficulty];
  return COST.default;
}

export const EXPLAIN_COST_DEFAULT = 5;
```

### 4.2 签到 src/lib/credits/checkin.ts

```ts
import { prisma } from '@/lib/prisma';

const REWARD = 5;

export async function checkInToday(userId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // prisma.$transaction 内做以下:
  // - INSERT DailyCheckIn (db.Date 字段)
  // - IF @@unique conflict → throw 已签到
  // - UPDATE User.credits += 5
  // - INSERT CreditLedger(reason='daily_signin', delta=+5, balance=new)
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

export class AlreadyCheckedInError extends Error {
  constructor() { super('今天已签到'); }
}
```

### 4.3 AI 解析 src/lib/credits/explain.ts

```ts
import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { QUESTION_EXPLAIN_PROMPT } from '@/lib/ai/explain-prompt';
import { decryptApiKey } from '@/lib/ai/crypto';
import { getExplainCost } from './explain-cost';

export class InsufficientCreditsError extends Error {
  constructor(public required: number, public balance: number) {
    super(`积分不足: 需要 ${required}, 当前 ${balance}`);
  }
}

/**
 * 单题 AI 解析:
 * 1. 查题目
 * 2. 计算价格
 * 3. 事务内校验余额 + 扣费 + 写流水
 * 4. 调 AI(失败回滚)
 * 5. 写 AIExplanation(content)
 * 6. 返回结果
 *
 * 缓存: 同 (userId, questionId) 已存在 → 直接返回,不再扣费
 */
export async function explainQuestion(opts: {
  userId: string;
  questionId: string;
  questionContent: string;
  questionType: string;
  signal?: AbortSignal;
}): Promise<{ content: string; cached: boolean; newBalance: number; costCredit: number }> {
  const existing = await prisma.aIExplanation.findFirst({
    where: { userId: opts.userId, questionId: opts.questionId },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return { content: existing.content, cached: true, newBalance: (await getBalance(opts.userId)), costCredit: 0 };
  }

  // 这里用 prisma 拿题目取 difficulty
  // 注意: 题目存在 Quiz.questions JSON 里,需要从某处取 difficulty。这里简化为:
  //   difficulty 通过 params 传入, 或从 content 里解析。
  //   为简化,本期先从 opts.questionContent 推断:
  const cost = getExplainCost(inferDifficulty(opts.questionContent));

  const after = await prisma.$transaction(async (tx) => {
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
    await prisma.aIExplanation.create({
      data: {
        userId: opts.userId,
        questionId: opts.questionId,
        costCredit: cost,
        content,
      },
    });
    return { content, cached: false, newBalance: after, costCredit: cost };
  } catch (err) {
    // AI 失败: 回滚扣费
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

async function getBalance(userId: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  return u?.credits ?? 0;
}

/**
 * 从题目文本里推断难度(简单启发式):
 * - 含「代码」「编程」「算法」→ 困难
 * - 含「简答」「论述」「分析」→ 中等
 * - 选择/判断/填空 → 中等(默认)
 * 实际可由题库管理显式传入,这里仅 fallback
 */
function inferDifficulty(text: string): '简单' | '中等' | '困难' {
  if (/代码|编程|算法|实现|function|class|def /.test(text)) return '困难';
  if (/简答|论述|分析|解释/.test(text)) return '中等';
  return '中等';
}
```

### 4.4 explain prompt src/lib/ai/explain-prompt.ts

```ts
export const QUESTION_EXPLAIN_PROMPT = `你是一位耐心的老师。学生答错了下面的题目,请用简洁清晰的方式:
1. 简述题目考点
2. 解释为什么学生的答案错(用 markdown 列出要点)
3. 给出正确答案 + 简要解题思路
4. 如果是代码题,展示正确代码并逐步讲解

请用中文回答,使用 markdown 格式,长度 200-500 字。`;
```

---

## 5. API 路由

### 5.1 GET /api/user/credits

**响应**:
```json
{
  "balance": 50,
  "checkedIn": false,
  "checkInReward": 5
}
```

### 5.2 POST /api/user/checkin

**响应(成功)**:
```json
{ "ok": true, "balance": 55, "credit": 5 }
```

**响应(已签到)**:
```json
{ "error": "今天已签到" }  → HTTP 409
```

### 5.3 POST /api/user/topup (占位)

**Body**: `{ amount: number }`

**响应**:
```json
{
  "orderId": "cuid...",
  "status": "pending",
  "message": "支付未对接,请联系运营手工加积分"
}
```

**本期行为**: 仅创建 `CreditLedger(reason='topup', delta=+amount)`,但不接支付
前端文案:「充值服务即将上线,请联系管理员手工充值」

### 5.4 POST /api/ai/explain

**Body**:
```json
{
  "questionId": "q_xxx",
  "content": "题目内容",
  "type": "single|multiple|boolean|fill|essay|code"
}
```

**响应(成功)**:
```json
{
  "content": "## 考点...",
  "cached": false,
  "newBalance": 45,
  "costCredit": 5
}
```

**响应(缓存命中)**:
```json
{
  "content": "...",
  "cached": true,
  "newBalance": 50,
  "costCredit": 0
}
```

**响应(余额不足)**:
```json
{ "error": "积分不足", "required": 5, "balance": 2 }  → HTTP 400
```

---

## 6. UI 设计

### 6.1 顶部 Layout 余额徽章

在 Sidebar/Layout 顶部显示当前余额徽章 + 签到按钮:

```
┌────────────────────────────┐
│  💎 50         [签到 +5]   │
│  - 余额明细                │
│  - 充值(占位)              │
└────────────────────────────┘
```

### 6.2 答题页错题 AI 解析按钮

在 AnswerSheet 错题展开视图里,「参考答案」下面加一行:

```
[ 你的答案 ]    [ 参考答案 ]
[  🧠 AI 解析此题 (-5 credit) ]   ← 仅错题显示
        ↓ 点击后
[ AI 解析中... 旋转 spinner ]
        ↓ 完成后
[ AI 解析结果 (markdown 渲染) ]
        ↓ 缓存命中
[ 已为你解析过 (免费查看) ]
```

### 6.3 /credits 页面

```
┌──────────────────────────────────────┐
│ 当前余额: 💎 50                      │
│ [充值(占位)]  [今日签到 +5 (已签到)] │
│                                       │
│ 积分流水                              │
│ ─────────────────────────────────────│
│ 2026-07-04 12:00  daily_signin  +5  → 50 │
│ 2026-07-03 09:00  ai_explain   -5  → 45 │
│ 2026-07-02 18:00  topup       +100 → 50 │
└──────────────────────────────────────┘
```

---

## 7. 关键文件清单

**新建**:
- `src/lib/credits/explain-cost.ts`
- `src/lib/credits/checkin.ts`
- `src/lib/credits/explain.ts`
- `src/lib/ai/explain-prompt.ts`
- `src/app/api/user/credits/route.ts`
- `src/app/api/user/checkin/route.ts`
- `src/app/api/user/topup/route.ts`
- `src/app/api/ai/explain/route.ts`
- `src/app/credits/page.tsx`
- `src/components/CreditBadge.tsx`
- `src/components/AIExplainPanel.tsx`
- `tests/credits/checkin.test.ts`
- `tests/credits/explain-cost.test.ts`
- `tests/credits/explain.test.ts`
- `tests/api/user-credits.test.ts`

**修改**:
- `prisma/schema.prisma` — 加 4 个 model + User.credits 字段
- `src/components/admin/QuizUploadPanel.tsx` — 加难度字段
- `src/components/admin/AiProviderModal.tsx` — 不改
- `src/components/AnswerSheet.tsx` — 错题加「AI 解析」按钮
- `src/components/Sidebar.tsx` — 顶部余额徽章

---

## 8. 验证

```bash
# 1. 类型检查
npx tsc --noEmit
# 预期:0 错误

# 2. 测试
npx vitest run
# 预期:95 + 新增 8-12 测试

# 3. 数据库
npx prisma db push
# 重启 dev server

# 4. 浏览器
# - 访问 /quiz/<id>
# - 答错题 → 展开错题 → 点「AI 解析」→ 提示扣 5 credit → 显示 markdown
# - 余额为 0 时: 弹「积分不足」+ 跳转 /credits
# - 顶部徽章签到: 余额 +5
# - 同题再点 AI: 显示「免费查看」(缓存命中)
```

---

## 9. 不在本期范围

- ❌ 真实支付集成(支付宝/微信),topup 占位
- ❌ 月度账单 / 报销功能
- ❌ 连续签到奖励递增(连续 N 天 +N)
- ❌ 退款逆操作 UI(数据库预留 reason='refund',前端不展示)
- ❌ AI 解析历史页(可 v2 加)