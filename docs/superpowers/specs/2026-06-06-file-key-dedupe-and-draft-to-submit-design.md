# File Key 去重 + 草稿→完成 状态流转

**日期**: 2026-06-06
**项目**: homework-ai (Next.js 在线答题系统)
**范围**: 上传去重 + 暂存/提交的状态机收敛

---

## 1. 背景与目标

### 当前痛点

1. 同一份 md 文件被多次打开/上传,会创建多条 `Quiz` 记录(无内容指纹,完全靠 cuid)
2. 暂存与提交产生两条独立的 `QuizResult`,即使它们是同一份题库的"同一份答题内容"
3. 每次"暂存进度"或"提交答案"都会弹**命名+选分类**对话框,即便用户上一次已经选过
4. 暂存的 draft 重新进入答题页时,分类关联依赖 localStorage(`CategoryContext.resultMap`),跨设备/刷新会丢

### 目标

- **去重上传**:同一份文件(内容相同)→ 同一份 Quiz
- **状态机收敛**:对同一份 Quiz,用户的答题数据收敛为**一条 QuizResult**,从 `draft` 走到 `submitted`,不分裂
- **零重复选择**:首次保存时填的名称/选过的分类,后续操作直接复用,不再弹对话框
- **默认值跟着文件走**:这套默认值存在 Quiz 记录上(随 fileKey 走),不依赖 localStorage

---

## 2. 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Key 生成 | SHA-256(hex) 文件原始文本 | 同一文件 = 同一 key,精度最高 |
| 同 key 重复上传 | 复用现有 Quiz,返回 `existed: true` | 防止同一份题库产生多条 record |
| Submit 语义 | 优先 update 现有 draft → 改 status 为 submitted | 用户明确要求"将暂存变为完成" |
| 默认名/分类存哪 | 存在 Quiz 表上(`defaultName` / `defaultCategoryId`) | 随 fileKey 走,跨设备一致 |
| 用户改后是否回写 | 同步回写到 Quiz | 后续操作自动用最新值 |
| 重复上传遇 draft | 弹轻量选择层(继续/重新开始/查看已有) | 用户明确要求按用户选择 |

---

## 3. 数据模型变更

### `prisma/schema.prisma` — `Quiz` 新增 3 字段 + 1 复合唯一

```prisma
model Quiz {
  id                String       @id @default(cuid())
  title             String
  questions         String       @db.Text
  userId            String
  user              User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  isOfficial        Boolean      @default(false)
  timeLimit         Int          @default(0)
  results           QuizResult[]
  createdAt         DateTime     @default(now())

  // === 新增 ===
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

**约束说明**:
- `@@unique([userId, fileKey])` 在 MySQL 下,`(userId, null)` 允许多行 → 旧数据兼容
- `fileKey` 为 null 的行(旧 Quiz)不去重、不抛冲突

### `QuizResult` 保持不变

`status` 仍是 `'draft' | 'submitted'`(string,不引入 enum 以避免迁移负担)。新行为:
- 对同一 `(userId, quizId)` 最多存在 1 条 `draft` 和 任意条 `submitted`(旧数据/特殊场景)
- 提交时优先把现有 draft 升级为 submitted,而不是 create 新行

---

## 4. 后端 API 变更

### 4.1 `POST /api/quizzes`

**请求体新增**:
```ts
{
  title: string;
  questions: Question[];
  fileKey?: string;  // 新增
}
```

**处理流程**:
1. 鉴权 → 解析 body → 校验 title/questions 必填
2. 若 `fileKey` 非空:`prisma.quiz.findFirst({ where: { userId, fileKey } })`
   - **命中**:
     - 查该 quiz 是否有 draft / submitted
     - 返回 `{ quiz, existed: true, hasDraft, hasSubmitted }`(questions **不更新**)
   - **未命中**:`prisma.quiz.create({ data: { ..., fileKey } })`,返回 `{ quiz, existed: false }`
3. 若 `fileKey` 为空:保持原行为,直接 create(旧入口/手动新增题目场景)

**响应**(成功):
```ts
{ quiz: Quiz; existed: boolean; hasDraft?: boolean; hasSubmitted?: boolean }
```

### 4.2 `POST /api/results`

**请求体新增**:
```ts
{
  quizId: string;
  name?: string;
  score: number;
  totalScore: number;
  results: AnswerResult[];
  status?: 'draft' | 'submitted';
  defaultName?: string;       // 新增
  defaultCategoryId?: string; // 新增
}
```

**处理流程**:
1. 鉴权 → 解析 body
2. 查询现有 draft:`findFirst({ userId, quizId, status: 'draft' })`
3. **如果 status === 'submitted' 且 draft 存在**:
   - `prisma.quizResult.update({ where: { id: draft.id }, data: { status: 'submitted', name, score, totalScore, results: JSON.stringify(answerResults) } })`
   - 即把 draft 升级为 submitted,保留同一行 id
4. **如果 status === 'draft' 且 draft 存在**:
   - `prisma.quizResult.update({ where: { id: draft.id }, data: { name, score, totalScore, results: JSON.stringify(answerResults) } })`
5. **否则**:create 新行
6. 成功路径后,若 `defaultName` 或 `defaultCategoryId` 有传:
   - `prisma.quiz.update({ where: { id: quizId }, data: { defaultName, defaultCategoryId } })`
   - **跳过规则**:`undefined`、`null`、`""`(空字符串)都不回写,避免覆盖已有默认值
   - 也就是说:只有用户**主动选了非空分类/填了非空名称**才回写,留空即视为"维持原样"

**响应**(成功):`{ result: QuizResult }`(保持原状,前端不感知 draft→submitted 的差异)

### 4.3 不变的接口

- `GET /api/quizzes` — 列表不变
- `GET /api/quizzes/[id]` — 单题库不变
- `GET /api/results` — 列表不变
- `DELETE /api/results` — 删除不变

---

## 5. 前端变更

### 5.1 `src/lib/hash.ts` (新增)

```ts
/**
 * 计算文本的 SHA-256 十六进制摘要
 * - 浏览器端使用 SubtleCrypto
 * - 服务端(若调用)降级使用 Node crypto
 */
