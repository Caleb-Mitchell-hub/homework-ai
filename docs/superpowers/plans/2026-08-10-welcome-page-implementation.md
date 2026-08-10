# Welcome 引导页实现计划

> **用于 agentic worker：** 必须使用子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行此计划。步骤使用 checkbox（`- [ ]`）语法进行跟踪。

**目标：** 构建 `/welcome` 产品引导页，以单页滚动故事形式向新用户展示 AI 解析、追问、报告、复习、数据隔离五大核心功能。

**架构：** 新建 `/welcome` 路由页面，由 3 个组件组成（WelcomeHero、WelcomeFeature、WelcomeCTA），使用 IntersectionObserver 驱动滚动入场动画，通过 `localStorage.welcome_seen` 管理已读状态。修改 `/register/setup` 跳转目标、侧边栏和设置页增加回看入口。

**技术栈：** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、IntersectionObserver API

## 全局约束

- 页面加载不引入额外 JS 库，动画纯 CSS + IntersectionObserver
- 支持 `prefers-reduced-motion` 媒体查询，匹配时禁用所有动画
- 所有文案使用中文
- 样式沿用项目 sky + emerald 渐变体系
- Section 使用语义化 `<section>` 标签
- 按钮提供 accessible label（`aria-label`）

---

### 任务 1：新建 WelcomeFeature 可复用组件

**文件：**
- 创建：`src/components/WelcomeFeature.tsx`

**接口：**
- 产出：`WelcomeFeature` 组件，接收 `WelcomeFeatureProps` 作为 props
- 供任务 3（welcome/page.tsx）使用

```ts
interface WelcomeFeatureProps {
  side: 'left' | 'right';
  badgeColor: string;
  icon: string;
  tag: string;
  title: string;
  description: string;
  steps?: string[];
  illustration: ReactNode;
}
```

- [ ] **步骤 1：编写组件代码**

```tsx
'use client';

import { ReactNode } from 'react';

interface WelcomeFeatureProps {
  side: 'left' | 'right';
  badgeColor: string;
  icon: string;
  tag: string;
  title: string;
  description: string;
  steps?: string[];
  illustration: ReactNode;
}

/** 单个功能展示 Section —— 左右图文布局 + 入场动画由父级 IntersectionObserver 控制 */
export default function WelcomeFeature({
  side,
  badgeColor,
  icon,
  tag,
  title,
  description,
  steps,
  illustration,
}: WelcomeFeatureProps) {
  const badgeBgMap: Record<string, string> = {
    sky: 'bg-sky-100 text-sky-700',
    violet: 'bg-violet-100 text-violet-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  };

  const badgeClass = badgeBgMap[badgeColor] || badgeBgMap.sky;

  const textBlock = (
    <div className="flex flex-col justify-center">
      {/* Badge */}
      <span className={`inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-[11px] font-medium mb-4 ${badgeClass}`}>
        <span>{icon}</span>
        <span>{tag}</span>
      </span>

      {/* 标题 */}
      <h2
        className="text-[32px] leading-[1.15] text-slate-800 mb-4 tracking-[-0.01em]"
        style={{ fontFamily: "var(--font-serif), 'Songti SC', serif", fontStyle: 'italic', fontWeight: 500 }}
      >
        {title}
      </h2>

      {/* 描述 */}
      <p className="text-[15px] text-slate-500 leading-relaxed mb-5 max-w-lg">
        {description}
      </p>

      {/* 操作步骤 */}
      {steps && steps.length > 0 && (
        <ol className="space-y-1.5">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-slate-400">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[10px] flex items-center justify-center font-medium mt-0.5">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const illusBlock = (
    <div className="flex items-center justify-center">
      {illustration}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center max-w-5xl mx-auto px-6 py-16 lg:py-24">
      {side === 'left' ? (
        <>
          {textBlock}
          {illusBlock}
        </>
      ) : (
        <>
          {illusBlock}
          {textBlock}
        </>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty src/components/WelcomeFeature.tsx
```

