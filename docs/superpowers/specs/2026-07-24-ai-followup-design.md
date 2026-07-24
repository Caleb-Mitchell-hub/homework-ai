# AI 追问功能 设计文档

> **日期:** 2026-07-24  
> **状态:** 设计中  
> **关联:** [[2026-07-04-credits-and-ai-explain-design]]

---

## 目标

用户在查看题目答案或 AI 解析后，可以对不理解的内容进行追问。AI 基于当前题目的上下文（题干 + 答案 + 已有 AI 解析）给出针对性回答。

---

## 架构决策

### 范围

- **仅当前题目上下文**（题干 + 正确答案 + AI 解析结果一并传给 AI 作为背景）
- **多轮对话**（一次追问会话内可连续问答，前端 state 维护历史）
- **不持久化**（追问历史仅存前端内存，刷新即清；不写 DB 缓存）

### 积分策略

- **追问完全免费**，不扣积分，不写 CreditLedger
- AI 解析（`POST /api/ai/explain`）积分规则不变

### 入口

- **QuestionCard**（答题中）：每道题下方显示「💬 追问」按钮
- **AnswerSheet**（交卷后）：每道题的答案/解析区域下方显示「💬 追问」按钮

---

## API 设计

### `POST /api/ai/followup`

**请求:**
```json
{
  "questionId": "string",
  "questionContent": "题目原文",
  "questionType": "single",
  "answer": "正确答案或参考答案",
  "aiExplanation": "已有的 AI 解析内容（可选，如果用户先点了 AI 解析）",
  "conversationHistory": [
    { "role": "user", "content": "什么是 Fiber 节点？" },
    { "role": "assistant", "content": "Fiber 节点是..." }
  ],
  "newQuestion": "那它和虚拟 DOM 有什么区别？"
}
```

**响应 (200):**
```json
{
  "content": "Fiber 和虚拟 DOM 的区别在于..."
}
```

**错误:**
- `401` — 未登录
- `502` — AI 调用失败（提示用户重试，不扣积分）

### 实现要点

- 不查缓存、不写缓存
- 不扣积分、不写 CreditLedger
- 用 `callChat`（非流式，追问响应通常较短）
- System prompt 设计为「基于题目上下文回答追问」的教师角色

### System Prompt

```
你是一位耐心的辅导老师。学生正在做一道题目，对某些内容不理解，需要你帮助解答。

以下是题目的完整信息：
- 题目：{questionContent}
- 正确答案：{answer}
- AI 解析（如有）：{aiExplanation}

请基于以上信息，用简洁清晰的中文回答学生的追问。使用 markdown 格式。
如果学生的追问与题目无关，请引导他们回到题目相关的讨论。
```

---

## 组件设计

### `AIFollowUp.tsx`（新文件）

```
Props:
  questionId: string
  questionContent: string
  questionType: string
  answer: string              // 正确答案/参考答案
  aiExplanation?: string      // 已有的 AI 解析（可选）

State:
  isOpen: boolean             // 是否展开对话框
  messages: Message[]         // 对话历史
  input: string               // 当前输入
  loading: boolean            // 等待 AI 回复中
  error: string | null
```

**UI 结构：**

```
[💬 追问] 按钮（始终可见）

isOpen === true 时展开：
┌─────────────────────────────────────┐
│ 对话区（max-h-64 overflow-y-auto）   │
│  ┌ 🙋 用户消息（右对齐 蓝色气泡）    │
│  └ 🤖 AI 回复（左对齐 灰色气泡）     │
│  ┌ 🙋 用户消息                      │
│  └ 🤖 AI 回复（带 typing 动画）     │
│ 输入区                              │
│  ┌──────────────────────┬────────┐  │
│  │ textarea             │  发送  │  │
│  └──────────────────────┴────────┘  │
└─────────────────────────────────────┘
```

**交互细节：**
- 点击「💬 追问」展开/收起面板
- Enter 发送，Shift+Enter 换行
- 发送后 input 清空，显示 loading spinner
- AI 回复到达后自动滚动到底部
- 错误时在输入区上方显示红色提示 + 重试按钮
- 关闭面板后重新打开，历史保留（组件未卸载）

---

## 数据流

```
用户点击[💬 追问] → 展开面板
用户输入问题 → 点发送
  → POST /api/ai/followup
     body: {
       questionId,
       questionContent,
       questionType,
       answer,              // 从 QuestionCard/AnswerSheet 传入
       aiExplanation,       // 从 AIExplainPanel 获取（如有）
       conversationHistory, // 当前组件的 messages
       newQuestion          // 用户刚输入的问题
     }
  → AI 返回 { content }
  → 追加到 messages: [...messages, {role:'user', content}, {role:'assistant', content: aiContent}]
  → 渲染 MarkdownView 显示 AI 回复
```

### 与 AIExplainPanel 的关系

- 独立组件，不互相依赖
- 当两者都使用时，QuestionCard/AnswerSheet 将 `AIExplainPanel` 的 content 作为 `aiExplanation` prop 传给 `AIFollowUp`
- 追问时后端自动带上 AI 解析上下文

---

## 修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/app/api/ai/followup/route.ts` | **新建** | 追问 API 端点 |
| `src/components/AIFollowUp.tsx` | **新建** | 追问对话组件 |
| `src/lib/ai/followup-prompt.ts` | **新建** | 追问 System Prompt |
| `src/components/QuestionCard.tsx` | **修改** | 添加 AIFollowUp 入口 |
| `src/components/AnswerSheet.tsx` | **修改** | 添加 AIFollowUp 入口 + 传递 AIExplainPanel 的 content |

---

## 测试策略

### 单元测试

1. `tests/lib/ai/followup-prompt.test.ts` — System prompt 格式正确性
2. `tests/components/ai-follow-up.test.tsx` — 组件渲染、展开/收起、消息追加、输入清空

### API 测试

3. `tests/app/api/ai/followup.test.ts` — 成功返回、未登录 401、AI 失败 502

---

## 边界情况

- **空输入**: 发送按钮 disabled 直到输入非空
- **AI 返回空内容**: 提示"AI 返回了空内容，请换个问法重试"
- **网络错误**: 提示"网络不可达，请稍后重试"，保留用户输入
- **快速连续发送**: 发送中时按钮 disabled
- **超长对话**: 前端最多保留 20 条消息（10 轮问答），旧消息截断
- **未登录**: 追问按钮仍然显示，但点击后弹出登录提示（或隐藏按钮，与 AIExplainPanel 行为一致）

---

## 不在本期范围内

- ~~追问历史持久化到 DB~~
- ~~追问内容跨设备同步~~
- ~~追问的积分扣费~~
- ~~关联其他题目的跨题追问~~
