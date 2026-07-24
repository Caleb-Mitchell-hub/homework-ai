# AI 追问功能 实现计划

> **供执行代理使用:** 按任务顺序逐项实现。每步使用 checkbox（`- [ ]`）跟踪进度。

**目标:** 为每道题添加「追问」按钮，用户可以对不理解的答案/AI解析内容进行多轮追问对话

**架构:** 新建 API 端点 `/api/ai/followup`（免费、不写缓存），新建 `AIFollowUp` 聊天组件，注入到 QuestionCard 和 AnswerSheet

**技术栈:** Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4 + callChat

---

### Task 1: 追问 System Prompt

**文件:**
- 创建: `src/lib/ai/followup-prompt.ts`

- [ ] **Step 1: 写 prompt 构建函数**

```typescript
/**
 * 追问 System Prompt。
 * 根据提供的题目上下文构建给 AI 的系统提示词。
 */
export function buildFollowUpPrompt(opts: {
  questionContent: string;
  questionType: string;
  answer?: string;
  aiExplanation?: string;
}): string {
  const parts: string[] = [
    '你是一位耐心的辅导老师。学生正在做一道题目，对某些内容不理解，需要你帮助解答。',
    '',
    '以下是题目的完整信息：',
    `- 题目类型：${opts.questionType}`,
    `- 题目内容：${opts.questionContent}`,
  ];

  if (opts.answer && opts.answer.trim()) {
    parts.push(`- 正确答案/参考答案：${opts.answer}`);
  }

  if (opts.aiExplanation && opts.aiExplanation.trim()) {
    parts.push(`- AI 解析（已有）：${opts.aiExplanation}`);
  }

  parts.push(
    '',
    '请基于以上信息，用简洁清晰的中文回答学生的追问。使用 markdown 格式。',
    '如果学生的追问与题目无关，请引导他们回到题目相关的讨论。'
  );

  return parts.join('\n');
}
```

- [ ] **Step 2: 提交**

---

### Task 2: 追问 API 端点

**文件:**
- 创建: `src/app/api/ai/followup/route.ts`

- [ ] **Step 1: 写 API route**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';
import { decryptApiKey } from '@/lib/ai/crypto';
import { buildFollowUpPrompt } from '@/lib/ai/followup-prompt';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  // 1. 鉴权
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  // 2. 解析 body
  const body = await request.json().catch(() => null);
  const {
    questionId,
    questionContent,
    questionType,
    answer,
    aiExplanation,
    conversationHistory,
    newQuestion,
  } = body || {};

  if (!questionId || !questionContent || !newQuestion?.trim()) {
    return NextResponse.json(
      { error: 'questionId、questionContent 和 newQuestion 必填' },
      { status: 400 }
    );
  }

  // 3. 获取活跃的 AI 厂商
  const provider = await prisma.aIProviderConfig.findFirst({
    where: { isActive: true },
  });
  if (!provider) {
    return NextResponse.json({ error: '未配置 AI 厂商' }, { status: 502 });
  }

  // 4. 拼装 messages
  const systemPrompt = buildFollowUpPrompt({
    questionContent,
    questionType: questionType || 'unknown',
    answer,
    aiExplanation,
  });

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // 追加对话历史
  if (Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory as Message[]) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // 当前追问
  messages.push({ role: 'user', content: newQuestion.trim() });

  // 5. 调 AI（不扣积分、不写缓存）
  try {
    const apiKey = decryptApiKey(provider.apiKeyCipher);
    const content = await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: messages as any,
      signal: request.signal,
      maxTokens: 1000,
      temperature: 0.5,
    });

    if (!content?.trim()) {
      return NextResponse.json(
        { error: 'AI 返回了空内容，请换个问法重试' },
        { status: 502 }
      );
    }

    return NextResponse.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai/followup] error:', msg);
    return NextResponse.json(
      { error: `AI 调用失败: ${msg.slice(0, 200)}` },
      { status: 502 }
    );
  }
}
```

- [ ] **Step 2: 提交**

---

### Task 3: AIFollowUp 组件

**文件:**
- 创建: `src/components/AIFollowUp.tsx`

- [ ] **Step 1: 写组件**

```typescript
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import MarkdownView from '@/components/MarkdownView';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  questionId: string;
  questionContent: string;
  questionType: string;
  answer?: string;
  aiExplanation?: string;
}

const MAX_MESSAGES = 20; // 最多 10 轮对话