预期：无类型错误（如果 tsc 报路径别名问题，改用 `npx tsc --noEmit` 检查全项目）

- [ ] **步骤 3：提交**

```bash
git add src/components/WelcomeFeature.tsx
git commit -m "feat: 新建 WelcomeFeature 可复用功能展示组件"
```

---

### 任务 2：新建 WelcomeHero 组件

**文件：**
- 创建：`src/components/WelcomeHero.tsx`

**接口：**
- 产出：`WelcomeHero` 组件，无 props
- 供任务 3（welcome/page.tsx）使用

- [ ] **步骤 1：编写组件代码**

```tsx
'use client';

import { useEffect, useState } from 'react';

/** 浮动几何图形 —— 纯 CSS 大循环漂移动画 */
function FloatingShape({
  className,
  style,
}: {
  className: string;
  style: React.CSSProperties;
}) {
  return (
    <div
      className={`absolute rounded-full opacity-20 ${className}`}
      style={{
        ...style,
        animationName: 'welcome-float',
        animationDuration: '22s',
        animationTimingFunction: 'ease-in-out',
        animationIterationCount: 'infinite',
        animationDelay: style.animationDelay,
      }}
    />
  );
}

/** Hero Section：深色背景 + 浮动几何图形 + 产品标题 + 向下滚动提示 */
export default function WelcomeHero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 延迟触发标题入场动画
    const t = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* 浮动几何图形 */}
      <FloatingShape
        className="w-72 h-72 bg-sky-400"
        style={{ top: '15%', left: '-5%', animationDelay: '0s' }}
      />
      <FloatingShape
        className="w-56 h-56 bg-emerald-400"
        style={{ top: '60%', right: '-3%', animationDelay: '-7s' }}
      />
      <FloatingShape
        className="w-40 h-40 bg-violet-400 rounded-3xl"
        style={{ top: '30%', right: '15%', animationDelay: '-14s' }}
      />
      <FloatingShape
        className="w-32 h-32 bg-amber-400 rounded-2xl"
        style={{ bottom: '20%', left: '10%', animationDelay: '-18s' }}
      />

      {/* 标题区 */}
      <div
        className={`relative z-10 text-center px-6 transition-all duration-700 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
        }`}
      >
        <h1
          className="text-[48px] sm:text-[56px] leading-[1.1] mb-4 tracking-[-0.02em]"
          style={{ fontFamily: "var(--font-serif), 'Songti SC', serif", fontStyle: 'italic', fontWeight: 500 }}
        >
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-emerald-400">
            Homework AI
          </span>
        </h1>
        <p className="text-lg sm:text-xl text-slate-300 font-light tracking-wide">
          让每一次练习都更有价值
        </p>
      </div>

      {/* 向下箭头 */}
      <div
        className={`absolute bottom-10 left-1/2 -translate-x-1/2 transition-all duration-700 delay-500 ${
          mounted ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-[11px] text-slate-500 tracking-wider">向下滚动了解</span>
          <svg
            className="w-5 h-5 text-slate-400 animate-bounce"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* 底部渐变过渡到下一个 Section */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-white pointer-events-none" />
    </section>
  );
}
```

- [ ] **步骤 2：在 globals.css 中添加浮动关键帧动画**

修改文件：`src/app/globals.css`

在文件末尾追加：

```css
/* ─────────────────────────────────────────────
   Welcome 页面浮动几何图形动画
   ───────────────────────────────────────────── */

@keyframes welcome-float {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(8px, -12px) scale(1.04);
  }
  50% {
    transform: translate(-6px, 6px) scale(0.97);
  }
  75% {
    transform: translate(-10px, -4px) scale(1.02);
  }
}

@media (prefers-reduced-motion: reduce) {
  @keyframes welcome-float {
    0%, 100% { transform: none; }
  }
}
```

- [ ] **步骤 3：验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty src/components/WelcomeHero.tsx
```

