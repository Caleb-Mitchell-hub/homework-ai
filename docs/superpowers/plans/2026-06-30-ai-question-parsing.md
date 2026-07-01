# AI 题目解析 + 多文档上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为题目解析流程引入**可配置 AI 厂商**(DeepSeek / 豆包 / 通义千问 / 智谱 / 自定义),并扩展文件上传至 **Markdown / TXT / PDF / Word / 图片**,本地解析与 AI 解析并行,前端双 tab 切换预览。

**Architecture:** 单一通用 `fetch` 适配器走 OpenAI Chat Completions 协议(所有国内厂商均兼容)。API Key 用 AES-256-GCM 加密存 MySQL,密钥从 `AI_KEY_ENCRYPTION_SECRET` env 读取。文档抽取用 `pdf-parse` + `mammoth`,图片走视觉模型。本地解析器原样保留作兜底。

**Tech Stack:** Next.js 16.2.6 (App Router) + React 19 + TypeScript 5 + Prisma 5 + MySQL + `pdf-parse` + `mammoth` + Vitest (新增,纯 TS 测试)

---

## 文件结构总览

### 新建 (后端)

- `prisma/migrations/20260701120000_add_ai_provider_config/migration.sql`
- `src/lib/ai/crypto.ts` — AES-256-GCM 加解密
- `src/lib/ai/providers.ts` — OpenAI 兼容 fetch 适配器
- `src/lib/ai/prompt.ts` — 解析系统提示词
- `src/lib/ai/parser.ts` — 编排:provider + text → Question[]
- `src/lib/ai/normalize.ts` — AI 宽松输出 → Question 严格类型映射
- `src/lib/ai/rate-limit.ts` — 内存令牌桶(每用户 10/分钟)
- `src/lib/extract/pdf.ts` — pdf-parse 封装
- `src/lib/extract/docx.ts` — mammoth 封装
- `src/lib/extract/image.ts` — 视觉模型 OCR
- `src/lib/extract/index.ts` — MIME 分派
- `src/lib/ai/providers-presets.ts` — 5 家预置厂商的 baseURL/model 常量
- `src/app/api/admin/ai/providers/route.ts` — GET / POST
- `src/app/api/admin/ai/providers/[id]/route.ts` — PUT / DELETE
- `src/app/api/admin/ai/providers/[id]/test/route.ts` — POST
- `src/app/api/admin/ai/active/route.ts` — PATCH
- `src/app/api/ai/parse/route.ts` — POST 用户侧
- `src/app/api/upload/route.ts` — POST 文件上传

### 新建 (前端)

- `src/app/admin/ai/page.tsx` — AI 厂商配置页
- `src/components/admin/AiProviderModal.tsx` — 新增/编辑弹窗
- `src/components/DualPreview.tsx` — 双 tab 切换预览(共享组件)

### 修改

- `prisma/schema.prisma` — 加 `AIProviderConfig` 模型
- `src/components/AdminSidebar.tsx` — 加「AI 配置」导航项
- `src/components/UploadForm.tsx` — 双预览切换
- `src/components/admin/QuizUploadPanel.tsx` — 双预览切换
- `package.json` — 加 `pdf-parse` `mammoth` `@types/mammoth` `vitest`
- `.env.example` — 加 `AI_KEY_ENCRYPTION_SECRET` 注释

### 不修改

- `src/lib/parser.ts`(本地解析器保留作兜底)
- `src/lib/question-normalize.ts`(已存在,本计划复用)
- `src/types/index.ts`(Question 类型已定)
- `src/app/api/quizzes/route.ts`(保存路径不动)

### 测试

- `tests/ai/crypto.test.ts`
- `tests/ai/providers.test.ts`
- `tests/ai/parser.test.ts`
- `tests/ai/normalize.test.ts`
- `tests/ai/prompt.test.ts`
- `tests/extract/dispatcher.test.ts`
- `tests/extract/pdf.test.ts`
- `tests/extract/docx.test.ts`
- `tests/api/ai-providers.test.ts`
- `tests/api/ai-parse.test.ts`

### Fixtures

- `tests/fixtures/parse/basic-choice.md`
- `tests/fixtures/parse/code-heavy.md`
- `tests/fixtures/parse/mixed-types.md`
- `tests/fixtures/parse/sample.pdf`(由实际 PDF 生成,gitignore 提交)
- `tests/fixtures/parse/sample.docx`

---

## Phase 1 — AI 配置底座 + 单厂商 AI 解析文本

### Task 1: 添加测试框架 Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/sanity.test.ts`

- [ ] **Step 1: 安装 Vitest**

Run:
```bash
npm install -D vitest @vitest/coverage-v8 happy-dom
```
Expected: package.json 新增 vitest,@vitest/coverage-v8,happy-dom

- [ ] **Step 2: 在 package.json 加 test 脚本**

修改 `package.json` 的 `scripts`:
```json
"scripts": {
  "dev": "next dev -H 0.0.0.0",
  "build": "next build",
  "start": "next start -H 0.0.0.0",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: 创建 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 4: 创建 sanity 测试**

Create `tests/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: 1 passed

- [ ] **Step 6: 提交**

```bash
git add package.json vitest.config.ts tests/sanity.test.ts
git commit -m "chore: add vitest test framework"
```

---

### Task 2: Prisma schema — AIProviderConfig 模型

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260701120000_add_ai_provider_config/migration.sql`

- [ ] **Step 1: 在 schema.prisma 末尾追加模型**

在 `prisma/schema.prisma` 末尾添加:
```prisma
/// 管理员配置的 AI 厂商(用于题目解析)
model AIProviderConfig {
  id              String   @id @default(cuid())
  /// 友好名,如 "DeepSeek 主用"
  name            String
  /// 厂商 key: "deepseek" | "doubao" | "qwen" | "zhipu" | "custom"
  provider        String
  /// OpenAI 兼容 baseURL
  baseURL         String
  /// AES-256-GCM 加密后的 API key (iv + tag + ciphertext, base64)
  apiKeyCipher    String   @db.Text
  /// API key 末 4 位(用于 UI 展示,不暴露明文)
  apiKeyLast4     String
  /// 主对话模型
  model           String
  /// 视觉模型(可选)
  visionModel     String?
  /// 是否启用图片识别
  supportsVision  Boolean  @default(false)
  /// 当前激活厂商(全局唯一,通过事务切换)
  isActive        Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([isActive])
}
```

- [ ] **Step 2: 用 prisma migrate dev 生成迁移**

Run:
```bash
npx prisma migrate dev --name add_ai_provider_config
```
Expected: 自动生成 `prisma/migrations/20260701120000_add_ai_provider_config/migration.sql`,并运行 `prisma generate`

- [ ] **Step 3: 检查生成的 SQL**

Read: `prisma/migrations/20260701120000_add_ai_provider_config/migration.sql`
Expected: 包含 CREATE TABLE 语句,字段与 schema 一致

- [ ] **Step 4: 提交**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add AIProviderConfig model"
```

---

### Task 3: AI_KEY_ENCRYPTION_SECRET 环境变量 + 启动校验

**Files:**
- Modify: `.env.example`
- Modify: `src/lib/prisma.ts`(加密钥启动校验,或新建 src/lib/env.ts)

- [ ] **Step 1: 创建 `.env.example`(若不存在),添加密钥注释**

Read `.env`:
```bash
cat .env
```
如果 `AI_KEY_ENCRYPTION_SECRET` 不存在,创建或修改 `.env`:
```bash
# 用于加密 AI 厂商 API key,必须 ≥ 32 字符
# 生成: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
AI_KEY_ENCRYPTION_SECRET=please-change-me-to-a-random-32-char-string-or-more
```

- [ ] **Step 2: 创建 `src/lib/env.ts` 启动校验**

Create `src/lib/env.ts`:
```ts
const SECRET = process.env.AI_KEY_ENCRYPTION_SECRET;

if (!SECRET || SECRET.length < 32) {
  throw new Error(
    'AI_KEY_ENCRYPTION_SECRET is missing or too short (need ≥ 32 chars). ' +
    'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
  );
}

export const AI_KEY_SECRET = SECRET;
```

- [ ] **Step 3: 在 prisma.ts 引用(确保模块图经过 env 校验)**

Edit `src/lib/prisma.ts` 第 1 行后插入:
```ts
import { PrismaClient } from '@prisma/client';
import './env'; // 启动校验 AI_KEY_ENCRYPTION_SECRET

const globalForPrisma = global as unknown as { prisma: PrismaClient };
// ... 后面不变
```

- [ ] **Step 4: 启动 dev server 验证不报错**

Run: `npm run dev`
Expected: 启动成功,控制台无 "AI_KEY_ENCRYPTION_SECRET" 报错

- [ ] **Step 5: 临时把密钥改短,验证启动失败**

Edit `.env` 把 `AI_KEY_ENCRYPTION_SECRET` 改成 `too-short`,重启 `npm run dev`
Expected: 启动失败,报错 "AI_KEY_ENCRYPTION_SECRET is missing or too short"

- [ ] **Step 6: 还原密钥**

Edit `.env` 还原 `AI_KEY_ENCRYPTION_SECRET=please-change-me-to-a-random-32-char-string-or-more`

- [ ] **Step 7: 提交**

```bash
git add src/lib/env.ts src/lib/prisma.ts .env.example
git commit -m "feat(env): validate AI_KEY_ENCRYPTION_SECRET on startup"
```

---

### Task 4: AES-256-GCM 加解密模块 (TDD)

**Files:**
- Create: `src/lib/ai/crypto.ts`
- Create: `tests/ai/crypto.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/ai/crypto.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { encryptApiKey, decryptApiKey } from '@/lib/ai/crypto';

describe('AI crypto', () => {
  it('round-trips API key', () => {
    const plain = 'sk-test-1234567890abcdef';
    const cipher = encryptApiKey(plain);
    expect(cipher).not.toBe(plain);
    expect(decryptApiKey(cipher)).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const plain = 'sk-test-same-input';
    const c1 = encryptApiKey(plain);
    const c2 = encryptApiKey(plain);
    expect(c1).not.toBe(c2);
  });

  it('throws on tampered ciphertext', () => {
    const cipher = encryptApiKey('sk-test');
    // 翻转密文最后一位 base64 字符
    const tampered = cipher.slice(0, -1) + (cipher.endsWith('A') ? 'B' : 'A');
    expect(() => decryptApiKey(tampered)).toThrow();
  });

  it('handles unicode keys', () => {
    const plain = '密钥-中文-key';
    expect(decryptApiKey(encryptApiKey(plain))).toBe(plain);
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- crypto`
Expected: FAIL (module not found)

