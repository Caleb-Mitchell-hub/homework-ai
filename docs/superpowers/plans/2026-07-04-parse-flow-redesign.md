# 上传解析流程改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 `/upload` 上传解析流程：上传后弹出本地/AI 选择对话框，解析过程显示进度条，解析成功后自动进入答题。

**Architecture:** 新建 SSE 流式解析端点 `/api/ai/parse-stream`,客户端用 `fetch + ReadableStream` 订阅进度事件。本地解析和 AI 解析共用同一套进度协议,UI 一致。删除「开始答题」按钮,改成选择对话框 + 进度对话框。

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind 3 · Vitest 4 · Prisma 5

---

## File Structure

| 文件 | 职责 |
|------|------|
| **新建** | |
| `src/components/ParseChoiceDialog.tsx` | 选择对话框（本地 vs AI） |
| `src/components/ParseProgressDialog.tsx` | 进度对话框（SSE 订阅） |
| `src/app/api/ai/parse-stream/route.ts` | SSE 流式解析端点 |
| `src/app/api/ai/available/route.ts` | 检测是否配置了激活的 AI 厂商 |
| `tests/ai/parse-stream.test.ts` | SSE 端点测试 |
| `tests/components/ParseChoiceDialog.test.tsx` | 选择对话框单元测试 |
| `tests/components/ParseProgressDialog.test.tsx` | 进度对话框单元测试 |
| **修改** | |
| `src/components/UploadForm.tsx` | 接入新对话框 + 移除旧按钮 + 自动进入答题 |
| `src/components/admin/QuizUploadPanel.tsx` | 同上 |

---

## Task 1: AI 厂商可用性检测端点

**Files:**
- Create: `src/app/api/ai/available/route.ts`
- Test: `tests/ai/available.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/ai/available.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIProviderConfig: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/ai/available/route';

describe('GET /api/ai/available', () => {
  it('returns available=true when active provider exists', async () => {
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue({ id: 'p1' });
    const req = new Request('http://localhost/api/ai/available');
    const res = await GET(req as any);
    const data = await res.json();
    expect(data.available).toBe(true);
  });

  it('returns available=false when no active provider', async () => {
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue(null);
    const req = new Request('http://localhost/api/ai/available');
    const res = await GET(req as any);
    const data = await res.json();
    expect(data.available).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npx vitest run tests/ai/available.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/ai/available/route'"

- [ ] **Step 3: 实现端点**

```typescript
// src/app/api/ai/available/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const provider = await prisma.aIProviderConfig.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  return NextResponse.json({ available: !!provider });
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npx vitest run tests/ai/available.test.ts`
Expected: 2 passed

- [ ] **Step 5: 提交**

```bash
git add src/app/api/ai/available/route.ts tests/ai/available.test.ts
git commit -m "feat(api): add /api/ai/available endpoint"
```

---

## Task 2: SSE 解析端点 - 骨架

**Files:**
- Create: `src/app/api/ai/parse-stream/route.ts`
- Test: `tests/ai/parse-stream.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/ai/parse-stream.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIProviderConfig: {
      findFirst: vi.fn(),
    },
  },
}));
vi.mock('@/lib/parser', () => ({
  parseMarkdown: vi.fn(),
}));
vi.mock('@/lib/ai/parser', () => ({
  aiParseQuestions: vi.fn(),
}));
vi.mock('@/lib/ai/normalize', () => ({
  normalizeAIOutputToQuestions: vi.fn((arr) => arr),
}));

import { prisma } from '@/lib/prisma';
import { parseMarkdown } from '@/lib/parser';
import { aiParseQuestions } from '@/lib/ai/parser';
import { POST } from '@/app/api/ai/parse-stream/route';

async function readSseEvents(res: Response): Promise<any[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const events: any[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.replace(/^data: /, '').trim();
      if (line) events.push(JSON.parse(line));
    }
  }
  return events;
}

