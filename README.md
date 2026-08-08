# HomeWork-AI

基于 Next.js 16 的智能在线答题系统，支持多种题型、AI 题目解析、AI 自动评分、追问和深度报告生成。

---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
  - [环境要求](#环境要求)
  - [本地开发](#本地开发)
  - [Docker 部署](#docker-部署)
- [项目结构](#项目结构)
- [功能详解](#功能详解)
  - [用户系统](#用户系统)
  - [题库与解析](#题库与解析)
  - [答题系统](#答题系统)
  - [AI 功能](#ai-功能)
  - [积分系统](#积分系统)
  - [笔记系统](#笔记系统)
  - [答题报告](#答题报告)
  - [管理后台](#管理后台)
- [支持的题型](#支持的题型)
- [AI 厂商配置](#ai-厂商配置)
- [API 路由](#api-路由)
- [测试](#测试)
- [环境变量](#环境变量)
- [用户指南](#用户指南)

---

## 功能概览

| 模块 | 功能 |
|------|------|
| 👤 用户系统 | 注册/登录、游客模式、密保找回密码、修改密码、修改用户名/职业 |
| 📚 题库管理 | 上传文件（PDF/Word/图片/Markdown）自动解析、本地解析 + AI 解析双通道、分类管理 |
| ✍️ 在线答题 | 7 种题型支持、限时答题、自动/手动评分、草稿暂存 |
| 🧠 AI 能力 | 题目智能解析、单题 AI 详解、AI 追问对话、面试题 AI 评分、综合报告生成 |
| 💰 积分系统 | 每日签到、积分流水、AI 功能扣积分、管理员充值/调整 |
| 📝 笔记系统 | 题目笔记、答案笔记、AI 输出笔记，支持按题库/题目/答题记录关联 |
| 📊 数据报告 | ECharts 图表、题型/难度分布分析、AI 综合评估与学习建议 |
| 🛡️ 管理后台 | 用户管理、题库管理、职业管理、积分管理、AI 厂商配置 |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | Next.js 16.2（App Router） |
| **UI** | React 19.2、Tailwind CSS 4 |
| **语言** | TypeScript 5 |
| **数据库** | MySQL 8 + Prisma ORM 5 |
| **认证** | JWT + bcryptjs |
| **图表** | ECharts 6 + echarts-for-react |
| **Markdown** | marked + highlight.js + KaTeX + Prism |
| **文件解析** | pdf-parse、mammoth (Word)、JSZip |
| **AI 集成** | OpenAI 兼容 API（支持多厂商切换）、流式 SSE |
| **测试** | Vitest 4 + @testing-library/react |
| **部署** | Docker + docker-compose |

---

## 快速开始

### 环境要求

- Node.js 20+
- MySQL 8.0+
- npm 10+

### 本地开发

```bash
# 1. 克隆项目
git clone <repo-url>
cd HomeWork-AI

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填写数据库连接、JWT 密钥等

# 4. 初始化数据库
npx prisma migrate deploy
npx prisma generate

# 5. 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 访问应用。

首次使用需要**初始化管理员账号**：访问 `/register/setup` 页面创建首个管理员用户。

### Docker 部署

```bash
# 使用 docker-compose 一键启动（含 MySQL）
docker-compose up -d

# 初始化数据库
docker-compose exec app npx prisma migrate deploy
```

---

## 项目结构

```
HomeWork-AI/
├── prisma/
│   ├── schema.prisma          # 数据库模型定义（14 个模型）
│   └── migrations/            # 数据库迁移文件
├── src/
│   ├── app/                   # Next.js App Router 页面 & API
│   │   ├── page.tsx           # 首页（题库列表）
│   │   ├── login/             # 登录页
│   │   ├── register/setup/    # 管理员初始化
│   │   ├── forgot-password/   # 密保找回密码
│   │   ├── banks/             # 我的题库
│   │   ├── upload/            # 上传题目
│   │   ├── quiz/[id]/         # 答题页面
│   │   ├── result/[id]/report/# 答题报告页面
│   │   ├── notes/             # 笔记页面
│   │   ├── credits/           # 积分中心
│   │   ├── admin/             # 管理后台
│   │   │   ├── dashboard/     # 数据大屏
│   │   │   ├── users/         # 用户管理
│   │   │   ├── quizzes/       # 题库管理（含新增/编辑）
│   │   │   ├── professions/   # 职业管理
│   │   │   ├── credits/       # 积分管理
│   │   │   └── ai/            # AI 厂商配置
│   │   └── api/               # API 路由（55+ 端点）
│   ├── components/            # React 组件（31 个）
│   ├── contexts/              # React Context（Auth、AdminAuth、Category 等）
│   ├── lib/                   # 业务逻辑库
│   │   ├── ai/                # AI 相关（解析、prompt、加密、限流、代理）
│   │   ├── credits/           # 积分相关（消耗计算、签到、报告）
│   │   └── extract/           # 文件提取（PDF/Word/图片）
│   └── types/                 # TypeScript 类型定义
├── tests/                     # 测试用例（32 个测试文件）
│   ├── ai/                    # AI 解析/加密/标准化/Prompt 测试
│   ├── api/                   # API 路由测试
│   ├── components/            # 组件测试
│   ├── credits/               # 积分系统测试
│   ├── extract/               # 文件提取测试
│   ├── lib/                   # 工具库测试（report、results-dedup、quiz-to-markdown 等）
│   └── fixtures/              # 测试固件
├── docs/user-guide/           # 用户指南（10 篇）
├── docker-compose.yml         # Docker 编排
├── Dockerfile                 # 多阶段构建
└── vitest.config.ts           # 测试配置
```

---

## 功能详解

### 用户系统

- **注册/登录**：用户名 + 密码，支持密保问题（用于找回密码）
- **游客模式**：一键游客登录，可浏览题库和答题，但 AI 功能受限（点击时弹窗提示需注册）
- **密码找回**：通过预设的密保问题验证身份后重置密码
- **修改密码**：登录后通过旧密码验证修改密码（`PUT /api/user/password`）
- **修改个人信息**：修改用户名、职业（`PATCH /api/user/profile`）
- **职业选择**：用户可选择职业，用于管理后台数据大屏的职业统计
- **权限控制**：普通用户 / 管理员 双角色体系

### 题库与解析

**上传方式**：
- 📄 粘贴 Markdown 文本
- 📎 上传 `.md` / `.txt` 文件
- 📕 上传 Word (`.docx`) 文件
- 📷 上传图片（需配置视觉模型）
- 📑 上传 PDF 文件

**双通道解析**：

| 特性 | 本地解析 | AI 解析 |
|------|---------|--------|
| 速度 | 即时 | 10-30 秒 |
| 成本 | 免费 | 免费（不限积分） |
| 格式规范题 | ✅ 优秀 | ✅ 优秀 |
| 代码题 | ❌ 较弱 | ✅ 精准 |
| 复杂格式 | ❌ 有限 | ✅ 智能 |
| 图片 OCR | ❌ 不支持 | ✅ 支持 |

- **文件去重**：基于 SHA-256 指纹，同一文件不会重复上传
- **分类系统**：支持系统预设分类 + 用户自定义分类（服务端存储，跨设备同步）
- **批量导出**：支持选中多个题库导出为 Markdown 文件

### 答题系统

支持 7 种题型，详见 [支持的题型](#支持的题型)。

- **限时答题**：题库可设置答题时长，倒计时结束后自动提交
- **草稿暂存**：支持中途保存草稿，稍后继续作答
- **自动判分**：客观题（单选/多选/判断/填空）自动判定对错
- **AI 评分**：主观题（面试题/简答题）AI 自动评分（0-100 分 + 详细反馈 + 改进建议）
- **人工批阅**：管理员可手动评分和写评语（`POST /api/admin/results/[id]/grade`）
- **去重保护**：使用 ref 同步锁防止重复提交，30 秒内同 quiz 去重

### AI 功能

所有 AI 功能基于 OpenAI 兼容 API，支持多厂商切换（DeepSeek、豆包、通义千问、智谱、自定义）。

**功能列表**：

| 功能 | 消耗积分 | 说明 |
|------|---------|------|
| 🧠 AI 题目解析 | 免费 | 流式实时进度展示，支持 JSON 容错修复 |
| 💡 AI 解析此题 | 10–30 积分/次 | 按难度计费：简单 10、中等 15、困难 30（默认 15），支持缓存复用 |
| 💬 AI 追问 | 免费 | 基于上下文的追问对话，支持多轮，SSE 流式响应 |
| 📊 AI 评分 | 免费 | 面试题/简答题智能评分（0-100）+ 反馈，一次性批量评分 |
| 📋 AI 生成报告 | 5 积分/次 | 综合答题分析报告，支持缓存复用（同 result 不重复扣费） |
| 🎯 AI 面试分析 | 100 积分/次 | 深度面试分析报告（综合能力评分、掌握/薄弱领域、改进计划） |

**AI 技术特性**：
- **流式输出**：SSE (Server-Sent Events) 实时推送 AI 生成内容
- **重试机制**：自动重试最多 2 次，带递增退避（500ms / 1000ms）
- **JSON 容错**：括号深度匹配算法处理 AI 尾部附加文字；截断 JSON 修复处理 token 上限
- **API Key 加密**：AES-256-GCM 加密存储 AI 厂商 API Key
- **代理支持**：支持 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量
- **限流保护**：AI 解析接口限流（每分钟 10 次 per user）
- **游客拦截**：客户端（弹窗提示）+ 服务端（403 响应）纵深防御
- **缓存复用**：AI 解析结果按 (userId, questionId) 缓存命中免扣费；AI 报告按 resultId 缓存
- **失败回滚**：AI 调用失败自动退还积分，写 refund 流水

### 积分系统

| 来源 | 积分 | 说明 |
|------|------|------|
| 每日签到 | +30 | 每天可签到一次，北京时间日期判断 |
| 管理员充值 | 自定义 | 后台手动调整（1 ~ 100,000） |

| 消耗 | 积分 | 说明 |
|------|------|------|
| AI 单题解析 | -10 ~ -30 | 按难度计费，缓存命中免费 |
| AI 生成报告 | -5 | 每次综合报告，同 result 缓存复用 |
| AI 面试分析 | -100 | 每次深度面试分析报告 |

> **注意**：AI 题目解析、AI 追问、AI 评分目前不消耗积分。用户注册初始积分为 0。

- **积分流水**：每笔积分变动都有详细记录（原因、变动额、余额、时间），支持按原因分类查询
- **失败回滚**：AI 调用失败或返回空内容时，已扣积分自动退回，写入 refund 流水
- **管理后台**：可查看所有用户积分汇总、手动调整/重置、导出流水数据

### 笔记系统

- 支持三种笔记类型：题目笔记、答案笔记、AI 输出笔记
- 笔记来源标记：手动 / AI 解析 / 参考答案 / AI 报告
- 支持 Markdown 编辑
- 按题库、题目、答题记录多维度关联

### 答题报告

- **总览卡片**：得分、正确率、用时
- **题型分布图**：ECharts 柱状图展示各题型得分率
- **难度分布图**：简单/中等/困难 各难度正确率
- **AI 综合分析**：
  - 知识点薄弱点识别
  - 难度递进建议
  - 推荐学习路径
- **缓存复用**：同一答题记录不重复生成报告

### 管理后台

| 页面 | 功能 |
|------|------|
| 数据大屏 | 用户数、题库数、答题次数、职业分布统计 |
| 用户管理 | 查看/停用/启用用户、重置密码、积分调整 |
| 题库管理 | 官方题库维护、新增/编辑题库、分配职业 |
| 职业管理 | 职业增删改查 |
| AI 配置 | 多 AI 厂商管理、激活切换、连通性测试、模型列表拉取 |
| 积分管理 | 积分流水查看、用户积分汇总、手动调整/重置、数据导出 |
| 人工批阅 | 通过 API 对答题记录进行手动评分和写评语 |

---

## 支持的题型

| 题型 | 类型标识 | 判分方式 | 说明 |
|------|---------|---------|------|
| 🔘 单选题 | `single` | 自动判分 | 4 个选项，唯一正确答案 |
| ☑️ 多选题 | `multiple` | 自动判分 | 多个正确选项 |
| ✅ 判断题 | `boolean` | 自动判分 | 对/错二选一 |
| ✏️ 填空题 | `fill` | 自动判分 | 支持多个空格 |
| 📝 简答题 | `essay` | AI 评分 / 人工批阅 | 主观文字回答，有参考答案 |
| 💻 代码题 | `code` | AI 评分 / 人工批阅 | 含代码块、语言、输入/输出示例 |
| 🎤 面试题 | `interview` | AI 评分 / 人工批阅 | 含参考答案要点和可选子问题列表 |

---

## AI 厂商配置

系统支持接入任意 OpenAI 兼容 API 的大语言模型服务商。

### 步骤

1. **设置加密密钥**：在 `.env` 中配置 `AI_KEY_ENCRYPTION_SECRET`（≥ 32 字符）
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

2. **添加厂商**：管理员后台 → 「AI 配置」→「新增厂商」
   - 填写厂商名称、Base URL、API Key、模型名称
   - 视觉模型（可选）：用于图片 OCR 解析
   - 勾选"支持图片识别"（如厂商有视觉模型）

3. **设为激活**：点击"设为激活"，同一时间只有一个激活厂商

4. **测试连通性**：点击"测试"按钮验证 API Key 和模型是否正常

### 预设厂商

系统内置了以下厂商的 Base URL 预设：

| 厂商 | 默认 Base URL |
|------|--------------|
| DeepSeek | `https://api.deepseek.com/v1` |
| 豆包 (Doubao) | `https://ark.cn-beijing.volces.com/api/v3` |
| 通义千问 (Qwen) | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 智谱 (Zhipu) | `https://open.bigmodel.cn/api/paas/v4` |
| 自定义 | 用户自行填写 |

---

## API 路由

### 认证 (`/api/auth/`)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 用户注册 |
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/guest` | POST | 游客登录 |
| `/api/auth/me` | GET | 获取当前用户信息 |
| `/api/auth/logout` | POST | 退出登录 |
| `/api/auth/forgot-password` | POST | 验证密保问题重置密码 |
| `/api/auth/check-username` | POST | 检查用户名是否可用 |
| `/api/auth/setup` | POST | 初始化管理员 |

### AI 功能 (`/api/ai/`)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/ai/parse` | POST | AI 解析题目（非流式） |
| `/api/ai/parse-stream` | POST | AI 解析题目（SSE 流式，含实时字符进度） |
| `/api/ai/explain` | POST | AI 单题解析（按难度扣积分，支持缓存） |
| `/api/ai/followup` | POST | AI 追问（SSE 流式，支持多轮对话） |
| `/api/ai/report` | POST | AI 生成综合报告（扣 5 积分，缓存复用） |
| `/api/ai/interview-report` | POST | AI 面试深度分析报告（扣 100 积分） |
| `/api/ai/grade-interview` | POST | AI 面试题/简答题批量评分 |
| `/api/ai/available` | GET | 检查是否有激活的 AI 厂商 |

### 题库 (`/api/quizzes/`)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/quizzes` | GET/POST | 题库列表 / 创建 |
| `/api/quizzes/[id]` | GET/PUT/DELETE | 题库详情 / 更新 / 删除 |
| `/api/quizzes/batch` | POST | 批量导出 |

### 用户 (`/api/user/`)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/user/credits` | GET | 当前积分余额 |
| `/api/user/credits/history` | GET | 积分流水（分页，按原因筛选） |
| `/api/user/checkin` | POST | 每日签到（+30 积分） |
| `/api/user/topup` | POST | 积分充值 |
| `/api/user/profile` | PATCH | 修改用户名/职业 |
| `/api/user/password` | PUT | 修改密码（需旧密码验证） |
| `/api/user/profession` | PUT | 更新职业 |
| `/api/user/quiz-categories` | GET/POST | 自定义分类列表/新增 |
| `/api/user/quiz-categories/[id]` | PUT/DELETE | 更新/删除自定义分类 |

### 其他

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/upload` | POST | 文件上传 |
| `/api/results` | GET/POST/DELETE | 答题结果列表 / 提交 / 删除 |
| `/api/notes` | GET/POST | 笔记列表 / 创建 |
| `/api/notes/[id]` | GET/PUT/DELETE | 笔记详情 / 更新 / 删除 |
| `/api/professions` | GET | 职业列表 |
| `/api/quiz-categories/presets` | GET | 系统预设分类 |

### 管理后台 (`/api/admin/`)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/admin/auth/login` | POST | 管理员登录 |
| `/api/admin/auth/me` | GET | 管理员信息 |
| `/api/admin/users` | GET | 用户列表 |
| `/api/admin/users/[id]/disable` | POST | 停用/启用用户 |
| `/api/admin/users/[id]/reset-password` | POST | 重置用户密码 |
| `/api/admin/quizzes` | GET | 题库管理列表 |
| `/api/admin/quizzes/[id]` | PUT/DELETE | 题库编辑/删除 |
| `/api/admin/quizzes/[id]/assignments` | POST | 分配题库到职业 |
| `/api/admin/professions` | GET/POST | 职业列表/新增 |
| `/api/admin/professions/[id]` | PUT/DELETE | 职业编辑/删除 |
| `/api/admin/ai/providers` | GET/POST | AI 厂商列表/新增 |
| `/api/admin/ai/providers/[id]` | PUT/DELETE | 厂商编辑/删除 |
| `/api/admin/ai/active` | PUT | 切换激活厂商 |
| `/api/admin/ai/fetch-models` | POST | 拉取厂商模型列表 |
| `/api/admin/ai/providers/[id]/test` | POST | 测试厂商连通性 |
| `/api/admin/credits/summary` | GET | 积分汇总统计 |
| `/api/admin/credits/users` | GET | 用户积分列表 |
| `/api/admin/credits/user/[id]` | GET | 用户积分详情与流水 |
| `/api/admin/credits/user/[id]/adjust` | POST | 手动调整积分 |
| `/api/admin/credits/user/[id]/reset` | POST | 重置用户积分 |
| `/api/admin/credits/ledger` | GET | 全量积分流水 |
| `/api/admin/credits/export` | GET | 导出积分数据 |
| `/api/admin/results/[id]/grade` | POST | 人工批阅（评分+评语） |
| `/api/admin/stats` | GET | 数据大屏统计 |

---

## 测试

```bash
# 运行全部测试
npm test

# 运行指定测试文件
npx vitest run tests/ai/parser.test.ts

# 监视模式
npm run test:watch

# 生成覆盖率报告
npx vitest run --coverage
```

测试覆盖范围：
- **AI 模块**（9 个）：解析器、加密、标准化、Prompt、限流、流式解析、providers、presets、available
- **API 路由**（8 个）：追问、报告、评分、签到、积分、结果 CRUD、人工批阅
- **业务逻辑**（7 个）：积分消耗计算、积分扣费、报告计算器、去重、Markdown 导出、signing、proxy
- **组件**（2 个）：答题卡辅助函数、Markdown 渲染
- **文件提取**（4 个）：PDF、Word、图片、调度器
- **基础**（1 个）：sanity 测试

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | MySQL 连接字符串 |
| `JWT_SECRET` | ✅ | JWT 签名密钥 |
| `ADMIN_USERNAME` | — | 系统初始化管理员用户名（仅首次 setup 使用） |
| `ADMIN_PASSWORD` | — | 系统初始化管理员密码（仅首次 setup 使用） |
| `AI_KEY_ENCRYPTION_SECRET` | ✅ | AI API Key 加密密钥（≥ 32 字符） |
| `HTTP_PROXY` | — | HTTP 代理（AI API 调用走代理） |
| `HTTPS_PROXY` | — | HTTPS 代理 |
| `TZ` | — | 时区设置（默认 `Asia/Shanghai`） |

---

## 用户指南

详细的功能使用说明请参阅 [用户指南文档](docs/user-guide/)：

1. [新增题库](docs/user-guide/01-新增题库.md)
2. [答题](docs/user-guide/02-答题.md)
3. [题库管理](docs/user-guide/03-题库管理.md)
4. [AI 单题解析](docs/user-guide/04-AI单题解析.md)
5. [AI 追问](docs/user-guide/05-AI追问.md)
6. [答题报告](docs/user-guide/06-答题报告.md)
7. [面试题 AI 评分与深度报告](docs/user-guide/07-面试题AI评分与深度报告.md)
8. [笔记](docs/user-guide/08-笔记.md)
9. [积分中心](docs/user-guide/09-积分中心.md)
10. [登录注册与找回密码](docs/user-guide/10-登录注册与找回密码.md)

---

## License

Private