- [ ] **Step 3: 实现 crypto.ts**

Create `src/lib/ai/crypto.ts`:
```ts
import crypto from 'crypto';
import { AI_KEY_SECRET } from '@/lib/env';

// 把 secret 规整成 32 字节 key (AES-256)
const KEY = Buffer.from(AI_KEY_SECRET.padEnd(32).slice(0, 32));

export function encryptApiKey(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptApiKey(cipherText: string): string {
  const buf = Buffer.from(cipherText, 'base64');
  if (buf.length < 12 + 16) throw new Error('cipher too short');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** 取字符串末 4 位用于 UI 展示(不暴露明文) */
export function last4(s: string): string {
  return s.length <= 4 ? s : s.slice(-4);
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npm test -- crypto`
Expected: 4 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/crypto.ts tests/ai/crypto.test.ts
git commit -m "feat(ai): AES-256-GCM api key encryption"
```

---

### Task 5: OpenAI 兼容 fetch 适配器 (TDD)

**Files:**
- Create: `src/lib/ai/providers.ts`
- Create: `tests/ai/providers.test.ts`

- [ ] **Step 1: 写失败的测试**

Create `tests/ai/providers.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callChat } from '@/lib/ai/providers';

describe('callChat', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends POST to baseURL/chat/completions with Bearer token', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'pong' } }] }),
    });

    const out = await callChat({
      baseURL: 'https://api.deepseek.com/v1/',
      apiKey: 'sk-test',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'ping' }],
    });

    expect(out).toBe('pong');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('strips trailing slash from baseURL', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    });
    await callChat({
      baseURL: 'https://example.com/',
      apiKey: 'k',
      model: 'm',
      messages: [],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/chat/completions',
      expect.anything()
    );
  });

  it('includes response_format=json_object when jsonMode', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{}' } }] }),
    });
    await callChat({
      baseURL: 'https://x.com',
      apiKey: 'k',
      model: 'm',
      messages: [],
      jsonMode: true,
    });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws on non-ok with status and excerpt', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => '{"error":"unauthorized"}',
    });
    await expect(
      callChat({ baseURL: 'https://x.com', apiKey: 'k', model: 'm', messages: [] })
    ).rejects.toThrow(/401.*unauthorized/);
  });

  it('supports image_url content parts', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'OCR done' } }] }),
    });
    await callChat({
      baseURL: 'https://x.com',
      apiKey: 'k',
      model: 'vision',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,XXX' } },
          { type: 'text', text: '描述此图' },
        ],
      }],
    });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.messages[0].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,XXX' },
    });
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- providers`
Expected: FAIL

- [ ] **Step 3: 实现 providers.ts**

Create `src/lib/ai/providers.ts`:
```ts
export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export interface CallChatOpts {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: AIChatMessage[];
  jsonMode?: boolean;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export async function callChat(opts: CallChatOpts): Promise<string> {
  const url = `${opts.baseURL.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 8000,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npm test -- providers`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/providers.ts tests/ai/providers.test.ts
git commit -m "feat(ai): OpenAI-compatible chat adapter"
```

---

### Task 6: 预置厂商常量

**Files:**
- Create: `src/lib/ai/providers-presets.ts`
- Create: `tests/ai/providers-presets.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/ai/providers-presets.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PRESETS, getPreset } from '@/lib/ai/providers-presets';

describe('provider presets', () => {
  it('contains all 5 keys', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(
      ['custom', 'deepseek', 'doubao', 'qwen', 'zhipu']
    );
  });

  it('deepseek has no vision model', () => {
    expect(PRESETS.deepseek.visionModel).toBeUndefined();
  });

  it('doubao/qwen/zhipu have vision models', () => {
    expect(PRESETS.doubao.visionModel).toBeTruthy();
    expect(PRESETS.qwen.visionModel).toBeTruthy();
    expect(PRESETS.zhipu.visionModel).toBeTruthy();
  });

  it('getPreset returns by key', () => {
    expect(getPreset('deepseek').baseURL).toContain('deepseek');
  });

  it('custom preset has empty fields', () => {
    expect(getPreset('custom').baseURL).toBe('');
    expect(getPreset('custom').model).toBe('');
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- providers-presets`
Expected: FAIL

- [ ] **Step 3: 实现 providers-presets.ts**

Create `src/lib/ai/providers-presets.ts`:
```ts
export interface ProviderPreset {
  label: string;
  baseURL: string;
  model: string;
  visionModel?: string;
  supportsVision: boolean;
}

export const PRESETS: Record<string, ProviderPreset> = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    supportsVision: false,
  },
  doubao: {
    label: '豆包',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1-5-pro-32k-250115',
    visionModel: 'doubao-1-5-vision-pro-250315',
    supportsVision: true,
  },
  qwen: {
    label: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    visionModel: 'qwen-vl-plus',
    supportsVision: true,
  },
  zhipu: {
    label: '智谱',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-plus',
    visionModel: 'glm-4v-plus',
    supportsVision: true,
  },
  custom: {
    label: '自定义',
    baseURL: '',
    model: '',
    supportsVision: false,
  },
};

export function getPreset(key: string): ProviderPreset {
  return PRESETS[key] ?? PRESETS.custom;
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npm test -- providers-presets`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/providers-presets.ts tests/ai/providers-presets.test.ts
git commit -m "feat(ai): provider presets (DeepSeek/豆包/通义/智谱/自定义)"
```

---

### Task 7: 解析系统提示词

**Files:**
- Create: `src/lib/ai/prompt.ts`
- Create: `tests/ai/prompt.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/ai/prompt.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { QUESTION_PARSE_PROMPT } from '@/lib/ai/prompt';

describe('parse prompt', () => {
  it('mentions all 6 question types', () => {
    expect(QUESTION_PARSE_PROMPT).toContain('"single"');
    expect(QUESTION_PARSE_PROMPT).toContain('"multiple"');
    expect(QUESTION_PARSE_PROMPT).toContain('"boolean"');
    expect(QUESTION_PARSE_PROMPT).toContain('"fill"');
    expect(QUESTION_PARSE_PROMPT).toContain('"essay"');
    expect(QUESTION_PARSE_PROMPT).toContain('"code"');
  });

  it('instructs JSON output (no markdown)', () => {
    expect(QUESTION_PARSE_PROMPT).toMatch(/JSON/i);
    expect(QUESTION_PARSE_PROMPT).toMatch(/不要.*markdown/);
  });

  it('instructs preserving code block indentation', () => {
    expect(QUESTION_PARSE_PROMPT).toMatch(/缩进/);
  });

  it('handles empty input', () => {
    expect(QUESTION_PARSE_PROMPT).toContain('[]');
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- prompt`
Expected: FAIL

- [ ] **Step 3: 实现 prompt.ts**

Create `src/lib/ai/prompt.ts`:
```ts
export const QUESTION_PARSE_PROMPT = `你是题目解析专家。给定一段文本(可能来自 Markdown / PDF / Word / 图片 OCR),请提取所有题目并以严格 JSON 数组返回(不要任何解释文本、不要 markdown 围栏)。

每道题的 schema:
{
  "type": "single" | "multiple" | "boolean" | "fill" | "essay" | "code",
  "title": "题干(保留 Markdown 行内格式)",
  "options": [{ "key": "A", "text": "选项内容" }, ...],
  "correctAnswer": "A" | ["A","B"] | "true" | "false" | "填空答案",
  "answer": "解析过程",
  "code": "代码块(不含围栏)",
  "language": "python" | "javascript" | "java" | "cpp" | ...,
  "inputExample": "示例输入",
  "outputExample": "示例输出"
}

规则:
1. 题目之间用 --- 风格的分隔符或题号识别
2. 选项若原文无 key,按顺序标 A/B/C/D
3. 代码块严格保留原始缩进,不要放入 title
4. 若原文没有答案,对应字段填空字符串
5. 文本无任何题目时返回 []`;
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npm test -- prompt`
Expected: 4 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/prompt.ts tests/ai/prompt.test.ts
git commit -m "feat(ai): question parse prompt template"
```

---

### Task 8: AI 宽松输出 → Question 严格类型 (TDD)

**Files:**
- Create: `src/lib/ai/normalize.ts`
- Create: `tests/ai/normalize.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/ai/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeAIOutputToQuestions } from '@/lib/ai/normalize';

const idGen = () => 'q' + Math.random().toString(36).slice(2, 8);

describe('normalizeAIOutputToQuestions', () => {
  it('maps single choice with correctAnswer "A"', () => {
    const out = normalizeAIOutputToQuestions(
      [{
        type: 'single',
        title: '哪一项?',
        options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }],
        correctAnswer: 'A',
        answer: '解析',
      }],
      idGen
    );
    expect(out[0].type).toBe('single');
    expect((out[0] as any).options).toEqual(['甲', '乙']);
    expect((out[0] as any).correctAnswer).toBe('A');
    expect(out[0].answer).toBe('解析');
  });

  it('maps multiple choice with correctAnswer ["A","C"]', () => {
    const out = normalizeAIOutputToQuestions(
      [{
        type: 'multiple',
        title: '多选',
        options: [{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }, { key: 'C', text: 'z' }],
        correctAnswer: ['A', 'C'],
        answer: '',
      }],
      idGen
    );
    expect((out[0] as any).correctAnswer).toBe('A,C');
  });

  it('maps boolean with string "true"', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'boolean', title: '判断', correctAnswer: 'true', answer: '' }],
      idGen
    );
    expect((out[0] as any).correctAnswer).toBe('true');
  });

  it('maps boolean with bool true', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'boolean', title: '判断', correctAnswer: true, answer: '' }],
      idGen
    );
    expect((out[0] as any).correctAnswer).toBe('true');
  });

  it('maps fill question with blanks default 1', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'fill', title: '填空', correctAnswer: '答案', answer: '' }],
      idGen
    );
    expect((out[0] as any).blanks).toBe(1);
    expect((out[0] as any).correctAnswer).toBe('答案');
  });

  it('maps code question with all fields', () => {
    const out = normalizeAIOutputToQuestions(
      [{
        type: 'code',
        title: '写函数',
        code: 'def f(): pass',
        language: 'python',
        inputExample: '1 2',
        outputExample: '3',
        answer: '略',
      }],
      idGen
    );
    expect(out[0].type).toBe('code');
    expect((out[0] as any).code).toBe('def f(): pass');
    expect((out[0] as any).language).toBe('python');
    expect((out[0] as any).inputExample).toBe('1 2');
    expect((out[0] as any).outputExample).toBe('3');
  });

  it('drops unknown question type', () => {
    const out = normalizeAIOutputToQuestions(
      [
        { type: 'single', title: '保留', correctAnswer: 'A', answer: '' },
        { type: 'weird', title: '丢弃', correctAnswer: '', answer: '' },
      ],
      idGen
    );
    expect(out).toHaveLength(1);
  });

  it('assigns id to each question', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'single', title: 'x', correctAnswer: 'A', answer: '' }],
      idGen
    );
    expect(out[0].id).toBeTruthy();
  });

  it('defaults missing optional fields', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'single', title: 'x', correctAnswer: 'A', answer: '' }],
      idGen
    );
    expect(out[0].score).toBeUndefined();
    expect(out[0].analysis).toBeUndefined();
  });

  it('passes through analysis and score if present', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'single', title: 'x', correctAnswer: 'A', answer: '', analysis: '解析', score: 5 }],
      idGen
    );
    expect(out[0].analysis).toBe('解析');
    expect(out[0].score).toBe(5);
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- normalize`
Expected: FAIL

- [ ] **Step 3: 实现 normalize.ts**

Create `src/lib/ai/normalize.ts`:
```ts
import type { Question } from '@/types';

