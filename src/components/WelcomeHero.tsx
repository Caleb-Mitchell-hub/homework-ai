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
      className={`welcome-shape absolute rounded-full opacity-20 ${className}`}
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
          style={{ fontFamily: "var(--font-fraunces), 'Songti SC', serif", fontStyle: 'italic', fontWeight: 500 }}
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
