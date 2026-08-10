# AI 题库生成 功能设计

> **目标**：在 `/upload` 页面新增「AI 生成」tab，用户输入主题 + 指定各题型数量，AI 自动生成完整题库。全过程流式展示进度，支持预览后保存。

**创建日期**：2026-08-10

---

## 1. 功能概述

用户无需准备任何源文件，只需输入主题描述（如"计算机网络 OSI 七层模型"）并指定各题型数量，系统调用 AI 自动生成包含题目、选项、答案的完整题库。生成过程实时流式展示进度，完成后可预览题目再确认保存。

## 2. UI 设计

### 2.1 入口

`/upload` 页面顶部新增 tab 切换：

```
[上传文件]  [AI 生成]
```

- 默认选中「上传文件」（保持现有用户习惯）
- 切换到「AI 生成」时展示生成表单

### 2.2 生成表单

```
┌─────────────────────────────────────────────┐
│  主题/内容（必填）                            │
│  ┌─────────────────────────────────────┐    │
│  │ placeholder:                        │    │
│  │ 例如：计算机网络OSI七层模型相关面试题  │    │
│  │ 也可以粘贴一段文本让AI基于内容出题    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  题型与数量                                   │
│  单选题 [5▼] 题    多选题 [3▼] 题             │
│  判断题 [2▼] 题    填空题 [0▼] 题             │
│  简答题 [2▼] 题    面试题 [1▼] 题             │
│                                             │
│  预估消耗：⚡ XX 积分                         │
│                                             │
│  [📋 复制提示词]         [✨ 生成题库]       │
└─────────────────────────────────────────────┘
```

规则：
- 主题/内容 textarea，必填
- 每题型的数量输入框，默认值 0，支持手动输入或步进按钮（min=0, max=50）
- 所有题型数量都为 0 时，「生成题库」按钮置灰
- 预估积分实时计算，用户修改数量时即时更新
- 排除代码题（AI 生成代码题质量不稳定）

### 2.3 进度弹窗

点击「生成题库」后打开全屏模态弹窗，样式与现有 `ParseProgressDialog` 一致：

```
┌─────────────────────────────────────────────┐
│  ✨ AI 正在生成题库…                         │
│                                             │
│  ████████████████░░░░░░ 75%                 │
│  正在解析题目格式…                            │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ AI 实时输出文字流（可滚动）…          │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

阶段标识：
- `prompt` — 构建提示词
- `generating` — AI 生成中（此时展示 delta 流式文字）
- `parsing` — 解析题目格式
- `done` — 完成

### 2.4 题目预览 & 操作

生成完成后展示题目列表（只读预览），每道题显示：
- 题号 + 题型标签（彩色标签区分）
- 题目标题
- 选项（单选/多选）、答案（判断）、参考答案（简答/面试）
- 难度标签

底部操作栏：
```
[重新生成]    [📋 复制提示词]    [确认保存]
```

- **重新生成**：关闭预览，重新调用 API
- **复制提示词**：将本次构建的完整 prompt 复制到剪贴板，Toast 提示
- **确认保存**：调 `POST /api/quizzes` 保存，跳转 `/quiz/:id`

## 3. API 设计

### `POST /api/ai/generate-quiz`

SSE 流式端点。

**请求体**：
```json
{
  "topic": "用户输入的文本",
  "counts": {
    "single": 5,
    "multiple": 3,
    "boolean": 0,
    "fill": 0,
    "essay": 2,
    "interview": 1
  },
  "timeLimit": 30
}
```

**SSE 事件**：
```
event: progress
data: {"stage":"prompt","message":"正在构建提示词…"}

event: progress
data: {"stage":"generating","message":"AI 正在生成题目…"}

event: delta
data: {"text":"{\n  \"questions\": [\n    {\n      \"type\": \"single\",\n ..."}

event: progress
data: {"stage":"parsing","message":"正在解析题目格式…"}

event: complete
data: {"questions":[...], "usage":{"promptTokens":1200,"completionTokens":800,"cost":42}}