type IdGen = () => string;
type Loose = Record<string, any>;

function pickOptions(raw: any): string[] {
  if (Array.isArray(raw)) {
    // AI 返回 [{key,text}, ...] 时取 text
    return raw.map((o: any) => (typeof o === 'string' ? o : (o?.text ?? String(o ?? ''))));
  }
  return [];
}

function toAnswer(raw: any): string {
  if (Array.isArray(raw)) return raw.join(',');
  if (raw === true) return 'true';
  if (raw === false) return 'false';
  return raw == null ? '' : String(raw);
}

export function normalizeAIOutputToQuestions(
  rawArr: Loose[],
  idGen: IdGen
): Question[] {
  const out: Question[] = [];
  for (const r of rawArr ?? []) {
    const type = r.type;
    const base = {
      id: idGen(),
      title: String(r.title ?? '').trim(),
      answer: String(r.answer ?? ''),
      analysis: r.analysis ? String(r.analysis) : undefined,
      score: typeof r.score === 'number' ? r.score : undefined,
    };
    switch (type) {
      case 'single':
        out.push({
          ...base,
          type: 'single',
          options: pickOptions(r.options),
          correctAnswer: toAnswer(r.correctAnswer),
        });
        break;
      case 'multiple':
        out.push({
          ...base,
          type: 'multiple',
          options: pickOptions(r.options),
          correctAnswer: toAnswer(r.correctAnswer),
        });
        break;
      case 'boolean':
        out.push({
          ...base,
          type: 'boolean',
          correctAnswer: r.correctAnswer === true || r.correctAnswer === 'true' ? 'true' : 'false',
        });
        break;
      case 'fill': {
        const blankCount = Number.isFinite(Number(r.blanks)) && Number(r.blanks) > 0 ? Number(r.blanks) : 1;
        out.push({
          ...base,
          type: 'fill',
          blanks: blankCount,
          correctAnswer: toAnswer(r.correctAnswer),
        });
        break;
      }
      case 'essay':
        out.push({
          ...base,
          type: 'essay',
          referenceAnswer: String(r.referenceAnswer ?? r.answer ?? ''),
        });
        break;
      case 'code':
        out.push({
          ...base,
          type: 'code',
          code: String(r.code ?? ''),
          language: String(r.language ?? 'plaintext'),
          inputExample: String(r.inputExample ?? ''),
          outputExample: String(r.outputExample ?? ''),
        });
        break;
      default:
        // 未知类型,丢弃
        break;
    }
  }
  return out;
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npm test -- normalize`
Expected: 10 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/normalize.ts tests/ai/normalize.test.ts
git commit -m "feat(ai): normalize AI output to Question type"
```

---

### Task 9: 编排入口 aiParseQuestions (TDD)

**Files:**
- Create: `src/lib/ai/parser.ts`
- Create: `tests/ai/parser.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/ai/parser.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiParseQuestions } from '@/lib/ai/parser';

// mock crypto 模块,避免依赖真实密钥
vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: (): string => 'sk-fake',
}));

const fakeProvider = {
  id: 'p1',
  baseURL: 'https://example.com/v1',
  apiKeyCipher: 'X',
  model: 'fake-model',
  supportsVision: false,
  isActive: true,
} as any;

describe('aiParseQuestions', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns normalized questions on valid JSON response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([
              { type: 'single', title: '哪项?', options: [{key:'A',text:'甲'}], correctAnswer: 'A', answer: '' },
            ]),
          },
        }],
      }),
    });
    const out = await aiParseQuestions({ text: '...', provider: fakeProvider });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('single');
  });

  it('strips ```json code fence', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '```json\n[{"type":"single","title":"x","correctAnswer":"A","answer":""}]\n```',
          },
        }],
      }),
    });
    const out = await aiParseQuestions({ text: '...', provider: fakeProvider });
    expect(out).toHaveLength(1);
  });

  it('truncates text to 60k chars', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '[]' } }] }),
    });
    const big = 'A'.repeat(100_000);
    await aiParseQuestions({ text: big, provider: fakeProvider });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    const userMsg = body.messages.find((m: any) => m.role === 'user');
    expect(userMsg.content.length).toBe(60_000);
  });

  it('retries once on JSON parse failure, then gives up', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
    });
    await expect(
      aiParseQuestions({ text: '...', provider: fakeProvider })
    ).rejects.toThrow();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries once and succeeds on second try', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'broken' } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '[{"type":"boolean","title":"x","correctAnswer":"true","answer":""}]' } }],
        }),
      });
    const out = await aiParseQuestions({ text: '...', provider: fakeProvider });
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- ai/parser`
Expected: FAIL

- [ ] **Step 3: 实现 parser.ts**

Create `src/lib/ai/parser.ts`:
```ts
import { callChat } from './providers';
import { QUESTION_PARSE_PROMPT } from './prompt';
import { normalizeAIOutputToQuestions } from './normalize';
import { decryptApiKey } from './crypto';
import type { Question } from '@/types';

interface ProviderLike {
  id: string;
  baseURL: string;
  apiKeyCipher: string;
  model: string;
  supportsVision?: boolean;
  visionModel?: string | null;
  isActive?: boolean;
}

const MAX_TEXT_CHARS = 60_000;
const RETRYABLE = 1;

function stripCodeFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  return s.trim();
}

function genId(): string {
  return 'q_' + Math.random().toString(36).slice(2, 10);
}

export async function aiParseQuestions(opts: {
  text: string;
  provider: ProviderLike;
  signal?: AbortSignal;
}): Promise<Question[]> {
  const apiKey = decryptApiKey(opts.provider.apiKeyCipher);
  const text = opts.text.slice(0, MAX_TEXT_CHARS);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRYABLE; attempt++) {
    try {
      const content = await callChat({
        baseURL: opts.provider.baseURL,
        apiKey,
        model: opts.provider.model,
        messages: [
          { role: 'system', content: QUESTION_PARSE_PROMPT },
          { role: 'user', content: text },
        ],
        jsonMode: true,
        signal: opts.signal,
      });
      const json = stripCodeFence(content);
      const arr = JSON.parse(json);
      if (!Array.isArray(arr)) throw new Error('AI 返回不是数组');
      return normalizeAIOutputToQuestions(arr, genId);
    } catch (err) {
      lastErr = err;
      // 非最后一次尝试则重试
    }
  }
  throw new Error(`AI 解析失败(已重试 ${RETRYABLE} 次): ${(lastErr as Error).message}`);
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npm test -- ai/parser`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/parser.ts tests/ai/parser.test.ts
git commit -m "feat(ai): aiParseQuestions orchestrator with retry"
```

---

### Task 10: 速率限制模块 (TDD)

**Files:**
- Create: `src/lib/ai/rate-limit.ts`
- Create: `tests/ai/rate-limit.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/ai/rate-limit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { aiRateLimiter } from '@/lib/ai/rate-limit';

describe('aiRateLimiter', () => {
  it('allows first N requests', () => {
    const key = 'user-' + Math.random();
    for (let i = 0; i < 10; i++) {
      expect(aiRateLimiter.check(key, 10, 60_000)).toBe(true);
    }
  });

  it('blocks after exceeding limit', () => {
    const key = 'user-' + Math.random();
    for (let i = 0; i < 10; i++) aiRateLimiter.check(key, 10, 60_000);
    expect(aiRateLimiter.check(key, 10, 60_000)).toBe(false);
  });

  it('isolates different keys', () => {
    const k1 = 'u1-' + Math.random();
    const k2 = 'u2-' + Math.random();
    for (let i = 0; i < 10; i++) aiRateLimiter.check(k1, 10, 60_000);
    expect(aiRateLimiter.check(k2, 10, 60_000)).toBe(true);
  });

  it('resets after window expires', () => {
    const key = 'u3-' + Math.random();
    aiRateLimiter.check(key, 2, 1); // 1ms window
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(aiRateLimiter.check(key, 2, 1)).toBe(true);
        resolve();
      }, 10);
    });
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- rate-limit`
Expected: FAIL

- [ ] **Step 3: 实现 rate-limit.ts**