describe('POST /api/ai/parse-stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no auth header', async () => {
    const req = new Request('http://localhost/api/ai/parse-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '# hello', mode: 'local' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('streams local parse progress events', async () => {
    const { getSession } = await import('@/lib/sessionStore');
    vi.mocked(getSession).mockReturnValue({ userId: 'u1', type: 'user' } as any);

    (parseMarkdown as any).mockReturnValue([
      { type: 'single', content: 'q1', answer: 'A', score: 10 },
    ]);

    const req = new Request('http://localhost/api/ai/parse-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ text: '# hello', mode: 'local' }),
    });
    const res = await POST(req as any);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    const events = await readSseEvents(res);
    const progresses = events.map((e) => e.progress);
    expect(progresses).toContain(5);
    expect(progresses).toContain(30);
    expect(progresses).toContain(85);
    expect(progresses).toContain(100);
    const last = events[events.length - 1];
    expect(last.questions).toHaveLength(1);
  });

  it('returns error event when no active AI provider for mode=ai', async () => {
    const { getSession } = await import('@/lib/sessionStore');
    vi.mocked(getSession).mockReturnValue({ userId: 'u1', type: 'user' } as any);
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue(null);

    const req = new Request('http://localhost/api/ai/parse-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ text: '# hello', mode: 'ai' }),
    });
    const res = await POST(req as any);
    const events = await readSseEvents(res);
    expect(events.some((e) => e.error)).toBe(true);
  });

  it('streams AI parse progress events', async () => {
    const { getSession } = await import('@/lib/sessionStore');
    vi.mocked(getSession).mockReturnValue({ userId: 'u1', type: 'user' } as any);
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue({
      id: 'p1', baseURL: 'https://x', apiKeyCipher: 'c', model: 'm',
    });
    (aiParseQuestions as any).mockResolvedValue([
      { type: 'single', content: 'q1', answer: 'A' },
    ]);

    const req = new Request('http://localhost/api/ai/parse-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
      body: JSON.stringify({ text: '# hello', mode: 'ai' }),
    });
    const res = await POST(req as any);
    const events = await readSseEvents(res);
    const last = events[events.length - 1];
    expect(last.progress).toBe(100);
    expect(last.questions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npx vitest run tests/ai/parse-stream.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/ai/parse-stream/route'"

- [ ] **Step 3: 实现 SSE 端点**

```typescript
// src/app/api/ai/parse-stream/route.ts
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseMarkdown } from '@/lib/parser';
import { aiParseQuestions } from '@/lib/ai/parser';
import { normalizeAIOutputToQuestions } from '@/lib/ai/normalize';
import { getSession } from '@/lib/sessionStore';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { aiRateLimiter } from '@/lib/ai/rate-limit';

const RATE_MAX = 10;
const RATE_WINDOW_MS = 60_000;

function genId(): string {
  return 'q_' + Math.random().toString(36).slice(2, 10);
}

function resolveUserId(req: NextRequest): string | null {
  const token = getTokenFromHeaders(req);
  if (!token) return null;
  const admin = verifyAdminToken(token);
  if (admin) return `admin:${admin.adminId}`;
  const user = getSession<{ userId: string; type?: string }>(token);
  if (user?.userId) return `user:${user.userId}`;
  return null;
}

export async function POST(req: NextRequest) {
  const userKey = resolveUserId(req);
  if (!userKey) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  if (!aiRateLimiter.check(userKey, RATE_MAX, RATE_WINDOW_MS)) {
    return new Response(JSON.stringify({ error: '请求过于频繁' }), { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const text: string = body?.text ?? '';
  const mode: 'local' | 'ai' = body?.mode === 'ai' ? 'ai' : 'local';
  if (!text.trim()) {
    return new Response(JSON.stringify({ error: 'text 为空' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller may be closed
        }
      };

      try {
        send({ progress: 5, message: '正在准备...' });

        if (mode === 'local') {
          send({ progress: 30, message: '正在解析 Markdown...' });
          await new Promise((r) => setTimeout(r, 50));
          const raw = parseMarkdown(text);
          send({ progress: 85, message: '规范化题目...' });
          await new Promise((r) => setTimeout(r, 50));
          const questions = normalizeAIOutputToQuestions(raw, genId);
          send({ progress: 100, message: '解析完成', questions });
        } else {
          const provider = await prisma.aIProviderConfig.findFirst({
            where: { isActive: true },
          });
          if (!provider) {
            send({ progress: 0, message: '未配置 AI 厂商', error: '未配置 AI 厂商' });
            return;
          }
          send({ progress: 30, message: '调用 AI 厂商...' });
          send({ progress: 60, message: '等待 AI 响应(通常 10-30 秒)...' });
          const raw = await aiParseQuestions({ text, provider });
          send({ progress: 90, message: '规范化题目...' });
          const questions = normalizeAIOutputToQuestions(raw, genId);
          send({ progress: 100, message: '解析完成', questions });
        }
      } catch (err: any) {
        send({ progress: 0, message: err?.message ?? '解析失败', error: err?.message ?? '解析失败' });
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

- [ ] **Step 4: 运行测试,确认通过**

Run: `npx vitest run tests/ai/parse-stream.test.ts`
Expected: 4 passed

- [ ] **Step 5: 提交**

```bash
git add src/app/api/ai/parse-stream/route.ts tests/ai/parse-stream.test.ts
git commit -m "feat(api): SSE parse-stream endpoint with local+ai modes"
```

---

## Task 3: ParseChoiceDialog 组件 - 测试

**Files:**
- Create: `tests/components/ParseChoiceDialog.test.tsx`
- Create: `src/components/ParseChoiceDialog.tsx`

- [ ] **Step 1: 写测试**

```tsx
// tests/components/ParseChoiceDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ParseChoiceDialog from '@/components/ParseChoiceDialog';

describe('ParseChoiceDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ParseChoiceDialog open={false} onClose={() => {}} onSelect={() => {}} aiAvailable={true} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders two cards when open', () => {
    const { getByText } = render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={() => {}} aiAvailable={true} />
    );
    expect(getByText('本地解析')).toBeTruthy();
    expect(getByText('AI 解析')).toBeTruthy();
  });

  it('calls onSelect(local) when local card clicked', () => {
    const onSelect = vi.fn();
    const { getAllByText } = render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={onSelect} aiAvailable={true} />
    );
    fireEvent.click(getAllByText('本地解析')[0]);
    expect(onSelect).toHaveBeenCalledWith('local');
  });

  it('calls onSelect(ai) when AI card clicked and aiAvailable', () => {
    const onSelect = vi.fn();
    const { getAllByText } = render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={onSelect} aiAvailable={true} />
    );
    fireEvent.click(getAllByText('AI 解析')[0]);
    expect(onSelect).toHaveBeenCalledWith('ai');
  });

  it('disables AI card when aiAvailable=false', () => {
    const onSelect = vi.fn();
    const { getByText } = render(
      <ParseChoiceDialog open={true} onClose={() => {}} onSelect={onSelect} aiAvailable={false} />
    );
    expect(getByText('未配置 AI 厂商')).toBeTruthy();
    // AI 按钮应 disabled,点击不触发
    const aiCard = getByText('AI 解析').closest('button')!;
    expect(aiCard).toHaveProperty('disabled', true);
  });

  it('calls onClose when overlay clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ParseChoiceDialog open={true} onClose={onClose} onSelect={() => {}} aiAvailable={true} />
    );
    const overlay = container.querySelector('.fixed.inset-0')!;
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when ESC pressed', () => {
    const onClose = vi.fn();
    render(
      <ParseChoiceDialog open={true} onClose={onClose} onSelect={() => {}} aiAvailable={true} />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npx vitest run tests/components/ParseChoiceDialog.test.tsx`
Expected: FAIL with "Cannot find module '@/components/ParseChoiceDialog'"

- [ ] **Step 3: 安装 testing-library**

Run: `npm install -D @testing-library/react@^16`
Expected: installed

- [ ] **Step 4: 实现组件**

```tsx
// src/components/ParseChoiceDialog.tsx
'use client';

import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: 'local' | 'ai') => void;
  aiAvailable: boolean;
}

