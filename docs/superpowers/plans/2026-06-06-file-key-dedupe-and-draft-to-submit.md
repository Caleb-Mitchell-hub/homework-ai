# File Key 去重 + 草稿→完成 实施计划

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. This plan has 9 tasks.

**Goal:** 同一份 md 文件上传时去重(同 fileKey 复用 Quiz),暂存/提交不再重复选分类/名称,提交时把 draft 升级为 submitted(同一行 id)。

**Architecture:** 后端在 `Quiz` 表加 `fileKey/defaultName/defaultCategoryId` 三个字段,API 改为"按 fileKey 复用 + 按 (userId, quizId) 单 draft";前端用 `SubtleCrypto` 算 SHA-256,上传时携带,答题页加载时自动恢复 draft 并跳过重复对话框。

**Tech Stack:** Next.js 16.2.6 (App Router) + Prisma 5 + MySQL + React 19 + Tailwind 4 + `crypto.subtle` (浏览器 SHA-256)

**文件结构总览**:

| 文件 | 类型 | 职责 |
|------|------|------|
| `prisma/schema.prisma` | 改 | +3 字段 + 1 复合 unique + 1 index |
| `src/lib/hash.ts` | 新增 | `sha256Hex(text)` SHA-256 hex 摘要 |
| `src/app/api/quizzes/route.ts` | 改 | POST:同 fileKey 复用 Quiz |
| `src/app/api/results/route.ts` | 改 | POST:submitted 路径升级 draft + 回写默认字段 |
| `src/components/UploadForm.tsx` | 改 | 算 fileKey + 处理 existed 分支 + 选择层 |
| `src/components/Sidebar.tsx` | 改 | 侧边栏上传路径同 UploadForm |
| `src/app/quiz/[id]/page.tsx` | 改 | 加载 draft + 跳过对话框 + 回传 defaultName/categoryId |

---

## Task 1: 数据库 schema 变更

**Files:**
- Modify: `prisma/schema.prisma:31-42`

- [ ] **Step 1: 编辑 schema,给 Quiz 模型加 3 个字段 + 复合 unique + 索引**

在 `prisma/schema.prisma` 的 `model Quiz` 块内,`createdAt DateTime @default(now())` 之后、闭合 `}` 之前,新增 3 行字段;在 `}` 之后,加 1 行 `@@unique` 和 1 行 `@@index`。

修改后 `Quiz` 模型完整结构(从 `model Quiz {` 到闭合括号):

```prisma
model Quiz {
  id         String       @id @default(cuid())
  title      String
  questions  String       @db.Text
  userId     String
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  isOfficial Boolean      @default(false)
  /// 答题时长（分钟），0 = 不限时
  timeLimit  Int          @default(0)
  results    QuizResult[]
  createdAt  DateTime     @default(now())

  /// 文件内容 SHA-256 指纹(hex)。null = 旧数据(无指纹,不参与去重)
  fileKey           String?
  /// 用户首次保存时设定的记录名(后续可改,作为暂存/提交默认值)
  defaultName       String?
  /// 默认归档分类 id(对应 CategoryContext localStorage 里的 Category.id)
  defaultCategoryId String?

  @@unique([userId, fileKey])
  @@index([userId, fileKey])
}
```

- [ ] **Step 2: 生成并应用 prisma migration**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx prisma migrate dev --name add_quiz_filekey
```

预期:`✔ Generated Prisma Client` + 提示执行了 `ALTER TABLE`。数据库中 `Quiz` 表出现 `fileKey` / `defaultName` / `defaultCategoryId` 三列,以及联合唯一索引。

- [ ] **Step 3: 验证 prisma client 重新生成**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx prisma generate
```

预期:无 error 输出。

---

## Task 2: SHA-256 helper

**Files:**
- Create: `src/lib/hash.ts`

- [ ] **Step 1: 创建 `src/lib/hash.ts`**

```ts
/**
 * 计算文本的 SHA-256 十六进制摘要。
 * - 浏览器优先使用 SubtleCrypto(更快)
 * - 服务端/老浏览器降级到 Node crypto
 *
 * 用于"按文件内容生成 fileKey",实现 Quiz 去重。
 */
export async function sha256Hex(text: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const buf = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest('SHA-256', buf);
    return bytesToHex(new Uint8Array(digest));
  }
  // 服务端/降级:动态 require,避免浏览器打包时拉 Node crypto
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = await import('crypto');
  return nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}
```