预期：无类型错误。

- [ ] **步骤 4：提交**

```bash
git add src/components/WelcomeHero.tsx src/app/globals.css
git commit -m "feat: 新建 WelcomeHero 组件 + 浮动动画关键帧"
```

---

### 任务 3：新建 WelcomeCTA 组件

**文件：**
- 创建：`src/components/WelcomeCTA.tsx`

**接口：**
- 产出：`WelcomeCTA` 组件，接收 `onStart: () => void` props
- 供任务 5（welcome/page.tsx）使用

- [ ] **步骤 1：编写组件代码**

```tsx
'use client';

interface WelcomeCTAProps {
  onStart: () => void;
}

/** 底部 CTA Section：「开始使用」按钮 + 积分提示 */
export default function WelcomeCTA({ onStart }: WelcomeCTAProps) {
  return (
    <section className="min-h-[60vh] flex flex-col items-center justify-center bg-gradient-to-b from-emerald-50/30 to-white px-6 py-20">
      <div className="text-center max-w-md">
        <h2
          className="text-[28px] leading-[1.2] text-slate-800 mb-3 tracking-[-0.01em]"
          style={{ fontFamily: "var(--font-serif), 'Songti SC', serif", fontStyle: 'italic', fontWeight: 500 }}
        >
          准备好了吗？
        </h2>
        <p className="text-[15px] text-slate-500 mb-8 leading-relaxed">
          300 积分已到账，可用于 AI 题目解析、答题报告等智能功能
        </p>

        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-semibold text-white rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 shadow-lg shadow-emerald-200 active:scale-95 transition-all"
        >
          开始使用 Homework AI
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>

        <p className="mt-6 text-[12.5px] text-slate-400">
          随时可从侧边栏「产品介绍」回看本页
        </p>
      </div>
    </section>
  );
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty src/components/WelcomeCTA.tsx
```

预期：无类型错误。

- [ ] **步骤 3：提交**

```bash
git add src/components/WelcomeCTA.tsx
git commit -m "feat: 新建 WelcomeCTA 底部 CTA 组件"
```

---

### 任务 4：新建各 Section 示意图组件（内联于 page.tsx）

**说明：** 示意图不单独建文件，在 `welcome/page.tsx` 中以局部函数/变量形式定义，避免文件碎片化。此处设计好每个示意图的 JSX 结构，在任务 5 中直接使用。

**文件：**
- 无新文件；代码内联写入任务 5 的 `welcome/page.tsx`

**示意图清单：**

1. **AI 解析示意图** —— 模拟文件拖拽区 → 题目卡片：

```tsx
function ParseIllustration() {
  return (
    <div className="relative w-full max-w-sm mx-auto">
      {/* 上传区域 */}
      <div className="border-2 border-dashed border-sky-300 rounded-2xl p-8 text-center bg-sky-50/50">
        <svg className="w-10 h-10 text-sky-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <span className="text-[12px] text-slate-400">拖拽或选择题目文件</span>
      </div>
      {/* 箭头 */}
      <div className="flex justify-center my-3">
        <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
      {/* 结果卡片 */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-medium mb-2">AI 已解析</span>
        <div className="space-y-1.5">
          <div className="h-2.5 bg-slate-100 rounded w-full" />
          <div className="flex gap-2">
            <div className="h-2.5 bg-slate-100 rounded w-1/2" />
            <div className="h-2.5 bg-slate-100 rounded w-1/2" />
          </div>
          <div className="flex gap-2">
            <div className="h-2.5 bg-sky-100 rounded w-1/2" />
            <div className="h-2.5 bg-emerald-100 rounded w-1/4" />
          </div>
        </div>
      </div>
    </div>
  );
}
```

2. **AI 追问示意图** —— 对话气泡：

