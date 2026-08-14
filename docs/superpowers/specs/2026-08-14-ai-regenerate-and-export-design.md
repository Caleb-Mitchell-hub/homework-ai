# AI 重新生成 + 记录/笔记导出 设计文档

日期：2026-08-14
状态：待评审

## 背景与目标

HomeWork-AI 是一个 Next.js 在线测验系统。当前 AI 解析、AI 报告在生成一次后会被缓存，用户无法真正"重新生成"；答题记录和笔记缺少导出能力；"我的笔记"页的管理体验简陋。本设计补齐三块能力：

1. AI 重新评分 / 重新解析 / 重新生成报告，且保持已有追问记录。
2. 答题记录导出（单条 + 批量），内容可勾选，格式为 Markdown。
3. "我的笔记"页 UI 管理优化（批量选择/删除、筛选/分组、视觉升级）与笔记导出。

## 需求概述

| # | 需求 | 关键约束 |
|---|------|---------|
| 1 | AI 重新生成 | 重新生成同首次扣积分，点击前二次确认；不触碰追问记录 |
| 2 | 记录导出 | Markdown(.md)；单条 + 批量；内容可勾选（AI 评分/解析/笔记/追问/报告等） |
| 3 | 笔记 UI + 导出 | 批量选择/删除、增强筛选/分组、批量导出、视觉升级；导出 Markdown |

## 现有数据模型（关键）

- `QuizResult`：答题记录。`results` 为 JSON 数组，每题含 `questionId`、`userAnswer`、`correct`、`interviewScore`、`interviewFeedback`、`manualScore`、`aiComment` 等。
- `AIExplanation`：AI 解析，按 `(userId, questionId, userAnswer)` 存储。
- `AIFollowUp`：追问，按 `(userId, questionId)` 存储，`role` 为 user/assistant。
- `Note`：笔记，按 `userId` + 可选 `questionId`/`quizId`/`resultId`，`type`(question/answer/ai_output)、`source`(manual/ai_explain/reference_answer/ai_report)。
- `AIReport`：报告，`resultId` 唯一，`content` 为 JSON。

> 注意：`AIExplanation` 与 `AIFollowUp` 没有 `resultId`，只有 `questionId`，因此解析/追问是按"题目"跨测验共享的。导出时按题目关联。

---

## 需求 1：AI 重新生成能力

### 后端改动

给 4 个 AI 路由加 `force` 参数。`force=true` 时跳过缓存，重新生成并覆盖。

**`POST /api/ai/explain`**
- body 增加 `force?: boolean`。
- 传入 `explainQuestion`（`src/lib/credits/explain.ts`），新增 `force` 选项：
  - `force=true`：跳过 `findFirst` 缓存查询；扣费后调 AI；写新缓存前删除旧的 `(userId, questionId, userAnswer)` 记录，再 `create` 新记录。
  - 扣积分逻辑与首次一致（`getExplainCost`）。
- 响应结构不变：`{ content, cached, newBalance, costCredit }`。

**`POST /api/ai/report`**
- body 增加 `force?: boolean`。
- `force=true`：跳过 `existing` 检查，重新生成，用 `upsert`（按 `resultId`）覆盖 `AIReport`。
- 扣 5 积分（`REPORT_COST`）逻辑不变。

**`POST /api/ai/interview-report`**
- body 增加 `force?: boolean`。
- `force=true`：跳过 `existingReport` 检查，重新生成，用 `upsert`（按 `resultId`）覆盖。
- 扣 100 积分（`INTERVIEW_REPORT_COST`）逻辑不变。

**`POST /api/ai/grade-interview`**
- 后端无需改动（每次触发本就会重新打分并覆盖 `results` JSON）。
- 仅前端加"重新评分"入口。

### 前端改动

- **AI 解析** `AIExplainPanel`：`done` 状态增加「🔄 重新解析」按钮。点击弹确认框「将重新生成解析并扣除 X 积分」，确认后带 `force: true` 重调。
- **AI 评分** `AnswerSheet`：面试题/简答题已评分时，在评分结果卡片加「🔄 重新评分」按钮，复用 `triggerGrade`，加确认框。
- **报告** `ReportView`：已有报告时加「🔄 重新生成报告」按钮，确认后带 `force: true` 重调（普通报告 / 面试报告各自入口）。

