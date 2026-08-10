'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import WelcomeHero from '@/components/WelcomeHero';
import WelcomeFeature from '@/components/WelcomeFeature';
import WelcomeCTA from '@/components/WelcomeCTA';

/* ==========================================
   示意图组件（内联，避免文件碎片化）
   ========================================== */

/** AI 解析示意图 —— 文件拖拽区 → 题目卡片 */
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

/** AI 追问示意图 —— 对话气泡 */
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

/** 报告示意图 —— CSS 柱状图 */
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
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[11px]">
        <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
        <span className="text-slate-500">简答题为薄弱方向，建议重点复习</span>
      </div>
    </div>
  );
}

/** 复习示意图 —— 知识点卡片 + 弱项标注 */
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

/** 数据隔离示意图 —— 用户分区 + 锁图标 */
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

/* ==========================================
   Section 配置数据
   ========================================== */

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

/* ==========================================
   页面主体
   ========================================== */

/** 使用 IntersectionObserver 为 Section 添加入场动画 */
function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.4) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

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
  const ref = useRef<HTMLElement>(null);
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

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('welcome_seen')) {
      setIsRevisit(true);
    }
  }, []);

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
      <button
        onClick={handleSkip}
        className="fixed top-4 right-4 z-50 px-4 py-2 text-[12.5px] text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur rounded-xl border border-white/10 transition-all"
        aria-label={isRevisit ? '返回首页' : '跳过引导'}
      >
        {isRevisit ? '返回首页' : '跳过'}
      </button>

      <WelcomeHero />

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

      <AnimatedSection bgClass="bg-gradient-to-b from-emerald-50/30 to-white">
        <WelcomeCTA onStart={markSeenAndGoHome} />
      </AnimatedSection>
    </div>
  );
}