```tsx
function FollowUpIllustration() {
  return (
    <div className="w-full max-w-sm mx-auto space-y-3">
      {/* 题目 */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <div className="h-2 bg-slate-100 rounded w-3/4 mb-2" />
        <div className="h-2 bg-slate-100 rounded w-1/2" />
      </div>
      {/* 用户问 */}
      <div className="flex justify-end">
        <div className="bg-sky-100 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
          <p className="text-[12.5px] text-sky-800">这个选项为什么不对？</p>
        </div>
      </div>
      {/* AI 答 */}
      <div className="flex justify-start">
        <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%]">
          <p className="text-[12.5px] text-slate-600">因为 B 选项描述的概念与题目要求相反，正确理解应该是...</p>
        </div>
      </div>
      {/* 追问入口 */}
      <div className="flex items-center gap-2 text-[11.5px] text-sky-500">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>点击追问，AI 即时解答</span>
      </div>
    </div>
  );
}
```

3. **报告示意图** —— 简化柱状图：

```tsx
function ReportIllustration() {
  const bars = [
    { label: '选择题', value: 85, color: 'bg-sky-400' },
    { label: '填空题', value: 60, color: 'bg-amber-400' },
    { label: '简答题', value: 45, color: 'bg-rose-400' },
    { label: '代码题', value: 70, color: 'bg-emerald-400' },
  ];

  return (
    <div className="w-full max-w-sm mx-auto bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📊</span>
        <span className="text-[13px] font-semibold text-slate-700">答题报告</span>
      </div>
      <div className="space-y-3">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-2.5">
            <span className="text-[11px] text-slate-500 w-12 flex-shrink-0">{bar.label}</span>
            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${bar.color} transition-all duration-700`}
                style={{ width: `${bar.value}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 tabular-nums w-8 text-right">{bar.value}%</span>
          </div>
        ))}
      </div>
      {/* 薄弱标注 */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px]">
        <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
        <span className="text-slate-500">简答题为薄弱方向，建议重点复习</span>
      </div>
    </div>
  );
}
```

4. **复习示意图** —— 知识点卡片：

```tsx
function ReviewIllustration() {
  const items = [
    { name: '面向对象基础', strong: true },
    { name: '继承与多态', strong: true },
    { name: '异常处理机制', strong: false },
    { name: '集合框架', strong: true },
  ];

  return (
    <div className="w-full max-w-sm mx-auto space-y-2.5">
      {items.map((item) => (
        <div
          key={item.name}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
            item.strong
              ? 'bg-white border-slate-200'
              : 'bg-rose-50 border-rose-200 shadow-sm shadow-rose-100'
          }`}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.strong ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className={`text-[13px] font-medium flex-1 ${item.strong ? 'text-slate-700' : 'text-rose-700'}`}>
            {item.name}
          </span>
          {!item.strong && (
            <span className="text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-medium">
              需加强
            </span>
          )}
        </div>
      ))}
      <p className="text-[11px] text-slate-400 text-center mt-3">
        系统自动标记薄弱知识点，精准复习
      </p>
    </div>
  );
}
```

5. **数据隔离示意图** —— 用户头像 + 锁：

```tsx
function IsolationIllustration() {
  return (
    <div className="w-full max-w-sm mx-auto">
      {/* 三个用户分区 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { name: '你', active: true, color: 'border-sky-400 bg-sky-50' },
          { name: '用户B', active: false, color: 'border-slate-200 bg-slate-50' },
          { name: '用户C', active: false, color: 'border-slate-200 bg-slate-50' },
        ].map((u) => (
          <div
            key={u.name}
            className={`rounded-xl border-2 p-3 text-center ${u.color}`}
          >
            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-1.5 text-sm font-semibold ${
              u.active ? 'bg-sky-400 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {u.name[0]}
            </div>
            <span className={`text-[10px] font-medium ${u.active ? 'text-sky-600' : 'text-slate-400'}`}>
              {u.name}
            </span>
            {!u.active && (
              <svg className="w-3.5 h-3.5 text-slate-300 mx-auto mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 text-center mt-4 flex items-center justify-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        每位用户数据完全隔离，互不可见
      </p>
    </div>
  );
}
```

> **注意：** 这些示意图函数在任务 5 中写入 `welcome/page.tsx` 文件的顶部（组件外部）。

---

### 任务 5：新建 /welcome 页面主体

**文件：**
- 创建：`src/app/welcome/page.tsx`

**接口：**
- 消费：WelcomeHero（任务 2）、WelcomeFeature（任务 1）、WelcomeCTA（任务 3）、示意图函数（任务 4）
- 消费：AuthContext（`useAuth`）、Next.js `useRouter`

- [ ] **步骤 1：编写 page.tsx 完整代码**

```tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import WelcomeHero from '@/components/WelcomeHero';
import WelcomeFeature from '@/components/WelcomeFeature';
import WelcomeCTA from '@/components/WelcomeCTA';

/* ──────── 示意图组件（内联，避免文件碎片化）─────── */

function ParseIllustration() {
  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div className="border-2 border-dashed border-sky-300 rounded-2xl p-8 text-center bg-sky-50/50">
        <svg className="w-10 h-10 text-sky-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <span className="text-[12px] text-slate-400">拖拽或选择题目文件</span>
      </div>
      <div className="flex justify-center my-3">
        <svg className="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full font-medium mb-2">AI 已解析</span>
        <div className="space-y-1.5">
          <div className="h-2.5 bg-slate-100 rounded w-full" />
          <div className="flex gap-2">
            <div className="h-2.5 bg-slate-100 rounded w-1/2" />
            <div className="h-2.5 bg-slate-100 rounded w-1/2" />
          </div>
          <div className="flex gap-2">
            <div className="h-2.5 bg-sky-100 rounded w-1/2" />
            <div className="h-2.5 bg-emerald-100 rounded w-1/4" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FollowUpIllustration() {
  return (
    <div className="w-full max-w-sm mx-auto space-y-3">
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
        <div className="h-2 bg-slate-100 rounded w-3/4 mb-2" />
        <div className="h-2 bg-slate-100 rounded w-1/2" />
      </div>
      <div className="flex justify-end">
        <div className="bg-sky-100 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
          <p className="text-[12.5px] text-sky-800">这个选项为什么不对？</p>
        </div>
      </div>
      <div className="flex justify-start">
        <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%]">
          <p className="text-[12.5px] text-slate-600">因为 B 选项描述的概念与题目要求相反，正确理解应该是...</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11.5px] text-sky-500">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>点击追问，AI 即时解答</span>
      </div>
    </div>
  );
}

function ReportIllustration() {
  const bars = [
    { label: '选择题', value: 85, color: 'bg-sky-400' },
    { label: '填空题', value: 60, color: 'bg-amber-400' },
    { label: '简答题', value: 45, color: 'bg-rose-400' },
    { label: '代码题', value: 70, color: 'bg-emerald-400' },
  ];

  return (
    <div className="w-full max-w-sm mx-auto bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">📊</span>
        <span className="text-[13px] font-semibold text-slate-700">答题报告</span>
      </div>
      <div className="space-y-3">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-2.5">
            <span className="text-[11px] text-slate-500 w-12 flex-shrink-0">{bar.label}</span>
            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${bar.color}`}
                style={{ width: `${bar.value}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400 tabular-nums w-8 text-right">{bar.value}%</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px]">
        <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
        <span className="text-slate-500">简答题为薄弱方向，建议重点复习</span>
      </div>
    </div>
  );
}

function ReviewIllustration() {
  const items = [
    { name: '面向对象基础', strong: true },
    { name: '继承与多态', strong: true },
    { name: '异常处理机制', strong: false },
    { name: '集合框架', strong: true },
  ];

  return (
    <div className="w-full max-w-sm mx-auto space-y-2.5">
      {items.map((item) => (
        <div
          key={item.name}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
            item.strong
              ? 'bg-white border-slate-200'
              : 'bg-rose-50 border-rose-200 shadow-sm shadow-rose-100'
          }`}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.strong ? 'bg-emerald-400' : 'bg-rose-400'}`} />
          <span className={`text-[13px] font-medium flex-1 ${item.strong ? 'text-slate-700' : 'text-rose-700'}`}>
            {item.name}
          </span>
          {!item.strong && (
            <span className="text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded-full font-medium">
              需加强
            </span>
          )}
        </div>
      ))}
      <p className="text-[11px] text-slate-400 text-center mt-3">
        系统自动标记薄弱知识点，精准复习
      </p>
    </div>
  );
}

