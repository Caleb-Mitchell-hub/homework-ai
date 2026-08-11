'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getCategoryDisplay, PREFIX_PRESET } from '@/lib/quizCategories';
import { useQuizCategories } from '@/contexts/QuizCategoryContext';
import SignupBonusModal from '@/components/SignupBonusModal';
import CategoryIcon from '@/components/CategoryIcon';

interface QuizListItem {
  id: string;
  title: string;
  isOfficial: boolean;
  timeLimit: number;
  categoryId?: string | null;
  createdAt: string | Date;
  results?: any[];
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">加载中...</div>}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, loading } = useAuth();
  const quizCat = useQuizCategories();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [professions, setProfessions] = useState<{ id: string; name: string }[]>([]);
  const [guestProfessionId, setGuestProfessionId] = useState<string>(
    typeof window !== 'undefined' ? localStorage.getItem('guestProfessionId') || '' : ''
  );
  const [signupBonus, setSignupBonus] = useState<number | null>(null);

  const activeCategory = searchParams.get('category') ?? 'all';

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // 检测新用户注册奖励标记（注册成功后写入的 localStorage）
  useEffect(() => {
    if (!loading && user && !user.isGuest) {
      const bonus = localStorage.getItem('signup_bonus');
      if (bonus) {
        setSignupBonus(parseInt(bonus, 10) || 300);
      }
    }
  }, [loading, user]);

  // 加载职业列表
  useEffect(() => {
    fetch('/api/professions')
      .then((res) => res.json())
      .then((data) => { if (data.professions) setProfessions(data.professions); })
      .catch(() => {});
  }, []);

  // 监听游客职业切换事件
  useEffect(() => {
    const handler = (e: Event) => {
      setGuestProfessionId((e as CustomEvent).detail || '');
    };
    window.addEventListener('guest-profession-changed', handler);
    return () => window.removeEventListener('guest-profession-changed', handler);
  }, []);

