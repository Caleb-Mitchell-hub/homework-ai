'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

function HairlineDivider() {
  return (
    <div
      className="h-px w-full my-7"
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, rgba(148, 163, 184, 0.25) 30%, rgba(148, 163, 184, 0.25) 70%, transparent 100%)',
      }}
    />
  );
}

function SectionTitle({
  accent,
  title,
  subtitle,
}: {
  accent: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 mb-4">
      <span
        className="inline-block w-[3px] h-3.5 rounded-sm"
        style={{ background: accent }}
      />
      <h3 className="text-[13px] font-semibold tracking-[0.08em] uppercase text-slate-700">
        {title}
      </h3>
      {subtitle && (
        <span className="text-[11px] text-slate-400 tracking-wide">{subtitle}</span>
      )}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] text-slate-700 font-medium">{label}</div>
        {hint && <div className="text-[11.5px] text-slate-400 mt-0.5 leading-snug">{hint}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  accent = 'from-indigo-400 to-pink-400',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  accent?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-all duration-300 ${
        checked
          ? `bg-gradient-to-r ${accent} shadow-inner`
          : 'bg-slate-200'
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Stepper({
  value,
  onChange,
  min,
  max,
  unit = '',
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-500 transition-colors text-sm leading-none flex items-center justify-center"
      >
        −
      </button>
      <div className="w-12 h-7 flex items-center justify-center text-[13px] font-medium text-slate-700 tabular-nums">
        {value}
        {unit}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-500 transition-colors text-sm leading-none flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}

export default function AdminSettingsPanel({ open, onClose }: Props) {
  const router = useRouter();
  const { admin, logout } = useAdminAuth();

  const [fontSize, setFontSize] = useState(16);
  const [remember, setRemember] = useState(true);
  const [autorefresh, setAutorefresh] = useState(true);
  const [showCorrect, setShowCorrect] = useState(false);
  const [animations, setAnimations] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [animateKey, setAnimateKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setAnimateKey(k => k + 1);
    const saved = localStorage.getItem('admin_fontSize');
    if (saved) setFontSize(parseInt(saved));
    const r = localStorage.getItem('admin_remember_flag') === '1';
    setRemember(r);
    const ar = localStorage.getItem('admin_pref_autorefresh');
    setAutorefresh(ar !== '0');
    const sc = localStorage.getItem('admin_pref_show_correct');
    setShowCorrect(sc === '1');
    const an = localStorage.getItem('admin_pref_animations');
    setAnimations(an !== '0');
  }, [open]);

  useEffect(() => {
    document.documentElement.style.setProperty('--base-font-size', `${fontSize}px`);
    localStorage.setItem('admin_fontSize', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('admin_pref_autorefresh', autorefresh ? '1' : '0');
    localStorage.setItem('admin_pref_show_correct', showCorrect ? '1' : '0');
    localStorage.setItem('admin_pref_animations', animations ? '1' : '0');
  }, [autorefresh, showCorrect, animations]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleLogout = () => {
    logout();
    window.location.href = '/admin/login';
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[80] animate-fade-in"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(99, 102, 241, 0.12), transparent 50%), radial-gradient(circle at 80% 100%, rgba(236, 72, 153, 0.10), transparent 50%), rgba(15, 23, 42, 0.30)',
          backdropFilter: 'blur(6px)',
        }}
        onClick={onClose}
      />

      <div
        className="fixed top-0 left-0 bottom-0 z-[90] w-full sm:w-[460px] shadow-2xl flex flex-col animate-slide-in-left"
        style={{
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.96) 100%)',
          borderRight: '1px solid rgba(226, 232, 240, 0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 pt-6 pb-4 flex items-start justify-between">
          <div>
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1.5">
              Admin Console
            </div>
            <h2
              className="text-[26px] leading-tight text-slate-800"
              style={{
                fontFamily: "'Fraunces', 'Songti SC', serif",
                fontWeight: 500,
                fontStyle: 'italic',
                letterSpacing: '-0.01em',
              }}
            >
              管理设置
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:rotate-90 transition-all duration-300 flex items-center justify-center"
            aria-label="关闭"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 pb-6">
          {admin && (
            <>
              <SectionTitle
                accent="linear-gradient(180deg, #6366f1, #ec4899)"
                title="管理员账户"
                subtitle="Admin"
              />

              <div
                className="relative p-4 rounded-2xl overflow-hidden mb-3"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(224, 231, 255, 0.5) 0%, rgba(252, 231, 243, 0.5) 100%)',
                  border: '1px solid rgba(199, 210, 254, 0.4)',
                }}
              >
                <div
                  className="absolute top-2 right-2 w-12 h-12 opacity-30"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, rgba(99, 102, 241, 0.5) 1px, transparent 1.5px)',
                    backgroundSize: '6px 6px',
                  }}
                />
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-400 to-pink-400 flex items-center justify-center text-white font-semibold shadow-md shadow-indigo-200">
                    {admin.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-slate-800 truncate">
                      {admin.username}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-indigo-100 text-indigo-700">
                        ROOT
                      </span>
                      <span className="text-[11px] text-slate-500">系统最高权限</span>
                    </div>
                  </div>
                </div>
              </div>

              <Row label="记住用户名" hint="下次自动填入登录表单">
                <Toggle checked={remember} onChange={(v) => {
                  setRemember(v);
                  if (!v) {
                    localStorage.removeItem('admin_remember_flag');
                    localStorage.removeItem('admin_remember_username');
                  } else if (admin.username) {
                    localStorage.setItem('admin_remember_flag', '1');
                    localStorage.setItem('admin_remember_username', admin.username);
                  }
                }} />
              </Row>
            </>
          )}

          <HairlineDivider />

          <SectionTitle
            accent="linear-gradient(180deg, #fbbf24, #fb923c)"
            title="数据大屏"
            subtitle="Dashboard"
          />

          <Row label="自动刷新" hint="数据每 30 秒自动拉取最新">
            <Toggle
              checked={autorefresh}
              onChange={setAutorefresh}
              accent="from-amber-400 to-orange-400"
            />
          </Row>

          <Row label="刷新频率" hint="设置自动刷新间隔">
            <span className="text-[12px] text-slate-500">30 秒</span>
          </Row>

          <HairlineDivider />

          <SectionTitle
            accent="linear-gradient(180deg, #a78bfa, #f472b6)"
            title="编辑偏好"
            subtitle="Editor"
          />

          <Row label="字体大小" hint="题库编辑界面字号">
            <Stepper
              value={fontSize}
              onChange={setFontSize}
              min={12}
              max={24}
              unit="px"
            />
          </Row>

          <Row label="发布前预览" hint="保存前展示题目渲染效果">
            <Toggle
              checked={showCorrect}
              onChange={setShowCorrect}
              accent="from-violet-400 to-pink-400"
            />
          </Row>

          <HairlineDivider />

          <SectionTitle
            accent="linear-gradient(180deg, #64748b, #94a3b8)"
            title="外观与动效"
            subtitle="Appearance"
          />

          <Row label="开启过渡动画">
            <Toggle
              checked={animations}
              onChange={setAnimations}
              accent="from-indigo-400 to-pink-400"
            />
          </Row>

          <HairlineDivider />

          <SectionTitle
            accent="linear-gradient(180deg, #fb7185, #f43f5e)"
            title="会话"
            subtitle="Session"
          />

          <div className="space-y-2">
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="group w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50/50 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:bg-rose-100 flex items-center justify-center transition-colors">
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-rose-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-[13.5px] text-slate-700 group-hover:text-rose-600 font-medium">退出登录</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">清除本地会话并返回登录页</div>
                </div>
              </div>
              <svg className="w-4 h-4 text-slate-300 group-hover:text-rose-400 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="mt-10 pt-5 border-t border-slate-200/60 flex items-center justify-between text-[10.5px] tracking-wider uppercase text-slate-400">
            <span>Admin v0.4.0</span>
            <span
              className="italic"
              style={{ fontFamily: "'Fraunces', serif" }}
            >
              control center
            </span>
          </div>
        </div>
      </div>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowLogoutConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <h4
              className="text-[19px] text-slate-800 mb-1.5"
              style={{ fontFamily: "'Fraunces', serif", fontWeight: 500 }}
            >
              退出管理后台？
            </h4>
            <p className="text-[13px] text-slate-500 leading-relaxed mb-5">
              您将从管理控制台登出，所有操作均需要重新登录才能继续。
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-[13px] text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-2.5 rounded-xl text-[13px] text-white bg-gradient-to-r from-rose-400 to-pink-500 hover:from-rose-500 hover:to-pink-600 shadow-md shadow-rose-200 transition-all"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in-left {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-slide-in-left { animation: slide-in-left 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-scale-in { animation: scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </>
  );
}
