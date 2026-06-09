'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

/**
 * 侧边栏配色 token —— 集中维护，避免颜色散落
 * user  → sky / emerald
 * admin → indigo / pink
 */
export type SidebarTone = 'user' | 'admin';

export const TONE = {
  user: {
    accent: 'sky',
    accent2: 'emerald',
    grad: 'from-sky-400 to-emerald-400',
    gradText: 'from-sky-500 to-emerald-500',
    dotColor: 'rgba(56, 189, 248, 0.55)',     // sky-400
    ringColor: 'sky-200',
    hoverInk: 'sky-500',
  },
  admin: {
    accent: 'indigo',
    accent2: 'pink',
    grad: 'from-indigo-400 to-pink-400',
    gradText: 'from-indigo-500 to-pink-500',
    dotColor: 'rgba(129, 140, 248, 0.55)',   // indigo-400
    ringColor: 'indigo-200',
    hoverInk: 'indigo-500',
  },
} as const;

/**
 * Fraunces 衬线字体的样式封装
 * - normal:  正文用
 * - italic: 杂志风大标题用
 */
export const SERIF = {
  normal: { fontFamily: 'var(--font-serif), "Songti SC", serif' },
  italic: { fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic' as const, fontWeight: 500 },
};

// ───────────────────────────────────────────────────────────────
// 基础组件
// ───────────────────────────────────────────────────────────────

/** 暖灰渐变细线 —— 章节之间的呼吸 */
export function HairlineDivider() {
  return (
    <div
      className="h-px w-full my-5"
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, rgba(148,163,184,0.25) 30%, rgba(148,163,184,0.25) 70%, transparent 100%)',
      }}
    />
  );
}

/** 章节小标 —— tracking 拉满的 uppercase 小字 */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5 px-2">
      <h3 className="text-[10px] tracking-[0.2em] uppercase text-slate-400 font-semibold">
        {children}
      </h3>
      {right}
    </div>
  );
}