Create `src/lib/ai/rate-limit.ts`:
```ts
// 内存令牌桶,够防滥用即可,不持久化
type Bucket = number[]; // 时间戳列表

class RateLimiter {
  private buckets = new Map<string, Bucket>();

  /** 返回 true 表示允许,false 表示被限流 */
  check(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    const bucket = this.buckets.get(key) ?? [];
    // 清理过期
    const fresh = bucket.filter((t) => t > cutoff);
    if (fresh.length >= max) {
      this.buckets.set(key, fresh);
      return false;
    }
    fresh.push(now);
    this.buckets.set(key, fresh);
    return true;
  }

  /** 测试用:清理所有 bucket */
  reset(): void {
    this.buckets.clear();
  }
}

export const aiRateLimiter = new RateLimiter();
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npm test -- rate-limit`
Expected: 4 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/rate-limit.ts tests/ai/rate-limit.test.ts
git commit -m "feat(ai): in-memory rate limiter for AI endpoints"
```

---

### Task 11: Admin API — GET/POST `/api/admin/ai/providers`

**Files:**
- Create: `src/app/api/admin/ai/providers/route.ts`

- [ ] **Step 1: 创建路由**

Create `src/app/api/admin/ai/providers/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { encryptApiKey, last4 } from '@/lib/ai/crypto';

export async function GET(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const list = await prisma.aIProviderConfig.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true, name: true, provider: true, baseURL: true,
      apiKeyLast4: true, model: true, visionModel: true,
      supportsVision: true, isActive: true,
      createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json({ providers: list });
}

export async function POST(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.provider || !body?.baseURL || !body?.model || !body?.apiKey) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
  }

  const cipher = encryptApiKey(body.apiKey);
  const last4str = last4(body.apiKey);

  const created = await prisma.$transaction(async (tx) => {
    if (body.isActive) {
      await tx.aIProviderConfig.updateMany({ data: { isActive: false } });
    }
    return tx.aIProviderConfig.create({
      data: {
        name: body.name,
        provider: body.provider,
        baseURL: body.baseURL,
        apiKeyCipher: cipher,
        apiKeyLast4: last4str,
        model: body.model,
        visionModel: body.visionModel ?? null,
        supportsVision: !!body.supportsVision,
        isActive: !!body.isActive,
      },
      select: {
        id: true, name: true, provider: true, baseURL: true,
        apiKeyLast4: true, model: true, visionModel: true,
        supportsVision: true, isActive: true,
        createdAt: true, updatedAt: true,
      },
    });
  });

  return NextResponse.json({ provider: created }, { status: 201 });
}
```

- [ ] **Step 2: 启动 dev server,curl 验证 GET 需要鉴权**

Run:
```bash
npm run dev &
sleep 5
curl -i http://localhost:3000/api/admin/ai/providers
```
Expected: 401 unauthorized

- [ ] **Step 3: 提交**

```bash
git add src/app/api/admin/ai/providers/route.ts
git commit -m "feat(api): GET/POST /api/admin/ai/providers"
```

---

### Task 12: Admin API — PUT/DELETE `/api/admin/ai/providers/[id]`

**Files:**
- Create: `src/app/api/admin/ai/providers/[id]/route.ts`

- [ ] **Step 1: 创建路由**

Create `src/app/api/admin/ai/providers/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { encryptApiKey, last4 } from '@/lib/ai/crypto';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (typeof body.name === 'string') updateData.name = body.name;
  if (typeof body.baseURL === 'string') updateData.baseURL = body.baseURL;
  if (typeof body.model === 'string') updateData.model = body.model;
  if (typeof body.visionModel === 'string' || body.visionModel === null) {
    updateData.visionModel = body.visionModel;
  }
  if (typeof body.supportsVision === 'boolean') updateData.supportsVision = body.supportsVision;
  if (typeof body.apiKey === 'string' && body.apiKey.length > 0) {
    updateData.apiKeyCipher = encryptApiKey(body.apiKey);
    updateData.apiKeyLast4 = last4(body.apiKey);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (body.isActive === true) {
      await tx.aIProviderConfig.updateMany({ data: { isActive: false } });
      updateData.isActive = true;
    } else if (body.isActive === false) {
      updateData.isActive = false;
    }
    return tx.aIProviderConfig.update({
      where: { id },
      data: updateData,
      select: {
        id: true, name: true, provider: true, baseURL: true,
        apiKeyLast4: true, model: true, visionModel: true,
        supportsVision: true, isActive: true,
        createdAt: true, updatedAt: true,
      },
    });
  });

  return NextResponse.json({ provider: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.aIProviderConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.isActive) {
    return NextResponse.json({ error: '请先切换激活厂商再删除' }, { status: 400 });
  }
  await prisma.aIProviderConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/api/admin/ai/providers/[id]/route.ts
git commit -m "feat(api): PUT/DELETE /api/admin/ai/providers/[id]"
```

---

### Task 13: Admin API — POST 测试连接

**Files:**
- Create: `src/app/api/admin/ai/providers/[id]/test/route.ts`

- [ ] **Step 1: 创建路由**

Create `src/app/api/admin/ai/providers/[id]/test/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { decryptApiKey } from '@/lib/ai/crypto';
import { callChat } from '@/lib/ai/providers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const provider = await prisma.aIProviderConfig.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const apiKey = decryptApiKey(provider.apiKeyCipher);
  const start = Date.now();

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
      signal: ctl.signal,
    });
    clearTimeout(timer);
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - start,
      model: provider.model,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - start,
      error: String(err?.message ?? err).slice(0, 200),
    }, { status: 502 });
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/api/admin/ai/providers/[id]/test/route.ts
git commit -m "feat(api): POST test connection for AI provider"
```

---

### Task 14: Admin API — PATCH 切换激活

**Files:**
- Create: `src/app/api/admin/ai/active/route.ts`

- [ ] **Step 1: 创建路由**

Create `src/app/api/admin/ai/active/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

export async function PATCH(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const targetId = body?.providerId;
  if (!targetId) return NextResponse.json({ error: '缺少 providerId' }, { status: 400 });

  const target = await prisma.aIProviderConfig.findUnique({ where: { id: targetId } });
  if (!target) return NextResponse.json({ error: 'provider not found' }, { status: 404 });

  // 事务原子切换
  await prisma.$transaction([
    prisma.aIProviderConfig.updateMany({ data: { isActive: false } }),
    prisma.aIProviderConfig.update({ where: { id: targetId }, data: { isActive: true } }),
  ]);

  return NextResponse.json({ ok: true, activeId: targetId });
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/api/admin/ai/active/route.ts
git commit -m "feat(api): PATCH /api/admin/ai/active (atomic switch)"
```

---

### Task 15: 用户侧 `/api/ai/parse`

**Files:**
- Create: `src/app/api/ai/parse/route.ts`

- [ ] **Step 1: 创建路由**

Create `src/app/api/ai/parse/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromHeaders } from '@/lib/admin-auth';
import { verifyAdminToken } from '@/lib/admin-auth';
import { getSession } from '@/lib/sessionStore';
import { aiParseQuestions } from '@/lib/ai/parser';
import { aiRateLimiter } from '@/lib/ai/rate-limit';

const MAX_TEXT_CHARS = 60_000;
const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function resolveUserId(req: NextRequest): string | null {
  const token = getTokenFromHeaders(req);
  if (!token) return null;
  // 优先 admin
  const admin = verifyAdminToken(token);
  if (admin) return `admin:${admin.adminId}`;
  const user = getSession<{ userId: string; type?: string }>(token);
  if (user?.userId) return `user:${user.userId}`;
  return null;
}

