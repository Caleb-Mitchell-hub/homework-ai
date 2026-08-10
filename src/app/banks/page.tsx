'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/components/DialogProvider';
import { SERIF } from '@/components/SidebarParts';
import { getCategoryDisplay, PREFIX_PRESET, PREFIX_USER } from '@/lib/quizCategories';
import { useQuizCategories } from '@/contexts/QuizCategoryContext';
import { quizToMarkdown } from '@/lib/quiz-to-markdown';
import JSZip from 'jszip';

interface QuizListItem {
  id: string;
  title: string;
  isOfficial: boolean;
  timeLimit: number;
  categoryId?: string | null;
  createdAt: string | Date;
  results?: Array<{ submittedAt: string | Date }>;
}

interface ParsedQuestion {
  type?: string;
  title?: string;
  [k: string]: unknown;
}

/** 解析 questions 字符串为题目数(后端存的是 JSON 字符串) */
function countQuestions(quiz: QuizListItem & { questionsRaw?: string }): number {
  const raw = quiz.questionsRaw;
  if (!raw) return 0;
  try {
    const arr = JSON.parse(raw) as ParsedQuestion[];
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

/** 格式化日期 */
function fmtDate(d: string | Date | undefined) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

/** 清理文件名中的非法字符 */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || '题库';
}

/** 触发浏览器下载 Blob */
function downloadBlob(data: string | Blob, filename: string, mime: string) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BanksPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const dialog = useDialog();
  const quizCat = useQuizCategories();

  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loadingList, setLoadingList] = useState(true);

  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<'created' | 'title' | 'count'>('created');

  /** 多选 + 批量操作 */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  /** 重命名状态 */
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  /** Toast */
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const showToast = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 2400);
  }, []);

  /** 导出选项弹窗 */
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportOpts, setExportOpts] = useState({
    aiExplanation: false,
    followUp: false,
    report: false,
  });
  const toggleExportOpt = (key: keyof typeof exportOpts) => {
    setExportOpts((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const toggleExportAll = () => {
    const allOn = exportOpts.aiExplanation && exportOpts.followUp && exportOpts.report;
    setExportOpts({ aiExplanation: !allOn, followUp: !allOn, report: !allOn });
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  /** 拉取题库(自己的 + 官方) */
  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      const res = await fetch('/api/quizzes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setQuizzes(data.quizzes || []);
      } else {
        showToast('err', data.error || '获取题库失败');
      }
    } catch (e) {
      console.error(e);
      showToast('err', '网络错误');
    } finally {
      setLoadingList(false);
    }
  }, [token, showToast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  /** 进入重命名态时聚焦输入框 */
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  // 只展示用户自己的题库(非官方)
  const myBanks = useMemo(() => quizzes.filter((q) => !q.isOfficial), [quizzes]);

  // 搜索 + 分类过滤 + 排序
  const view = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let filtered = kw ? myBanks.filter((q) => q.title.toLowerCase().includes(kw)) : myBanks;
    // 分类过滤
    if (categoryFilter && categoryFilter !== 'all') {
      if (categoryFilter === 'uncat') {
        filtered = filtered.filter((q) => !q.categoryId);
      } else {
        filtered = filtered.filter((q) => q.categoryId === categoryFilter);
      }
    }
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title, 'zh-CN');
      if (sortBy === 'count') {
        // 题数需要从 questions 字符串解析(列表接口不返回 questions 字段,这里用 results 长度代理?不行,用 createdAt 兜底)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return sorted;
  }, [myBanks, keyword, sortBy, categoryFilter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === view.length) setSelected(new Set());
    else setSelected(new Set(view.map((v) => v.id)));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  /** 删除单个题库 */
  const handleDeleteOne = async (id: string, title: string) => {
    const ok = await dialog.confirm({
      title: '删除题库',
      message: `确定要删除题库「${title}」吗?\n该题库下的所有答题记录也会被一起删除。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/quizzes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('err', data.error || '删除失败');
        return;
      }
      setQuizzes((prev) => prev.filter((q) => q.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast('ok', '已删除');
    } catch (e) {
      console.error(e);
      showToast('err', '网络错误');
    }
  };

  /** 批量删除 */
  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    const ok = await dialog.confirm({
      title: '批量删除题库',
      message: `确定要删除选中的 ${selected.size} 个题库吗?\n它们下面的所有答题记录也会被一起删除。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setBatchBusy(true);
    try {
      for (const id of selected) {
        await fetch(`/api/quizzes/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      setQuizzes((prev) => prev.filter((q) => !selected.has(q.id)));
      showToast('ok', `已删除 ${selected.size} 个题库`);
      exitSelectMode();
    } catch (e) {
      console.error(e);
      showToast('err', '批量删除失败');
    } finally {
      setBatchBusy(false);
    }
  };

  /** 待导出的题库 id 列表（打开弹窗时暂存） */
  const [pendingExportIds, setPendingExportIds] = useState<string[]>([]);

  /** 打开导出选项弹窗 */
  const openExportDialog = (ids: string[]) => {
    setPendingExportIds(ids);
    // 默认全部不勾选
    setExportOpts({ aiExplanation: false, followUp: false, report: false });
    setShowExportDialog(true);
  };

  /** 确认导出（从弹窗中调用） */
  const doExport = async () => {
    setShowExportDialog(false);
    await handleExport(pendingExportIds, exportOpts);
  };

  /**
   * 通用导出入口：传入题库 id 列表 + 导出选项。
   *  - 1 个 → 单 .md 文件
   *  - 多个 → 打包为 .zip
   */
  const handleExport = async (ids: string[], include?: {
    aiExplanation?: boolean;
    followUp?: boolean;
    report?: boolean;
  }) => {
    if (ids.length === 0) return;
    setExportBusy(true);
    try {
      const res = await fetch('/api/quizzes/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids, include }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('err', data.error || '导出失败');
        return;
      }
      const quizzes = data.quizzes || [];
      if (quizzes.length === 0) {
        showToast('err', '没有可导出的题库');
        return;
      }
      const ts = new Date().toISOString().slice(0, 10);

      if (quizzes.length === 1) {
        // 单个题库 → 直接下载 .md 文件
        const q = quizzes[0];
        const extras: any = {};
        if (q.explanations) extras.explanations = q.explanations;
        if (q.followups) extras.followups = q.followups;
        if (q.report) extras.report = q.report;
        const md = quizToMarkdown({
          title: q.title,
          questions: q.questions,
          timeLimit: q.timeLimit,
          createdAt: q.createdAt,
        }, Object.keys(extras).length > 0 ? extras : undefined);
        const safeName = sanitizeFilename(q.title);
        downloadBlob(md, `${safeName}.md`, 'text/markdown');
        showToast('ok', `已导出「${q.title}」`);
      } else {
        // 多个题库 → 打包为 .zip
        const zip = new JSZip();
        for (const q of quizzes) {
          const extras: any = {};
          if (q.explanations) extras.explanations = q.explanations;
          if (q.followups) extras.followups = q.followups;
          if (q.report) extras.report = q.report;
          const md = quizToMarkdown({
            title: q.title,
            questions: q.questions,
            timeLimit: q.timeLimit,
            createdAt: q.createdAt,
          }, Object.keys(extras).length > 0 ? extras : undefined);
          const safeName = sanitizeFilename(q.title);
          zip.file(`${safeName}.md`, md);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, `题库导出_${ts}_${quizzes.length}套.zip`, 'application/zip');
        showToast('ok', `已导出 ${quizzes.length} 个题库`);
      }
    } catch (e) {
      console.error(e);
      showToast('err', '导出失败');
    } finally {
      setExportBusy(false);
    }
  };

  /** 进入重命名 */
  const startRename = (q: QuizListItem) => {
    setRenamingId(q.id);
    setRenameValue(q.title);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  /** 修改题库分类 */
  const handleChangeCategory = async (quizId: string, newCategoryId: string | null) => {
    try {
      const res = await fetch(`/api/quizzes/${quizId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: undefined, categoryId: newCategoryId ?? '' }),
      });
      if (!res.ok) {
        const data = await res.json();
        showToast('err', data.error || '修改分类失败');
        return;
      }
      setQuizzes((prev) => prev.map((q) => (q.id === quizId ? { ...q, categoryId: newCategoryId } : q)));
      showToast('ok', '已更新分类');
    } catch {
      showToast('err', '网络错误');
    }
  };

  const submitRename = async () => {
    if (!renamingId) return;
    const newTitle = renameValue.trim();
    if (!newTitle) {
      showToast('err', '标题不能为空');
      return;
    }
    const original = myBanks.find((q) => q.id === renamingId);
    if (!original || original.title === newTitle) {
      cancelRename();
      return;
    }
    setRenameBusy(true);
    try {
      const res = await fetch(`/api/quizzes/${renamingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newTitle }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast('err', data.error || '重命名失败');
        return;
      }
      setQuizzes((prev) => prev.map((q) => (q.id === renamingId ? { ...q, title: newTitle } : q)));
      showToast('ok', '已重命名');
      cancelRename();
    } catch (e) {
      console.error(e);
      showToast('err', '网络错误');
    } finally {
      setRenameBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 顶部:返回 + 标题 */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回首页
          </button>
          <div className="text-center">
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-sky-500/80 font-medium mb-1">
              My Library
            </div>
            <h1
              className="text-[22px] leading-tight text-slate-800"
              style={SERIF.italic}
            >
              题库管理
            </h1>
          </div>
          <div className="w-20" />
        </div>

        {/* 工具条:搜索 + 排序 + 管理 */}
        <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索题库标题…"
              className="w-full pl-9 pr-3 py-2 bg-white/80 border border-slate-200 rounded-lg text-[13px] text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'created' | 'title' | 'count')}
            className="px-3 py-2 bg-white/80 border border-slate-200 rounded-lg text-[13px] text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            <option value="created">按创建时间</option>
            <option value="title">按标题</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-white/80 border border-slate-200 rounded-lg text-[13px] text-slate-700 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          >
            <option value="all">全部分类</option>
            {quizCat.presetCategories.map((c) => (
              <option key={c.key} value={`${PREFIX_PRESET}${c.key}`}>{c.emoji} {c.text}</option>
            ))}
            <option value="uncat">📂 未分类</option>
            {quizCat.userCategories.map((uc) => (
              <option key={uc.id} value={`${PREFIX_USER}${uc.id}`}>🏷️ {uc.name}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (selectMode) exitSelectMode();
              else setSelectMode(true);
            }}
            className={`px-4 py-2 rounded-lg text-[12.5px] tracking-wider uppercase transition-colors ${
              selectMode
                ? 'bg-sky-400 text-white'
                : 'text-slate-500 hover:text-sky-600 hover:bg-sky-50 border border-slate-200'
            }`}
          >
            {selectMode ? '取消' : '管理'}
          </button>
        </div>

        {/* 批量操作条 */}
        {selectMode && (
          <div className="flex items-center gap-2 mb-3 p-2.5 bg-sky-50/60 border border-sky-200/60 rounded-lg">
            <span className="text-[12px] text-slate-600 flex-1">
              已选 <span className="font-semibold text-sky-600">{selected.size}</span> / {view.length} 项
            </span>
            <button
              onClick={selectAll}
              className="px-3 py-1 text-[11.5px] text-slate-600 hover:text-sky-600 hover:bg-white rounded"
            >
              {selected.size === view.length ? '取消全选' : '全选'}
            </button>
            <button
              onClick={() => openExportDialog(Array.from(selected))}
              disabled={selected.size === 0 || exportBusy}
              className="px-3 py-1 text-[11.5px] bg-emerald-400 text-white rounded hover:bg-emerald-500 disabled:opacity-50"
            >
              {exportBusy ? '导出中…' : '导出'}
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selected.size === 0 || batchBusy}
              className="px-3 py-1 text-[11.5px] bg-rose-400 text-white rounded hover:bg-rose-500 disabled:opacity-50"
            >
              {batchBusy ? '删除中…' : '删除'}
            </button>
          </div>
        )}

        {/* 列表 */}
        {loadingList ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-white/60 border border-slate-200/60 animate-pulse" />
            ))}
          </div>
        ) : myBanks.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-200/60 rounded-2xl bg-white/40">
            <div className="text-slate-400 text-sm mb-3">还没有自己的题库</div>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-sky-400 text-white text-[13px] rounded-lg hover:bg-sky-500 transition-colors"
            >
              前往首页上传
            </button>
          </div>
        ) : view.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            没找到匹配「{keyword}」的题库
          </div>
        ) : (
          <ul className="space-y-2">
            {view.map((q) => {
              const isSelected = selected.has(q.id);
              const isRenaming = renamingId === q.id;
              const resultCount = q.results?.length ?? 0;
              const lastSubmitted = q.results?.[0]?.submittedAt;
              return (
                <li
                  key={q.id}
                  className={`group flex items-center gap-3 p-3.5 bg-white/80 border rounded-xl transition-all ${
                    isSelected
                      ? 'border-sky-400 bg-sky-50/40'
                      : 'border-slate-200/60 hover:border-sky-300 hover:shadow-sm'
                  }`}
                >
                  {/* 多选勾 */}
                  {selectMode && (
                    <button
                      onClick={() => toggleSelect(q.id)}
                      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-sky-400 border-sky-400'
                          : 'border-slate-300 hover:border-sky-400'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )}

                  {/* 主体 */}
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename();
                            else if (e.key === 'Escape') cancelRename();
                          }}
                          onBlur={() => {
                            // blur 时若未保存则放弃
                            if (renamingId) cancelRename();
                          }}
                          disabled={renameBusy}
                          className="flex-1 px-2 py-1 bg-white border border-sky-400 rounded text-[14px] text-slate-800 outline-none focus:ring-4 focus:ring-sky-100"
                        />
                        <button
                          onMouseDown={(e) => e.preventDefault()} // 防止 blur 先触发
                          onClick={submitRename}
                          disabled={renameBusy}
                          className="px-2.5 py-1 bg-sky-400 text-white text-[11.5px] rounded hover:bg-sky-500 disabled:opacity-50"
                        >
                          保存
                        </button>
                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={cancelRename}
                          disabled={renameBusy}
                          className="px-2.5 py-1 text-slate-500 text-[11.5px] rounded hover:bg-slate-100"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          onClick={() => {
                            if (!selectMode) router.push(`/quiz/${q.id}`);
                          }}
                          className={`text-[14px] font-medium text-slate-800 truncate ${
                            !selectMode ? 'cursor-pointer hover:text-sky-600' : ''
                          } transition-colors`}
                          title={q.title}
                        >
                          {q.title}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10.5px] text-slate-400">
                          <span>创建于 {fmtDate(q.createdAt)}</span>
                          {q.timeLimit > 0 && <span>· {q.timeLimit} 分钟</span>}
                          {(() => {
                            const cd = getCategoryDisplay(q.categoryId);
                            return cd.kind !== 'none' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{cd.emoji} {cd.text}</span>
                            ) : (
                              <span className="text-slate-300">未分类</span>
                            );
                          })()}
                          {resultCount > 0 && <span>· 最近答题 {fmtDate(lastSubmitted)}</span>}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 操作按钮组(非选择模式 + 非重命名态时显示) */}
                  {!selectMode && !isRenaming && (
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => router.push(`/quiz/${q.id}`)}
                        title="开始/继续答题"
                        className="px-2.5 py-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded text-[11.5px] transition-colors"
                      >
                        答题
                      </button>
                      <button
                        onClick={() => openExportDialog([q.id])}
                        disabled={exportBusy}
                        title="导出为 Markdown 文件"
                        className="px-2.5 py-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded text-[11.5px] transition-colors disabled:opacity-50"
                      >
                        导出
                      </button>
                      <select
                        value={q.categoryId ?? ''}
                        onChange={(e) => handleChangeCategory(q.id, e.target.value || null)}
                        title="修改分类"
                        className="px-2 py-1.5 text-[11px] bg-transparent border border-slate-200 rounded text-slate-500 outline-none focus:border-sky-400 cursor-pointer hover:bg-white"
                      >
                        <option value="">未分类</option>
                        {quizCat.presetCategories.map((c) => (
                          <option key={c.key} value={`${PREFIX_PRESET}${c.key}`}>{c.emoji} {c.text}</option>
                        ))}
                        {quizCat.userCategories.length > 0 && (
                          <optgroup label="我的分类">
                            {quizCat.userCategories.map((uc) => (
                              <option key={uc.id} value={`${PREFIX_USER}${uc.id}`}>🏷️ {uc.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <button
                        onClick={() => startRename(q)}
                        title="重命名"
                        className="px-2.5 py-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded text-[11.5px] transition-colors"
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => handleDeleteOne(q.id, q.title)}
                        title="删除"
                        className="px-2.5 py-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded text-[11.5px] transition-colors"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 导出选项弹窗 */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <h3 className="text-slate-800 text-lg font-bold mb-1">导出选项</h3>
            <p className="text-[12px] text-slate-500 mb-4">
              即将导出 {pendingExportIds.length} 个题库。选择需要包含的附加内容：
            </p>
            <div className="space-y-3 mb-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked
                  disabled
                  className="w-4 h-4 rounded accent-sky-400 opacity-60"
                />
                <span className="text-[13px] text-slate-700">题目与答案<span className="text-[11px] text-slate-400 ml-1">（默认包含）</span></span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExportOpt('aiExplanation')}>
                <input
                  type="checkbox"
                  checked={exportOpts.aiExplanation}
                  onChange={() => toggleExportOpt('aiExplanation')}
                  className="w-4 h-4 rounded accent-violet-400"
                />
                <span className="text-[13px] text-slate-700">AI 解析</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExportOpt('followUp')}>
                <input
                  type="checkbox"
                  checked={exportOpts.followUp}
                  onChange={() => toggleExportOpt('followUp')}
                  className="w-4 h-4 rounded accent-indigo-400"
                />
                <span className="text-[13px] text-slate-700">追问记录</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExportOpt('report')}>
                <input
                  type="checkbox"
                  checked={exportOpts.report}
                  onChange={() => toggleExportOpt('report')}
                  className="w-4 h-4 rounded accent-emerald-400"
                />
                <span className="text-[13px] text-slate-700">答题报告</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer" onClick={toggleExportAll}>
                <input
                  type="checkbox"
                  checked={exportOpts.aiExplanation && exportOpts.followUp && exportOpts.report}
                  onChange={toggleExportAll}
                  className="w-4 h-4 rounded accent-sky-400"
                />
                <span className="text-[13px] text-slate-700 font-medium">全选</span>
              </label>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowExportDialog(false)}
                className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-[13px]"
              >
                取消
              </button>
              <button
                onClick={doExport}
                disabled={exportBusy}
                className="flex-1 py-2 bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-lg hover:from-sky-500 hover:to-emerald-500 text-[13px] disabled:opacity-50"
              >
                {exportBusy ? '导出中…' : '确认导出'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="alert"
          onClick={() => setToast(null)}
          className={`fixed top-4 right-4 z-[100] px-4 py-2 text-sm rounded-xl shadow-lg cursor-pointer anim-fade-in border ${
            toast.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-600'
          }`}
        >
          {toast.text}（点击关闭）
        </div>
      )}
    </div>
  );
}