export async function sha256Hex(text: string): Promise<string>
```

**实现**:
- 浏览器:`crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))` → 转 hex
- 不可用时降级:Node `crypto.createHash('sha256').update(text).digest('hex')`
- 大文件注意:`SubtleCrypto` 在 Chromium / Firefox 上限为 2GB,本场景 md 文件远小于此

### 5.2 `src/components/UploadForm.tsx`

**`handleParse` 改动**:
- 在 POST 之前:`const fileKey = await sha256Hex(preview);`
- POST body 增加 `fileKey`
- 解析响应:
  - `existed: false` → 保持原 `router.push('/quiz/${id}')` / `onCreated(id)`
  - `existed: true, hasDraft: true` → 弹**轻量选择层**(用现有 setState + inline 模态):
    - 继续上次:`router.push('/quiz/${id}')`,答题页会读到 draft 自动恢复
    - 重新开始:`DELETE /api/results?id=<draftId>` + 清空 `localStorage.quiz_progress_${id}` + `router.push('/quiz/${id}')`
    - 查看已有(若有 submitted):跳到 ResultCard(沿用现有路由)
  - `existed: true, hasDraft: false, hasSubmitted: true` → 弹"该题库已有 X 条完成记录"提示:
    - 重新挑战:不做 delete,直接 `router.push('/quiz/${id}')`,后端会自动 create 新 draft
    - 查看记录:跳到 ResultCard

### 5.3 `src/components/Sidebar.tsx`

`handleSidebarFileChange` 同 5.2 的逻辑;模态用 inline 弹层(保持侧边栏风格一致)。

### 5.4 `src/app/quiz/[id]/page.tsx`

**新增 useEffect:加载现有 draft / 恢复默认值**

```ts
useEffect(() => {
  if (!quiz || !token) return;
  fetch(`/api/results?quizId=${quiz.id}`, { headers: { Authorization: ... } })
    .then(r => r.json())
    .then(({ results }) => {
      // 取最新一条 submitted(优先),再考虑 draft
      const latest = results?.[0];
      if (!latest) return;
      // 把 results 解析为 answers
      const restored: Record<string, string> = {};
      for (const item of latest.results) restored[item.questionId] = item.userAnswer;
      setAnswers(restored);
      // 名称/分类预填
      if (latest.name) setDraftName(latest.name);
      if (quiz.defaultName) setQuizName(quiz.defaultName);
      // 分类映射
      if (quiz.defaultCategoryId) setSelectedCategoryId(quiz.defaultCategoryId);
    });
}, [quiz, token]);
```

> **注意**:`quiz` 对象来自 `/api/quizzes/[id]`,需确认响应中包含 `defaultName` / `defaultCategoryId` 字段(已在 prisma select all 范围内,默认会返回)。

**`handleSaveDraft` 改动**:
- 若 `quizName.trim()` 和 `selectedCategoryId` 都**已经有值**(从默认值/draft 恢复),直接调 `confirmAction()` 跳过对话框
- 否则保留原"弹对话框"流程(给首次使用的用户)

**`handleSubmit` 改动**:同上

**`confirmAction` 改动**:
- POST body 增加 `defaultName: quizName.trim() || draftName` 和 `defaultCategoryId: selectedCategoryId`
- 提交成功后 `setDraftName(data.result.name)`(保持原行为)

**Quiz 详情页响应**:
- 当前 `GET /api/quizzes/[id]` 返回 `quiz` 全字段,`defaultName` / `defaultCategoryId` 自动包含。无需改 API。

### 5.5 `src/lib/storage.ts` (暂存兼容)

- **保留** `localStorage.quiz_progress_${quiz.id}` 作为本地缓存
- 权威数据来源改为 `QuizResult.results` 字段
- 现有"清空草稿"按钮:增加"同步删除对应 draft"动作(`DELETE /api/results?id=<draftId>`)

---

## 6. 数据流图

### 6.1 上传(新文件)

```
UploadForm.handleParse
  ├─ sha256Hex(preview) → fileKey
  ├─ POST /api/quizzes { title, questions, fileKey }
  │    └─ server: findFirst(userId, fileKey) → null
  │       └─ create Quiz { ..., fileKey, defaultName: title, defaultCategoryId: null }
  ├─ existed=false → router.push(/quiz/${id})
  └─ QuizPage 加载:无现有结果 → answers = {}