export async function POST(req: NextRequest) {
  const userKey = resolveUserId(req);
  if (!userKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!aiRateLimiter.check(userKey, RATE_MAX, RATE_WINDOW_MS)) {
    return NextResponse.json({ error: '请求过于频繁,请稍后再试' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const text: string = body?.text ?? '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'text 为空' }, { status: 400 });
  }

  // 选 provider: 指定 id > 激活
  let provider;
  if (body?.providerId) {
    provider = await prisma.aIProviderConfig.findUnique({ where: { id: body.providerId } });
  } else {
    provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
  }
  if (!provider) {
    return NextResponse.json({ error: '未配置 AI 厂商' }, { status: 503 });
  }

  const warning = text.length > MAX_TEXT_CHARS
    ? `文本超过 ${MAX_TEXT_CHARS} 字符,已截断`
    : undefined;

  try {
    const questions = await aiParseQuestions({ text, provider });
    return NextResponse.json({ questions, warning });
  } catch (err: any) {
    return NextResponse.json(
      { error: `AI 解析失败: ${String(err?.message ?? err).slice(0, 200)}` },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/app/api/ai/parse/route.ts
git commit -m "feat(api): POST /api/ai/parse user-facing AI parse"
```

---

### Task 16: Admin Sidebar 加导航项

**Files:**
- Modify: `src/components/AdminSidebar.tsx`

- [ ] **Step 1: 在 NAV_ITEMS 数组 professions 之后插入**

Edit `src/components/AdminSidebar.tsx`,在 `{ key: 'users', label: '用户管理', path: '/admin/users', ... },` 这行**之前**插入:
```ts
  {
    key: 'ai',
    label: 'AI 配置',
    path: '/admin/ai',
    icon: (
      <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
```

- [ ] **Step 2: 启动 dev server,验证侧栏显示**

Run: `npm run dev`
访问 http://localhost:3000/admin/login → 登录 → 访问 /admin/dashboard
Expected: 侧栏「职业管理」和「用户管理」之间出现「AI 配置」入口

- [ ] **Step 3: 提交**

```bash
git add src/components/AdminSidebar.tsx
git commit -m "feat(admin): add AI 配置 nav item"
```

---

### Task 17: Admin AI 配置页面 + 列表

**Files:**
- Create: `src/app/admin/ai/page.tsx`

- [ ] **Step 1: 创建页面**

Create `src/app/admin/ai/page.tsx`:
```tsx
import { Suspense } from 'react';
import AdminAIList from './AdminAIList';

export default function AdminAIPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">加载中...</div>}>
      <AdminAIList />
    </Suspense>
  );
}
```

- [ ] **Step 2: 创建列表子组件(放在同目录)**

Create `src/app/admin/ai/AdminAIList.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AiProviderModal from '@/components/admin/AiProviderModal';

interface Provider {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  apiKeyLast4: string;
  model: string;
  visionModel: string | null;
  supportsVision: boolean;
  isActive: boolean;
  createdAt: string;
}

export default function AdminAIList() {
  const { token } = useAuth();
  const [list, setList] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch('/api/admin/ai/providers', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setList(data.providers ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [token]);

  const onTest = async (id: string) => {
    const res = await fetch(`/api/admin/ai/providers/${id}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.ok) alert(`✓ 连接成功 · ${data.latencyMs}ms · ${data.model}`);
    else alert(`✗ 失败 · ${data.error}`);
  };

  const onActivate = async (id: string) => {
    await fetch('/api/admin/ai/active', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ providerId: id }),
    });
    load();
  };

  const onDelete = async (id: string) => {
    if (!confirm('确认删除该厂商?')) return;
    await fetch(`/api/admin/ai/providers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">AI 厂商配置</h1>
          <p className="text-sm text-slate-500 mt-1">管理系统用于题目解析的 AI 厂商与 API 凭据</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 text-sm font-medium"
        >
          + 新增厂商
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm">加载中...</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-slate-500">还没有配置任何 AI 厂商</p>
          <p className="text-xs text-slate-400 mt-1">用户上传题目后,本地解析仍可作为兜底</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <div
              key={p.id}
              className={`p-4 rounded-xl border bg-white ${
                p.isActive ? 'border-sky-300 shadow-sm ring-1 ring-sky-100' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${p.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="font-medium text-slate-800">{p.name}</span>
                    {p.isActive && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[11px] rounded-full">激活中</span>
                    )}
                  </div>
                  <div className="text-[12px] text-slate-500 font-mono truncate">
                    {p.model} · {p.baseURL}
                  </div>
                  <div className="text-[12px] text-slate-400 mt-1">
                    视觉: {p.supportsVision ? `✓ ${p.visionModel}` : '✗'}
                    <span className="ml-3">Key: ****{p.apiKeyLast4}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => onTest(p.id)} className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded">测试连接</button>
                  {!p.isActive && (
                    <button onClick={() => onActivate(p.id)} className="px-2.5 py-1 text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded">设为激活</button>
                  )}
                  <button onClick={() => setEditing(p)} className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded">编辑</button>
                  <button onClick={() => onDelete(p.id)} className="px-2.5 py-1 text-[11px] bg-rose-100 hover:bg-rose-200 text-rose-700 rounded">删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <AiProviderModal
          provider={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: 提交(组件会编译失败因为 AiProviderModal 还没建,没关系,下一步)**

```bash
git add src/app/admin/ai/page.tsx src/app/admin/ai/AdminAIList.tsx
git commit -m "feat(admin): AI provider list page"
```

---

### Task 18: AiProviderModal 弹窗

**Files:**
- Create: `src/components/admin/AiProviderModal.tsx`

- [ ] **Step 1: 创建弹窗组件**

Create `src/components/admin/AiProviderModal.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PRESETS } from '@/lib/ai/providers-presets';

interface Provider {
  id: string;
  name: string;
  provider: string;
  baseURL: string;
  model: string;
  visionModel: string | null;
  supportsVision: boolean;
  isActive: boolean;
}

interface Props {
  provider: Provider | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function AiProviderModal({ provider, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const isEdit = !!provider;
  const [preset, setPreset] = useState(provider?.provider ?? 'deepseek');
  const [name, setName] = useState(provider?.name ?? '');
  const [baseURL, setBaseURL] = useState(provider?.baseURL ?? PRESETS.deepseek.baseURL);
  const [model, setModel] = useState(provider?.model ?? PRESETS.deepseek.model);
  const [apiKey, setApiKey] = useState('');
  const [visionModel, setVisionModel] = useState(provider?.visionModel ?? '');
  const [supportsVision, setSupportsVision] = useState(provider?.supportsVision ?? false);
  const [isActive, setIsActive] = useState(provider?.isActive ?? false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (isEdit) return;
    const p = PRESETS[preset];
    if (p) {
      setBaseURL(p.baseURL);
      setModel(p.model);
      setVisionModel(p.visionModel ?? '');
      setSupportsVision(p.supportsVision);
    }
  }, [preset, isEdit]);

  const onSubmit = async () => {
    setErr('');
    if (!name.trim()) { setErr('请输入名称'); return; }
    if (!isEdit && !apiKey.trim()) { setErr('请输入 API Key'); return; }
    setSaving(true);
    const body: Record<string, unknown> = {
      name, provider: preset, baseURL, model,
      visionModel: supportsVision ? visionModel : null,
      supportsVision, isActive,
    };
    if (!isEdit) body.apiKey = apiKey;
    else if (apiKey) body.apiKey = apiKey;

    const url = isEdit ? `/api/admin/ai/providers/${provider.id}` : '/api/admin/ai/providers';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error ?? '保存失败');
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          {isEdit ? '编辑厂商' : '新增厂商'}
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">厂商</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              disabled={isEdit}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400"
            >
              {Object.entries(PRESETS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如 DeepSeek 主用"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">Base URL</label>
            <input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">模型</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[12px] text-slate-600 mb-1">
              API Key {isEdit && <span className="text-slate-400">(留空不修改)</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isEdit ? '****' : 'sk-...'}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="sv"
              checked={supportsVision}
              onChange={(e) => setSupportsVision(e.target.checked)}
            />
            <label htmlFor="sv" className="text-[12px] text-slate-600">启用视觉模型(图片 OCR)</label>
          </div>
          {supportsVision && (
            <div>
              <label className="block text-[12px] text-slate-600 mb-1">视觉模型</label>
              <input
                value={visionModel ?? ''}
                onChange={(e) => setVisionModel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-sky-400"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ia"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <label htmlFor="ia" className="text-[12px] text-slate-600">设为激活厂商</label>
          </div>
          {err && <div className="text-[12px] text-rose-600">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
          <button
            onClick={onSubmit}
            disabled={saving}
            className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 启动 dev server,验证页面可加载,弹窗可打开**

Run: `npm run dev`
访问 /admin/ai
Expected: 页面正常加载,点"+ 新增厂商"弹窗出现,选厂商后 baseURL/model 自动填充

- [ ] **Step 3: 提交**

```bash
git add src/components/admin/AiProviderModal.tsx
git commit -m "feat(admin): AI provider create/edit modal"
```

---

### Task 19: UploadForm 加单 tab AI 解析按钮(Phase 1 验收)

**Files:**
- Modify: `src/components/UploadForm.tsx`

> Phase 1 验收要求:**md/txt 上传后能调 AI**,不需要双预览切换,先加一个"AI 解析"按钮,产出单独的 Question[] 存到 state。

- [ ] **Step 1: 在 UploadForm 顶部加 import**

Read `src/components/UploadForm.tsx`,在已有 import 之后添加:
```tsx
import type { Question as QuestionType } from '@/types';
```

- [ ] **Step 2: 在组件 state 区加 aiQuestions**

找到 `setManualQuestions` 附近的 state,添加:
```tsx
const [aiQuestions, setAiQuestions] = useState<QuestionType[] | null>(null);
const [aiLoading, setAiLoading] = useState(false);
const [aiError, setAiError] = useState('');
```

- [ ] **Step 3: 加 aiParse handler**

在 `parseMarkdown` 调用附近(找到调用本地 parser 的地方)添加:
```tsx
const handleAiParse = async () => {
  if (!preview.trim()) {
    setAiError('请先上传文件');
    return;
  }
  setAiLoading(true);
  setAiError('');
  try {
    const res = await fetch('/api/ai/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: preview }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '解析失败');
    setAiQuestions(data.questions ?? []);
  } catch (err: any) {
    setAiError(String(err?.message ?? err));
  } finally {
    setAiLoading(false);
  }
};
```

- [ ] **Step 4: 在预览区添加 AI 解析按钮**

找到预览区域(显示 `preview` 的地方),添加按钮:
```tsx
<div className="flex items-center gap-2">
  <button
    onClick={handleAiParse}
    disabled={aiLoading || !preview.trim()}
    className="px-3 py-1.5 bg-violet-500 text-white text-[12px] rounded-lg hover:bg-violet-600 disabled:opacity-50"
  >
    {aiLoading ? 'AI 解析中...' : '🧠 AI 解析'}
  </button>
  {aiQuestions && (
    <span className="text-[11px] text-slate-500">AI: {aiQuestions.length} 道题</span>
  )}
  {aiError && <span className="text-[11px] text-rose-600">⚠ {aiError}</span>}
</div>
```

- [ ] **Step 5: 在 preview 上方加黄色提示**

找到文件读取/拖入区域之后,添加(仅当未配置 AI 时显示;此处简化为始终提示一次):
```tsx
{aiError?.includes('未配置 AI 厂商') && (
  <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2 rounded-lg text-[12px]">
    未配置 AI 厂商,请管理员在「AI 配置」中设置后再使用
  </div>
)}
```

- [ ] **Step 6: 启动 dev server,手动测试**

访问 /upload,上传一个 .md,点 AI 解析按钮
Expected:
- 无激活厂商时:显示黄色 banner + "未配置 AI 厂商"
- 有激活厂商时:AI 解析按钮变 loading,完成后显示 "AI: N 道题"

- [ ] **Step 7: 提交**

```bash
git add src/components/UploadForm.tsx
git commit -m "feat(upload): AI parse button on UploadForm (Phase 1)"
```

---

### Task 20: 运行所有测试 + 类型检查

- [ ] **Step 1: 运行全部测试**

Run: `npm test`
Expected: 全部 passed (sanity + crypto + providers + prompt + normalize + parser + rate-limit + providers-presets)

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 如果有错,修复直到 0**

- [ ] **Step 4: 提交(如无修改则跳过)**

---

## Phase 2 — 多文档格式抽取 + 文件上传端点

### Task 21: 安装 pdf-parse / mammoth

- [ ] **Step 1: 安装**

Run:
```bash
npm install pdf-parse mammoth
npm install -D @types/mammoth
```
Expected: package.json 新增 3 个依赖

- [ ] **Step 2: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add pdf-parse mammoth @types/mammoth"
```

---

### Task 22: pdf-parse 抽取器 (TDD)

**Files:**
- Create: `src/lib/extract/pdf.ts`
- Create: `tests/extract/pdf.test.ts`
- Create: `tests/fixtures/parse/sample.pdf`(由 pdfkit 生成)

- [ ] **Step 1: 生成 fixture PDF**

Run:
```bash
mkdir -p tests/fixtures/parse
npm install -D pdfkit
node -e "
const PDFDocument = require('pdfkit');
const fs = require('fs');
const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('tests/fixtures/parse/sample.pdf'));
doc.fontSize(14).text('Sample Quiz', { underline: true });
doc.moveDown();
doc.fontSize(11).text('1. What is 2+2?\nA. 3\nB. 4\nC. 5\nD. 6\nAnswer: B');
doc.moveDown();
doc.text('2. True or false: Water boils at 100°C.\nAnswer: true');
doc.end();
"
```
Expected: `tests/fixtures/parse/sample.pdf` 生成

- [ ] **Step 2: 写测试**

Create `tests/extract/pdf.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { extractPdf } from '@/lib/extract/pdf';

describe('extractPdf', () => {
  it('extracts text from sample PDF', async () => {
    const buf = readFileSync(path.resolve(__dirname, '../fixtures/parse/sample.pdf'));
    const text = await extractPdf(buf);
    expect(text).toContain('Sample Quiz');
    expect(text).toMatch(/2\+2/);
    expect(text).toMatch(/100/);
  });

  it('throws on invalid buffer', async () => {
    const buf = Buffer.from('not a pdf');
    await expect(extractPdf(buf)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: 运行测试,确认失败**

Run: `npm test -- extract/pdf`
Expected: FAIL (module not found)

- [ ] **Step 4: 实现 pdf.ts**

Create `src/lib/extract/pdf.ts`:
```ts
import pdfParse from 'pdf-parse';

export async function extractPdf(buffer: Buffer): Promise<string> {
  const { text } = await pdfParse(buffer);
  return text ?? '';
}
```

- [ ] **Step 5: 运行测试,确认通过**

Run: `npm test -- extract/pdf`
Expected: 2 passed

- [ ] **Step 6: 提交**

```bash
git add src/lib/extract/pdf.ts tests/extract/pdf.test.ts tests/fixtures/parse/sample.pdf
git commit -m "feat(extract): PDF text extraction via pdf-parse"
```

---

### Task 23: mammoth DOCX 抽取器 (TDD)

**Files:**
- Create: `src/lib/extract/docx.ts`
- Create: `tests/extract/docx.test.ts`

- [ ] **Step 1: 写测试 + 生成 fixture 集成**

Create `tests/extract/docx.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateDocxFixture } from './fixture-helper';
import { extractDocx } from '@/lib/extract/docx';

describe('extractDocx', () => {
  it('extracts text from DOCX', async () => {
    const buf = await generateDocxFixture([
      'Word Quiz',
      '1. Choose the correct option.',
      'A. option A',
      'B. option B',
    ]);
    const text = await extractDocx(buf);
    expect(text).toContain('Word Quiz');
    expect(text).toMatch(/option A/);
  });

  it('throws on invalid buffer', async () => {
    const buf = Buffer.from('not a docx');
    await expect(extractDocx(buf)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 创建 fixture-helper**

Create `tests/extract/fixture-helper.ts`:
```ts
import { Document, Packer, Paragraph, TextRun } from 'docx';

export async function generateDocxFixture(lines: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      children: lines.map((line) => new Paragraph({ children: [new TextRun(line)] })),
    }],
  });
  return await Packer.toBuffer(doc);
}
```

- [ ] **Step 3: 安装 docx(测试用)**

Run: `npm install -D docx`

- [ ] **Step 4: 运行测试,确认失败**

Run: `npm test -- extract/docx`
Expected: FAIL

- [ ] **Step 5: 实现 docx.ts**

Create `src/lib/extract/docx.ts`:
```ts
import mammoth from 'mammoth';

export async function extractDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value ?? '';
}
```

- [ ] **Step 6: 运行测试,确认通过**

Run: `npm test -- extract/docx`
Expected: 2 passed

- [ ] **Step 7: 提交**

```bash
git add src/lib/extract/docx.ts tests/extract/docx.test.ts tests/extract/fixture-helper.ts package.json package-lock.json
git commit -m "feat(extract): DOCX text extraction via mammoth"
```

---

### Task 24: 图片视觉识别抽取器

**Files:**
- Create: `src/lib/extract/image.ts`
- Create: `tests/extract/image.test.ts`

- [ ] **Step 1: 写测试(mock fetch)**

Create `tests/extract/image.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: () => 'sk-fake',
}));

import { extractImage } from '@/lib/extract/image';

const fakeProvider = {
  baseURL: 'https://example.com/v1',
  apiKeyCipher: 'X',
  visionModel: 'vision-v1',
  supportsVision: true,
} as any;

describe('extractImage', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { global.fetch = originalFetch; });

  it('throws if provider does not support vision', async () => {
    await expect(
      extractImage({ buffer: Buffer.from([1]), mime: 'image/png', provider: { ...fakeProvider, supportsVision: false } })
    ).rejects.toThrow(/不支持视觉/);
  });

  it('throws if visionModel is missing', async () => {
    await expect(
      extractImage({ buffer: Buffer.from([1]), mime: 'image/png', provider: { ...fakeProvider, visionModel: null } })
    ).rejects.toThrow(/不支持视觉/);
  });

  it('calls vision model with data url', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'OCR done' } }] }),
    });
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // png magic bytes
    const text = await extractImage({ buffer: buf, mime: 'image/png', provider: fakeProvider });
    expect(text).toBe('OCR done');

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.model).toBe('vision-v1');
    expect(body.messages[0].content[0]).toMatchObject({
      type: 'image_url',
      image_url: { url: expect.stringMatching(/^data:image\/png;base64,/) },
    });
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- extract/image`
Expected: FAIL

- [ ] **Step 3: 实现 image.ts**

Create `src/lib/extract/image.ts`:
```ts
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';

interface ProviderLike {
  baseURL: string;
  apiKeyCipher: string;
  visionModel?: string | null;
  supportsVision?: boolean;
}

const SYSTEM_PROMPT = '你是 OCR + 题目解析专家,提取图中所有文字并尽量识别为结构化题目。';

export async function extractImage(opts: {
  buffer: Buffer;
  mime: string;
  provider: ProviderLike;
  signal?: AbortSignal;
}): Promise<string> {
  if (!opts.provider.supportsVision || !opts.provider.visionModel) {
    throw new Error('当前激活厂商不支持视觉识别,请在 AI 配置中启用视觉模型');
  }
  const apiKey = decryptApiKey(opts.provider.apiKeyCipher);
  const dataUrl = `data:${opts.mime};base64,${opts.buffer.toString('base64')}`;
  return await callChat({
    baseURL: opts.provider.baseURL,
    apiKey,
    model: opts.provider.visionModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: '请提取图中所有题目文字' },
        ],
      },
    ],
    signal: opts.signal,
  });
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npm test -- extract/image`
Expected: 3 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/extract/image.ts tests/extract/image.test.ts
git commit -m "feat(extract): image OCR via vision model"
```

---

### Task 25: MIME 分派器 (TDD)

**Files:**
- Create: `src/lib/extract/index.ts`
- Create: `tests/extract/dispatcher.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/extract/dispatcher.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/extract/pdf', () => ({ extractPdf: vi.fn(async () => 'PDF_TEXT') }));
vi.mock('@/lib/extract/docx', () => ({ extractDocx: vi.fn(async () => 'DOCX_TEXT') }));
vi.mock('@/lib/extract/image', () => ({
  extractImage: vi.fn(async () => 'IMAGE_TEXT'),
}));

import { extractText } from '@/lib/extract/index';
import { extractPdf } from '@/lib/extract/pdf';
import { extractDocx } from '@/lib/extract/docx';
import { extractImage } from '@/lib/extract/image';

const fakeProvider = { baseURL: 'x', apiKeyCipher: 'x', visionModel: 'v', supportsVision: true } as any;

describe('extractText dispatcher', () => {
  it('routes .pdf by extension', async () => {
    const out = await extractText({ buffer: Buffer.from([1]), filename: 'a.pdf' });
    expect(out).toBe('PDF_TEXT');
    expect(extractPdf).toHaveBeenCalled();
  });

  it('routes .docx by extension', async () => {
    const out = await extractText({ buffer: Buffer.from([1]), filename: 'a.docx' });
    expect(out).toBe('DOCX_TEXT');
    expect(extractDocx).toHaveBeenCalled();
  });

  it('routes image by mime and forwards provider', async () => {
    const out = await extractText({ buffer: Buffer.from([1]), mime: 'image/png', provider: fakeProvider });
    expect(out).toBe('IMAGE_TEXT');
    expect(extractImage).toHaveBeenCalledWith(expect.objectContaining({ provider: fakeProvider }));
  });

  it('throws when image given but no provider', async () => {
    await expect(
      extractText({ buffer: Buffer.from([1]), mime: 'image/png' })
    ).rejects.toThrow(/图片识别需要 AI 厂商/);
  });

  it('falls back to utf8 for unknown mime', async () => {
    const out = await extractText({ buffer: Buffer.from('hello', 'utf8'), mime: 'text/plain' });
    expect(out).toBe('hello');
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npm test -- dispatcher`
Expected: FAIL

- [ ] **Step 3: 实现 index.ts**

Create `src/lib/extract/index.ts`:
```ts
import { extractPdf } from './pdf';
import { extractDocx } from './docx';
import { extractImage } from './image';

interface ProviderLike {
  baseURL: string;
  apiKeyCipher: string;
  visionModel?: string | null;
  supportsVision?: boolean;
}

export async function extractText(opts: {
  buffer: Buffer;
  mime?: string;
  filename?: string;
  provider?: ProviderLike;
  signal?: AbortSignal;
}): Promise<string> {
  const name = opts.filename ?? '';
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const mime = (opts.mime ?? '').toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') return extractPdf(opts.buffer);
  if (ext === 'docx' || mime.includes('wordprocessingml')) return extractDocx(opts.buffer);
  if (ext === 'doc') throw new Error('.doc 格式不支持,请另存为 .docx');
  if (/^image\//.test(mime) || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    if (!opts.provider) throw new Error('图片识别需要 AI 厂商(请先在管理后台配置)');
    return extractImage({
      buffer: opts.buffer,
      mime: mime || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      provider: opts.provider,
      signal: opts.signal,
    });
  }
  // 兜底 utf8
  return opts.buffer.toString('utf8');
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npm test -- dispatcher`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/lib/extract/index.ts tests/extract/dispatcher.test.ts
git commit -m "feat(extract): MIME dispatcher"
```

---

### Task 26: `/api/upload` 文件上传端点

**Files:**
- Create: `src/app/api/upload/route.ts`

- [ ] **Step 1: 创建路由**

Create `src/app/api/upload/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyAdminToken } from '@/lib/admin-auth';
import { getSession } from '@/lib/sessionStore';
import { prisma } from '@/lib/prisma';
import { extractText } from '@/lib/extract';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = ['md', 'txt', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'];

function resolveUserId(req: NextRequest): string | null {
  const token = getTokenFromHeaders(req);
  if (!token) return null;
  const admin = verifyAdminToken(token);
  if (admin) return admin.userId;
  const user = getSession<{ userId: string }>(token);
  return user?.userId ?? null;
}

export async function POST(req: NextRequest) {
  const userId = resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少文件' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `文件超过 10MB 限制 (实际 ${(file.size / 1024 / 1024).toFixed(2)}MB)` }, { status: 413 });
  }

  const filename = file.name;
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: `不支持的文件类型: .${ext}` }, { status: 415 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || '';

  // 图片需要 active provider
  let provider;
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
    if (!provider?.supportsVision) {
      return NextResponse.json({
        error: '当前激活厂商不支持图片识别,请在「AI 配置」中启用视觉模型',
      }, { status: 415 });
    }
  }

  try {
    const text = await extractText({ buffer: buf, mime, filename, provider });
    return NextResponse.json({
      text,
      fileName: filename,
      mime,
      size: file.size,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: `文档解析失败: ${String(err?.message ?? err).slice(0, 200)}`,
    }, { status: 500 });
  }
}
```

> Note: Next.js 16 App Router 不用 Pages Router 的 `export const config`。`formData()` 默认支持,大小限制由本路由的 `MAX_BYTES` 校验把关。

- [ ] **Step 2: curl 测试(需要先登录拿 token,跳过集成测试)**

手动测试:
```bash
# 在浏览器登录后,从 devtools 复制 token,例如:
TOKEN="..."
curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@tests/fixtures/parse/sample.pdf"
```
Expected: 返回 `{ text: "...", fileName: "sample.pdf", mime: "application/pdf", size: ... }`

- [ ] **Step 3: 提交**

```bash
git add src/app/api/upload/route.ts
git commit -m "feat(api): POST /api/upload file upload + text extract"
```

---

### Task 27: UploadForm 文件选择扩展

**Files:**
- Modify: `src/components/UploadForm.tsx`

- [ ] **Step 1: 把文件类型常量提到组件外**

找到 UploadForm 中的文件类型/accept 字符串,改为动态:
```tsx
const ALLOWED_ACCEPT = '.md,.txt,.pdf,.docx,.png,.jpg,.jpeg,.webp';
const MAX_BYTES = 10 * 1024 * 1024;
```

- [ ] **Step 2: 修改文件 input 的 accept**

找到 `<input type="file" ...>` 标签,把 `accept=".md,.txt"` 改成:
```tsx
accept={ALLOWED_ACCEPT}
```

- [ ] **Step 3: 修改 FileReader 分支**

找到 `handleFileChange` 或拖拽处理,把直接 `readAsText` 改成:
```tsx
const handleFile = async (file: File) => {
  setError('');
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const isText = ext === 'md' || ext === 'txt';

  if (isText) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) setPreview(result);
      else setError('文件读取失败');
    };
    reader.readAsText(file);
    return;
  }

  // PDF/Word/图片 → 走 /api/upload
  if (file.size > MAX_BYTES) {
    setError(`文件超过 10MB 限制`);
    return;
  }
  setIsLoading(true);
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '上传失败');
    setPreview(data.text ?? '');
  } catch (err: any) {
    setError(String(err?.message ?? err));
  } finally {
    setIsLoading(false);
  }
};
```

把原有的 `handleFileChange` 和拖拽 handler 改为调用 `handleFile(file)`。

- [ ] **Step 4: 启动 dev,验证 PDF/Word/图片可上传**

访问 /upload,分别上传:
1. .pdf → 应抽到文本
2. .docx → 应抽到文本
3. .png(假设有视觉 provider) → 应通过视觉识别抽取
Expected: preview 区域显示抽到的文本(可能含原 Markdown 标记)

- [ ] **Step 5: 提交**

```bash
git add src/components/UploadForm.tsx
git commit -m "feat(upload): accept PDF/Word/图片 via /api/upload"
```

---

### Task 28: QuizUploadPanel 文件选择扩展(共享组件同步)

**Files:**
- Modify: `src/components/admin/QuizUploadPanel.tsx`

- [ ] **Step 1: 同样的改造**

参照 Task 27,把 `src/components/admin/QuizUploadPanel.tsx` 的文件处理逻辑改成 `handleFile(file)` 分流,文本走 FileReader、二进制走 `/api/upload`。

需要确认 `QuizUploadPanel` 是否能拿到 token(检查 props,如果没传 token,从 useAuth 拿)。

如果该组件没 useAuth,加 import:
```tsx
import { useAuth } from '@/contexts/AuthContext';
const { token } = useAuth();
```

- [ ] **Step 2: 验证**

访问 /admin/quizzes/new,上传 PDF/Word
Expected: preview 区域显示抽到的文本

- [ ] **Step 3: 提交**

```bash
git add src/components/admin/QuizUploadPanel.tsx
git commit -m "feat(upload): QuizUploadPanel accept PDF/Word/图片"
```

---

### Task 29: 跑所有测试 + 类型检查

- [ ] **Step 1: 运行**

Run: `npm test && npx tsc --noEmit`
Expected: 全绿,0 类型错误

- [ ] **Step 2: 修复直到 0 错**

---

## Phase 3 — 双预览切换 UI

### Task 30: DualPreview 共享组件

**Files:**
- Create: `src/components/DualPreview.tsx`

> 抽出来避免 UploadForm 和 QuizUploadPanel 重复实现。父组件负责持有 questions state 和 ai fetch 逻辑,DualPreview 只负责切换 UI 状态。

- [ ] **Step 1: 创建组件**

Create `src/components/DualPreview.tsx`:
```tsx
'use client';

