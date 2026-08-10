# Welcome 引导页设计文档

## 概述

为新用户注册后的首次访问设计一个产品引导介绍页（`/welcome`），以单页滚动故事形式展示产品核心功能亮点，帮助新用户快速了解产品价值并建立使用信心。

## 设计目标

- **产品介绍为主（70%）**：展示 AI 解析、追问、报告、复习、数据隔离五大亮点
- **操作指引为辅（30%）**：每个功能附简要操作步骤，降低上手门槛
- **沉浸式体验**：单页滚动 + 入场动画，类似 Apple 产品介绍页风格
- **非强制**：用户可跳过，可随时从侧边栏/设置回看

---

## 用户流程

```
注册成功 → /register/setup → /welcome → /
                                │
                                ├─ 点「跳过」→ /（标记已读）
                                ├─ 点「开始使用」→ /（标记已读）
                                └─ 侧边栏/设置 → /welcome（回看，不检查标记）
```

### 触发时机

- **首次进入**：`/register/setup` 的 `handleSubmit` 和 `handleSkip` 完成后跳转至 `/welcome`
- **回看**：侧边栏新增菜单项「✨ 产品介绍」、设置页新增入口行「查看产品介绍」

### 已读状态

- 使用 `localStorage` 键 `welcome_seen`，值为 `'1'` 表示已读
- 写入时机：用户点击「跳过」或「开始使用」
- 回看模式：不检查该标记，允许重复访问

---

## 页面结构

页面路径：`src/app/welcome/page.tsx`

### Section 概览

| # | Section | 高度 | 核心信息 |
|---|---------|------|---------|
| 1 | Hero 主视觉 | 100vh | 产品名 + 价值主张「让每一次练习都更有价值」+ 向下滚动提示 |
| 2 | AI 智能解析题目 | ~80vh | 支持多格式上传，自动识别题型和答案，附 3 步操作指引 |
| 3 | AI 追问 | ~80vh | 答题中随时追问获取即时解释，附 2 步操作指引 |
| 4 | 智能报告生成 | ~80vh | 提交后自动生成多维分析报告，标注薄弱方向 |
| 5 | 针对性复习 | ~80vh | 基于报告弱项精准推荐复习内容 |
| 6 | 用户数据隔离 | ~80vh | 独立账号，数据互不可见，强调隐私安全 |
| 7 | CTA 底部 | ~60vh | 「开始使用 Homework AI」+ 积分到账提示 |

### 各 Section 内容详情

#### Section 1: Hero

- 背景：深色渐变 `slate-900 → slate-800`
- 浮动几何图形缓慢漂移（纯 CSS @keyframes）
- 标题：`Fraunces` serif，56px，渐变文字 `sky-400 → emerald-400`
- 副标题：「让每一次练习都更有价值」
- 底部：向下箭头呼吸动画

#### Section 2: AI 智能解析题目

- Badge 标签：`🤖 AI 智能解析`
- 标题：「告别手动录入，一键智能解析」
- 描述：支持 Markdown、PDF、Word、图片等多种格式上传，AI 自动识别题目类型、选项和答案，秒级生成结构化试卷
- 操作步骤：① 上传题目文件 → ② 选择 AI 解析模式 → ③ 获得结构化试卷
- 示意图：文件拖拽区 → 题目卡片变换（纯 CSS 模拟）

#### Section 3: AI 追问

- Badge 标签：`💬 AI 追问`
- 标题：「不懂就问，即时答疑」
- 描述：答题过程中对任何题目有疑问，随时点击追问按钮，AI 会根据题目上下文给出针对性解答，帮你真正理解知识点
- 操作步骤：① 点击题目旁追问按钮 → ② 输入你的问题 → ③ 获取 AI 详细解答
- 示意图：对话气泡样式（用户问 → AI 答）

#### Section 4: 智能报告生成

- Badge 标签：`📊 智能报告`
- 标题：「答题结果一目了然」
- 描述：提交答案后自动生成多维度分析报告，涵盖正确率、各题型表现、知识点掌握度，精准定位你的薄弱方向
- 操作步骤：① 完成答题 → ② 查看自动生成的分析报告 → ③ 了解各维度得分
- 示意图：简化柱状图/雷达图（纯 CSS）

#### Section 5: 针对性复习

- Badge 标签：`🎯 针对性复习`
- 标题：「精准复习，高效提升」
- 描述：报告会标注你的薄弱知识点，提供针对性的复习建议，不再盲目刷题，每一次练习都有明确方向
- 与 Section 4 形成"诊断 → 治疗"叙事链

#### Section 6: 用户数据隔离

- Badge 标签：`🔒 数据隔离`
- 标题：「你的数据，只属于你」
- 描述：每位用户拥有独立的数据空间，答题记录、报告、笔记互不可见，保障隐私与安全
- 示意图：用户头像 + 锁图标 + 数据分区

#### Section 7: CTA

- 主按钮：「开始使用 Homework AI」渐变按钮
- 辅助文字：积分已到账提示
- 点击后写入 `welcome_seen='1'`，跳转首页

---

## 组件架构

```
src/app/welcome/page.tsx          ← 页面主体，控制滚动 + 已读状态
src/components/WelcomeHero.tsx    ← Section 1: Hero（深色背景 + 浮动图形 + 标题）
src/components/WelcomeFeature.tsx ← Section 2-6: 可复用功能展示组件
src/components/WelcomeCTA.tsx     ← Section 7: CTA 底部
```

