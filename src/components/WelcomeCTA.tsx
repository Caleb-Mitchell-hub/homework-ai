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
          style={{ fontFamily: "var(--font-fraunces), 'Songti SC', serif", fontStyle: 'italic', fontWeight: 500 }}
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