export default function AIFollowUp({
  questionId,
  questionContent,
  questionType,
  answer,
  aiExplanation,
}: Props) {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // 展开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !token) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    // 截断超长历史
    if (newMessages.length > MAX_MESSAGES) {
      newMessages.splice(0, newMessages.length - MAX_MESSAGES);
    }
    setMessages(newMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/followup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questionId,
          questionContent,
          questionType,
          answer,
          aiExplanation,
          conversationHistory: messages,
          newQuestion: text,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '追问失败');
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.content },
      ]);
    } catch (err: any) {
      setError(err?.message || '追问失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const retryLast = () => {
    // 移除最后一条 assistant 消息对应的 user 消息，重新发送
    if (messages.length === 0) return;
    // 找到最后一条 user 消息
    const lastUserIdx = [...messages].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return;
    const actualIdx = messages.length - 1 - lastUserIdx;
    const lastUserMsg = messages[actualIdx];
    // 回到该消息之前的状态
    setMessages(messages.slice(0, actualIdx));
    setInput(lastUserMsg.content);
    setError(null);
  };

  return (
    <div className="mt-2">
      {/* 入口按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 text-[12px] rounded-lg transition-all ${
          isOpen
            ? 'bg-indigo-100 text-indigo-700'
            : 'bg-gradient-to-r from-indigo-400 to-purple-400 text-white hover:opacity-90'
        }`}
      >
        💬 追问
        {messages.length > 0 && !isOpen && (
          <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/25 text-[10px]">
            {messages.filter((m) => m.role === 'user').length}
          </span>
        )}
      </button>

      {/* 展开的对话面板 */}
      {isOpen && (
        <div className="mt-2 border border-indigo-100 rounded-xl overflow-hidden bg-white/60">
          {/* 对话区 */}
          <div className="max-h-64 overflow-y-auto px-3 py-2.5 space-y-2.5">
            {messages.length === 0 && !loading && (
              <div className="text-[12px] text-slate-400 text-center py-4">
                输入你的疑问，AI 会基于题目内容为你解答
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-[12.5px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-indigo-500 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <MarkdownView content={msg.content} size="sm" />
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}

            {/* loading 态 */}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 rounded-xl bg-slate-100 text-slate-700 rounded-bl-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="px-3 py-1.5 bg-rose-50 border-t border-rose-100 flex items-center justify-between">
              <span className="text-[11px] text-rose-600">{error}</span>
              <button
                onClick={retryLast}
                className="text-[11px] text-rose-600 hover:underline flex-shrink-0 ml-2"
              >
                重试
              </button>
            </div>
          )}

          {/* 输入区 */}
          <div className="flex items-end gap-2 px-3 py-2 border-t border-slate-100 bg-white/80">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入追问内容…"
              rows={1}
              disabled={loading}
              className="flex-1 resize-none px-3 py-1.5 text-[12.5px] bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-3 py-1.5 bg-indigo-500 text-white text-[12px] rounded-lg hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 提交**

---

### Task 4: AIExplainPanel 添加 onDone 回调

**文件:**
- 修改: `src/components/AIExplainPanel.tsx`

- [ ] **Step 1: 新增 onDone prop，在 AI 返回成功时调用**

```typescript
// 修改 Props 接口，新增 onDone
interface Props {
  questionId: string;
  questionContent: string;
  questionType: string;
  onNeedCredits: (required: number, balance: number) => void;
  onDone?: (content: string) => void;  // ← 新增
}
```

在 `ask()` 函数中，成功获取 `data.content` 后调用：

```typescript
// 在 setState({ status: 'done', content: data.content }); 之前加：
if (data.content && onDone) {
  onDone(data.content);
}
```

- [ ] **Step 2: 提交**

---

### Task 5: QuestionCard 添加追问入口

**文件:**
- 修改: `src/components/QuestionCard.tsx`

- [ ] **Step 1: 导入 AIFollowUp，在题目末尾渲染**

在 import 区域添加：
```typescript
import AIFollowUp from '@/components/AIFollowUp';
```

在组件 return 的 JSX 中，`</div>` 闭合标签前（即最外层 div 的末尾），追加：

```typescript
{/* 追问入口 - 答题中也可用 */}
<div className="mt-4 pt-3 border-t border-slate-100">
  <AIFollowUp
    questionId={question.id}
    questionContent={question.title}
    questionType={question.type}
  />
</div>
```

位置：在 `{showResult && ...}` 正确答案区域**之后**，最外层 div 的闭合标签之前。

参照现有结构（line 324-348），追问按钮放在所有条件渲染（showResult）之后。

- [ ] **Step 2: 提交**

---

### Task 6: AnswerSheet 添加追问入口 + 传递 AI 解析内容

**文件:**
- 修改: `src/components/AnswerSheet.tsx`

- [ ] **Step 1: 导入 AIFollowUp，用 state 追踪 AI 解析内容**

在 import 区域添加：
```typescript
import AIFollowUp from '@/components/AIFollowUp';
```

在组件函数体内新增 state（所有现有 hooks 之后）：
```typescript
// 记录每道题的 AI 解析内容，供追问上下文使用
const [explainContents, setExplainContents] = useState<Record<string, string>>({});
```

- [ ] **Step 2: 给 AIExplainPanel 传 onDone，修改追问区域**

将现有的 AIExplainPanel 调用（line 348-357）改为：
```typescript
<AIExplainPanel
  questionId={q.id}
  questionContent={q.title}
  questionType={q.type}
  onNeedCredits={(req, bal) => {
    alert(`积分不足: 需要 ${req} 积分, 当前 ${bal} 积分。请前往 /credits 充值`);
    window.location.href = '/credits';
  }}
  onDone={(content) => {
    setExplainContents((prev) => ({ ...prev, [q.id]: content }));
  }}
/>
```

- [ ] **Step 3: 在参考答案区域后追加追问按钮**

在 `{/* AI 解析 - 仅错题显示 */}` 块之后（`</div>` 闭合前），追加：

```typescript
{/* 追问入口 */}
<div className="pt-2 border-t border-slate-200/60">
  <AIFollowUp
    questionId={q.id}
    questionContent={q.title}
    questionType={q.type}
    answer={refAnswer}
    aiExplanation={explainContents[q.id]}
  />
</div>
```

注意：追问入口**不受** `correct === false` 限制——所有题目（不论对错、主观客观）都能追问。

- [ ] **Step 4: 提交**

---

### Task 7: 测试

**文件:**
- 创建: `tests/lib/ai/followup-prompt.test.ts`
- 创建: `tests/app/api/ai/followup.test.ts`
- 创建: `tests/components/ai-follow-up.test.tsx`

- [ ] **Step 1: Prompt 测试**

```typescript
import { describe, it, expect } from 'vitest';
import { buildFollowUpPrompt } from '@/lib/ai/followup-prompt';

describe('buildFollowUpPrompt', () => {
  it('包含题目内容和类型', () => {
    const p = buildFollowUpPrompt({
      questionContent: '什么是闭包？',
      questionType: 'essay',
    });
    expect(p).toContain('什么是闭包？');
    expect(p).toContain('essay');
  });

  it('包含答案（提供时）', () => {
    const p = buildFollowUpPrompt({
      questionContent: '1+1=?',
      questionType: 'fill',
      answer: '2',
    });
    expect(p).toContain('2');
  });

  it('包含 AI 解析（提供时）', () => {
    const p = buildFollowUpPrompt({
      questionContent: 'test',
      questionType: 'single',
      aiExplanation: '这是解析内容',
    });
    expect(p).toContain('这是解析内容');
  });

  it('不包含答案字段（未提供时）', () => {
    const p = buildFollowUpPrompt({
      questionContent: 'test',
      questionType: 'boolean',
    });
    expect(p).not.toContain('正确答案');
  });

  it('包含引导语', () => {
    const p = buildFollowUpPrompt({
      questionContent: 'test',
      questionType: 'single',
    });
    expect(p).toContain('辅导老师');
    expect(p).toContain('markdown');
  });
});
```

- [ ] **Step 2: 组件测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AIFollowUp from '@/components/AIFollowUp';

// Mock useAuth
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AIFollowUp', () => {
  const defaultProps = {
    questionId: 'q1',
    questionContent: '测试题目',
    questionType: 'single',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始态显示追问按钮', () => {
    render(<AIFollowUp {...defaultProps} />);
    expect(screen.getByText('💬 追问')).toBeTruthy();
  });

  it('点击按钮展开/收起面板', () => {
    render(<AIFollowUp {...defaultProps} />);
    const btn = screen.getByText('💬 追问');
    fireEvent.click(btn);
    expect(screen.getByPlaceholderText('输入追问内容…')).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByPlaceholderText('输入追问内容…')).toBeNull();
  });

  it('空输入时发送按钮 disabled', () => {
    render(<AIFollowUp {...defaultProps} />);
    fireEvent.click(screen.getByText('💬 追问'));
    const sendBtn = screen.getByText('发送');
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('发送后显示用户消息和 loading', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: 'AI 回答内容' }),
    });

    render(<AIFollowUp {...defaultProps} />);
    fireEvent.click(screen.getByText('💬 追问'));

    const textarea = screen.getByPlaceholderText('输入追问内容…');
    fireEvent.change(textarea, { target: { value: '什么是闭包？' } });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(screen.getByText('什么是闭包？')).toBeTruthy();
    });
  });

  it('显示 AI 回复', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: '闭包是指函数可以访问其外部作用域的变量...' }),
    });

    render(<AIFollowUp {...defaultProps} />);
    fireEvent.click(screen.getByText('💬 追问'));

    fireEvent.change(screen.getByPlaceholderText('输入追问内容…'), {
      target: { value: '什么是闭包？' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(screen.getByText('闭包是指函数可以访问其外部作用域的变量...')).toBeTruthy();
    });
  });

  it('错误状态显示重试按钮', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: '网络错误' }),
    });

    render(<AIFollowUp {...defaultProps} />);
    fireEvent.click(screen.getByText('💬 追问'));

    fireEvent.change(screen.getByPlaceholderText('输入追问内容…'), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(screen.getByText('重试')).toBeTruthy();
    });
  });

  it('关闭后重新打开，消息历史保留', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: '回答' }),
    });

    render(<AIFollowUp {...defaultProps} />);
    const btn = screen.getByText('💬 追问');

    // 打开、发消息
    fireEvent.click(btn);
    fireEvent.change(screen.getByPlaceholderText('输入追问内容…'), {
      target: { value: '问题1' },
    });
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(screen.getByText('问题1')).toBeTruthy();
    });

    // 关闭
    fireEvent.click(btn);

    // 重新打开，消息还在
    fireEvent.click(btn);
    expect(screen.getByText('问题1')).toBeTruthy();
  });
});
```

- [ ] **Step 3: API 路由测试**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/ai/followup/route';
import { NextRequest } from 'next/server';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIProviderConfig: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  verifyToken: () => ({ userId: 'u1' }),
  getTokenFromHeaders: () => 'mock-token',
}));

// Mock callChat
vi.mock('@/lib/ai/providers', () => ({
  callChat: vi.fn(),
}));

// Mock crypto
vi.mock('@/lib/ai/crypto', () => ({
  decryptApiKey: () => 'decrypted-key',
}));

import { prisma } from '@/lib/prisma';
import { callChat } from '@/lib/ai/providers';

function buildRequest(body: any): NextRequest {
  return new NextRequest('http://localhost/api/ai/followup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai/followup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未登录返回 401', async () => {
    vi.mocked(require('@/lib/auth').verifyToken).mockReturnValueOnce(null);
    const req = buildRequest({ questionId: 'q1', questionContent: 'test', newQuestion: 'why?' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('缺少必填字段返回 400', async () => {
    const req = buildRequest({ questionId: 'q1' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('无活跃 AI 厂商返回 502', async () => {
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValueOnce(null);
    const req = buildRequest({ questionId: 'q1', questionContent: 'test', newQuestion: 'why?' });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it('成功返回 AI 内容', async () => {
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValueOnce({
      baseURL: 'https://api.test.com',
      model: 'test-model',
      apiKeyCipher: 'encrypted',
    } as any);
    vi.mocked(callChat).mockResolvedValueOnce('这是 AI 的追问回答');

    const req = buildRequest({
      questionId: 'q1',
      questionContent: 'test',
      questionType: 'single',
      newQuestion: 'why?',
      conversationHistory: [{ role: 'user', content: 'hello' }],
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.content).toBe('这是 AI 的追问回答');
  });

  it('AI 返回空内容返回 502', async () => {
    vi.mocked(prisma.aIProviderConfig.findFirst).mockResolvedValueOnce({
      baseURL: 'https://api.test.com',
      model: 'test-model',
      apiKeyCipher: 'encrypted',
    } as any);
    vi.mocked(callChat).mockResolvedValueOnce('');

    const req = buildRequest({
      questionId: 'q1',
      questionContent: 'test',
      newQuestion: 'why?',
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 4: 运行全部测试，确保通过**

```bash
npx vitest run
```

- [ ] **Step 5: TypeScript 类型检查**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: 提交**