/** 导航项 —— 左侧 2px 渐变 active 竖条 */
export function NavItem({
  icon,
  label,
  active,
  onClick,
  tone,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  tone: SidebarTone;
  disabled?: boolean;
}) {
  const t = TONE[tone];
  // Tailwind 安全字面量：完整 class 字符串（不能拼接）
  const activeIconColor = tone === 'user' ? 'text-sky-500' : 'text-indigo-500';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative w-full flex items-center gap-2.5 pl-3.5 pr-3 py-2 rounded-lg text-[13px] transition-all group ${
        active
          ? 'text-slate-800 font-medium bg-white/60'
          : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
      } ${disabled ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''}`}
    >
      {/* 左侧 active 竖条 */}
      <span
        className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-gradient-to-b ${t.grad} transition-opacity ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <span
        className={`flex-shrink-0 transition-colors ${
          active ? activeIconColor : 'text-slate-400 group-hover:text-slate-500'
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

/** 角色小徽章 —— USER / GUEST / ADMIN */
export function RoleBadge({ role }: { role: 'user' | 'guest' | 'admin' }) {
  const map = {
    user:  { label: 'USER',  cls: 'bg-emerald-50 text-emerald-600 border-emerald-200/60' },
    guest: { label: 'GUEST', cls: 'bg-amber-50 text-amber-600 border-amber-200/60' },
    admin: { label: 'ADMIN', cls: 'bg-indigo-50 text-indigo-600 border-indigo-200/60' },
  };
  const { label, cls } = map[role];
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] tracking-[0.15em] font-medium border ${cls}`}
    >
      {label}
    </span>
  );
}

/** 底部用户卡 —— 头像 + 名字 + 角色 + 箭头 */
export function UserCard({
  username,
  isGuest,
  tone,
  onClick,
}: {
  username: string;
  isGuest?: boolean;
  tone: SidebarTone;
  onClick: () => void;
}) {
  const t = TONE[tone];
  return (
    <button
      onClick={onClick}
      className="w-full group flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/70 transition-all"
    >
      <div
        className={`w-9 h-9 rounded-xl bg-gradient-to-br ${t.grad} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}
        style={SERIF.italic}
      >
        {username.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-[12.5px] text-slate-700 font-medium truncate group-hover:text-slate-900">
          {username}
        </div>
        <div className="text-[9.5px] text-slate-400 tracking-[0.2em] uppercase mt-0.5 flex items-center gap-1.5">
          {isGuest ? 'GUEST' : tone === 'admin' ? 'ADMIN' : 'USER'} · SETTINGS
        </div>
      </div>
      <svg
        className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/** 未登录态登录按钮 —— 衬线斜体"Sign in →" */
export function SignInButton({ onClick, tone }: { onClick: () => void; tone: SidebarTone }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-200/60 hover:border-slate-300 hover:bg-white/60 transition-all group"
    >
      <span className="text-[12.5px] text-slate-500 group-hover:text-slate-700 transition-colors tracking-wider uppercase">
        Sign in
      </span>
      <span
        className="text-[12.5px] text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all"
        style={SERIF.italic}
      >
        →
      </span>
    </button>
  );
}

/** 折叠/展开浮动按钮 */
export function FoldToggle({
  hidden,
  onToggle,
  tone,
}: {
  hidden: boolean;
  onToggle: () => void;
  tone: SidebarTone;
}) {
  if (!hidden) return null;
  const hoverColor = tone === 'user' ? 'hover:text-sky-500' : 'hover:text-indigo-500';
  return (
    <button
      onClick={onToggle}
      title="展开侧栏"
      className={`fixed left-0 top-1/2 -translate-y-1/2 z-50 px-2 py-4 bg-white/80 backdrop-blur text-slate-500 ${hoverColor} rounded-r-2xl border border-slate-200/60 border-l-0 shadow-md transition-colors`}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/** 角落圆点阵装饰 */
export function DotPattern({ tone }: { tone: SidebarTone }) {
  const t = TONE[tone];
  return (
    <div
      className="pointer-events-none absolute right-3 top-3 w-16 h-16 opacity-30"
      style={{
        backgroundImage: `radial-gradient(circle, ${t.dotColor} 1px, transparent 1.5px)`,
        backgroundSize: '6px 6px',
      }}
    />
  );
}

/** 杂志报头风格日期小字（客户端每分钟更新） */
export function DateLabel() {
  // 用 suppressHydrationWarning 避免水合不一致
  return (
    <div
      className="text-[9.5px] tracking-[0.2em] uppercase text-slate-400/80 mt-0.5"
      suppressHydrationWarning
    >
      <CurrentDate />
    </div>
  );
}

function CurrentDate() {
  if (typeof window === 'undefined') return <span>&nbsp;</span>;
  const now = new Date();
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const d = days[now.getDay()];
  const m = months[now.getMonth()];
  const day = String(now.getDate()).padStart(2, '0');
  return <span>{d} · {day} {m}</span>;
}

// ───────────────────────────────────────────────────────────────
// 抽屉容器（丝滑的进入/退出两阶段动画 + peek 模式）
// ───────────────────────────────────────────────────────────────

const DRAWER_OUT_MS = 320; // 必须与 globals.css 中 anim-*-out 的 duration 一致
const PEEK_WIDTH = 28; // 关闭后露出的把手宽度（px）

/**
 * 抽屉容器 —— peek 模式
 * - 点遮罩 / 按 ESC / 点关闭按钮 → 抽屉滑出,只露 28px 的把手(类似 macOS 抽屉)
 * - 鼠标 hover 把手 → 抽屉自动滑出到完整宽度
 * - 抽屉永久 mount(不卸载),仅靠 transform 滑动,体感更丝滑
 * - DrawerTrigger 浮动按钮(左上角)与 peek 把手可二选一触发打开
 */
export function SidebarDrawer({
  open,
  onClose,
  onOpen,
  tone,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** peek 模式:hover 把手时通知父级展开抽屉 */
  onOpen?: () => void;
  tone: SidebarTone;
  children: ReactNode;
}) {
  const t = TONE[tone];
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // ESC 关闭 + 锁滚动
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // peek 模式:抽屉**永远 mount**(不卸载),只通过 transform 滑动
  useEffect(() => {
    setMounted(true);
    if (open) {
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
    }
  }, [open]);

  if (!mounted) return null;

  // 计算抽屉当前的 translateX 偏移
  //   visible = true   → translateX(0)                              完整显示
  //   visible = false  → translateX(calc(-100% + PEEK_WIDTH))      露出 PEEK_WIDTH 把手
  const drawerTransform = visible
    ? 'translateX(0)'
    : `translateX(calc(-100% + ${PEEK_WIDTH}px))`;

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      {/* 遮罩 —— 只在抽屉打开时拦截点击 */}
      <button
        aria-label="关闭侧栏"
        onClick={onClose}
        tabIndex={visible ? 0 : -1}
        className={`absolute inset-0 bg-slate-900/30 transition-opacity duration-300 ${
          visible ? 'anim-scrim-in opacity-100' : 'opacity-0'
        }`}
        style={{
          backdropFilter: visible ? 'blur(2px)' : 'blur(0px)',
          WebkitBackdropFilter: visible ? 'blur(2px)' : 'blur(0px)',
          pointerEvents: visible ? 'auto' : 'none',
        }}
      />

      {/* 抽屉本体 */}
      <aside
        className={`absolute left-0 top-0 bottom-0 w-72 border-r border-slate-200/60 shadow-2xl flex flex-col overflow-hidden pointer-events-auto ${
          visible ? 'anim-panel-in' : 'anim-panel-out'
        }`}
        style={{
          background:
            'linear-gradient(180deg, rgba(250,250,247,0.98) 0%, rgba(248,250,252,0.98) 100%)',
          boxShadow: visible
            ? '20px 0 48px -12px rgba(15, 23, 42, 0.18), 1px 0 0 rgba(148, 163, 184, 0.18)'
            : '4px 0 12px -4px rgba(15, 23, 42, 0.08)',
          transform: drawerTransform,
          transition: 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* 顶部 2px 渐变高亮条 */}
        <div
          className={`absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r ${t.grad} z-10 ${
            visible ? 'opacity-80' : 'opacity-0'
          }`}
          style={{ transition: 'opacity 0.4s ease' }}
        />

        {/* 内层柔光高光（与背景叠加） */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 80% 30% at 0% 0%, rgba(255,255,255,0.55) 0%, transparent 60%)',
          }}
        />

        <DotPattern tone={tone} />

        {/* 内容层带 stagger 渐入；离开时不加 */}
        <div
          className={`relative flex-1 flex flex-col min-h-0 ${
            visible ? 'anim-stagger-1' : ''
          }`}
        >
          {children}
        </div>
      </aside>

      {/* Peek 把手 —— 关闭后露在左边的 28px 竖条 */}
      {/* 点击 → onOpen() 打开抽屉;按住拖动 → 上下调整位置(持久化) */}
      <DraggablePeekHandle
        visible={!visible}
        onOpen={onOpen}
      />
    </div>
  );
}

/**
 * 可拖动的 peek 把手
 * - 短按(移动 < 5px)→ 视为点击 → onOpen
 * - 按住拖动 → 上下移动位置,松手时保持新位置
 * - 位置以「视口高度的百分比」存到 localStorage,刷新后保留
 */
function DraggablePeekHandle({
  visible,
  onOpen,
}: {
  visible: boolean;
  onOpen?: () => void;
}) {
  const STORAGE_KEY = 'homework-ai-sidebar-peek-top';
  const HANDLE_H = 144; // h-36 = 144px
  const DRAG_THRESHOLD = 5; // px,小于此值视为点击

  const [topPct, setTopPct] = useState<number>(50);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startPct: number;
    moved: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 启动时从 localStorage 读出上次的纵向位置
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseFloat(stored);
      if (!isNaN(n) && n >= 0 && n <= 100) {
        setTopPct(n);
      }
    }
  }, []);

  // 位置变更后回写
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, String(topPct));
  }, [topPct]);

  if (!visible || !onOpen) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* 某些浏览器对非主指针会抛错,忽略 */
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startPct: topPct,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const dy = e.clientY - state.startY;
    if (!state.moved && Math.abs(dy) > DRAG_THRESHOLD) {
      state.moved = true;
      setIsDragging(true);
      // 拖动时禁止文本选择
      document.body.style.userSelect = 'none';
    }
    if (state.moved) {
      const vh = window.innerHeight || 1;
      const handleHalfPct = (HANDLE_H / 2 / vh) * 100;
      // 中心点允许的最小/最大百分比(让按钮始终在视口内)
      const minPct = handleHalfPct;
      const maxPct = 100 - handleHalfPct;
      const next = Math.max(minPct, Math.min(maxPct, state.startPct + (dy / vh) * 100));
      setTopPct(next);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const target = e.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
    const wasDragging = state.moved;
    dragRef.current = null;
    setIsDragging(false);
    document.body.style.userSelect = '';
    if (!wasDragging) {
      // 当作点击 → 打开抽屉
      onOpen();
    }
  };

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title="点击展开 · 按住拖动调整位置"
      className={`pointer-events-auto absolute left-0 z-10 px-2 py-4 rounded-r-2xl border border-l-0 border-slate-200/60 shadow-md hover:shadow-lg flex items-center justify-center select-none touch-none ${
        isDragging
          ? 'bg-white border-sky-400 cursor-grabbing scale-105'
          : 'bg-white/85 backdrop-blur hover:bg-white hover:border-sky-300 cursor-grab'
      }`}
      style={{
        top: `${topPct}%`,
        height: `${HANDLE_H}px`,
        transform: 'translateY(-50%)',
        touchAction: 'none',
        transition: isDragging ? 'none' : 'background-color 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.15s',
      }}
    >
      <svg
        className={`w-3.5 h-3.5 transition-all ${
          isDragging ? 'text-sky-500 scale-110' : 'text-slate-400 group-hover:text-sky-500'
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/** 触发抽屉的浮动菜单按钮 —— 固定在左上角 */
export function DrawerTrigger({
  onClick,
  tone,
  badge,
}: {
  onClick: () => void;
  tone: SidebarTone;
  badge?: ReactNode;
}) {
  const t = TONE[tone];
  const [pressing, setPressing] = useState(false);

  return (
    <button
      onClick={() => {
        setPressing(true);
        setTimeout(() => setPressing(false), 300);
        onClick();
      }}
      title="打开菜单"
      className={`fixed left-4 top-4 z-[70] w-10 h-10 rounded-xl bg-white/80 backdrop-blur border border-slate-200/60 shadow-sm hover:shadow-md hover:border-slate-300 transition-all group flex items-center justify-center ${
        pressing ? 'anim-trigger-press' : ''
      }`}
    >
      <span
        className={`absolute inset-x-2 bottom-0.5 h-[2px] rounded-full bg-gradient-to-r ${t.grad} opacity-60 group-hover:opacity-100 transition-opacity`}
      />
      <svg className="w-4 h-4 text-slate-500 group-hover:text-slate-800 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      {badge}
    </button>
  );
}