```

### 6.2 上传(同文件,无 draft / submitted)

```
UploadForm.handleParse
  ├─ sha256Hex(preview) → fileKey
  ├─ POST /api/quizzes { fileKey }
  │    └─ server: findFirst → 命中
  │       └─ hasDraft=false, hasSubmitted=false
  │       └─ 返回 { existed: true, hasDraft: false, hasSubmitted: false }
  ├─ 直接 router.push(/quiz/${id})  (复用现有 Quiz,questions 不更新)
  └─ QuizPage 加载:无 draft → answers = {} (空题库)
```

### 6.3 上传(同文件,已有 draft)

```
UploadForm.handleParse
  ├─ sha256Hex(preview) → fileKey
  ├─ POST /api/quizzes { fileKey }
  │    └─ server: 命中 + hasDraft=true
  ├─ 弹轻量选择层 (继续 / 重新开始 / 查看)
  └─ 用户选继续 → router.push(/quiz/${id})
        └─ QuizPage useEffect: fetch /api/results → 找到 draft
           └─ 恢复 answers,预填 quizName/defaultCategoryId
           └─ 用户继续答题 → 点提交:
              └─ handleSubmit: 有默认值 → 跳过弹窗 → confirmAction
                 └─ POST /api/results { status: 'submitted', defaultName, defaultCategoryId }
                    └─ server: findFirst draft → update({ status: 'submitted' })
                       └─ 同一行 id 升级
```

### 6.4 暂存(draft 生命周期)

```
QuizPage 加载
  └─ 无 draft → 空白开始

用户点"暂存进度"
  └─ quizName/categoryId 已有值? → 跳过弹窗 → confirmAction
  └─ 无 → 弹对话框 → 用户输入 → confirmAction
  └─ POST /api/results { status: 'draft', defaultName, defaultCategoryId }
     └─ server: findFirst draft → null → create new draft
        └─ 同步 UPDATE Quiz.defaultName/defaultCategoryId

用户再次点"暂存进度"
  └─ POST /api/results { status: 'draft', defaultName: ..., defaultCategoryId: ... }
     └─ server: findFirst draft → 命中 → update 同一行
