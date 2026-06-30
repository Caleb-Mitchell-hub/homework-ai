# AI 题目解析 + 多文档上传 设计

**日期**: 2026-06-30
**项目**: HomeWork-AI (Next.js 16 + Prisma 5 + MySQL)
**状态**: 设计稿,等待用户审阅

---

## 1. 目标与背景

### 1.1 痛点

1. **代码题识别不出来** — `src/lib/parser.ts` 是手写正则/启发式解析器,代码题路径极其脆弱:只在"答案区"解析、用 `### ... 参考答案` 触发、多语言代码会丢失、没有 I/O 示例、没有测试用例。
2. **仅支持 .md / .txt** — 没有真实文件上传链路,无法处理 PDF / Word / 图片等教师常用素材。
3. **没有 AI 配置能力** — 数据库里没有 AI 配置表,没有任何 AI SDK。

### 1.2 目标

为题目解析流程引入 **可配置的 AI 解析**,并把支持的文件格式扩展到 **Markdown / TXT / PDF / Word / 图片**。具体:

- 管理员可在后台配置多家 AI 厂商(DeepSeek / 豆包 / 通义千问 / 智谱 / 自定义),保存 API Key 并切换"激活厂商"。
- 用户上传文件后,**本地解析 + AI 解析并行运行**,前端双 tab 切换预览。
- AI 解析永远不阻塞本地结果;本地解析永远作为兜底。
- 代码题解析质量大幅提升(`code` / `language` / `inputExample` / `outputExample` 字段都被填充)。

### 1.3 不在本期范围(留 TODO)

- PDF 扫版图片 OCR(纯文本 PDF 可处理,扫版需另引 OCR 引擎)
- 长文档分块 + 多轮 AI 拼接(> 60k 字符)
- AI 调用按用户配额 / 成本统计
- 流式输出(SSE)
- 代码题自动评测(题目 schema 加 `testCases` 字段是另一大改动)

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  ① 数据库层:新增 AIProviderConfig 表(管理员配置)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ② AI 服务层 src/lib/ai/                                      │
│     crypto.ts    AES-256-GCM 加解密 API Key                   │
│     providers.ts OpenAI 兼容协议 fetch 适配器(适配所有厂商)    │
│     prompt.ts    题目解析系统提示词                            │
│     parser.ts    text + provider → Question[] 编排            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ③ 文档抽取层 src/lib/extract/                                │
│     pdf.ts  pdf-parse                                          │
│     docx.ts mammoth.js                                         │
│     image.ts 多模态视觉模型调用                                │
│     index.ts 按 MIME 分派                                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ④ API 路由(新增)                                              │
│     /api/admin/ai/providers         GET  POST                  │
│     /api/admin/ai/providers/[id]    PUT  DELETE                │
│     /api/admin/ai/providers/[id]/test POST                    │
│     /api/admin/ai/active            PATCH                     │
│     /api/ai/parse                   POST (用户侧解析)          │
│     /api/upload                     POST (文件上传 + 抽文本)  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  ⑤ UI 改动                                                    │
│     /admin/ai/page.tsx             AI 厂商配置页               │
│     components/AdminSidebar        新增「AI 配置」导航项       │
│     components/UploadForm          双预览切换                  │
│     components/admin/QuizUploadPanel 双预览切换               │
└─────────────────────────────────────────────────────────────┘
```

**为什么用 OpenAI 兼容协议?** DeepSeek、字节方舟 Ark、阿里百炼 compatible-mode、智谱 BigModel 都支持 OpenAI Chat Completions 协议 → 一个 `fetch` 调用跑遍所有厂商,**不引入任何 AI SDK**,包体最小。

---

## 3. 数据模型

`prisma/schema.prisma` 新增 `AIProviderConfig` 模型:

```prisma
model AIProviderConfig {
  id              String   @id @default(cuid())
  name            String                      // 友好名: "DeepSeek 主用"
  provider        String                      // "deepseek" | "doubao" | "qwen" | "zhipu" | "custom"
  baseURL         String                      // OpenAI 兼容 baseURL
  apiKeyCipher    String                      // 加密后的 API key (AES-256-GCM)
  model           String                      // 主对话模型
  visionModel     String?                     // 视觉模型(可选,允许为空)
  supportsVision  Boolean  @default(false)    // 是否启用图片识别
  isActive        Boolean  @default(false)    // 当前激活厂商(全局唯一,事务切换)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([isActive])
}
```

### 关键约束

- **API key 加密存储**:AES-256-GCM,密钥从环境变量 `AI_KEY_ENCRYPTION_SECRET` 读取(必须 ≥ 32 字符);服务启动时校验密钥长度。
- **`isActive` 切换原子化**:`PATCH /api/admin/ai/active` 通过 Prisma `$transaction` 保证全局只有一个 `isActive=true`。
- **`visionModel` 与 `model` 分离**:豆包/Qwen/智谱的对话模型和视觉模型往往是不同的(如 `doubao-1-5-pro-32k-250115` vs `doubao-1-5-vision-pro-250315`)。
- **预置厂商模板**:新增厂商表单 dropdown 选厂商后,自动填入 `baseURL` 和 `model` 推荐值,管理员只需填 API Key。

### 预置厂商 baseURL + model

| 厂商 | baseURL | model 推荐 | visionModel 推荐 |
|------|---------|------------|------------------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | — |
| 豆包 | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-1-5-pro-32k-250115` | `doubao-1-5-vision-pro-250315` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | `qwen-vl-plus` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-plus` | `glm-4v-plus` |
| 自定义 | 空 | 空 | 空 |

---

## 4. AI 服务层 (`src/lib/ai/`)

### 4.1 `crypto.ts` — API key 加解密

```ts
import crypto from 'crypto';
const SECRET = process.env.AI_KEY_ENCRYPTION_SECRET!;
if (!SECRET || SECRET.length < 32) throw new Error('AI_KEY_ENCRYPTION_SECRET 必须 ≥ 32 字符');