export default function ParseChoiceDialog({ open, onClose, onSelect, aiAvailable }: Props) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-800 mb-1">选择解析方式</h2>
        <p className="text-[12px] text-slate-500 mb-5">选完后会自动开始解析并进入答题</p>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onSelect('local')}
            className="p-5 bg-gradient-to-br from-sky-50 to-emerald-50 border-2 border-sky-200 hover:border-sky-400 rounded-xl text-left transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">⚡</span>
              <span className="font-semibold text-slate-800">本地解析</span>
            </div>
            <p className="text-[12px] text-slate-600 mb-3">即时完成</p>
            <ul className="text-[11px] text-slate-500 space-y-1">
              <li>• 适合格式规范的 Markdown</li>
              <li>• 无需网络,无 API 成本</li>
              <li>• 代码题支持较弱</li>
            </ul>
          </button>

          <button
            onClick={() => aiAvailable && onSelect('ai')}
            disabled={!aiAvailable}
            className={`p-5 border-2 rounded-xl text-left transition-all ${
              aiAvailable
                ? 'bg-gradient-to-br from-violet-50 to-pink-50 border-violet-200 hover:border-violet-400'
                : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🧠</span>
              <span className="font-semibold text-slate-800">AI 解析</span>
            </div>
            <p className="text-[12px] text-slate-600 mb-3">
              {aiAvailable ? '预计 10-30 秒' : '未配置 AI 厂商'}
            </p>
            <ul className="text-[11px] text-slate-500 space-y-1">
              <li>• 适合代码题 / 复杂格式</li>
              <li>• 需调用 AI 厂商 API</li>
              <li>• 图片 OCR 必需</li>
            </ul>
            {!aiAvailable && (
              <p className="text-[11px] text-amber-600 mt-3">
                请管理员在「AI 配置」中设置激活厂商
              </p>
            )}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 text-[12px] text-slate-500 hover:text-slate-800"
        >
          稍后再说
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 运行测试,确认通过**

Run: `npx vitest run tests/components/ParseChoiceDialog.test.tsx`
Expected: 7 passed

- [ ] **Step 6: 提交**

```bash
git add src/components/ParseChoiceDialog.tsx tests/components/ParseChoiceDialog.test.tsx package.json package-lock.json
git commit -m "feat(ui): add ParseChoiceDialog with local/AI selection"
```

---

## Task 4: ParseProgressDialog 组件 - 测试

**Files:**
- Create: `tests/components/ParseProgressDialog.test.tsx`
- Create: `src/components/ParseProgressDialog.tsx`

- [ ] **Step 1: 写测试**

```tsx
// tests/components/ParseProgressDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

const mockFetch = vi.fn();
global.fetch = mockFetch;

import ParseProgressDialog from '@/components/ParseProgressDialog';

function makeSseStream(events: any[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

describe('ParseProgressDialog', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <ParseProgressDialog
        open={false}
        mode="local"
        text="x"
        token="t"
        onComplete={() => {}}
        onError={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders progress bar and current message', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([
        { progress: 5, message: '准备中...' },
        { progress: 30, message: '解析中...' },
        { progress: 100, message: '完成', questions: [{ type: 'single', content: 'q', answer: 'A', score: 10 }] },
      ]),
    });

    const onComplete = vi.fn();
    const { getByText, findByText } = render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# hello"
        token="t"
        onComplete={onComplete}
        onError={() => {}}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    // 标题
    expect(getByText('⚡ 本地解析中')).toBeTruthy();
  });

  it('calls onError when stream returns error event', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([
        { progress: 0, message: 'AI 失败', error: 'AI 失败' },
      ]),
    });

    const onError = vi.fn();
    render(
      <ParseProgressDialog
        open={true}
        mode="ai"
        text="# hello"
        token="t"
        onComplete={() => {}}
        onError={onError}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith('AI 失败'));
  });

  it('calls onError when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('网络错误'));

    const onError = vi.fn();
    render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# hello"
        token="t"
        onComplete={() => {}}
        onError={onError}
        onCancel={() => {}}
      />
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith('网络错误'));
  });

  it('uses Authorization header with token', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      body: makeSseStream([]),
    });

    render(
      <ParseProgressDialog
        open={true}
        mode="local"
        text="# hello"
        token="mytoken"
        onComplete={() => {}}
        onError={() => {}}
        onCancel={() => {}}
      />
    );

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/ai/parse-stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer mytoken' }),
      })
    );
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npx vitest run tests/components/ParseProgressDialog.test.tsx`
Expected: FAIL with "Cannot find module '@/components/ParseProgressDialog'"

- [ ] **Step 3: 实现组件**

```tsx
// src/components/ParseProgressDialog.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface ParseProgress {
  progress: number;
  message: string;
  questions?: unknown[];
  error?: string;
}

