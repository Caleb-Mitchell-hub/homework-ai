# 上传解析流程改造 设计

**日期**: 2026-07-04
**项目**: HomeWork-AI (Next.js 16 + Prisma 5 + MySQL)
**状态**: 设计稿,等待用户审阅

---

## 1. 目标与背景

### 1.1 痛点

当前的 `/upload` 流程([src/components/UploadForm.tsx](src/components/UploadForm.tsx))有 3 个体验问题:

1. **上传后还要再点"开始答题"按钮** — 文件上传到 textarea 后,用户还得手动点 [UploadForm.tsx:671-687](src/components/UploadForm.tsx#L671-L687) 那个按钮才能进入答题,多一步操作。
2. **本地/AI 解析二选一不明确** — 用户只能看见 AI 解析按钮和「开始答题」按钮,但「开始答题」永远走本地解析。AI 解析结果只是展示用,跟提交流程**完全脱钩**([UploadForm.tsx:192](src/components/UploadForm.tsx#L192) 调的是 `parseMarkdown`,不是 AI 结果)。
3. **AI 解析无进度反馈** — 「🧠 AI 解析」点击后只显示 `⏳ 12s` 计时器,用户看不到阶段(初始化/上传中/AI 处理中/规范化中)。

### 1.2 目标

- **选择对话框**:上传文件/粘贴文本后弹出对话框,让用户选「⚡ 本地解析」还是「🧠 AI 解析」,明确告诉用户两者的差别。
- **进度条**:解析过程中用进度条 + 阶段文案实时反馈,本地解析和 AI 解析共用同一套 UI 协议。
- **自动进入答题**:解析成功后自动创建题库并跳转到 `/quiz/[id]`,不再需要"开始答题"按钮。
- **复用现有 AI 厂商**:直接复用上一期做的 `AIProviderConfig` 表,无需新增配置。

### 1.3 不在本期范围(留 TODO)

- AI 智能评分(下一期)
- 题库导出(下一期)
- 流式输出文本(token by token),本期的"进度"是阶段式而非 token 流
- 多文件/批量上传
- 拖拽即解析(本期仍需点击选择)

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  用户上传文件 / 粘贴文本 → 弹 ParseChoiceDialog                │
│      ├─ ⚡ 本地解析  → ParseProgressDialog → POST /api/quizzes│
│      └─ 🧠 AI 解析  → ParseProgressDialog → POST /api/quizzes│
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ParseProgressDialog 内部:                                     │
│   客户端打开 EventSource('POST /api/ai/parse-stream')         │
│   服务端按阶段 emit: 5% → 20% → 50% / 80% → 90% → 100%       │
│   100% 时附带最终 questions[],客户端自动跳 /quiz/[id]          │
└─────────────────────────────────────────────────────────────┘
```

**关键决策**:
- **不引入真正的流式 token 输出**。AI 厂商的响应是非流式的(`callChat` 等完整结果),所谓"进度"是阶段式(初始化/AI 处理中/规范化)。这避免了 SSE 双工复杂度和兼容性。
- **本地解析也走 SSE**。本地解析是同步的,但为了 UI 一致,服务端先 emit `progress: 0` 再 `setTimeout(50ms)` 后 emit `progress: 100 + questions`,前端体验一致。
- **删除「开始答题」按钮**,改成主流程里的「开始解析」按钮(用于关闭弹窗后用户主动触发)。

---

## 3. 数据流

### 3.1 SSE 流式响应协议

服务端用 `ReadableStream` + `text/event-stream`,事件格式:

```
event: progress
data: {"progress": 20, "message": "正在解析 Markdown..."}

event: progress
data: {"progress": 100, "message": "解析完成", "questions": [...]}

event: error
data: {"message": "AI 调用超时"}
```

每个事件以 `\n\n` 结束(JSON 字符串)。

### 3.2 客户端订阅

```typescript
const res = await fetch('/api/ai/parse-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ text, mode: 'local' | 'ai' }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buf = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  // 按 \n\n 切分事件
  // 解析 event: progress / error
}
```

> 用 `fetch + ReadableStream` 而非 `EventSource`,因为 EventSource 只支持 GET。

### 3.3 阶段与进度对照

| 阶段 | 本地解析 | AI 解析 | 进度 | 说明 |
|------|---------|---------|------|------|
| init | ✓ | ✓ | 5% | 接收文本,准备解析 |
| parsing | parseMarkdown | callChat | 30% | 实际解析进行中 |
| waiting_ai | — | ✓ | 60% | 仅 AI,等待响应 |
| normalizing | ✓ | ✓ | 85% | normalize |
| done | ✓ | ✓ | 100% | 附带 questions |
| error | ✓ | ✓ | — | 错误事件 |

---

## 4. 组件设计

### 4.1 `ParseChoiceDialog.tsx` (新建)

```tsx
'use client';
import { useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: 'local' | 'ai') => void;
  aiAvailable: boolean;  // 是否配置了激活的 AI 厂商
}

export default function ParseChoiceDialog({ open, onClose, onSelect, aiAvailable }: Props) {
  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6"
           onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">选择解析方式</h2>
        <p className="text-[12px] text-slate-500 mb-5">选完后会自动开始解析并进入答题</p>

        <div className="grid grid-cols-2 gap-3">
          {/* 本地解析卡片 */}
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

          {/* AI 解析卡片 */}
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

        <button onClick={onClose} className="mt-4 text-[12px] text-slate-500 hover:text-slate-800">
          稍后再说
        </button>
      </div>
    </div>
  );
}
```

### 4.2 `ParseProgressDialog.tsx` (新建)

```tsx
'use client';
import { useEffect, useState, useRef } from 'react';

interface ParseProgress {
  progress: number;   // 0-100
  message: string;
  questions?: any[];  // 100% 时附带
  error?: string;
}

interface Props {
  open: boolean;
  mode: 'local' | 'ai';
  text: string;
  token: string | null;
  onComplete: (questions: any[]) => void;
  onError: (err: string) => void;
  onCancel: () => void;
}

export default function ParseProgressDialog({ open, mode, text, token, onComplete, onError, onCancel }: Props) {
  const [state, setState] = useState<ParseProgress>({ progress: 0, message: '准备中...' });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch('/api/ai/parse-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text, mode }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error('解析失败');

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
            const data = line.replace(/^data: /, '');
            const evt = JSON.parse(data);
            setState(evt);
            if (evt.error) {
              onError(evt.error);
              return;
            }
            if (evt.progress === 100 && evt.questions) {
              onComplete(evt.questions);
              return;
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        onError(err.message ?? '解析失败');
      }
    })();

    return () => ctrl.abort();
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h3 className="font-semibold text-slate-800 mb-3">
          {mode === 'ai' ? '🧠 AI 解析中' : '⚡ 本地解析中'}
        </h3>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
          <div className="h-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all duration-300"
               style={{ width: `${state.progress}%` }} />
        </div>
        <p className="text-[12px] text-slate-500">{state.message}</p>
        {state.error && (
          <button onClick={onCancel} className="mt-4 text-[12px] text-rose-600">关闭</button>
        )}
      </div>
    </div>
  );
}
```

### 4.3 `UploadForm.tsx` 改造

```diff
- 引入 DualPreview 等旧组件
+ 引入 ParseChoiceDialog, ParseProgressDialog