export function encryptApiKey(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(SECRET.padEnd(32).slice(0, 32)), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
export function decryptApiKey(cipherText: string): string { /* 反向 */ }
```

### 4.2 `providers.ts` — 通用适配器

```ts
export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

export async function callChat(opts: {
  baseURL: string;
  apiKey: string;
  model: string;
  messages: AIChatMessage[];
  jsonMode?: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const res = await fetch(`${opts.baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
      temperature: 0.2,
      max_tokens: 8000,
    }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AI ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
```

### 4.3 `prompt.ts` — 系统提示词(决定解析质量的核心)

```ts
export const QUESTION_PARSE_PROMPT = `你是题目解析专家。给定一段文本(可能来自 Markdown / PDF / Word / 图片 OCR),
请提取所有题目并以严格 JSON 数组返回(不要任何解释文本、不要 markdown 围栏)。

每道题的 schema:
{
  "type": "single" | "multiple" | "boolean" | "fill" | "essay" | "code",
  "title": "题干(保留 Markdown 行内格式)",
  // 选择题必填:
  "options": [{ "key": "A", "text": "选项内容" }, ...],
  // 答案必填(不同题型字段名不同):
  "correctAnswer": "A" | ["A","B"] | "true" | "false" | "填空答案",
  "answer": "解析过程",
  // 代码题专用:
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

### 4.4 `parser.ts` — 编排入口

```ts
export async function aiParseQuestions(opts: {
  text: string;
  provider: AIProviderConfig;
  signal?: AbortSignal;
}): Promise<Question[]> {
  const apiKey = decryptApiKey(opts.provider.apiKeyCipher);
  const content = await callChat({
    baseURL: opts.provider.baseURL,
    apiKey,
    model: opts.provider.model,
    messages: [
      { role: 'system', content: QUESTION_PARSE_PROMPT },
      { role: 'user', content: opts.text.slice(0, 60000) },  // 截断防爆
    ],
    jsonMode: true,
    signal: opts.signal,
  });
  const json = stripCodeFence(content);                 // 容错:去掉可能的 ```json 围栏
  const arr = JSON.parse(json);                          // 解析失败时由上层重试
  return normalizeAIOutputToQuestions(arr);              // 把 AI 宽松字段映射到 Question 严格类型
}
```

`normalizeAIOutputToQuestions` 把 AI 返回的 `correctAnswer: "A"` 映射到 `Question.single.correctAnswer`,把 `["A","B"]` 映射到 `Question.multiple.correctAnswer`,依此类推;为缺字段补默认(空字符串、空数组)。

---

## 5. 文档抽取层 (`src/lib/extract/`)

### 5.1 `pdf.ts`

```ts
import pdfParse from 'pdf-parse';
export async function extractPdf(buffer: Buffer): Promise<string> {
  const { text } = await pdfParse(buffer);
  return text;
}
```

### 5.2 `docx.ts`

```ts
import mammoth from 'mammoth';
export async function extractDocx(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}
```

### 5.3 `image.ts` — 多模态识别

```ts
export async function extractImage(opts: {
  buffer: Buffer; mime: string; provider: AIProviderConfig;
}): Promise<string> {
  if (!opts.provider.supportsVision || !opts.provider.visionModel) {
    throw new Error('当前激活厂商不支持视觉识别');
  }
  const apiKey = decryptApiKey(opts.provider.apiKeyCipher);
  const dataUrl = `data:${opts.mime};base64,${opts.buffer.toString('base64')}`;
  return await callChat({
    baseURL: opts.provider.baseURL,
    apiKey,
    model: opts.provider.visionModel!,
    messages: [
      { role: 'system', content: '你是 OCR + 题目解析专家,提取图中所有文字并尽量识别为结构化题目' },
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: '请提取图中所有题目文字' },
      ]},
    ],
  });
}
```

### 5.4 `index.ts` — 分派

```ts
export async function extractText(opts: {
  buffer: Buffer; mime: string; filename?: string; provider?: AIProviderConfig;
}): Promise<string> {
  const ext = (opts.filename ?? '').toLowerCase().split('.').pop();
  if (ext === 'pdf' || opts.mime === 'application/pdf') return extractPdf(opts.buffer);
  if (ext === 'docx' || opts.mime.includes('wordprocessing')) return extractDocx(opts.buffer);
  if (/^image\//.test(opts.mime)) {
    if (!opts.provider) throw new Error('图片识别需要 AI 厂商');
    return extractImage({ buffer: opts.buffer, mime: opts.mime, provider: opts.provider });
  }
  // md/txt fallback: 直接 utf8
  return opts.buffer.toString('utf8');
}
```

**注意**:不识别 PDF 内的图片(扫版 PDF);只识别内嵌文本。

---

## 6. API 路由

### 6.1 端点清单

| 路径 | 方法 | 鉴权 | 用途 |
|------|------|------|------|
| `/api/admin/ai/providers` | `GET` `POST` | admin | 列出 / 新增厂商配置 |
| `/api/admin/ai/providers/[id]` | `PUT` `DELETE` | admin | 修改 / 删除 |
| `/api/admin/ai/providers/[id]/test` | `POST` | admin | 测试连接(发最小请求) |
| `/api/admin/ai/active` | `PATCH` | admin | 切换激活厂商(事务原子) |
| `/api/ai/parse` | `POST` | user/admin | 用户侧解析入口 |
| `/api/upload` | `POST` | user/admin | multipart 文件上传 + 抽文本 |

### 6.2 `POST /api/upload` 流程

```
1. 鉴权 → verifyToken / verifyAdminToken
2. 解析 multipart (Next.js 16 内置 formData())
3. 大小校验: ≤ 10MB,否则 413
4. mime/扩展名校验:白名单 {md,txt,pdf,docx,png,jpg,jpeg,webp}
5. 图片路径 → 拉取 active provider,无 vision provider → 415
6. 抽文本: extractText(buffer, mime, filename, provider)
7. 返回 { text, fileName, mime, size }
```

**注意**:`/api/upload` **不**在这里跑 AI 解析,只返回抽出的文本。理由:
- 文本抽取 < 2s,AI 解析可能 10-30s
- 前端拿到文本后可以**先调本地 parser 看效果**,再决定是否调 AI
- 失败可以单独重试 AI 而不需要重传文件

### 6.3 `POST /api/ai/parse` 流程

请求体:
```json
{ "text": "...", "providerId": "可选,默认 active" }
```

```
1. 鉴权
2. 查 provider(默认 isActive=true;若指定 providerId 则用指定的)
   - 无 active → 503 "未配置 AI 厂商"
3. 调用 aiParseQuestions({ text, provider })
4. 文本超 60k 字符 → 截断并返回 warning
5. 解析失败(LLM 返回非 JSON) → 重试一次,再失败则 502
6. 成功 → 返回 { questions: Question[], warning?: string }
```

### 6.4 Admin 厂商配置 API

**`POST /api/admin/ai/providers`** 请求:
```json
{
  "name": "DeepSeek 主用",
  "provider": "deepseek",
  "baseURL": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "apiKey": "sk-xxx",
  "visionModel": null,
  "supportsVision": false,
  "isActive": true
}
```
→ 服务端加密 `apiKey` → 存 `apiKeyCipher`;响应**不返回**解密后的 key,仅 `apiKeyLast4`(末 4 位)用于 UI 展示。

**`POST /api/admin/ai/providers/[id]/test`**
→ 发 `[{role:'user', content:'ping'}]`,期望 < 5s;返回 `{ ok, latencyMs, model }`。

**`PATCH /api/admin/ai/active`** 请求 `{ providerId }` → `$transaction`:
1. `UPDATE AIProviderConfig SET isActive=false`
2. `UPDATE AIProviderConfig SET isActive=true WHERE id=?`

### 6.5 客户端调用顺序

```
用户上传文件
   ↓
FileReader (.md/.txt) | 或 multipart POST /api/upload (PDF/Word/图片)
   ↓
UploadForm.onFile() 拿到 text
   ↓
┌──────────────────────────┬──────────────────────────┐
│ 本地 parser.parseMarkdown(text) │ fetch /api/ai/parse(text)  │
│        ↓                    │       ↓                  │
│  questionsLocal            │  questionsAI             │
└──────────────────────────┴──────────────────────────┘
   ↓
前端拿到 [本地结果, AI结果] 两个 Question[]
   ↓
双 tab 切换预览
   ↓
用户选一份 → 编辑 → 点"保存题库"
   ↓
走原有 POST /api/quizzes (零修改)
```

**关键决策**:
- 本地解析仍然走客户端(零延迟)
- AI 解析走服务端(避免暴露 API Key 给浏览器)
- 文件二进制上传走服务端(md/txt 仍可走 FileReader,但 PDF/Word/图片必须服务端抽)
- 保存路径完全不动

---

## 7. UI 改动

### 7.1 后台 AI 配置页 `/admin/ai`

**侧栏** `AdminSidebar.tsx` 新增一项 `🧠 AI 配置 → /admin/ai`

**页面布局**:
```
┌─ 标题 ──────────────────────────────────────────┐
│  AI 厂商配置                                    │
│  管理系统用于题目解析的 AI 厂商与 API 凭据        │
└────────────────────────────────────────────────┘
┌─ 列表区 ─────────────────────────────────────────┐
│  ┌──────────────────────────────────────────┐  │
│  │ 🟢 DeepSeek 主用            [激活中]      │  │
│  │ deepseek-chat · api.deepseek.com/v1      │  │
│  │ 视觉: ✗  创建于 2026-06-30              │  │
│  │ [测试连接] [取消激活] [编辑] [删除]       │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │ ⚪ 豆包备用                  [未激活]    │  │
│  │ doubao-1-5-pro-32k · ark.cn-beijing...   │  │
│  │ 视觉: ✓ doubao-1-5-vision-pro            │  │
│  │ [测试连接] [设为激活] [编辑] [删除]       │  │
│  └──────────────────────────────────────────┘  │
│  [+ 新增厂商]                                   │
└────────────────────────────────────────────────┘
```

**新增厂商弹窗字段**:

| 字段 | 控件 | 备注 |
|------|------|------|
| 厂商 | dropdown | DeepSeek / 豆包 / 通义千问 / 智谱 / 自定义 |
| 名称 | input | 友好名,自由填写 |
| Base URL | input | dropdown 选厂商时自动填充(可手动改) |
| 模型 | input | 同上自动填充 |
| API Key | password | 写时加密存 `apiKeyCipher`,回显时只显示末 4 位 |
| 视觉模型 | input | 选"启用视觉"才出现 |
| 启用视觉 | checkbox | 决定图片 OCR 是否走这家 |
| 设为激活 | checkbox | 新增时若勾选,事务切换 |

**测试连接** → POST `/api/admin/ai/providers/[id]/test` → 发最小请求验证;返回 `{ ok, latencyMs }`,成功时按钮变绿 3s。

### 7.2 双预览面板(`UploadForm` + `QuizUploadPanel` 改造)

**当前**:上传 → 调本地 parser → 单预览 → 保存

**改造后**:上传 → 抽文本 → **并行**跑本地 + AI → **双 tab 切换预览**

```
┌────────────────────────────────────────────────────────┐
│  📁 exam.pdf · 124KB · 27s 前                          │
│                                                        │
│  ┌─ 本地解析 ──────┐  ┌─ AI 解析 ──────────────┐      │
│  │ ✓ 8 道题        │  │ ⏳ 解析中… 12s         │      │  ← 失败时显示 ⚠
│  └─────────────────┘  └────────────────────────┘      │
│                                                        │
│  ┌─ 题库标题 ─────────────────────────────────────┐  │
│  │ [期中考试复习题]                                │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  预览的题目来自:  [● 本地]  [○ AI]   (segment)         │
│                                                        │
│  ┌─ 题目 1 ─────────────────────────────────────┐    │
│  │ 1. 下列关于 HTTP 协议的说法正确的是?          │    │
│  │ A. ...                                        │    │
│  │ ...                                           │    │
│  │ [编辑] [删除]                                 │    │
│  └──────────────────────────────────────────────┘    │
│  ┌─ 题目 2 ─────────────────────────────────────┐    │
│  │ 2. 写一个 Python 函数实现...                  │    │
│  │ 代码: ...                                     │    │
│  │ 输入示例: 1 2 3  [输出示例: 6]                │    │
│  └──────────────────────────────────────────────┘    │
│                                                        │
│        [保存题库]      [暂存并继续编辑]                │
└────────────────────────────────────────────────────────┘
```

**关键交互**:
- segment 单选切本地/AI 结果
- AI 解析中显示 spinner + 已耗时(每秒更新)
- AI 失败时 segment 红色标签 "AI 解析失败: <原因>",用户仍可选本地结果
- 题目编辑/删除沿用现有逻辑
- "保存题库" / "暂存" 路径完全不变

---

## 8. 失败兜底矩阵

| 场景 | 表现 | 处理 |
|------|------|------|
| 上传 .exe 等非法格式 | 拖入时高亮红框 | toast: "不支持的文件类型" |
| 文件 > 10MB | 拖入时拒绝 | toast: "文件超过 10MB 限制" |
| 用户未配置 active AI | 进入上传页 | 顶部黄色 banner: "未配置 AI 厂商,仅可使用本地解析" |
| 上传图片 + active 无视觉 | 上传图片时 | toast: "当前厂商不支持图片识别,请在 AI 配置启用视觉模型" |
| AI 调用 401/403 | 双预览区 | "AI 解析失败: API key 无效",仅本地可保存 |
| AI 调用 429 | 双预览区 | "AI 解析失败: 限流,请稍后重试" + [重试] 按钮 |
| AI 调用超时 (>60s) | 双预览区 | "AI 解析超时" + [重试] |
| AI 返回非 JSON | 内部已重试一次 | 仍失败 → "AI 返回格式异常" + [重试] |
| pdf-parse / mammoth 抛错 | 上传后 | toast: "文档解析失败: <错误>",回到拖入状态 |
| 网络断 | 同上 | toast + [重试] |

**核心原则:AI 解析永不阻塞本地结果;本地解析永远作为兜底可用。**

---

## 9. 测试策略

### 9.1 端到端验证(fixtures)

| # | fixture 文件 | 大小 | 题型覆盖 |
|---|--------------|------|---------|
| 1 | `fixtures/parse/basic-choice.md` | 2 KB | 单选 + 多选 + 判断 |
| 2 | `fixtures/parse/code-heavy.md` | 4 KB | **5 道 Python 代码题**(含 I/O 示例) |
| 3 | `fixtures/parse/mixed-types.md` | 6 KB | 6 种题型全覆盖 |
| 4 | `fixtures/parse/exam.pdf` | ~50 KB | PDF,含可识别文字 |
| 5 | `fixtures/parse/handwritten.png` | ~200 KB | 截图含 3 道手写数学题 |

**每个 fixture 验收标准**:
- 本地解析得到 ≥ 1 道题(baseline)
- AI 解析得到 ≥ 1 道题
- fixture 2 的 5 道代码题,AI 必须有 ≥ 4 道 `type==='code'` 且 `code` 字段非空
- fixture 5 必须由 vision 模型解析,纯对话模型返回空或报错
- 解析时间:fixture 1-3 < 10s;fixture 4-5 < 30s

### 9.2 自动化测试(最小集)

由于这是个**调用外部 API** 的功能,自动化测试**打桩**,不能真实调 LLM:

```
tests/
├── ai/
│   ├── crypto.test.ts          # encrypt/decrypt 双向 round-trip
│   ├── parser.test.ts          # 用 mock fetch 验证 prompt 拼接 + JSON 解析 + 字段映射
│   ├── prompt.test.ts          # prompt 模板无缺失字段
│   └── normalize.test.ts       # AI 宽松输出 → Question 严格类型
├── extract/
│   ├── pdf.test.ts             # fixture PDF → text
│   ├── docx.test.ts            # fixture DOCX → text
│   └── dispatcher.test.ts      # 按 MIME 分派正确
└── api/
    ├── ai-providers.test.ts    # CRUD + 加密字段不泄漏
    ├── ai-active.test.ts       # 切换事务原子性
    └── ai-parse.test.ts        # 鉴权 / 503 无激活 / mock 200
```

---

## 10. 实施分阶段

按依赖顺序,**每阶段独立可用**,可分别发布:

### 阶段 1:AI 配置底座 + 单厂商 AI 解析文本(约 1-1.5 天)

- Prisma 加 `AIProviderConfig` 模型 + migration
- `src/lib/ai/{crypto,providers,prompt,parser}.ts`
- `src/app/admin/ai/page.tsx` + 弹窗 + 侧栏导航
- `/api/admin/ai/providers` CRUD + `/active` + `/test`
- `/api/ai/parse` 端点
- **不涉及文件上传改动**:上传 `.md`/`.txt` 仍然走 FileReader,但 `UploadForm` 加「AI 解析」按钮(单 tab)
- **验收**:管理员能配 DeepSeek API key,用户上传 `.md` 后能切到 AI 结果

### 阶段 2:多文档格式抽取 + 文件上传端点(约 1 天)

- 安装 `pdf-parse` `mammoth` `@types/mammoth`
- `src/lib/extract/{pdf,docx,image,index}.ts`
- `/api/upload` multipart 端点
- `UploadForm` / `QuizUploadPanel` 文件选择扩展到 PDF/Word/图片
- **验收**:PDF/Word/图片都能抽到文本(图片需先在 AI 配置启用视觉)

### 阶段 3:双预览切换 UI(约 0.5 天)

- `UploadForm` / `QuizUploadPanel` 改双 tab 切换
- AI 解析中 spinner + 耗时 + 失败重试
- 用户未配 AI 时黄色 banner
- fixture 5 个端到端验证
- **验收**:并行跑本地 + AI,UI 切换顺畅,失败兜底到位

> 阶段 1 完成 → 可用 AI 解析 .md/.txt(代码题解析质量飞跃)
> 阶段 1+2 完成 → 可用 AI 解析 PDF/Word/图片
> 阶段 1+2+3 完成 → 完整双预览体验

---

## 11. 上线前 checklist

- [ ] `.env.example` 加 `AI_KEY_ENCRYPTION_SECRET=请改成-32-字符以上的随机串`
- [ ] `package.json` 加 `pdf-parse` `mammoth` `@types/mammoth`
- [ ] 加密密钥缺失时服务启动报错(避免上线后才发现)
- [ ] 文件上传路径加大小限制中间件(防恶意大文件)
- [ ] `POST /api/ai/parse` 加速率限制(防滥用,每用户 10 次/分钟)
- [ ] 失败日志:`{ userId, providerId, error, latencyMs }` → console,后续可落库
- [ ] README 增补"AI 配置"章节

---

## 12. 关键文件清单

### 新建

- `prisma/migrations/xxx_add_ai_provider_config/migration.sql`
- `src/lib/ai/crypto.ts`
- `src/lib/ai/providers.ts`
- `src/lib/ai/prompt.ts`
- `src/lib/ai/parser.ts`
- `src/lib/extract/pdf.ts` `docx.ts` `image.ts` `index.ts`
- `src/app/api/admin/ai/providers/route.ts`
- `src/app/api/admin/ai/providers/[id]/route.ts`
- `src/app/api/admin/ai/providers/[id]/test/route.ts`
- `src/app/api/admin/ai/active/route.ts`
- `src/app/api/ai/parse/route.ts`
- `src/app/api/upload/route.ts`
- `src/app/admin/ai/page.tsx`
- `src/components/admin/AiProviderModal.tsx`

### 修改

- `prisma/schema.prisma` — 加 `AIProviderConfig` 模型
- `src/components/AdminSidebar.tsx` — 加导航项
- `src/components/UploadForm.tsx` — 双预览切换
- `src/components/admin/QuizUploadPanel.tsx` — 双预览切换
- `.env.example` — 加 `AI_KEY_ENCRYPTION_SECRET` 注释
- `package.json` — 加 `pdf-parse` `mammoth` `@types/mammoth`

### 不修改

- `src/lib/parser.ts`(本地解析器保留作兜底)
- `src/lib/question-normalize.ts`
- `src/app/api/quizzes/route.ts`(保存路径不动)
- 所有 `Question` 类型定义