interface Props {
  open: boolean;
  mode: 'local' | 'ai';
  text: string;
  token: string | null;
  onComplete: (questions: unknown[]) => void;
  onError: (err: string) => void;
  onCancel: () => void;
}

export default function ParseProgressDialog({
  open,
  mode,
  text,
  token,
  onComplete,
  onError,
  onCancel,
}: Props) {
  const [state, setState] = useState<ParseProgress>({ progress: 0, message: '准备中...' });
  const completedRef = useRef(false);
  const abortedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    completedRef.current = false;
    abortedRef.current = false;
    setState({ progress: 0, message: '准备中...' });

    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/ai/parse-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify({ text, mode }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
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
              const evt: ParseProgress = JSON.parse(data);
              setState(evt);
              if (evt.error) {
                if (!completedRef.current) {
                  completedRef.current = true;
                  onError(evt.error);
                }
                return;
              }
              if (evt.progress === 100 && evt.questions && !completedRef.current) {
                completedRef.current = true;
                onComplete(evt.questions);
                return;
              }
            } catch {
              // 忽略解析失败的块
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          abortedRef.current = true;
          return;
        }
        if (!completedRef.current) {
          completedRef.current = true;
          onError(err?.message ?? '解析失败');
        }
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [open]);

  if (!open) return null;

  const isAi = mode === 'ai';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          {isAi ? '🧠 AI 解析中' : '⚡ 本地解析中'}
          <span className="text-[11px] text-slate-400 font-normal">
            {state.progress}%
          </span>
        </h3>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${state.progress}%` }}
          />
        </div>
        <p className="text-[12px] text-slate-500 min-h-[1.25rem]">{state.message}</p>

        {state.error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-[12px] text-rose-600 mb-2">{state.error}</p>
            <button
              onClick={onCancel}
              className="text-[12px] text-rose-700 underline hover:text-rose-900"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npx vitest run tests/components/ParseProgressDialog.test.tsx`
