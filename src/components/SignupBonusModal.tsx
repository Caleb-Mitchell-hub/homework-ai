'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface SignupBonusModalProps {
  amount: number;
  onClose: () => void;
}

/**
 * 新用户注册奖励弹窗
 * - 数字从 0 滚动递增到 amount
 * - 入场动画复用 anim-stagger-1
 * - 点击按钮后清理 localStorage 标记并关闭
 */
export default function SignupBonusModal({ amount, onClose }: SignupBonusModalProps) {
  const { refreshCredits } = useAuth();
  const [display, setDisplay] = useState(0);
  const [closing, setClosing] = useState(false);
  const animRef = useRef<number>(0);

  // 数字递增动画：easeOutExpo，约 1.2 秒
  useEffect(() => {
    const duration = 1200;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo: 1 - 2^(-10 * t)
      const eased = 1 - Math.pow(2, -10 * progress);
      setDisplay(Math.round(eased * amount));

      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      }
    };

    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [amount]);

  // 锁 body 滚动
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleClaim = () => {
    localStorage.removeItem('signup_bonus');
    setClosing(true);
    refreshCredits();
    // 等淡出动画播完再通知父组件卸载
    setTimeout(onClose, 350);
  };

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-opacity duration-300 ${closing ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className={`w-full max-w-sm bg-white rounded-2xl p-8 shadow-2xl text-center transition-all duration-300 ${closing ? 'scale-95 opacity-0' : 'anim-stagger-1'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 图标 */}
        <div className="text-5xl mb-3">🎉</div>

        {/* 标题 */}
        <h2 className="text-[20px] font-semibold text-slate-800 mb-2">
          欢迎加入 Homework AI！
        </h2>

        {/* 积分数字 */}
        <div className="my-6">
          <span className="text-[56px] font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-500 tabular-nums leading-none">
            +{display}
          </span>
          <span className="text-2xl ml-1">💎</span>
        </div>

        {/* 副标题 */}
        <p className="text-[13.5px] text-slate-500 mb-2">注册奖励已到账</p>
        <p className="text-[12px] text-slate-400 mb-7">
          积分可用于 AI 题目解析、答题报告等智能功能
        </p>

        {/* 按钮 */}
        <button
          onClick={handleClaim}
          className="w-full py-3 text-[14.5px] font-semibold text-white rounded-xl bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 transition-all shadow-lg shadow-emerald-200 active:scale-95"
        >
          开心收下 🎁
        </button>
      </div>
    </div>
  );
}