- handleFile 内: setPreview(data.text)
+ handleFile 内: setPreview(data.text); setShowChoice(true)

- 删除 fetchAi / handleParse 旧逻辑
+ handleParseChoice(mode):
    setShowChoice(false)
    setShowProgress(true)
    setParseMode(mode)

+ handleParseComplete(questions):
    // POST /api/quizzes
    // router.push(`/quiz/${quiz.id}`)

+ handleParseError(err):
    setShowProgress(false)
    setError(err)

- 删除「🧠 AI 解析」按钮
- 「开始答题」按钮 → 「开始解析」按钮(用于关闭弹窗后用户主动触发)
```

### 4.4 `aiAvailable` 检测

新增轻量 API `GET /api/ai/available`,返回 `{ available: boolean }`(检查是否有 `isActive=true` 的厂商)。客户端在弹选择对话框前调用一次。

### 4.5 服务端 `/api/ai/parse-stream/route.ts` (新建)

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { aiParseQuestions } from '@/lib/ai/parser';
import { parseMarkdown } from '@/lib/parser';
import { resolveUserId } from '@/lib/ai/auth';
import { aiRateLimiter } from '@/lib/ai/rate-limit';
import { normalizeAIOutputToQuestions } from '@/lib/ai/normalize';

export async function POST(req: NextRequest) {
  // 鉴权 + 限流(复用 parse 路由)
  // ...

  const { text, mode = 'ai' } = await req.json();

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ progress: 5, message: '正在准备...' });

        if (mode === 'local') {
          send({ progress: 30, message: '正在解析 Markdown...' });
          await new Promise(r => setTimeout(r, 80)); // 让 UI 看到进度变化
          const questions = parseMarkdown(text);
          send({ progress: 85, message: '规范化题目...' });
          await new Promise(r => setTimeout(r, 80));
          send({ progress: 100, message: '解析完成', questions });
        } else {
          const provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
          if (!provider) {
            send({ progress: 0, message: '未配置 AI 厂商', error: '未配置 AI 厂商' });
            controller.close();
            return;
          }
          send({ progress: 30, message: '调用 AI 厂商...' });
          send({ progress: 60, message: '等待 AI 响应（通常 10-30 秒）...' });
          const questions = await aiParseQuestions({ text, provider });
          send({ progress: 90, message: '规范化题目...' });
          const normalized = normalizeAIOutputToQuestions(questions, () => 'q_' + Math.random().toString(36).slice(2, 10));
          send({ progress: 100, message: '解析完成', questions: normalized });
        }
      } catch (err: any) {
        send({ progress: 0, message: err.message, error: err.message });
      } finally {
        controller.close();
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

---

## 5. 关键文件清单

**新建**:
- [src/components/ParseChoiceDialog.tsx](src/components/ParseChoiceDialog.tsx) — 选择对话框
- [src/components/ParseProgressDialog.tsx](src/components/ParseProgressDialog.tsx) — 进度对话框
- [src/app/api/ai/parse-stream/route.ts](src/app/api/ai/parse-stream/route.ts) — SSE 端点
- [src/app/api/ai/available/route.ts](src/app/api/ai/available/route.ts) — 是否配置 AI 厂商

**修改**:
- [src/components/UploadForm.tsx](src/components/UploadForm.tsx) — 接入新对话框 + 流程改造
- [src/components/admin/QuizUploadPanel.tsx](src/components/admin/QuizUploadPanel.tsx) — 同上

**不修改**:
- [src/lib/ai/parser.ts](src/lib/ai/parser.ts) — 复用
- [src/lib/ai/normalize.ts](src/lib/ai/normalize.ts) — 复用
- [src/app/api/quizzes/route.ts](src/app/api/quizzes/route.ts) — 复用
- [src/app/quiz/[id]/page.tsx](src/app/quiz/[id]/page.tsx) — 复用

---

## 6. 验证

```bash
# 1. 类型检查
npx tsc --noEmit
# 预期:0 错误

# 2. 单元测试(新增 + 现有)
npx vitest run
# 预期:已有 50 测试 + 新增 5-8 测试

# 3. 浏览器端到端
# - 未配置 AI:上传 .md → 弹对话框 → AI 卡片 disabled → 选本地 → 进度条 → 进入答题 ✓
# - 已配置 AI:上传 .md → 弹对话框 → 选 AI → 进度条从 5% → 30% → 60% → 90% → 100% → 进入答题 ✓
# - 关闭弹窗后再次粘贴内容 → 点「开始解析」→ 重新弹对话框 ✓
# - AI 解析失败 → 进度对话框显示错误 → 可关闭,不跳转 ✓
```

---

## 7. 不在本轮范围

- ❌ AI 智能评分(下期)
- ❌ 题库导出(下期)
- ❌ 流式 token 输出(本期阶段式进度)
- ❌ 多文件批量上传
- ❌ 拖拽即解析(仍需点选)