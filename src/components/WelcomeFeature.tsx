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