  // 拉取题库列表(自己的 + 所有官方的)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (activeCategory && activeCategory !== 'all') params.set('category', activeCategory);
        // 游客传 professionId
        if (user?.isGuest && guestProfessionId) params.set('professionId', guestProfessionId);
        const qs = params.toString();
        const url = qs ? `/api/quizzes?${qs}` : '/api/quizzes';
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && res.ok) {
          setQuizzes(data.quizzes || []);
        }
      } catch (e) {
        console.error('获取题库列表失败:', e);
      } finally {
        if (!cancelled) setLoadingQuizzes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, activeCategory, guestProfessionId, user?.isGuest]);

  // 统计每个分类下的题库数(从全量请求,仅在 "全部"tab 时展示)
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const q of quizzes) {
      const key = q.categoryId || 'uncat';
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [quizzes]);

  const setCategory = (cat: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (cat === 'all') params.delete('category');
    else params.set('category', cat);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const officialQuizzes = quizzes.filter((q) => q.isOfficial);
  const myQuizzes = quizzes.filter((q) => !q.isOfficial);

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {/* 头部标题 */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">在线答题系统</h1>
          <p className="text-slate-500 text-sm">选择官方题库,或上传自己的 Markdown 题目开始答题</p>

          {/* 游客职业切换 */}
          {user?.isGuest && (
            <div className="flex items-center justify-center gap-2.5 mt-3">
              <span className="text-[12px] text-slate-500 font-medium">当前职业</span>
              <div className="relative">
                <select
                  value={guestProfessionId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGuestProfessionId(v);
                    if (v) localStorage.setItem('guestProfessionId', v);
                    else localStorage.removeItem('guestProfessionId');
                  }}
                  className="text-[13px] pl-3.5 pr-8 py-2 bg-white/80 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 appearance-none cursor-pointer hover:border-sky-300 transition-colors min-w-[140px]"
                >
                  <option value="">未选择</option>
                  {professions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* 登录用户未选择职业提示 */}
          {user && !user.isGuest && !user.professionId && (
            <div className="mt-4 inline-flex flex-col items-center gap-2.5 p-3.5 bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-[13px] text-slate-600">
                <svg className="w-4 h-4 flex-shrink-0 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>请选择你的职业，以查看对应的题库</span>
              </div>
              <div className="relative">
                <select
                  value={user.professionId || ''}
                  onChange={async (e) => {
                    const v = e.target.value || null;
                    const token = localStorage.getItem('token');
                    if (!token) return;
                    await fetch('/api/user/profession', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ professionId: v }),
                    });
                    // 更新 localStorage 中的 user，避免刷新后再次提示
                    const storedUser = localStorage.getItem('user');
                    if (storedUser) {
                      const u = JSON.parse(storedUser);
                      u.professionId = v;
                      localStorage.setItem('user', JSON.stringify(u));
                    }
                    window.location.reload();
                  }}
                  className="text-[13px] pl-3.5 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 appearance-none cursor-pointer hover:border-sky-300 transition-colors min-w-[160px]"
                >
                  <option value="">选择职业…</option>
                  {professions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* 分类筛选 tab */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-wrap justify-center">
          {/* "全部" tab */}
          <button
            onClick={() => setCategory('all')}
            className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-all ${
              activeCategory === 'all'
                ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                : 'bg-white/70 border border-slate-200/60 text-slate-500 hover:text-slate-700 hover:bg-white'
            }`}
          >
            全部 <span className="ml-1 opacity-70 tabular-nums">{quizzes.length}</span>
          </button>
          {/* 预设分类 */}
          {quizCat.presetCategories.map((cat) => {
            const id = `${PREFIX_PRESET}${cat.key}`;
            const count = categoryCounts[id] || 0;
            const isActive = activeCategory === cat.key || activeCategory === id;
            return (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                    : 'bg-white/70 border border-slate-200/60 text-slate-500 hover:text-slate-700 hover:bg-white'
                }`}
              >
                <CategoryIcon emoji={cat.emoji} size="sm" /> {cat.text} <span className="ml-1 opacity-70 tabular-nums">{count}</span>
              </button>
            );
          })}
          {/* 未分类 tab */}
          {(() => {
            const uncatCount = categoryCounts['uncat'] || 0;
            const isActive = activeCategory === 'uncat';
            return (
              <button
                onClick={() => setCategory('uncat')}
                className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                    : 'bg-white/70 border border-slate-200/60 text-slate-500 hover:text-slate-700 hover:bg-white'
                }`}
              >
                📂 未分类 <span className="ml-1 opacity-70 tabular-nums">{uncatCount}</span>
              </button>
            );
          })()}
        </div>

        {/* 官方题库区块 */}
        <section>
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-[10.5px] tracking-[0.25em] uppercase text-indigo-500/80 font-medium mb-1">
                Official Library
              </div>
              <h2
                className="text-[22px] leading-tight text-slate-800"
                style={{ fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic', fontWeight: 500 }}
              >
                官方题库
              </h2>
            </div>
            <span className="text-[11px] text-slate-400 tabular-nums">{officialQuizzes.length} 套</span>
          </div>

          {loadingQuizzes ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl bg-white/60 border border-slate-200/60 animate-pulse"
                />
              ))}
            </div>
          ) : officialQuizzes.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-10 border border-dashed border-slate-200/60 rounded-2xl bg-white/40">
              {activeCategory !== 'all' ? '该分类下暂无官方题库' : '暂未发布官方题库'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {officialQuizzes.map((q) => {
                const display = getCategoryDisplay(q.categoryId);
                return (
                  <button
                    key={q.id}
                    onClick={() => router.push(`/quiz/${q.id}`)}
                    className="group text-left p-4 rounded-2xl bg-white/80 border border-indigo-200/40 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-100 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-indigo-50 text-indigo-600 font-medium tracking-wider">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.364 1.118l1.287 3.957c.299.921-.756 1.688-1.539 1.118L10 14.347l-3.367 2.446c-.783.57-1.838-.197-1.539-1.118l1.287-3.957a1 1 0 00-.364-1.118L2.65 8.384c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
                        </svg>
                        官方
                      </span>
                      <div className="flex items-center gap-1.5">
                        {display.kind !== 'none' && (
                          <CategoryIcon emoji={display.emoji} size="sm" />
                        )}
                        {q.timeLimit > 0 && (
                          <span className="text-[10px] text-slate-400 tabular-nums">{q.timeLimit} 分钟</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[14px] font-semibold text-slate-800 line-clamp-2 mb-1.5 group-hover:text-indigo-600 transition-colors">
                      {q.title}
                    </div>
                    <div className="flex items-center justify-between text-[10.5px] text-slate-400">
                      <span>
                        {q.results && q.results.length > 0 ? '已有答题记录 · 点击继续' : '点击开始答题 →'}
                      </span>
                      {display.kind !== 'none' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded-full">{display.text}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* 自己的题库(仅展示最近 6 个,折叠入口放底部) */}
        {myQuizzes.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-4">
              <div>
                <div className="text-[10.5px] tracking-[0.25em] uppercase text-sky-500/80 font-medium mb-1">
                  My Library
                </div>
                <h2
                  className="text-[22px] leading-tight text-slate-800"
                  style={{ fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic', fontWeight: 500 }}
                >
                  我的题库
                </h2>
              </div>
              <span className="text-[11px] text-slate-400 tabular-nums">{myQuizzes.length} 套</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {myQuizzes.slice(0, 6).map((q) => {
                const display = getCategoryDisplay(q.categoryId);
                return (
                  <button
                    key={q.id}
                    onClick={() => router.push(`/quiz/${q.id}`)}
                    className="group text-left p-4 rounded-2xl bg-white/70 border border-slate-200/60 hover:border-sky-400 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-500 font-medium tracking-wider">
                        我的
                      </span>
                      <div className="flex items-center gap-1.5">
                        {display.kind !== 'none' && (
                          <CategoryIcon emoji={display.emoji} size="sm" />
                        )}
                        {q.timeLimit > 0 && (
                          <span className="text-[10px] text-slate-400 tabular-nums">{q.timeLimit} 分钟</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[14px] font-semibold text-slate-800 line-clamp-2 mb-1.5 group-hover:text-sky-600 transition-colors">
                      {q.title}
                    </div>
                    <div className="flex items-center justify-between text-[10.5px] text-slate-400">
                      <span>
                        {q.results && q.results.length > 0 ? '已有答题记录 · 点击继续' : '点击开始答题 →'}
                      </span>
                      {display.kind !== 'none' && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded-full">{display.text}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* 新用户注册奖励弹窗 */}
      {signupBonus !== null && (
        <SignupBonusModal
          amount={signupBonus}
          onClose={() => setSignupBonus(null)}
        />
      )}
    </div>
  );
}