Expected: 5 passed

- [ ] **Step 5: 提交**

```bash
git add src/components/ParseProgressDialog.tsx tests/components/ParseProgressDialog.test.tsx
git commit -m "feat(ui): add ParseProgressDialog with SSE subscription"
```

---

## Task 5: UploadForm 接入新对话框 - 测试先行

**Files:**
- Modify: `tests/components/UploadForm.test.tsx` (新建)
- Modify: `src/components/UploadForm.tsx`

- [ ] **Step 1: 写测试**

```tsx
// tests/components/UploadForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'mytoken', user: { id: 'u1', username: 'u', isGuest: false }, login: vi.fn(), logout: vi.fn(), loading: false }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import UploadForm from '@/components/UploadForm';

beforeEach(() => {
  mockFetch.mockReset();
  mockPush.mockReset();
});

function makeSseStream(events: any[]) {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
}

describe('UploadForm - parse flow', () => {
  it('opens choice dialog after file is read into textarea', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: makeSseStream([]),  // /api/ai/available
    });

    const { getByLabelText, findByText } = render(<UploadForm />);

    const file = new File(['# hi\nA. one'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await findByText('选择解析方式');
  });

  it('starts local parse and navigates to quiz when complete', async () => {
    // available check
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: makeSseStream([]),
    });

    const { findByText, getByText } = render(<UploadForm />);
    const file = new File(['# hi\nA. one\n答案: A'], 'test.md', { type: 'text/markdown' });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const localCard = await findByText('本地解析');
    fireEvent.click(localCard.closest('button')!);

    // 后续两个 fetch: SSE + POST /api/quizzes
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: makeSseStream([
        { progress: 100, message: 'ok', questions: [{ type: 'single', content: 'q1', answer: 'A', score: 10 }] },
      ]),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ quiz: { id: 'quiz1' } }),
    });

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/quiz/quiz1'));
  });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `npx vitest run tests/components/UploadForm.test.tsx`
Expected: FAIL (选择对话框未显示 / 上传后未触发)

- [ ] **Step 3: 修改 UploadForm - 移除旧按钮,接入新对话框**

在 [src/components/UploadForm.tsx](src/components/UploadForm.tsx) 做以下改动:

```diff
-import DualPreview, { type DualAiState } from '@/components/DualPreview';
+import ParseChoiceDialog from '@/components/ParseChoiceDialog';
+import ParseProgressDialog from '@/components/ParseProgressDialog';

 // 新增 state
+const [showChoice, setShowChoice] = useState(false);
+const [showProgress, setShowProgress] = useState(false);
+const [parseMode, setParseMode] = useState<'local' | 'ai'>('local');
+const [aiAvailable, setAiAvailable] = useState(false);

+useEffect(() => {
+  fetch('/api/ai/available')
+    .then((r) => r.json())
+    .then((d) => setAiAvailable(!!d.available))
+    .catch(() => setAiAvailable(false));
+}, []);