import { useState } from 'react';
import type { Question as QuestionType } from '@/types';

type Source = 'local' | 'ai';

export type DualAiState =
  | { status: 'idle' }
  | { status: 'loading'; elapsed: number }
  | { status: 'done'; questions: QuestionType[] }
  | { status: 'error'; message: string };

interface Props {
  /** 本地解析结果(已格式化好的题目) */
  localQuestions: QuestionType[];
  /** AI 解析状态机(父组件持有) */
  aiState: DualAiState;
  /** 点击 AI tab 且 idle 时触发 */
  onRequestAi: () => void;
  /** AI 失败时点击重试 */
  onRetryAi: () => void;
  /** 渲染题目(父组件复用现有题卡 UI) */
  renderQuestions: (qs: QuestionType[], source: Source) => React.ReactNode;
  localLabel?: string;
  aiLabel?: string;
}

export default function DualPreview({
  localQuestions, aiState, onRequestAi, onRetryAi,
  renderQuestions, localLabel = '本地解析', aiLabel = 'AI 解析',
}: Props) {
  const [source, setSource] = useState<Source>('local');

  // 切到 AI tab 时若 idle 则触发 fetch
  const selectSource = (s: Source) => {
    setSource(s);
    if (s === 'ai' && aiState.status === 'idle') {
      onRequestAi();
    }
  };

  const aiTabBadge = () => {
    switch (aiState.status) {
      case 'loading':
        return <span className="ml-1 text-violet-500">⏳ {aiState.elapsed}s</span>;
      case 'done':
        return <span className="ml-1 text-emerald-600">✓ {aiState.questions.length} 道</span>;
      case 'error':
        return <span className="ml-1 text-rose-500">⚠</span>;
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="inline-flex p-1 bg-slate-100 rounded-lg text-[12px] mb-3">
        <button
          onClick={() => selectSource('local')}
          className={`px-3 py-1 rounded ${source === 'local' ? 'bg-white shadow text-slate-700 font-medium' : 'text-slate-500'}`}
        >
          {localLabel} · {localQuestions.length} 道
        </button>
        <button
          onClick={() => selectSource('ai')}
          className={`px-3 py-1 rounded ${source === 'ai' ? 'bg-white shadow text-slate-700 font-medium' : 'text-slate-500'}`}
        >
          {aiLabel}{aiTabBadge()}
        </button>
      </div>

      {source === 'local' ? (
        renderQuestions(localQuestions, 'local')
      ) : (
        <>
          {aiState.status === 'loading' && (
            <div className="p-6 text-center text-slate-400 text-sm">
              AI 解析中…{aiState.elapsed}s
            </div>
          )}
          {aiState.status === 'error' && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-[12px] text-rose-700 flex items-center justify-between">
              <span>AI 解析失败: {aiState.message}</span>
              <button onClick={onRetryAi} className="px-2 py-1 bg-rose-500 text-white rounded text-[11px]">
                重试
              </button>
            </div>
          )}
          {aiState.status === 'done' && renderQuestions(aiState.questions, 'ai')}
          {aiState.status === 'idle' && (
            <div className="p-6 text-center text-slate-400 text-sm">点击上方「AI 解析」开始</div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
git add src/components/DualPreview.tsx
git commit -m "feat(ui): DualPreview shared component"
```

---

### Task 31: UploadForm 接入 DualPreview

**Files:**
- Modify: `src/components/UploadForm.tsx`

> 现有 UploadForm 已有复杂的手动编辑/题卡渲染逻辑。**不要重写全部**,只把 `aiQuestions/aiError/aiLoading` 三个 state 合并成 `aiState`,并在 preview 区域用 DualPreview 包住。

- [ ] **Step 1: 引入 DualPreview + DualAiState 类型**

```tsx
import DualPreview, { type DualAiState } from '@/components/DualPreview';
```

- [ ] **Step 2: 把 Task 19 加的 state 合并**

删除:
```tsx
const [aiQuestions, setAiQuestions] = useState<QuestionType[] | null>(null);
const [aiLoading, setAiLoading] = useState(false);
const [aiError, setAiError] = useState('');
```

替换为:
```tsx
const [aiState, setAiState] = useState<DualAiState>({ status: 'idle' });
const [aiStart, setAiStart] = useState(0);
```

- [ ] **Step 3: 重写 fetchAi**

替换 Task 19 的 `handleAiParse`:
```tsx
const fetchAi = async () => {
  if (!preview.trim()) return;
  setAiStart(Date.now());
  setAiState({ status: 'loading', elapsed: 0 });
  try {
    const res = await fetch('/api/ai/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: preview }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '解析失败');
    setAiState({ status: 'done', questions: data.questions ?? [] });
  } catch (err: any) {
    setAiState({ status: 'error', message: String(err?.message ?? err) });
  }
};
```

- [ ] **Step 4: 加 elapsed 计时器 effect**

在组件顶层(其他 useEffect 旁边)添加:
```tsx
useEffect(() => {
  if (aiState.status !== 'loading') return;
  const t = setInterval(() => {
    setAiState((s) => s.status === 'loading'
      ? { ...s, elapsed: Math.floor((Date.now() - aiStart) / 1000) }
      : s);
  }, 1000);
  return () => clearInterval(t);
}, [aiState.status, aiStart]);
```

- [ ] **Step 5: 把 preview 区域包成 DualPreview**

定位到现有 `preview` 显示和手动题目编辑部分,用 DualPreview 包住。**最小改动**:把现有的"题目列表渲染"抽成一个函数 `renderLocalList = () => <现有 JSX>`,然后:
```tsx
<DualPreview
  localQuestions={manualQuestions /* 或 parseMarkdown(preview) 的结果 */}
  aiState={aiState}
  onRequestAi={fetchAi}
  onRetryAi={fetchAi}
  renderQuestions={(qs, _src) => (
    <div>
      {/* 把现有的题目卡片渲染循环 + 编辑/删除按钮原样放进来,
          数据源换成 qs 即可 */}
    </div>
  )}
/>
```

> 关键:renderQuestions 复用现有 UI,**不重写**题卡。AI 题目落入同一组 state 时,人工编辑/删除按钮天然生效。

- [ ] **Step 6: 删除 Task 19 旧版"AI 解析"按钮 + 黄色 banner**

Task 19 加的内联按钮和 `aiError?.includes('未配置 AI 厂商')` banner 删掉,改由 DualPreview 内部展示错误 + Task 33 的黄色 banner 统一处理。

- [ ] **Step 7: 启动 dev,验证**

访问 /upload,上传 .md,本地解析展示,切到 AI tab 触发解析,完成后切回本地 tab 验证。

- [ ] **Step 8: 提交**

```bash
git add src/components/UploadForm.tsx
git commit -m "feat(upload): UploadForm dual preview tabs"
```

---

### Task 32: QuizUploadPanel 接入 DualPreview

**Files:**
- Modify: `src/components/admin/QuizUploadPanel.tsx`

> 与 Task 31 模式完全一致。QuizUploadPanel 没有 useAuth,需要先加 import。

- [ ] **Step 1: 加 useAuth import**

```tsx
import { useAuth } from '@/contexts/AuthContext';
const { token } = useAuth();
```

- [ ] **Step 2: 合并 state 为 aiState**

删除 Task 28 加的 `aiQuestions / aiLoading / aiError`,替换为:
```tsx
const [aiState, setAiState] = useState<DualAiState>({ status: 'idle' });
const [aiStart, setAiStart] = useState(0);
```

- [ ] **Step 3: 写 fetchAi + elapsed effect**

同 Task 31 Step 3-4,完全一致的实现。

- [ ] **Step 4: 把预览区域包成 DualPreview**

参照 Task 31 Step 5,renderQuestions 复用现有题目渲染。

- [ ] **Step 5: 验证**

访问 /admin/quizzes/new,上传 .md,切 AI tab,验证双预览。

- [ ] **Step 6: 提交**

```bash
git add src/components/admin/QuizUploadPanel.tsx
git commit -m "feat(upload): QuizUploadPanel dual preview tabs"
```

---

### Task 33: 黄色 banner(未配置 AI 时)

**Files:**
- Modify: `src/components/UploadForm.tsx`
- Modify: `src/components/admin/QuizUploadPanel.tsx`

- [ ] **Step 1: 在 UploadForm 顶部加 banner**

在 `<div className="px-4 ...">` 容器内最顶部加:
```tsx
{aiState.status === 'error' && aiState.message.includes('未配置 AI 厂商') && (
  <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[12px]">
    ⚠ 未配置 AI 厂商,当前仅可使用本地解析。请管理员在「AI 配置」中设置激活厂商后再使用 AI 解析。
  </div>
)}
```

- [ ] **Step 2: 同样加到 QuizUploadPanel**

- [ ] **Step 3: 验证**

不配置 AI 时上传文件,顶部显示黄色 banner

- [ ] **Step 4: 提交**

```bash
git add src/components/UploadForm.tsx src/components/admin/QuizUploadPanel.tsx
git commit -m "feat(ui): yellow banner when no AI provider configured"
```

---

### Task 34: 端到端 fixture 验证

**Files:**
- Create: `tests/fixtures/parse/basic-choice.md`
- Create: `tests/fixtures/parse/code-heavy.md`
- Create: `tests/fixtures/parse/mixed-types.md`

- [ ] **Step 1: 创建 fixture 1: basic-choice.md**

Create `tests/fixtures/parse/basic-choice.md`:
```markdown
# 测试卷

## 一、选择题

1. 下列哪个是 HTTP 协议默认端口?
A. 21
B. 80
C. 443
D. 3306

答案: B

2. 下列哪些是 JavaScript 数据类型?(多选)
A. number
B. string
C. array
D. http

答案: ABC

## 二、判断题

3. CSS 是一种编程语言。
答案: 错误
```

- [ ] **Step 2: 创建 fixture 2: code-heavy.md**

Create `tests/fixtures/parse/code-heavy.md`:
```markdown
# Python 编程题

## 题 1
写一个 Python 函数,接受两个整数返回它们的和。

输入示例:
```
1 2
```
输出示例:
```
3
```

```python
def add(a, b):
    return a + b
```

## 题 2
写一个函数判断字符串是否为回文。

```python
def is_palindrome(s):
    return s == s[::-1]
```

输入示例:
```
abcba
```
输出示例:
```
True
```

## 题 3
实现一个斐波那契数列第 n 项(递归)。

## 题 4
写一个函数找列表中的最大值。

## 题 5
实现冒泡排序。
```

- [ ] **Step 3: 创建 fixture 3: mixed-types.md**

Create `tests/fixtures/parse/mixed-types.md`:
```markdown
# 综合练习

1. 中国首都是? (单选)
A. 上海
B. 北京
C. 广州
答案: B

2. 地球是圆的吗? (判断)
答案: 正确

3. 请填写《静夜思》的作者: ____
答案: 李白

4. 谈谈你对人工智能的看法。 (简答)
答案: 开放题

5. 用 Python 写一个 hello world。
答案: 
```python
print("Hello, World!")
```
```

- [ ] **Step 4: 浏览器端到端测试**

启动 dev,访问 /upload:
1. 上传 basic-choice.md → 本地解析应得 ≥ 3 道,AI 解析应得 ≥ 3 道
2. 上传 code-heavy.md → AI 解析的代码题 ≥ 4 道,每道 code 字段非空
3. 上传 mixed-types.md → AI 解析覆盖 6 种题型中的至少 5 种

- [ ] **Step 5: 提交 fixtures**

```bash
git add tests/fixtures/parse/*.md
git commit -m "test: add parse fixtures for E2E validation"
```

---

### Task 35: 跑全套测试 + 类型检查 + 构建

- [ ] **Step 1: 跑测试**

Run: `npm test`
Expected: 全部 passed

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 构建**

Run: `npm run build`
Expected: build 成功

- [ ] **Step 4: 修复直到全部通过**

- [ ] **Step 5: 最终提交(若有改动)**

```bash
git add -A
git commit -m "chore: phase 3 complete, all tests pass"
```

---

### Task 36: 更新 README

**Files:**
- Modify: `README.md`(若存在)

- [ ] **Step 1: 检查 README 是否存在**

Run: `ls README.md`

- [ ] **Step 2: 若存在,在合适位置加 "AI 配置" 章节**

追加:
```markdown
## AI 厂商配置(题目解析)

为提升代码题解析质量,系统支持调用 AI 模型。

1. 在 `.env` 配置 `AI_KEY_ENCRYPTION_SECRET`(≥ 32 字符):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

2. 管理员登录后台 → 侧栏「AI 配置」→ 新增厂商 → 填 API Key → 设为激活

3. 用户上传题目时,本地解析与 AI 解析并行,前端可切换预览
```

- [ ] **Step 3: 提交**

```bash
git add README.md
git commit -m "docs: add AI provider configuration section"
```

---

## Self-Review Checklist

执行人完成所有任务后,跑以下命令自审:

- [ ] `npm test` 全部通过
- [ ] `npx tsc --noEmit` 0 错误
- [ ] `npm run build` 成功
- [ ] 浏览器访问 `/admin/ai` 可正常增删改查厂商
- [ ] 浏览器访问 `/upload` 上传 .md/.pdf/.docx/.png 均能解析
- [ ] 浏览器双 tab 切换正常,AI 解析失败时回退本地
- [ ] 未配置 AI 时显示黄色 banner
- [ ] `.env` 删 `AI_KEY_ENCRYPTION_SECRET` 时启动失败
- [ ] 数据库 `aIProviderConfig` 表已生成,apiKeyCipher 字段不暴露

---

## 不在本期范围

- PDF 扫版图片 OCR(纯文本 PDF 可处理,扫版需另引 OCR 引擎)
- 长文档分块 + 多轮 AI 拼接(> 60k 字符)
- AI 调用按用户配额 / 成本统计
- 流式输出(SSE)
- 代码题自动评测(题目 schema 加 `testCases` 字段是另一大改动)