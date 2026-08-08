'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories } from '@/contexts/CategoryContext';
import { useQuizCategories } from '@/contexts/QuizCategoryContext';
import { QuizResult } from '@/types';
import { useRouter, usePathname } from 'next/navigation';
import SettingsPanel from '@/components/SettingsPanel';
import CategoryTree from '@/components/CategoryTree';
import CreditBadge from '@/components/CreditBadge';
import { sha256Hex } from '@/lib/hash';
import { useDialog } from '@/components/DialogProvider';
import {
  TONE,
  SERIF,
  SectionLabel,
  NavItem,
  UserCard,
  SignInButton,
  DotPattern,
  DateLabel,
  SidebarDrawer,
} from '@/components/SidebarParts';

interface Props {
  onSelectResult?: (result: QuizResult) => void;
  open: boolean;
  onClose: () => void;
  /** peek 模式:hover 把手 / 点击把手时通知父级打开抽屉 */
  onOpen?: () => void;
  /** 当前在主区域打开的记录 id（用于侧栏内高亮） */
  activeResultId?: string | null;
}

const TONE_KEY = 'user' as const;

export default function Sidebar({ onSelectResult, open, onClose, onOpen, activeResultId }: Props) {
  const { token: userToken, user } = useAuth();
  // 兼容 admin 登录：admin 的 token 存在 localStorage.adminToken
  const [token, setToken] = useState<string | null>(userToken);
  useEffect(() => {
    setToken(userToken || (typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null));
  }, [userToken]);
  const cat = useCategories();
  const quizCat = useQuizCategories();
  const dialog = useDialog();
  const router = useRouter();
  const pathname = usePathname();
  const [results, setResults] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [currentQuizId, setCurrentQuizId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 隐藏的 file input ref —— 点"上传新题库"导航项时直接触发 */
  const sidebarFileInputRef = useRef<HTMLInputElement>(null);
  /** 解析中/上传中状态(用于在导航项上展示小转圈) */
  const [uploading, setUploading] = useState(false);
  /** 上传过程中的错误,用来 toast 提示(简化为 setState,直接 alert 也行) */
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reuploadChoice, setReuploadChoice] = useState<{
    quizId: string;
    draftId: string | null;
    hasSubmitted: boolean;
  } | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchResults = async () => {
      try {
        const res = await fetch('/api/results', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok) {
          setResults(data.results || []);
        }
      } catch (error) {
        console.error('获取结果失败:', error);
      }
    };

    fetchResults();
    const interval = setInterval(fetchResults, 5000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    const quizId = localStorage.getItem('currentQuizId');
    setCurrentQuizId(quizId);
  }, []);

  // 抽屉关闭时自动退出批量选择模式
  useEffect(() => {
    if (open) return;
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [open]);

  // 路由变化时自动关闭抽屉(点导航项后)
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // 点"上传新题库" -> 跳转到 /upload 页面(那里有解析选择对话框)
  const handleSidebarFilePick = () => {
    onClose();
    router.push('/upload');
  };

  // 用户在系统选择器里选完文件 -> 读文件 -> 解析 -> 创建 -> 跳答题页
  const handleSidebarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 清空 value,允许下次选同一个文件
    e.target.value = '';
    if (!file) return;
    if (!token) {
      await dialog.alert({ title: '未登录', message: '请先登录后再上传题库' });
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const text = await file.text();
      const { parseMarkdown, extractTitle } = await import('@/lib/parser');
      const questions = parseMarkdown(text);
      if (questions.length === 0) {
        setUploadError('未能解析到任何题目，请检查文件格式');
        setUploading(false);
        return;
      }
      const title = extractTitle(text);
      const fileKey = await sha256Hex(text);
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title, questions, fileKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || '创建失败');
        setUploading(false);
        return;
      }
      // 同 fileKey 已存在 → 弹选择层
      if (data.existed) {
        setUploading(false);
        setReuploadChoice({
          quizId: data.quiz.id,
          draftId: data.draftId ?? null,
          hasSubmitted: !!data.hasSubmitted,
        });
        return;
      }
      // 关抽屉 + 跳到答题页
      onClose();
      router.push(`/quiz/${data.quiz.id}`);
    } catch (err) {
      console.error('侧边栏上传失败:', err);
      setUploadError('解析失败：' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (result: any) => {
    const ok = await dialog.confirm({
      title: '删除记录',
      message: '确定要删除这条记录吗?',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/results?id=${result.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setResults((prev) => prev.filter((r) => r.id !== result.id));
      }
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await dialog.confirm({
      title: '批量删除',
      message: `确定要删除选中的 ${selectedIds.size} 条记录吗?`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;

    try {
      for (const id of selectedIds) {
        await fetch(`/api/results?id=${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      }
      setResults((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
    } catch (error) {
      console.error('批量删除失败:', error);
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === results.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(results.map((r) => r.id)));
  };

  // 批量把选中记录归入某分类（点击 CategoryTree 的分类行触发）
  const handleBatchAssign = (categoryId: string | null) => {
    for (const id of selectedIds) {
      cat.setResultCategory(id, categoryId);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  // 重传选择层处理
  const handleReuploadContinue = () => {
    if (!reuploadChoice) return;
    const id = reuploadChoice.quizId;
    setReuploadChoice(null);
    onClose();
    router.push(`/quiz/${id}`);
  };

  const handleReuploadRestart = async () => {
    if (!reuploadChoice || !token) return;
    const { quizId, draftId } = reuploadChoice;
    if (draftId) {
      try {
        await fetch(`/api/results?id=${draftId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        console.error('删除 draft 失败:', e);
      }
    }
    try { localStorage.removeItem(`quiz_progress_${quizId}`); } catch {}
    setReuploadChoice(null);
    onClose();
    router.push(`/quiz/${quizId}`);
  };

  const handleReuploadViewSubmitted = () => {
    if (!reuploadChoice) return;
    const id = reuploadChoice.quizId;
    setReuploadChoice(null);
    onClose();
    router.push(`/?focus=${id}`);
  };

  const drawerContent = (
    <>
      {/* 顶部：品牌 + 关闭按钮 */}
      <div className="relative p-4 border-b border-slate-200/60 flex-shrink-0">
        <div className="flex items-start justify-between gap-2 pr-8">
          <div className="min-w-0 flex-1">
            <h2
              className="text-[20px] leading-[1.15] text-slate-800 tracking-[-0.01em]"
              style={SERIF.italic}
            >
              答题工作台
            </h2>
            <p className="text-[10px] text-slate-400 tracking-wider uppercase mt-0.5">
              Workspace
            </p>
            <DateLabel />
<CreditBadge />
          </div>
        </div>
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/60 transition-all flex items-center justify-center"
          title="关闭"
          aria-label="关闭侧栏"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 主体：导航 + 记录 */}
      <div className="flex-1 overflow-y-auto">
        {/* 导航区 */}
        <div className="p-3 space-y-0.5">
          <NavItem
            tone={TONE_KEY}
            icon={
              <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            }
            label="首页"
            active={pathname === '/'}
            onClick={() => router.push('/')}
          />
          {user && (
            <>
              <NavItem
                tone={TONE_KEY}
                icon={
                  <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                }
                label={uploading ? '解析中…' : '上传新题库'}
                onClick={handleSidebarFilePick}
                disabled={uploading}
              />
              <NavItem
                tone={TONE_KEY}
                icon={
                  <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11H5m14-4H5m14 8H5m14 4H5" />
                  </svg>
                }
                label="题库管理"
                active={pathname === '/banks'}
                onClick={() => {
                  onClose();
                  router.push('/banks');
                }}
              />
              <NavItem
                tone={TONE_KEY}
                icon={
                  <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                }
                label="我的笔记"
                active={pathname === '/notes'}
                onClick={() => {
                  onClose();
                  router.push('/notes');
                }}
              />
              <NavItem
                tone={TONE_KEY}
                icon={
                  <svg className="w-[15px] h-[15px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
                label="个人设置"
                active={pathname === '/settings'}
                onClick={() => {
                  onClose();
                  router.push('/settings');
                }}
              />
            </>
          )}
        </div>

        {/* 题库分类导航 */}
        {user && (
          <div className="px-3 mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400 tracking-[0.15em] uppercase">题库分类</span>
            </div>
            <div className="space-y-0.5">
              {quizCat.all.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onClose();
                    // preset 直接传 key,user 传完整 id
                    const param = c.kind === 'preset' ? c.key : c.id;
                    router.push(`/?category=${encodeURIComponent(param)}`);
                  }}
                  className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-600 hover:bg-white/60 hover:text-slate-800 transition-colors"
                >
                  <span className="text-[13px]">{c.emoji}</span>
                  <span className="truncate">{c.text}</span>
                </button>
              ))}
              <button
                onClick={() => {
                  onClose();
                  router.push('/?category=uncat');
                }}
                className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-500 hover:bg-white/60 hover:text-slate-700 transition-colors"
              >
                <span className="text-[13px]">📂</span>
                <span className="truncate">未分类</span>
              </button>
              {quizCat.userCategories.length > 0 && (
                <div className="mt-1 pt-1 border-t border-slate-100">
                  {quizCat.userCategories.map((uc) => (
                    <div key={uc.id} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] text-slate-500 hover:bg-white/60 group/uc">
                      <span className="text-[13px]">🏷️</span>
                      <button
                        onClick={() => {
                          onClose();
                          router.push(`/?category=${encodeURIComponent(`user:${uc.id}`)}`);
                        }}
                        className="flex-1 text-left truncate text-slate-600 hover:text-slate-800"
                      >
                        {uc.name}
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await quizCat.removeUserCategory(`user:${uc.id}`);
                          } catch {
                            // 静默失败，不影响使用
                          }
                        }}
                        className="opacity-0 group-hover/uc:opacity-100 text-slate-400 hover:text-rose-500 transition-all text-[10px]"
                        title="删除此分类"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={async () => {
                  const name = await dialog.prompt({
                    title: '新建分类',
                    message: '输入新的题库分类名称',
                    placeholder: '例如: Docker',
                  });
                  if (name && name.trim()) {
                    try {
                      await quizCat.addUserCategory(name.trim());
                    } catch (err: any) {
                      await dialog.alert({
                        title: '创建分类失败',
                        message: err?.message || '请确认已登录后再试',
                        confirmText: '知道了',
                      });
                    }
                  }
                }}
                className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] text-sky-500 hover:bg-sky-50/60 transition-colors"
              >
                <span className="text-[13px]">+</span>
                <span>新建分类</span>
              </button>
            </div>
          </div>
        )}

        {/* 答题记录 —— 折叠分类树 */}
        {user && (
          <div className="px-3 mt-3">
            <SectionLabel
              right={
                <div className="flex items-center gap-1.5">
                  <span className="text-[9.5px] text-slate-300 tabular-nums">
                    {results.length}
                  </span>
                  <button
                    onClick={() => {
                      if (selectMode) {
                        setSelectMode(false);
                        setSelectedIds(new Set());
                      } else {
                        setSelectMode(true);
                      }
                    }}
                    className={`text-[9.5px] tracking-[0.15em] uppercase px-1.5 py-0.5 rounded transition-colors ${
                      selectMode
                        ? 'bg-sky-400 text-white'
                        : 'text-slate-400 hover:text-sky-500 hover:bg-sky-50'
                    }`}
                  >
                    {selectMode ? '取消' : '管理'}
                  </button>
                </div>
              }
            >
              Records · 答题记录
            </SectionLabel>

            {selectMode && (
              <div className="flex gap-1.5 mb-2.5">
                <button
                  onClick={selectAll}
                  className="flex-1 py-1 bg-slate-100 text-slate-600 text-[10.5px] rounded hover:bg-slate-200"
                >
                  {selectedIds.size === results.length ? '取消全选' : '全选'}
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedIds.size === 0}
                  className="flex-1 py-1 bg-rose-400 text-white text-[10.5px] rounded hover:bg-rose-500 disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            )}

            {/* 在管理模式下：点击分类名 → 批量把选中记录归入该分类 */}
            {selectMode && selectedIds.size > 0 && (
              <div className="mb-2 px-1 text-[10px] text-slate-400 tracking-wider uppercase">
                点击分类 · 把 {selectedIds.size} 条记录归入 →
              </div>
            )}

            {results.length === 0 ? (
              <p className="text-slate-400 text-[11px] px-1 py-2">暂无答题记录</p>
            ) : (
              <CategoryTree
                results={results}
                activeResultId={activeResultId ?? null}
                onResultClick={onSelectResult}
                batchSelectedIds={selectMode ? selectedIds : undefined}
                onBatchAssign={handleBatchAssign}
                onBatchToggleSelect={toggleSelect}
              />
            )}
          </div>
        )}
      </div>

      {/* 底部：设置入口 */}
      <div className="border-t border-slate-200/60 p-3 flex-shrink-0">
        {user ? (
          <UserCard
            username={user.username}
            isGuest={user.isGuest}
            tone={TONE_KEY}
            onClick={() => {
              onClose();
              router.push('/settings');
            }}
          />
        ) : (
          <SignInButton tone={TONE_KEY} onClick={() => router.push('/login')} />
        )}
      </div>
    </>
  );

  return (
    <>
      {/* 全局隐藏的 file input —— 点"上传新题库"导航项直接触发系统选择器 */}
      <input
        ref={sidebarFileInputRef}
        type="file"
        accept=".md,.txt"
        onChange={handleSidebarFileChange}
        className="hidden"
        aria-hidden
      />
      {uploadError && (
        <div
          role="alert"
          className="fixed top-4 right-4 z-[100] px-4 py-2 bg-rose-50 border border-rose-200 text-rose-600 text-sm rounded-xl shadow-lg anim-stagger-1"
          onClick={() => setUploadError(null)}
        >
          {uploadError}（点击关闭）
        </div>
      )}
      <SidebarDrawer open={open} onClose={onClose} onOpen={onOpen} tone={TONE_KEY}>
        {drawerContent}
      </SidebarDrawer>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {reuploadChoice && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }}
          onClick={() => setReuploadChoice(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-[18px] font-semibold text-slate-800 mb-2">检测到已存在的题库</h4>
            <p className="text-[13px] text-slate-500 mb-5">
              {reuploadChoice.draftId
                ? '这份文件之前有未提交的进度。'
                : '这份文件已经有完成记录。'}
            </p>
            <div className="space-y-2.5">
              {reuploadChoice.draftId && (
                <button
                  onClick={handleReuploadContinue}
                  className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all"
                >
                  继续上次进度
                </button>
              )}
              {reuploadChoice.draftId && (
                <button
                  onClick={handleReuploadRestart}
                  className="w-full py-2.5 text-[13.5px] text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  重新开始(清空旧进度)
                </button>
              )}
              {reuploadChoice.hasSubmitted && !reuploadChoice.draftId && (
                <button
                  onClick={handleReuploadViewSubmitted}
                  className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all"
                >
                  查看已有完成记录
                </button>
              )}
              {!reuploadChoice.draftId && !reuploadChoice.hasSubmitted && (
                <button
                  onClick={handleReuploadContinue}
                  className="w-full py-2.5 text-[13.5px] text-white bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 rounded-xl transition-all"
                >
                  进入答题
                </button>
              )}
              <button
                onClick={() => setReuploadChoice(null)}
                className="w-full py-2.5 text-[13px] text-slate-500 hover:text-slate-700 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