+// handleFile: 上传/读取成功后弹选择框
 const handleFile = useCallback(async (file: File) => {
   setError('');
-  setAiState({ status: 'idle' });
+  setAiState({ status: 'idle' });  // 保留(其他地方可能用)
   if (file.size > MAX_BYTES) {
     setError(`文件超过 10MB 限制`);
     return;
   }
   const mode = resolveFileAccept(file);
   if (mode === 'text') {
     const reader = new FileReader();
     reader.onload = (ev) => {
       const result = ev.target?.result as string;
       if (result) {
-        setPreview(result);
+        setPreview(result);
+        setShowChoice(true);  // ★ 弹选择对话框
       }
     };
     reader.onerror = () => { setError('文件读取失败'); };
     reader.readAsText(file);
   } else {
     setIsLoading(true);
     try {
       const fd = new FormData();
       fd.append('file', file);
       const res = await fetch('/api/upload', { ... });
       const data = await res.json();
       if (!res.ok) throw new Error(data.error ?? '上传失败');
       setPreview(data.text ?? '');
+      setShowChoice(true);  // ★ 弹选择对话框
     } catch (err: any) {
       setError(String(err?.message ?? err));
     } finally {
       setIsLoading(false);
     }
   }
 }, [token]);

-// 删除 fetchAi / 旧 aiState 相关逻辑
+const handleParseChoice = (mode: 'local' | 'ai') => {
+  setParseMode(mode);
+  setShowChoice(false);
+  setShowProgress(true);
+};

+const handleParseComplete = async (questions: unknown[]) => {
+  setShowProgress(false);
+  const qs = questions as Array<{ type: string; content: string; answer: string; score?: number; options?: string[]; analysis?: string }>;
+  const title = extractTitle(preview);
+  const fileKey = await sha256Hex(preview);
+  try {
+    const res = await fetch('/api/quizzes', {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
+      body: JSON.stringify({ title, questions: qs, fileKey }),
+    });
+    const data = await res.json();
+    if (!res.ok) {
+      setError(data.error ?? '创建题库失败');
+      return;
+    }
+    if (data.existed) {
+      setReuploadChoice({
+        quizId: data.quiz.id,
+        draftId: data.draftId ?? null,
+        hasSubmitted: !!data.hasSubmitted,
+      });
+      return;
+    }
+    if (onCreated) onCreated(data.quiz.id);
+    else router.push(`/quiz/${data.quiz.id}`);
+  } catch (err: any) {
+    setError('网络错误: ' + (err?.message ?? err));
+  }
+};

+const handleParseError = (err: string) => {
+  setShowProgress(false);
+  setError('解析失败: ' + err);
+};
```

修改「开始答题」按钮为「开始解析」(也弹出选择对话框):

```diff
-<button onClick={handleParse}>开始答题</button>
+<button
+  onClick={() => preview.trim() && setShowChoice(true)}
+  disabled={!preview.trim() || isLoading}
+>开始解析</button>
```

**完全删除旧的 handleParse 内部逻辑**(`parseMarkdown` 那块),以及 fetchAi 函数。

在组件 return 处,新对话框加在 reuploadChoice 之前:

```tsx
{showChoice && (
  <ParseChoiceDialog
    open={showChoice}
    onClose={() => setShowChoice(false)}
    onSelect={handleParseChoice}
    aiAvailable={aiAvailable}
  />
)}

{showProgress && (
  <ParseProgressDialog
    open={showProgress}
    mode={parseMode}
    text={preview}
    token={token}
    onComplete={handleParseComplete}
    onError={handleParseError}
    onCancel={() => setShowProgress(false)}
  />
)}
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `npx vitest run tests/components/UploadForm.test.tsx`
Expected: 2 passed

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: 提交**

```bash
git add src/components/UploadForm.tsx tests/components/UploadForm.test.tsx
git commit -m "feat(upload): integrate parse choice + progress dialogs into UploadForm"
```

---

## Task 6: QuizUploadPanel 接入新对话框

**Files:**
- Modify: `src/components/admin/QuizUploadPanel.tsx`

- [ ] **Step 1: 修改组件**

```diff
 // src/components/admin/QuizUploadPanel.tsx
-import DualPreview, { type DualAiState } from '@/components/DualPreview';
+import ParseChoiceDialog from '@/components/ParseChoiceDialog';
+import ParseProgressDialog from '@/components/ParseProgressDialog';

 const [aiState, setAiState] = useState<DualAiState>({ status: 'idle' });
 const [aiStart, setAiStart] = useState(0);
+const [showChoice, setShowChoice] = useState(false);
+const [showProgress, setShowProgress] = useState(false);
+const [parseMode, setParseMode] = useState<'local' | 'ai'>('local');
+const [aiAvailable, setAiAvailable] = useState(false);

+useEffect(() => {
+  fetch('/api/ai/available')
+    .then((r) => r.json())
+    .then((d) => setAiAvailable(!!d.available))
+    .catch(() => setAiAvailable(false));
+}, []);
```