```

---

## 7. 兼容性 / 迁移

| 场景 | 行为 |
|------|------|
| 旧 Quiz(无 fileKey) | 视为无指纹,API 不报错;上传时仍 create 新行(不参与去重) |
| 旧 QuizResult | 行为不变(API 保持后向兼容) |
| 旧 Quiz + 新上传同内容 | 旧 Quiz 不被命中,创建新 Quiz 走新流程;两份 Quiz 并存(用户可手动删旧) |
| localStorage 旧 progress | 仍存在 `quiz_progress_${id}`;权威数据改为 QuizResult;本地缓存与云端不一致时以云端为准 |
| 旧 submitted + 新上传同内容 | 触发"已有完成记录"提示,用户选"重新挑战"则直接跳答题页(后端 create 新 draft) |
| 旧 draft + 新上传同内容 | 触发"继续 / 重新开始 / 查看"三选一弹层 |

**数据库迁移**:
- 跑 `npx prisma migrate dev --name add_quiz_filekey` 生成 migration
- 旧数据 `fileKey = null`,不破坏既有数据

---

## 8. 错误处理

| 错误场景 | 处理 |
|------|------|
| 浏览器不支持 SubtleCrypto | `sha256Hex` 抛 `UnsupportedError`,UI 弹"请使用现代浏览器";不影响主流程,fallback 到不上传 fileKey |
| `fileKey` 冲突(理论不应发生) | `@@unique` 触发 → server 500 → 前端弹通用错误 |
| POST `/api/quizzes` 失败 | 维持原 `setError(data.error)` 弹错 |
| POST `/api/results` 失败 | 维持原 catch log + toast |
| 轻量选择层中"重新开始"时 delete 失败 | toast 提示,但不阻止跳转(用户可手动删) |
| Quiz 详情未带 `defaultName` / `defaultCategoryId` | 视为 null(默认值缺失),不影响 |

---

## 9. 测试要点

- [ ] 单元:`sha256Hex('abc')` 等于已知常量
- [ ] API:同 `fileKey` 第二次 POST /api/quizzes → `existed: true`
- [ ] API:同 quizId 多次 POST /api/results status=draft → 仅 1 行
- [ ] API:同 quizId 已有 draft 时 POST /api/results status=submitted → 该行 status 变 submitted
- [ ] API:同 quizId 无 draft 时 POST /api/results status=submitted → create 新行
- [ ] API:POST /api/results 同步 defaultName/defaultCategoryId → Quiz 行更新
- [ ] 前端:首次上传新文件 → 走 create,正常
- [ ] 前端:重传同文件无 draft → 静默跳转,无对话框
- [ ] 前端:重传同文件有 draft → 弹三选一,各自行为正确
- [ ] 前端:重传同文件仅 submitted → 弹二选一,行为正确
- [ ] 前端:答题页有 draft 时 → 自动恢复 answers,跳过 save/submit 对话框
- [ ] 前端:draft 提交后 → 侧边栏该记录从「草稿」分类移到「最近」

---

## 10. 影响面汇总

| 文件 | 改动 |
|------|------|
| `prisma/schema.prisma` | +3 字段 + 1 复合唯一 + 1 索引 |
| `prisma/migrations/*` | 自动生成 |
| `src/lib/hash.ts` | 新增 |
| `src/app/api/quizzes/route.ts` | POST 增加 fileKey 复用分支 |
| `src/app/api/results/route.ts` | POST submitted 路径调整 + 默认值回写 |
| `src/components/UploadForm.tsx` | sha256 + existed 分支处理 + 选择层弹窗 |
| `src/components/Sidebar.tsx` | 同上(侧边栏上传路径) |
| `src/app/quiz/[id]/page.tsx` | 加载 draft + 跳过对话框 + 默认值回传 |

---

## 11. 不在本次范围

- 题目内容变更后的 progress 迁移(题目改了,旧 progress 答案 ID 不匹配,留作后续)
- 同 fileKey 多 attempt 并存模式(用户未要求)
- 编辑已 submitted 记录并重新提交(超出"草稿变完成"语义)
- 全局"按 fileKey 去重"的批量重建工具

---

## 12. 验收

实现完成后需逐一验证:
- [ ] 新文件上传 → 走 create 路径
- [ ] 同文件重传无 draft → 静默跳转,无对话框
- [ ] 同文件重传有 draft → 三选一弹窗出现
- [ ] 继续 draft → 答题页答案/名称/分类自动恢复
- [ ] 提交后 → 侧边栏记录从草稿变最近
- [ ] 改名/换分类保存 → Quiz.defaultName/defaultCategoryId 同步
- [ ] 第二次保存同 draft → 不创建新行
- [ ] prisma migration 跑通,旧数据 `fileKey=null` 不报错
- [ ] TypeScript 编译通过