### WelcomeFeature Props

```ts
interface WelcomeFeatureProps {
  side: 'left' | 'right';    // 图文左右布局方向
  badgeColor: string;         // Badge 主题色（sky/violet/emerald/amber/rose/indigo）
  icon: string;               // Badge 图标（emoji）
  tag: string;                // Badge 文字
  title: string;              // 标题
  description: string;        // 功能描述
  steps?: string[];           // 操作步骤（可选）
  illustration: ReactNode;    // 示意图
}
```

---

## 滚动动画

### 实现方式

- `IntersectionObserver` 监听每个 Section
- Section 进入视口 40% 时触发入场动画
- 纯 CSS transition class toggling，复用项目已有的 `anim-stagger-*`

### 动画时间线

| 延迟 | 元素 | 效果 |
|------|------|------|
| 0ms | Badge 标签 | 淡入 + 上移 20px |
| 150ms | 标题 | 淡入 + 上移 20px |
| 300ms | 描述文字 | 淡入 + 上移 15px |
| 450ms | 操作步骤（如有） | 淡入 |
| 200ms | 示意图（另一侧） | 淡入 + 缩放 0.95→1 |

### Hero 区特殊动效

- 浮动几何图形：3-4 个半透明圆形/圆角方块，`@keyframes` 20s+ 缓慢漂移
- 标题：整行从下弹入（`translateY(40px) → 0`）
- 向下箭头：自定义呼吸 pulse

### 降级处理

- 浏览器不支持 `IntersectionObserver`：所有 Section 直接可见，跳过动画
- `prefers-reduced-motion`：禁用所有动画，元素直接显示

---

## 视觉风格

### 色彩

沿用项目 sky + emerald 渐变体系：

| 用途 | 配色 |
|------|------|
| Section 背景 | 交替：白 → `slate-50` → 白 → `sky-50/30` → 白 → `emerald-50/30` |
| Hero 背景 | `slate-900 → slate-800` 深色 |
| 强调文字 | `bg-gradient-to-r from-sky-400 to-emerald-400` |
| 按钮 | 渐变 `from-sky-400 to-emerald-400`，阴影 `shadow-lg shadow-emerald-200` |
| Badge | sky / violet / emerald / amber / rose / indigo 六色各一个 |

### 字体

| 层级 | 样式 |
|------|------|
| Hero 标题 | `Fraunces` serif italic，~56px，渐变文字 |
| Section 标题 | `Fraunces` serif italic，~36-40px，`text-slate-800` |
| 功能描述 | `Geist` sans，15px，`text-slate-500`，`leading-relaxed` |
| 操作步骤 | `Geist` sans，13px，`text-slate-400`，编号列表 |

### 示意图

纯 CSS/Tailwind 构建，不依赖外部图片：
- AI 解析：模拟文件拖拽区 → 题目卡片
- AI 追问：对话气泡
- 报告：CSS 柱状图（复用 `ReportBarChart` 风格）
- 数据隔离：图标 + 分区示意

---

## 状态管理

### localStorage 键

| 键 | 用途 | 写入时机 |
|----|------|---------|
| `welcome_seen` | 引导页已读标记 | 点击「跳过」或「开始使用」 |

### 边界情况

| 场景 | 处理 |
|------|------|
| 已登录老用户直接访问 `/welcome` | 允许进入（回看模式），不检查 `welcome_seen` |
| 未登录用户访问 `/welcome` | `redirect` 到 `/login` |
| 已看过用户从侧边栏再次进入 | 「跳过」按钮文案改为「返回首页」 |
| setup 页面跳过/完成后 | 改为跳转 `/welcome`（不再直接到 `/`） |
| 用户在 welcome 页刷新浏览器 | 保持在 welcome 页 |
| 移动端 | Section 上下堆叠（图在上文在下），字体缩放 |
| 游客用户 | 不触发 welcome（游客直接进 `/`，现有逻辑不变） |

---

## 改动范围

### 新建文件

| 文件 | 说明 |
|------|------|
| `src/app/welcome/page.tsx` | Welcome 页面主体 |
| `src/components/WelcomeHero.tsx` | Hero Section |
| `src/components/WelcomeFeature.tsx` | 可复用功能展示 Section |
| `src/components/WelcomeCTA.tsx` | 底部 CTA |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/app/register/setup/page.tsx` | `router.push('/')` → `router.push('/welcome')`（3 处：`handleSubmit` 1 处 + `handleSkip` 2 处） |
| `src/components/Sidebar.tsx` | 新增「✨ 产品介绍」菜单项 |
| `src/app/settings/page.tsx` | 新增「查看产品介绍」入口行 |

---

## 非功能需求

- **性能**：页面加载不引入额外 JS 库，动画纯 CSS + IntersectionObserver，首屏 < 100KB
- **可访问性**：支持 `prefers-reduced-motion`，Section 语义化 HTML（`<section>`），按钮有 accessible label
- **兼容性**：支持 Chrome/Firefox/Safari/Edge 近两个主要版本，移动端响应式
- **国际化**：当前仅中文，文案集中管理便于后续 i18n
