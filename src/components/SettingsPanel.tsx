'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/components/DialogProvider';

interface Props {
  open: boolean;
  onClose: () => void;
}

// 段区间纹理分隔
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

// 区块标题：左小竖条 + 标题 + 副标题
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

// 标签行
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

// 切换开关：滑动胶囊
function Toggle({
  checked,
  onChange,
  accent = 'from-sky-400 to-emerald-400',
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

// 数字调节：− N +
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
        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-500 transition-colors text-sm leading-none flex items-center justify-center"
      >
        −
      </button>
      <div className="w-12 h-7 flex items-center justify-center text-[13px] font-medium text-slate-700 tabular-nums">
        {value}
        {unit}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-500 transition-colors text-sm leading-none flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}

export default function SettingsPanel({ open, onClose }: Props) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const dialog = useDialog();
  const panelRef = useRef<HTMLDivElement>(null);

  // 状态
  const [fontSize, setFontSize] = useState(16);
  const [remember, setRemember] = useState(true);
  const [autosave, setAutosave] = useState(true);
  const [showCorrect, setShowCorrect] = useState(false);
  const [animations, setAnimations] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [animateKey, setAnimateKey] = useState(0);

  // 初始化读取偏好
  useEffect(() => {
    if (!open) return;
    setAnimateKey(k => k + 1);
    const saved = localStorage.getItem('fontSize');
    if (saved) setFontSize(parseInt(saved));
    const r = localStorage.getItem('remember_flag') === '1';
    setRemember(r);
    const a = localStorage.getItem('pref_autosave');
    setAutosave(a !== '0');
    const sc = localStorage.getItem('pref_show_correct');
    setShowCorrect(sc === '1');
    const an = localStorage.getItem('pref_animations');
    setAnimations(an !== '0');
  }, [open]);

  // 实时同步字体
  useEffect(() => {
    document.documentElement.style.setProperty('--base-font-size', `${fontSize}px`);
    localStorage.setItem('fontSize', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('pref_autosave', autosave ? '1' : '0');
    localStorage.setItem('pref_show_correct', showCorrect ? '1' : '0');
    localStorage.setItem('pref_animations', animations ? '1' : '0');
  }, [autosave, showCorrect, animations]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 锁定背景滚动
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
    window.location.href = '/login';
  };

  if (!open) return null;

  return (
    <>
      {/* 背景遮罩：渐变模糊（区别于普通黑色遮罩） */}
      <div
        className="fixed inset-0 z-[80] animate-fade-in"
        style={{
          background:
            'radial-gradient(circle at 20% 0%, rgba(56, 189, 248, 0.12), transparent 50%), radial-gradient(circle at 80% 100%, rgba(16, 185, 129, 0.10), transparent 50%), rgba(15, 23, 42, 0.30)',
          backdropFilter: 'blur(6px)',
        }}
        onClick={onClose}
      />

      {/* 主面板：左侧抽屉式（覆盖现有 Sidebar） */}
      <div
        ref={panelRef}
        className="fixed top-0 left-0 bottom-0 z-[90] w-full sm:w-[460px] shadow-2xl flex flex-col animate-slide-in-left"
        style={{
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.96) 100%)',
          borderRight: '1px solid rgba(226, 232, 240, 0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部：细线 + 关闭 */}
        <div className="px-7 pt-6 pb-4 flex items-start justify-between">
          <div>
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-sky-500/80 font-medium mb-1.5">
              Preferences
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
              设置
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

        {/* 主体：分栏滚动区 */}
        <div className="flex-1 overflow-y-auto px-7 pb-6">
          {/* ==== 账户 ==== */}
          {user && (
            <>
              <SectionTitle
                accent="linear-gradient(180deg, #38bdf8, #34d399)"
                title="账户"
                subtitle="Account"
              />

              {/* 用户卡：头像 + 角色徽章 */}
              <div
                className="relative p-4 rounded-2xl overflow-hidden mb-3"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(224, 242, 254, 0.5) 0%, rgba(209, 250, 229, 0.5) 100%)',
                  border: '1px solid rgba(186, 230, 253, 0.4)',
                }}
              >
                {/* 角落装饰：圆点阵 */}
                <div
                  className="absolute top-2 right-2 w-12 h-12 opacity-30"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, rgba(56, 189, 248, 0.5) 1px, transparent 1.5px)',
                    backgroundSize: '6px 6px',
                  }}
                />
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center text-white font-semibold shadow-md shadow-sky-200">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-slate-800 truncate">
                      {user.username}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          user.isGuest
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {user.isGuest ? 'GUEST' : 'MEMBER'}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {user.isGuest ? '匿名身份' : '已登录账号'}
                      </span>
                    </div>
                  </div>
                </div>
                {user.isGuest && (
                  <button
                    onClick={() => {
                      onClose();
                      router.push('/login?mode=register');
                    }}
                    className="mt-3 w-full py-2 text-[12px] text-sky-600 hover:text-sky-700 bg-white/60 hover:bg-white border border-sky-200 rounded-lg transition-colors"
                  >
                    注册账号以保存当前进度 →
                  </button>
                )}
              </div>

              <Row label="记住用户名" hint="下次自动填入登录表单">
                <Toggle checked={remember} onChange={(v) => {
                  setRemember(v);
                  if (!v) {
                    localStorage.removeItem('remember_flag');
                    localStorage.removeItem('remember_username');
                  } else if (user.username) {
                    localStorage.setItem('remember_flag', '1');
                    localStorage.setItem('remember_username', user.username);
                  }
                }} />
              </Row>
            </>
          )}

          <HairlineDivider />

          {/* ==== 答题 ==== */}
          <SectionTitle
            accent="linear-gradient(180deg, #a78bfa, #f472b6)"
            title="答题偏好"
            subtitle="Quiz"
          />

          <Row label="字体大小" hint="调整所有题目的正文字号">
            <Stepper
              value={fontSize}
              onChange={setFontSize}
              min={12}
              max={24}
              unit="px"
            />
          </Row>

          <div className="mt-1 mb-1 p-3 rounded-xl bg-slate-50/80 border border-slate-100">
            <div className="text-[10px] tracking-wider uppercase text-slate-400 mb-1.5">Preview</div>
            <div
              className="text-slate-700 leading-relaxed"
              style={{ fontSize: `${fontSize}px` }}
            >
              这是一段示例题目文字，<span className="text-sky-600">关键词</span> 会被高亮。
            </div>
          </div>

          <Row label="自动暂存进度" hint="每 5 秒保存当前答题内容到本地">
            <Toggle checked={autosave} onChange={setAutosave} />
          </Row>

          <Row label="提交后显示答案" hint="立刻查看正确答案，无需进入结果页">
            <Toggle
              checked={showCorrect}
              onChange={setShowCorrect}
              accent="from-violet-400 to-pink-400"
            />
          </Row>

          <HairlineDivider />

          {/* ==== 外观 ==== */}
          <SectionTitle
            accent="linear-gradient(180deg, #fbbf24, #fb923c)"
            title="外观与动效"
            subtitle="Appearance"
          />

          <Row label="开启过渡动画" hint="淡入淡出与元素位移">
            <Toggle
              checked={animations}
              onChange={setAnimations}
              accent="from-amber-400 to-orange-400"
            />
          </Row>

          <Row label="背景风格" hint="可恢复浅色渐变背景">
            <button
              onClick={() => {
                document.documentElement.style.setProperty('--bg-style', 'default');
                localStorage.setItem('bg_style', 'default');
              }}
              className="px-3 py-1.5 text-[12px] text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
            >
              重置
            </button>
          </Row>

          <HairlineDivider />

          {/* ==== 数据 ==== */}
          <SectionTitle
            accent="linear-gradient(180deg, #64748b, #94a3b8)"
            title="数据与缓存"
            subtitle="Storage"
          />

          <Row label="草稿" hint="未提交的答题进度">
            <button
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: '清空所有本地草稿',
                  message: '确定要清空所有本地草稿吗?此操作不可恢复。',
                  confirmText: '清空',
                  danger: true,
                });
                if (!ok) return;
                Object.keys(localStorage).forEach((k) => {
                  if (k.startsWith('quiz_progress_')) localStorage.removeItem(k);
                });
                setAnimateKey(k => k + 1);
              }}
              className="px-3 py-1.5 text-[12px] text-slate-500 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
            >
              清空
            </button>
          </Row>

          <Row label="偏好设置" hint="字体、动画等本地配置">
            <button
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: '重置所有偏好',
                  message: '确定要重置所有偏好为默认值吗?',
                  confirmText: '重置',
                  danger: true,
                });
                if (!ok) return;
                ['fontSize', 'pref_autosave', 'pref_show_correct', 'pref_animations'].forEach(k =>
                  localStorage.removeItem(k)
                );
                setFontSize(16);
                setAutosave(true);
                setShowCorrect(false);
                setAnimations(true);
                setAnimateKey(k => k + 1);
              }}
              className="px-3 py-1.5 text-[12px] text-slate-500 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
            >
              重置
            </button>
          </Row>

          <HairlineDivider />

          {/* ==== 账户操作（已登录时显示） ==== */}
          {user && (
            <>
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
            </>
          )}

          {/* 底部签名行 */}
          <div className="mt-10 pt-5 border-t border-slate-200/60 flex items-center justify-between text-[10.5px] tracking-wider uppercase text-slate-400">
            <span>v0.4.0</span>
            <span
              className="italic"
              style={{ fontFamily: "'Fraunces', serif" }}
            >
              made with care
            </span>
          </div>
        </div>
      </div>

      {/* 退出确认弹窗（弹窗之上再嵌一个轻量确认层） */}
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
              确认退出？
            </h4>
            <p className="text-[13px] text-slate-500 leading-relaxed mb-5">
              当前账号将从本设备登出，已提交的答题记录会保留在云端。
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

      {/* 全局动画样式（局部作用域） */}
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