event: error
data: {"message":"积分不足","code":"INSUFFICIENT_CREDITS"}
```

**error codes**：
- `INSUFFICIENT_CREDITS` — 积分不足
- `NO_PROVIDER` — 未配置 AI 厂商
- `PARSE_FAILED` — AI 返回内容无法解析
- `EMPTY_RESULT` — AI 返回了空内容
- `RATE_LIMITED` — 频率限制

## 4. 积分系统

### 4.1 定价

| 题型 | 单价（积分/题） | 估算 token/题 |
|------|:----------:|:-----------:|
| 单选题 | 2 | ~200 |
| 多选题 | 2 | ~250 |
| 判断题 | 1 | ~150 |
| 填空题 | 3 | ~300 |
| 简答题 | 5 | ~500 |
| 面试题 | 8 | ~800 |

### 4.2 扣费策略

「固定单价 + token 上限兜底」：

1. 生成前计算预估积分：`Σ(数量 × 单价)`
2. 事务扣预估积分，写 `CreditLedger`
3. AI 调用完成，取 `usage.prompt_tokens + completion_tokens`
4. 实际积分 = `ceil(totalTokens / 100)`
5. 实际 > 预估：补扣差额，写 `CreditLedger`
6. 实际 < 预估：退还差额，写 refund
7. 失败或异常：全部退还

### 4.3 Schema 变更

`CreditReason` 枚举新增：
```
ai_generate_quiz
```

## 5. AI 提示词设计

### 5.1 System Prompt

```
你是一位专业的题库出题专家。根据用户提供的主题或内容，
严格按照指定的题型和数量生成高质量题目。

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
      "type": "single | multiple | boolean | fill | essay | interview",
      "title": "题目标题",
      "difficulty": "简单 | 中等 | 困难",
      "options": ["A选项","B选项","C选项","D选项"],
      "correctAnswer": "正确选项字母",
      "blanks": 1,
      "referenceAnswer": "参考答案（简答题/面试题必填）",
      "subQuestions": ["子问题1", "子问题2"]
    }
  ]
}
```

### 5.2 User Prompt

```
【主题/内容】
{topic}

【题目要求】
请生成以下题型和数量（共计 {total} 题）：
- 单选题：{counts.single} 题
- 多选题：{counts.multiple} 题
- 判断题：{counts.boolean} 题
- 填空题：{counts.fill} 题
- 简答题：{counts.essay} 题
- 面试题：{counts.interview} 题

对于数量为 0 的题型不要生成。题目内容请围绕上述主题展开，
确保覆盖核心知识点，难度递进合理。
```

### 5.3 输出处理

1. 使用 `extractJson()` 解析 AI 返回的 JSON
2. 通过 `normalizeAIOutputToQuestions()` 转换为 `Question[]`
3. 通过 `autoConvertEssayToInterview()` 兜底
4. 校验题型数量是否匹配用户请求（偏差 ≤20% 接受，偏差过大则在事件中标注 warning）

## 6. 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/app/api/ai/generate-quiz/route.ts` | SSE 流式生成 API 端点 |
| `src/lib/ai/generate-prompt.ts` | 构建生成题库的 system/user prompt |
| `src/lib/credits/generate-cost.ts` | 定价表 + 预估计算 + 实际消耗换算 |
| `src/lib/credits/generate.ts` | 扣费/补扣/退款逻辑（事务安全） |
| `src/components/AIGenerateForm.tsx` | AI 生成表单（主题输入 + 题型数量 + 预估积分） |
| `src/components/AIGenerateDialog.tsx` | 流式进度弹窗（复用 ParseProgressDialog 样式） |
| `src/components/AIGeneratePreview.tsx` | 题目预览 + 操作按钮（保存/重生成/复制提示词） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/app/upload/page.tsx` | 新增 tab 切换（上传文件 / AI 生成），引入 `AIGenerateForm` |
| `prisma/schema.prisma` | `CreditReason` 枚举新增 `ai_generate_quiz` |

## 7. 错误处理

| 场景 | 处理 |
|------|------|
| 积分不足 | 前端弹窗提示所需积分 → 引导去充值页 |
| 未配置 AI | Toast 「AI 服务未配置，请联系管理员」 |
| AI 超时 | 5 分钟超时 → SSE error → 退还积分 |
| JSON 解析失败 | 尝试 `extractJson` 5 种策略 → 仍失败则退款 + error |
| 题型数量不匹配 | 偏差 ≤20% 接受并标注 warning；偏差 >20% 仍需用户确认 |
| 用户关闭弹窗 | `AbortController.abort()` 取消请求，已扣积分不退（AI 调用已发生） |
| 快速双击提交 | 前端 ref 锁 + API 层 3 秒防抖 |

## 8. 边界条件

- topic 最长 5000 字符（后端截断 + 前端提示）
- 单题型最多 50 题
- 总题目数最少 1 题，最多 100 题
- timeout = 300 秒（生成大题量耗时较长）
- temperature = 0.7（有一定随机性避免重复出题）
- jsonMode = true
- maxTokens = 16000（确保大题量输出不被截断）