修改 `handleFile`,文件读取/上传成功后弹选择框(同 UploadForm):

```diff
 // .readAsText 后:
-  if (result) setPreview(result);
+  if (result) {
+    setPreview(result);
+    setShowChoice(true);
+  }

 // /api/upload 成功后:
-  setPreview(data.text ?? '');
+  setPreview(data.text ?? '');
+  setShowChoice(true);
```

**删除 fetchAi 函数**和 aiState 相关 effect(已被 ParseProgressDialog 取代)。

新增 handler:

```tsx
const handleParseChoice = (mode: 'local' | 'ai') => {
  setParseMode(mode);
  setShowChoice(false);
  setShowProgress(true);
};

const handleParseComplete = async (questions: unknown[]) => {
  setShowProgress(false);
  const qs = questions as Array<{ type: string; content: string; answer: string; score?: number; options?: string[]; analysis?: string }>;
  if (qs.length === 0) {
    setError('未能解析到任何题目');
    return;
  }
  const title = extractTitle(preview);
  await onParsed(title, qs);
};

const handleParseError = (err: string) => {
  setShowProgress(false);
  setError('解析失败: ' + err);
};
```

修改「开始解析」按钮(原 handleParse 简化为只弹选择框):

```diff
-<button onClick={handleParse} disabled={...}>开始解析</button>
+<button
+  onClick={() => preview.trim() && setShowChoice(true)}
+  disabled={!preview.trim() || isLoading || busy}
+>开始解析</button>
```

**删除旧 handleParse 中的 parseMarkdown 逻辑**(已上移到对话框)。

return 处加对话框:

```tsx
{showChoice && (
  <ParseChoiceDialog
    open={showChoice}
    onClose={() => setShowChoice(false)}
    onSelect={handleParseChoice}
    aiAvailable={aiAvailable}
  />
)}

{showProgress && (
  <ParseProgressDialog
    open={showProgress}
    mode={parseMode}
    text={preview}
    token={token}
    onComplete={handleParseComplete}
    onError={handleParseError}
    onCancel={() => setShowProgress(false)}
  />
)}
```

**删除 textarea 下方旧 AI 按钮 row**(整段紫色按钮 + 状态显示)。

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 提交**

```bash
git add src/components/admin/QuizUploadPanel.tsx
git commit -m "feat(admin): integrate parse choice + progress dialogs into QuizUploadPanel"
```

---

## Task 7: 端到端验证

**Files:** N/A

- [ ] **Step 1: 跑全套测试**

Run: `npx vitest run`
Expected: 50(旧) + 12(新) = 62 tests passed

- [ ] **Step 2: 启动 dev server 验证**

确认 dev server 已在运行(http://localhost:3000),访问 `/upload`:

1. 上传 `.md` 文件 → 应弹出「选择解析方式」对话框
2. 选「⚡ 本地解析」→ 弹出进度对话框 → 瞬间完成 → 进入 `/quiz/[id]`
3. 关闭对话框后粘贴内容 → 点「开始解析」→ 再次弹选择框
4. 选「🧠 AI 解析」(需已配置 AI 厂商)→ 进度条分阶段更新 → 进入 `/quiz/[id]`

- [ ] **Step 3: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errors

- [ ] **Step 4: 提交最终报告**

无新文件需要 commit,但需确认所有任务都已提交:

Run: `git log --oneline -10`
Expected: 看到 Task 1-6 的 commits

---

## Self-Review Checklist

- [x] Spec coverage: 选择对话框 (Task 3) · 进度条 (Task 4) · 自动进入答题 (Task 5/6) · SSE 端点 (Task 2) · AI 检测 (Task 1) 全覆盖
- [x] Placeholder scan: 无 "TBD"/"TODO"/"类似 Task N" 等占位
- [x] Type consistency: `aiAvailable`、`parseMode`、`onComplete` 命名跨任务一致
- [x] 接口一致性: `POST /api/ai/parse-stream` 的 body `{text, mode}` 在客户端 Task 4、Task 5、Task 6 一致