- [ ] **Step 2: TypeScript 编译验证**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx tsc --noEmit
```

预期:无 error 输出(可能有一些与本次改动无关的既有告警,可忽略)。

---

## Task 3: API — POST /api/quizzes 复用 fileKey

**Files:**
- Modify: `src/app/api/quizzes/route.ts:46-79`

- [ ] **Step 1: 重写 POST 函数**

把 `src/app/api/quizzes/route.ts` 中 `export async function POST(request: Request) { ... }` 整段替换为:

```ts
export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    await updateUserActiveTime(payload.userId);

    const { title, questions, fileKey } = await request.json();

    if (!title || !questions) {
      return NextResponse.json({ error: '标题和题目不能为空' }, { status: 400 });
    }

    // 有 fileKey → 先查是否已有同 (userId, fileKey) 的 Quiz
    if (fileKey && typeof fileKey === 'string') {
      const existing = await prisma.quiz.findFirst({
        where: { userId: payload.userId, fileKey },
      });
      if (existing) {
        // 探测现有 draft / submitted 状态(供前端选择层用)
        const [draft, submitted] = await Promise.all([
          prisma.quizResult.findFirst({
            where: { userId: payload.userId, quizId: existing.id, status: 'draft' },
            select: { id: true },
          }),
          prisma.quizResult.count({
            where: { userId: payload.userId, quizId: existing.id, status: 'submitted' },
          }),
        ]);
        return NextResponse.json({
          quiz: existing,
          existed: true,
          hasDraft: !!draft,
          draftId: draft?.id ?? null,
          hasSubmitted: submitted > 0,
        });
      }
    }

    // 走 create 路径(fileKey 可选存)
    const quiz = await prisma.quiz.create({
      data: {
        title,
        questions: JSON.stringify(questions),
        userId: payload.userId,
        fileKey: fileKey && typeof fileKey === 'string' ? fileKey : null,
      },
    });

    return NextResponse.json({ quiz, existed: false });
  } catch (error) {
    console.error('创建题目错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: TypeScript 验证**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx tsc --noEmit
```

预期:无 error。

---

## Task 4: API — POST /api/results 升级 draft + 回写默认字段

**Files:**
- Modify: `src/app/api/results/route.ts:71-141`

- [ ] **Step 1: 替换 POST 函数**

把 `export async function POST(request: Request) { ... }` 整段(从 `try {` 到 `catch` 的闭合)替换为:

```ts
export async function POST(request: Request) {
  try {
    const token = getTokenFromHeaders(request);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const payload = resolveAuthPayload(token);
    if (!payload) {
      return NextResponse.json({ error: '无效的token' }, { status: 401 });
    }

    const {
      quizId,
      name,
      score,
      totalScore,
      results: answerResults,
      status,
      defaultName,
      defaultCategoryId,
    } = await request.json();

    if (!quizId || score === undefined || !answerResults) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 把返回结果中的 results 字符串解析为对象数组
    const safeResult = (r: any) => {
      let arr: any[] = [];
      try {
        arr = JSON.parse(r.results || '[]');
      } catch {
        arr = [];
      }
      return { ...r, results: arr };
    };

    // 探测当前 (user, quiz) 下的 draft
    const existingDraft = await prisma.quizResult.findFirst({
      where: {
        userId: payload.userId,
        quizId,
        status: 'draft',
      },
    });

    let result: any;

    if (status === 'submitted' && existingDraft) {
      // 草稿 → 完成:升级同一行
      result = await prisma.quizResult.update({
        where: { id: existingDraft.id },
        data: {
          name: name || existingDraft.name,
          score,
          totalScore,
          results: JSON.stringify(answerResults),
          status: 'submitted',
          submittedAt: new Date(),
        },
      });
    } else if (status === 'draft' && existingDraft) {
      // 暂存:更新现有 draft
      result = await prisma.quizResult.update({
        where: { id: existingDraft.id },
        data: {
          name: name || existingDraft.name,
          score,
          totalScore,
          results: JSON.stringify(answerResults),
        },
      });
    } else {
      // 全新创建(无 draft,或首次 submitted)
      result = await prisma.quizResult.create({
        data: {
          quizId,
          userId: payload.userId,
          name: name || '未命名',
          score,
          totalScore,
          results: JSON.stringify(answerResults),
          status: status || 'submitted',
        },
      });
    }

    // 回写默认 name / category 到 Quiz(undefined/null/"" 跳过,保留旧值)
    const quizUpdate: Record<string, string> = {};
    if (typeof defaultName === 'string' && defaultName.trim().length > 0) {
      quizUpdate.defaultName = defaultName.trim();
    }
    if (typeof defaultCategoryId === 'string' && defaultCategoryId.length > 0) {
      quizUpdate.defaultCategoryId = defaultCategoryId;
    }
    if (Object.keys(quizUpdate).length > 0) {
      await prisma.quiz.update({
        where: { id: quizId },
        data: quizUpdate,
      });
    }

    return NextResponse.json({ result: safeResult(result) });
  } catch (error) {
    console.error('创建结果错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: TypeScript 验证**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx tsc --noEmit
```

预期:无 error。

---

## Task 5: 前端 — UploadForm 算 fileKey + 选择层

**Files:**
- Modify: `src/components/UploadForm.tsx:1-7`(import)、`92-143`(handleParse)
- Create: inline 弹层 state(在现有组件内)

- [ ] **Step 1: 在 import 区域加入 `sha256Hex`**

在 `src/components/UploadForm.tsx` 第 6 行后插入:

```ts
import { sha256Hex } from '@/lib/hash';
```

- [ ] **Step 2: 在组件顶部、router 之后,新增选择层相关 state**

在 `const router = useRouter();` 这一行(原代码第 50 行)后,新增:

```tsx
  // 选择层状态
  const [reuploadChoice, setReuploadChoice] = useState<{
    quizId: string;
    draftId: string | null;
    hasSubmitted: boolean;
  } | null>(null);
  // 重置 progress 用
  const progressKey = (quizId: string) => `quiz_progress_${quizId}`;
```

- [ ] **Step 3: 重写 `handleParse` 集成 fileKey + existed 分支**

把 `const handleParse = async () => { ... }`(原代码 92-143 行)整段替换为:

```tsx
  const handleParse = async () => {
    if (!preview.trim()) {
      setError('请先选择文件或粘贴内容');
      return;
    }

    if (!token) {
      setError('请先登录');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const questions = parseMarkdown(preview);
      if (questions.length === 0) {
        setError('未能解析到任何题目，请检查文件格式是否正确');
        setIsLoading(false);
        return;
      }

      const title = extractTitle(preview);
      const fileKey = await sha256Hex(preview);

      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title, questions, fileKey }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '创建题目失败');
        setIsLoading(false);
        return;
      }

      // 同 fileKey 已存在 → 弹选择层
      if (data.existed) {
        setIsLoading(false);
        setReuploadChoice({
          quizId: data.quiz.id,
          draftId: data.draftId ?? null,
          hasSubmitted: !!data.hasSubmitted,
        });
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
      if (onCreated) {
        onCreated(data.quiz.id);
      } else {
        router.push(`/quiz/${data.quiz.id}`);
      }
    } catch (err) {
      console.error('Parse error:', err);
      setError('解析失败：' + (err as Error).message);
      setIsLoading(false);
    }
  };
```

- [ ] **Step 4: 在组件 JSX 末尾、return 之前,新增选择层处理函数**

在 `const handleClear = () => { ... };` 之后(约 167 行后),插入:

```tsx
  const handleReuploadContinue = () => {
    if (!reuploadChoice) return;
    const id = reuploadChoice.quizId;
    setReuploadChoice(null);
    if (onCreated) onCreated(id);
    else router.push(`/quiz/${id}`);
  };

  const handleReuploadRestart = async () => {
    if (!reuploadChoice || !token) return;
    const { quizId, draftId } = reuploadChoice;
    // 删 draft(若有)
    if (draftId) {
      try {
        await fetch(`/api/results?id=${draftId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.error('删除 draft 失败:', e);
      }
    }
    // 清本地 progress
    try { localStorage.removeItem(progressKey(quizId)); } catch {}
    setReuploadChoice(null);
    if (onCreated) onCreated(quizId);
    else router.push(`/quiz/${quizId}`);
  };

  const handleReuploadViewSubmitted = () => {
    if (!reuploadChoice) return;
    const id = reuploadChoice.quizId;
    setReuploadChoice(null);
    // 跳到首页 + 触发侧边栏点击(简化为直接 push 到首页,通过侧边栏查看)
    router.push(`/?focus=${id}`);
  };
```

- [ ] **Step 5: 在 JSX `return` 体内、关闭根 `<div>` 之前,渲染选择层弹窗**

定位到 `UploadForm` 组件的 `return (...)` 语句,在最外层 `<div className="w-full h-screen ...">` 内部、所有内容之后、闭合 `</div>` 之前,新增:

```tsx
      {reuploadChoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }}
          onClick={() => setReuploadChoice(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[18px] font-semibold text-slate-800 mb-2">检测到已存在的题库</h4>
            <p className="text-[13px] text-slate-500 mb-5">
              {reuploadChoice.draftId
                ? '这份文件之前有未提交的进度。'
                : '这份文件已经有完成记录。'}
            </p>
            <div className="space-y-2.5">
              {reuploadChoice.draftId && (
                <button
                  onClick={handleReuploadContinue}
                  className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all"
                >
                  继续上次进度
                </button>
              )}
              {reuploadChoice.draftId && (
                <button
                  onClick={handleReuploadRestart}
                  className="w-full py-2.5 text-[13.5px] text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  重新开始(清空旧进度)
                </button>
              )}
              {reuploadChoice.hasSubmitted && !reuploadChoice.draftId && (
                <button
                  onClick={handleReuploadViewSubmitted}
                  className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all"
                >
                  查看已有完成记录
                </button>
              )}
              {!reuploadChoice.draftId && !reuploadChoice.hasSubmitted && (
                <button
                  onClick={handleReuploadContinue}
                  className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all"
                >
                  进入答题
                </button>
              )}
              <button
                onClick={() => setReuploadChoice(null)}
                className="w-full py-2.5 text-[13px] text-slate-500 hover:text-slate-700 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: TypeScript 验证**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx tsc --noEmit
```

预期:无 error。

---

## Task 6: 前端 — Sidebar 侧边栏上传同 UploadForm 逻辑

**Files:**
- Modify: `src/components/Sidebar.tsx:103-147`(handleSidebarFileChange)

- [ ] **Step 1: 引入 sha256Hex + 选择层 state + 弹窗**

在 `Sidebar.tsx` 第 22 行(`import {` 区块内)新增 import:

```ts
import { sha256Hex } from '@/lib/hash';
```

- [ ] **Step 2: 在组件 state 区域(在 `setUploadError` 之后)新增选择层 state**

找到 `const [uploadError, setUploadError] = useState<string | null>(null);`,在它之后新增:

```tsx
  const [reuploadChoice, setReuploadChoice] = useState<{
    quizId: string;
    draftId: string | null;
    hasSubmitted: boolean;
  } | null>(null);
```

- [ ] **Step 3: 替换 `handleSidebarFileChange`**

把 `const handleSidebarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { ... }`(原 103-147 行)整段替换为:

```tsx
  const handleSidebarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!token) {
      alert('请先登录');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const text = await file.text();
      const { parseMarkdown, extractTitle } = await import('@/lib/parser');
      const questions = parseMarkdown(text);
      if (questions.length === 0) {
        setUploadError('未能解析到任何题目，请检查文件格式');
        setUploading(false);
        return;
      }
      const title = extractTitle(text);
      const fileKey = await sha256Hex(text);
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title, questions, fileKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || '创建失败');
        setUploading(false);
        return;
      }
      // 同 fileKey 已存在 → 弹选择层
      if (data.existed) {
        setUploading(false);
        setReuploadChoice({
          quizId: data.quiz.id,
          draftId: data.draftId ?? null,
          hasSubmitted: !!data.hasSubmitted,
        });
        return;
      }
      onClose();
      router.push(`/quiz/${data.quiz.id}`);
    } catch (err) {
      console.error('侧边栏上传失败:', err);
      setUploadError('解析失败：' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };
```

- [ ] **Step 4: 在组件函数体内、`handleBatchAssign` 之后新增选择层处理函数**

找到 `const handleBatchAssign = ...` 整段结束的 `};`,在它之后插入:

```tsx
  const handleReuploadContinue = () => {
    if (!reuploadChoice) return;
    const id = reuploadChoice.quizId;
    setReuploadChoice(null);
    onClose();
    router.push(`/quiz/${id}`);
  };

  const handleReuploadRestart = async () => {
    if (!reuploadChoice || !token) return;
    const { quizId, draftId } = reuploadChoice;
    if (draftId) {
      try {
        await fetch(`/api/results?id=${draftId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.error('删除 draft 失败:', e);
      }
    }
    try { localStorage.removeItem(`quiz_progress_${quizId}`); } catch {}
    setReuploadChoice(null);
    onClose();
    router.push(`/quiz/${quizId}`);
  };

  const handleReuploadViewSubmitted = () => {
    if (!reuploadChoice) return;
    const id = reuploadChoice.quizId;
    setReuploadChoice(null);
    onClose();
    router.push(`/?focus=${id}`);
  };
```

- [ ] **Step 5: 在 `Sidebar` JSX return 内、最后闭合标签之前,渲染选择层弹窗**

定位到 `return (` 后的最外层 `<>...</>` fragment,在 `</>` 之前新增:

```tsx
      {reuploadChoice && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }}
          onClick={() => setReuploadChoice(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[18px] font-semibold text-slate-800 mb-2">检测到已存在的题库</h4>
            <p className="text-[13px] text-slate-500 mb-5">
              {reuploadChoice.draftId
                ? '这份文件之前有未提交的进度。'
                : '这份文件已经有完成记录。'}
            </p>
            <div className="space-y-2.5">
              {reuploadChoice.draftId && (
                <button onClick={handleReuploadContinue} className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all">
                  继续上次进度
                </button>
              )}
              {reuploadChoice.draftId && (
                <button onClick={handleReuploadRestart} className="w-full py-2.5 text-[13.5px] text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                  重新开始(清空旧进度)
                </button>
              )}
              {reuploadChoice.hasSubmitted && !reuploadChoice.draftId && (
                <button onClick={handleReuploadViewSubmitted} className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all">
                  查看已有完成记录
                </button>
              )}
              {!reuploadChoice.draftId && !reuploadChoice.hasSubmitted && (
                <button onClick={handleReuploadContinue} className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all">
                  进入答题
                </button>
              )}
              <button onClick={() => setReuploadChoice(null)} className="w-full py-2.5 text-[13px] text-slate-500 hover:text-slate-700 transition-colors">
                取消
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: TypeScript 验证**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx tsc --noEmit
```

预期:无 error。

---

## Task 7: 前端 — quiz/[id]/page.tsx 加载 draft + 跳过对话框 + 回传默认值

**Files:**
- Modify: `src/app/quiz/[id]/page.tsx`(多处)

- [ ] **Step 1: 新增 useEffect 加载 draft / 恢复默认值**

找到第 78 行 `};` 结束的 `fetchQuiz` 函数后,在紧接着的 `// 答题进度自动保存` 注释**之前**,插入新的 useEffect:

```tsx
  // 加载现有结果(draft 优先 → submitted),恢复答案 / 名称 / 分类
  useEffect(() => {
    if (!quiz || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/results?quizId=${quiz.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const list: any[] = data.results || [];
        if (cancelled || list.length === 0) return;
        // 优先取 draft(没 draft 才取最新的 submitted,用于"重答已提交"场景)
        const draft = list.find((r) => r.status === 'draft');
        const latest = draft ?? list[0];
        // 还原 answers
        const restored: Record<string, string> = {};
        for (const item of latest.results || []) {
          if (item?.questionId && typeof item.userAnswer === 'string') {
            restored[item.questionId] = item.userAnswer;
          }
        }
        setAnswers(restored);
        // 名称:Quiz.defaultName 优先,否则用结果名
        if (quiz.defaultName) setQuizName(quiz.defaultName);
        else if (latest.name) setQuizName(latest.name);
        // 分类
        if (quiz.defaultCategoryId) setSelectedCategoryId(quiz.defaultCategoryId);
        // 记录结果名,供 doSubmit fallback 使用
        if (latest.name) setDraftName(latest.name);
      } catch (e) {
        console.error('加载 draft 失败:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [quiz, token]);
```

- [ ] **Step 2: 修改 `handleSaveDraft` 与 `handleSubmit`,有默认值时跳过对话框**

把 `const handleSaveDraft = () => { ... };` 替换为:

```tsx
  const handleSaveDraft = () => {
    if (!quiz) return;
    // 有名称 + 分类时跳过对话框(默认值或 draft 已恢复)
    if (quizName.trim() && selectedCategoryId) {
      confirmAction();
      return;
    }
    setDialogMode('draft');
    setShowNameDialog(true);
  };
```

把 `const handleSubmit = async () => { ... };` 替换为:

```tsx
  const handleSubmit = async () => {
    if (!quiz) return;
    if (quizName.trim() && selectedCategoryId) {
      // 跳过对话框,直接提交
      confirmAction();
      return;
    }
    setDialogMode('submit');
    setShowNameDialog(true);
  };
```

- [ ] **Step 3: 修改 `confirmAction`,POST body 增加 defaultName/defaultCategoryId**

把 `const confirmAction = async () => { ... };` 函数体中两处 `fetch('/api/results', { ... })` 的 body 替换:

**draft 分支的 body 改为**(找到 `status: 'draft',` 这一行后面,大约 227 行):

```tsx
          body: JSON.stringify({
            quizId: quiz.id,
            name:
              quizName.trim() ||
              draftName ||
              `${quiz.title}_${new Date().toLocaleDateString('zh-CN')}`,
            score: gradedResult.score,
            totalScore: gradedResult.totalScore,
            results: gradedResult.results,
            status: 'draft',
            defaultName: quizName.trim() || undefined,
            defaultCategoryId: selectedCategoryId || undefined,
          }),
```

**doSubmit 内部 fetch 的 body 改为**(找到 `status: 'submitted',` 这一行后,大约 165 行):

```tsx
        body: JSON.stringify({
          quizId: quiz.id,
          name:
            quizName.trim() ||
            draftName ||
            `${quiz.title}_${new Date().toLocaleDateString('zh-CN')}`,
          score: gradedResult.score,
          totalScore: gradedResult.totalScore,
          results: gradedResult.results,
          status: 'submitted',
          defaultName: quizName.trim() || undefined,
          defaultCategoryId: selectedCategoryId || undefined,
        }),
```

- [ ] **Step 4: TypeScript 验证**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx tsc --noEmit
```

预期:无 error。

---

## Task 8: 集成联调 — 跑通 prisma + 验证路由

- [ ] **Step 1: 重新生成 prisma client(确保 API 用的字段就绪)**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx prisma generate
```

预期:无 error。

- [ ] **Step 2: 检查项目能否启动(next dev 仅做语法 sanity)**

```bash
cd "e:/WorkSpace/Project/HomeWork-AI" && npx next build --no-lint 2>&1 | tail -30
```

预期:build 成功或仅有非本次相关的告警(若有 prisma client 类型问题,见下方排错)。

> 排错:
> - 若 prisma client 报 `Property 'fileKey' does not exist` → 跑 `npx prisma generate` 再 build
> - 若报 `Module not found: @/lib/hash` → 确认 `src/lib/hash.ts` 文件已存在

---

## Task 9: 验收清单(手工 / 用户主导)

由用户主导,逐项确认:

- [ ] 上传新 md 文件 → 创建新 Quiz,正常进入答题页
- [ ] 上传同一份 md 第二次(无 draft / submitted)→ 静默跳转,无对话框
- [ ] 上传同一份 md 第三次(中间已暂存过)→ 弹出三选一(继续/重新开始/查看)
- [ ] 选"继续"→ 答题页 answers / 名称 / 分类都自动恢复
- [ ] 答题中点"暂存进度" → 直接保存(无对话框)
- [ ] 答题中点"提交答案" → 直接保存(无对话框),草稿升级为已提交
- [ ] 侧边栏"最近"分类出现该记录;"草稿"分类不再有它
- [ ] 改名字 / 改分类后再保存 → 后续操作自动用新值
- [ ] 旧数据(无 fileKey)依然能正常上传/答题,不受影响
- [ ] TypeScript 编译全程 0 错

---

## 自审小结

- Spec coverage:Task 1-2 = 数据模型,Task 3-4 = 后端 API,Task 5-6 = 前端上传侧,Task 7 = 前端答题页,Task 8 = 集成,Task 9 = 验收 — 完整覆盖 spec 全部 12 节
- 无 TODO / 占位符
- 类型一致:`sha256Hex`、`fileKey`、`defaultName`、`defaultCategoryId`、API 字段名 `existed/hasDraft/hasSubmitted/draftId` 在前后端和任务间完全一致