确认弹窗统一走 `useDialog().confirm`，文案标明将扣除的积分。

### 保持追问记录

重新解析 / 评分 / 报告**只更新各自对应的表**（`AIExplanation` / `QuizResult.results` / `AIReport`），**绝不触碰 `AIFollowUp`**。追问记录天然保留，无需迁移，但需在实现时确保批量/覆盖逻辑不级联删除追问。

---

## 需求 2：答题记录导出

### 聚合 API

新增 `GET /api/export/result/[id]`（鉴权：登录 + 归属校验，与 `GET /api/results/[id]` 一致）。

返回结构：

```ts
{
  result: {
    id, name, score, totalScore, status, submittedAt,
    items: Array<{         // 解析后的 results JSON
      questionId, userAnswer, correct,
      interviewScore?, interviewFeedback?, manualScore?, manualComment?, aiComment?
    }>
  },
  quiz: {
    id, title, questions: Question[]   // 已解析
  },
  explanations: Record<questionId, Array<{ content, createdAt }>>,
  followups:    Record<questionId, Array<{ role, content, createdAt }>>,
  notes:        Array<{ id, type, title, content, source, updatedAt }>,
  report:       { knowledgePoints?, advice? } | null
}
```

聚合查询：
- `explanations`：`AIExplanation.findMany({ where: { userId, questionId: { in: questionIds } } })`，按 questionId 分组。
- `followups`：`AIFollowUp.findMany({ where: { userId, questionId: { in: questionIds } }, orderBy: createdAt })`，按 questionId 分组。
- `notes`：`Note.findMany({ where: { userId, OR: [{ resultId: id }, { quizId }] } })`。
- `report`：`AIReport.findUnique({ where: { resultId: id } })`，存在则 `JSON.parse(content)`。

### Markdown 生成

新建 `src/lib/result-to-markdown.ts`，复用 `quiz-to-markdown.ts` 中的 `questionToMarkdown` / `optionLetter` / `toChineseNum` 等 helper（必要时抽为公共导出）。

函数签名：

```ts
export function resultToMarkdown(opts: {
  result: { name, score, totalScore, submittedAt, items };
  quiz: { title, questions };
  explanations?: Record<string, ...[]>;
  followups?: Record<string, ...[]>;
  notes?: Note[];
  report?: ...;
  sections: ExportSections;   // 勾选内容
}): string
```

`ExportSections`：

```ts
interface ExportSections {
  question: boolean;      // 题目（题干+选项）
  userAnswer: boolean;    // 你的答案
  correctAnswer: boolean; // 正确答案
  aiScore: boolean;       // AI 评分
  aiExplain: boolean;     // AI 解析
  notes: boolean;         // 笔记
  followups: boolean;     // 追问
  report: boolean;        // 答题报告
}
```

输出结构：`# 记录名` → 元信息（得分/总分/时间）→ 逐题（按勾选渲染各块）→ 报告段。

### 内容勾选（ExportDialog 组件）

新建 `src/components/ExportDialog.tsx`：受控弹窗，展示 8 个勾选项 + 全选/全不选，确定回调返回 `ExportSections`。

### 单条导出

- 入口：`RecordDetailDrawer` 头部加「⬇ 导出」按钮。
- 流程：点击 → 拉聚合 API → 打开 `ExportDialog` 勾选 → 前端拼 Markdown → Blob 下载 `记录名-日期.md`。

### 批量导出

- 入口：`records/page.tsx` 加「批量导出」模式（与删除共用多选态）。
- 流程：勾选多条 → 弹一次 `ExportDialog`（勾选应用到所有记录）→ 并发拉取各条聚合数据 → 每条生成 `.md` → `jszip` 打包 → 下载 `答题记录导出-日期.zip`。

### 下载工具

新建 `src/lib/download.ts`：`downloadMarkdown(filename, content)` 与 `downloadZip(filename, files: { name, content }[])`，用 `Blob` + `URL.createObjectURL` + `<a download>`。现有 `src/app/banks/page.tsx` 内已有 `downloadBlob` + `jszip` 导出模式（题库导出），抽到该文件复用，避免重复。