function IsolationIllustration() {
  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="grid grid-cols-3 gap-3">
        {[
          { name: '你', active: true, color: 'border-sky-400 bg-sky-50' },
          { name: '用户B', active: false, color: 'border-slate-200 bg-slate-50' },
          { name: '用户C', active: false, color: 'border-slate-200 bg-slate-50' },
        ].map((u) => (
          <div
            key={u.name}
            className={`rounded-xl border-2 p-3 text-center ${u.color}`}
          >
            <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-1.5 text-sm font-semibold ${
              u.active ? 'bg-sky-400 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {u.name[0]}
            </div>
            <span className={`text-[10px] font-medium ${u.active ? 'text-sky-600' : 'text-slate-400'}`}>
              {u.name}
            </span>
            {!u.active && (
              <svg className="w-3.5 h-3.5 text-slate-300 mx-auto mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 text-center mt-4 flex items-center justify-center gap-1.5">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        每位用户数据完全隔离，互不可见
      </p>
    </div>
  );
}

/* ──────── Section 配置数据 ─────── */

interface FeatureSectionData {
  id: string;
  side: 'left' | 'right';
  badgeColor: string;
  icon: string;
  tag: string;
  title: string;
  description: string;
  steps?: string[];
  illustration: React.ReactNode;
  bgClass: string;
}

const FEATURE_SECTIONS: FeatureSectionData[] = [
  {
    id: 'parse',
    side: 'left',
    badgeColor: 'sky',
    icon: '🤖',
    tag: 'AI 智能解析',
    title: '告别手动录入，一键智能解析',
    description: '支持 Markdown、PDF、Word、图片等多种格式上传，AI 自动识别题目类型、选项和答案，秒级生成结构化试卷',
    steps: ['上传题目文件', '选择 AI 解析模式', '获得结构化试卷'],
    illustration: <ParseIllustration />,
    bgClass: 'bg-white',
  },
  {
    id: 'followup',
    side: 'right',
    badgeColor: 'violet',
    icon: '💬',
    tag: 'AI 追问',
    title: '不懂就问，即时答疑',
    description: '答题过程中对任何题目有疑问，随时点击追问按钮，AI 会根据题目上下文给出针对性解答，帮你真正理解知识点',
    steps: ['点击题目旁追问按钮', '输入你的问题', '获取 AI 详细解答'],
    illustration: <FollowUpIllustration />,
    bgClass: 'bg-slate-50',
  },
  {
    id: 'report',
    side: 'left',
    badgeColor: 'emerald',
    icon: '📊',
    tag: '智能报告',
    title: '答题结果一目了然',
    description: '提交答案后自动生成多维度分析报告，涵盖正确率、各题型表现、知识点掌握度，精准定位你的薄弱方向',
    steps: ['完成答题', '查看自动生成的分析报告', '了解各维度得分'],
    illustration: <ReportIllustration />,
    bgClass: 'bg-white',
  },
  {
    id: 'review',
    side: 'right',
    badgeColor: 'amber',
    icon: '🎯',
    tag: '针对性复习',
    title: '精准复习，高效提升',
    description: '报告会标注你的薄弱知识点，提供针对性的复习建议，不再盲目刷题，每一次练习都有明确方向',
    illustration: <ReviewIllustration />,
    bgClass: 'bg-sky-50/30',
  },
  {
    id: 'isolation',
    side: 'left',
    badgeColor: 'indigo',
    icon: '🔒',
    tag: '数据隔离',
    title: '你的数据，只属于你',
    description: '每位用户拥有独立的数据空间，答题记录、报告、笔记互不可见，保障隐私与安全',
    illustration: <IsolationIllustration />,
    bgClass: 'bg-white',
  },
];

/* ──────── 页面主体 ─────── */

/** 使用 IntersectionObserver 为 Section 添加入场动画 */
function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.4) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // prefers-reduced-motion 时直接设为可见
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return inView;
}

/** 带入场动画的 Section 包装器 */
function AnimatedSection({
  children,
  bgClass,
}: {
  children: React.ReactNode;
  bgClass: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <section ref={ref} className={bgClass}>
      <div
        className={`transition-all duration-700 ${
          inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {children}
      </div>
    </section>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isRevisit, setIsRevisit] = useState(false);

  // 判断是否为回看模式（侧边栏/设置进入）
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('welcome_seen')) {
      setIsRevisit(true);
    }
  }, []);

  // 未登录跳转登录页
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const markSeenAndGoHome = useCallback(() => {
    localStorage.setItem('welcome_seen', '1');
    router.push('/');
  }, [router]);

  const handleSkip = () => {
    markSeenAndGoHome();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="w-full">
      {/* 固定跳过按钮 */}
      <button
        onClick={handleSkip}
        className="fixed top-4 right-4 z-50 px-4 py-2 text-[12.5px] text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl border border-white/10 transition-all"
        aria-label={isRevisit ? '返回首页' : '跳过引导'}
      >
        {isRevisit ? '返回首页' : '跳过'}
      </button>

      {/* Hero */}
      <WelcomeHero />

      {/* 功能展示 Sections */}
      {FEATURE_SECTIONS.map((section) => (
        <AnimatedSection key={section.id} bgClass={section.bgClass}>
          <WelcomeFeature
            side={section.side}
            badgeColor={section.badgeColor}
            icon={section.icon}
            tag={section.tag}
            title={section.title}
            description={section.description}
            steps={section.steps}
            illustration={section.illustration}
          />
        </AnimatedSection>
      ))}

      {/* CTA */}
      <AnimatedSection bgClass="bg-gradient-to-b from-emerald-50/30 to-white">
        <WelcomeCTA onStart={markSeenAndGoHome} />
      </AnimatedSection>
    </div>
  );
}
```

- [ ] **步骤 2：验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

预期：无新增类型错误。

- [ ] **步骤 3：提交**

```bash
git add src/app/welcome/page.tsx
git commit -m "feat: 新建 /welcome 引导页，含 Hero + 5 功能 Section + CTA"
```

---

### 任务 6：修改 register/setup 跳转目标

**文件：**
- 修改：`src/app/register/setup/page.tsx`

**改动：** 将 3 处 `router.push('/')` 替换为 `router.push('/welcome')`

- [ ] **步骤 1：修改 handleSubmit 中的跳转**

找到第 64 行（`handleSubmit` 函数内的 `router.push('/')`）：

```tsx
// 原：
router.push('/');

// 改为：
router.push('/welcome');
```

- [ ] **步骤 2：修改 handleSkip 中的跳转（2 处）**

`handleSkip` 内有两条分支：

```tsx
// 原（第 83 行附近）：
}).finally(() => router.push('/'));

// 改为：
}).finally(() => router.push('/welcome'));

// 原（第 85 行附近）：
router.push('/');

// 改为：
router.push('/welcome');
```

- [ ] **步骤 3：验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

预期：无新增类型错误。

- [ ] **步骤 4：提交**

```bash
git add src/app/register/setup/page.tsx
git commit -m "feat: setup 完成后跳转 /welcome 引导页"
```

---

### 任务 7：侧边栏新增「产品介绍」入口

**文件：**
- 修改：`src/components/Sidebar.tsx`

**改动：** 在导航区「个人设置」项下方新增一个 `NavItem`

- [ ] **步骤 1：在 Sidebar 导航区添加菜单项**

找到「个人设置」NavItem（大约第 362-376 行），在其闭合 `</NavItem>` 之后、其余导航项附近插入新项。具体位置：在「个人设置」和题库分类区域之间插入。

在「个人设置」NavItem 后面（第 376 行 `</NavItem>` 之后）添加：

```tsx
              <NavItem
                tone={TONE_KEY}
                icon={
                  <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                }
                label="产品介绍"
                active={pathname === '/welcome'}
                onClick={() => {
                  onClose();
                  router.push('/welcome');
                }}
              />
```

注意：新增的 NavItem 需要在 `user &&` 条件块内。检查现有条件块的范围：`{user && (<> ... </>)}` 从第 321 行到第 377 行左右（包含首页、上传、题库管理、笔记、个人设置）。新菜单项应放在同一个 `<>...</>` 片段内的个人设置之后。

- [ ] **步骤 2：验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

预期：无新增类型错误。

- [ ] **步骤 3：提交**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: 侧边栏新增「产品介绍」入口"
```

---

### 任务 8：设置页新增「查看产品介绍」入口

**文件：**
- 修改：`src/app/settings/page.tsx`

**改动：** 在设置页头部区域（标题下方）添加一个入口行，点击跳转 `/welcome`

- [ ] **步骤 1：添加产品介绍入口行**

找到页面标题区域（第 238-250 行，`return` 语句中 `<h1>⚙️ 个人设置</h1>` 下方），在标题和第一个卡片之间插入一个入口行。具体在 `<p>管理账户信息与安全设置</p>`（第 249 行）之后，`<div className="grid grid-cols-1...">` 之前插入：

```tsx
        {/* 产品介绍入口 */}
        <button
          onClick={() => router.push('/welcome')}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-600 hover:text-sky-600 hover:border-sky-300 hover:bg-sky-50 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          查看产品介绍 · 了解 Homework AI 全部功能
        </button>
```

- [ ] **步骤 2：验证 TypeScript 编译**

```bash
npx tsc --noEmit
```

预期：无新增类型错误。

- [ ] **步骤 3：提交**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: 设置页新增「查看产品介绍」入口"
```

---

### 任务 9：端到端验证与收尾

**文件：**
- 无新建文件
- 不产生代码改动（仅验证）

- [ ] **步骤 1：TypeScript 全量编译检查**

```bash
npx tsc --noEmit
```

预期：零错误。

- [ ] **步骤 2：启动开发服务器手动验证**

```bash
npm run dev
```

手动验证以下场景：
1. 清除 `localStorage` → 注册新账号 → 完成 setup → 应跳转到 `/welcome`
2. 在 `/welcome` 滚动浏览各 Section → 确认入场动画正常
3. 点击「跳过」→ 应跳转首页并标记已读
4. 再次注册 → 完成 setup → 点击「开始使用」→ 应跳转首页
5. 从侧边栏「产品介绍」→ 进入 `/welcome`（回看模式，跳过按钮显示「返回首页」）
6. 从设置页「查看产品介绍」→ 同上
7. 移动端浏览器（或 Chrome DevTools 模拟）→ Section 上下堆叠正常
8. 在系统设置中开启 `prefers-reduced-motion: reduce` → 动画应禁用（Section 直接可见）
9. 未登录直接访问 `/welcome` → 应跳转至 `/login`
10. 游客账号 → 不自动进入 welcome，侧边栏不显示产品介绍入口

- [ ] **步骤 3：运行现有测试确保无回归**

```bash
npx vitest run
```

预期：所有现有测试通过。

- [ ] **步骤 4：提交（如有遗漏改动）**

```bash
git add -A
git commit -m "chore: welcome 引导页端到端验证完毕"
```