---

## 需求 3：笔记 UI 优化 + 导出

### 批量选择 + 批量删除

- `notes/page.tsx` 列表进入多选模式：每条出现勾选框，顶部工具条显示「已选 N 条 / 全选 / 取消」。
- 新增 `POST /api/notes/batch-delete`：body `{ ids: string[] }`，执行 `deleteMany({ where: { userId, id: { in: ids } } })`，仅删本人笔记，天然防越权，返回删除数量。
- 删除前 `useDialog().confirm`：「确定删除 N 条笔记？」。

### 增强筛选 / 分组

在现有「类型筛选 + 搜索」基础上：
- **来源筛选**：新增下拉，全部 / 手动记录 / AI解析 / 标准答案 / AI报告（映射 `source` 字段）。
- **分组视图**：新增「按时间分组」开关，开启后按「今天 / 昨天 / 近 7 天 / 更早」分块。

### 导出笔记

- 新建 `src/lib/notes-to-markdown.ts`：`notesToMarkdown(notes: Note[])`，每条输出 `## 标题` + 类型/来源标签行 + 内容。
- **单条导出**：详情区加「⬇ 导出」按钮，下载 `笔记标题.md`。
- **批量导出**：多选模式下勾选多条 → 打包 zip（每条一个 `.md`，复用 `jszip`）。

### 视觉升级

- 类型/来源用彩色标签区分；卡片 hover/选中态优化；空状态、加载态补齐。
- 多选模式下选中卡片高亮描边 + 底部操作条。

---

## 数据流（导出）

```
用户点击"导出"
  → GET /api/export/result/[id]（或笔记页本地数据）
  → ExportDialog 勾选内容
  → resultToMarkdown / notesToMarkdown 拼字符串
  → downloadMarkdown / downloadZip（Blob 下载）
```

批量：`Promise.all` 并发拉多条 → 逐条 `resultToMarkdown` → `jszip` 打包。

## 错误处理

- 聚合 API：登录失效 401、无权限 403、记录不存在 404、JSON 解析失败兜底空数组。
- 导出下载：生成失败提示 toast，不静默失败。
- 重新生成：AI 失败时沿用现有退款逻辑（`explain` / `report` / `interview-report` 已有 refund 流程），前端提示错误。
- 批量删除：`deleteMany` 按 `userId` + `id in` 过滤，只删本人笔记，越权 id 自然跳过（不计入删除数）。

## 测试策略

- `result-to-markdown.ts` / `notes-to-markdown.ts`：纯函数单测，覆盖各 `sections` 组合、空数据、含公式/代码块。
- `explainQuestion(force=true)`：单测验证跳过缓存 + 删除旧记录 + 扣费。
- 聚合 API：验证鉴权、归属校验、各字段分组正确。
- 批量删除 API：验证越权保护（不能删他人笔记）。

## 涉及文件清单

**后端**
- `src/app/api/ai/explain/route.ts`（加 force）
- `src/lib/credits/explain.ts`（加 force 逻辑）
- `src/app/api/ai/report/route.ts`（加 force + upsert）
- `src/app/api/ai/interview-report/route.ts`（加 force + upsert）
- `src/app/api/export/result/[id]/route.ts`（新增聚合 API）
- `src/app/api/notes/batch-delete/route.ts`（新增批量删除）

**前端**
- `src/components/AIExplainPanel.tsx`（重新解析按钮）
- `src/components/AnswerSheet.tsx`（重新评分按钮）
- `src/components/ReportView.tsx`（重新生成报告按钮）
- `src/components/RecordDetailDrawer.tsx`（导出入口）
- `src/components/ExportDialog.tsx`（新增）
- `src/app/records/page.tsx`（批量导出入口 + 多选）
- `src/app/notes/page.tsx`（批量选择/删除、筛选/分组、视觉升级、导出）

**库/工具**
- `src/lib/result-to-markdown.ts`（新增）
- `src/lib/notes-to-markdown.ts`（新增）
- `src/lib/download.ts`（新增，Blob 下载 / zip 打包）
- `src/lib/quiz-to-markdown.ts`（抽公共 helper，若有）

**依赖**：复用现有 `jszip`，无新增依赖。
