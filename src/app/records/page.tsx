'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCategories } from '@/contexts/CategoryContext';
import { RecordSummary } from '@/types';
import RecordCard from '@/components/RecordCard';
import RecordDetailDrawer from '@/components/RecordDetailDrawer';
import { migrateCategoriesIfNeeded } from '@/lib/migrate-categories';
import { useDialog } from '@/components/DialogProvider';
import ExportDialog from '@/components/ExportDialog';
import { resultToMarkdown, type ExportSections } from '@/lib/result-to-markdown';
import { downloadZip } from '@/lib/download';

const SYSTEM_TABS = [
  { key: 'all', label: '全部' },
  { key: 'recent', label: '最近' },
  { key: 'draft', label: '草稿' },
  { key: 'uncat', label: '未分类' },
] as const;

const SORT_OPTIONS = [
  { value: 'recent', label: '最近优先' },
  { value: 'score_desc', label: '得分最高' },
  { value: 'score_asc', label: '得分最低' },
];

export default function RecordsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">加载中...</div>}>
      <RecordsContent />
    </Suspense>
  );
}

function RecordsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, loading } = useAuth();
  const ctx = useCategories();
  const dialog = useDialog();

  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingRecords, setLoadingRecords] = useState(false);

  // 筛选状态
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSysTab, setActiveSysTab] = useState<string>('all');
  const [activeUserCategory, setActiveUserCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('recent');

  // 详情抽屉
  const selectedId = searchParams.get('id');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 批量导出状态
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = 20;

  // 权限守卫
  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  // 迁移旧 localStorage 分类
  useEffect(() => {
    if (!token || !user?.id) return;
    migrateCategoriesIfNeeded(user.id, token).then((migrated) => {
      if (migrated) {
        // 刷新页面以重新加载分类
        window.location.reload();
      }
    });
  }, [token, user?.id]);

  // URL ?id=xxx 自动打开抽屉
  useEffect(() => {
    if (selectedId) setDrawerOpen(true);
  }, [selectedId]);

  // 拉取记录
  const fetchRecords = useCallback(async () => {
    if (!token) return;
    setLoadingRecords(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('sort', sortBy);
      if (searchQuery) params.set('search', searchQuery);
      if (activeUserCategory) params.set('categoryId', activeUserCategory);
      if (activeSysTab === 'recent') params.set('sysCategory', 'recent');
      else if (activeSysTab === 'draft') params.set('status', 'draft');
      else if (activeSysTab === 'uncat') params.set('sysCategory', 'uncat');

      const res = await fetch(`/api/results?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data.results ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (e) {
      console.error('加载记录失败:', e);
    } finally {
      setLoadingRecords(false);
    }
  }, [token, page, sortBy, searchQuery, activeUserCategory, activeSysTab]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // 搜索防抖
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
    }, 300);
  };

  // 切换分类 tab
  const handleTabChange = (key: string) => {
    setActiveSysTab(key);
    setActiveUserCategory(null);
    setPage(1);
  };

  const handleUserCategoryClick = (catId: string) => {
    setActiveSysTab('');
    setActiveUserCategory(catId);
    setPage(1);
  };

  // 关闭抽屉
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    router.replace('/records');
  };

  // 删除记录
  const handleDelete = async (id: string) => {
    const ok = await dialog.confirm({
      title: '删除记录',
      message: '确定要删除这条答题记录吗？',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/results?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setRecords((prev) => prev.filter((r) => r.id !== id));
        setTotal((prev) => prev - 1);
      }
    } catch {
      // 忽略错误
    }
  };

  // 切换单条选中
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 批量导出
  const handleExport = async (sections: ExportSections) => {
    setExportOpen(false);
    setExporting(true);
    try {
      const files: { name: string; content: string }[] = [];
      await Promise.all(
        [...selectedIds].map(async (id) => {
          try {
            const res = await fetch(`/api/export/result/${id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            const md = resultToMarkdown({
              result: {
                name: data.result.name,
                score: data.result.score,
                totalScore: data.result.totalScore,
                submittedAt: data.result.submittedAt,
                items: data.result.items,
              },
              quiz: data.quiz,
              explanations: data.explanations,
              followups: data.followups,
              notes: data.notes,
              report: data.report,
              sections,
            });
            files.push({ name: data.result.name, content: md });
          } catch (e) {
            console.error('导出单条失败:', id, e);
          }
        })
      );
      if (files.length) {
        await downloadZip(`答题记录导出_${new Date().toISOString().slice(0, 10)}`, files);
      } else {
        await dialog.alert({ title: '导出失败', message: '没有成功生成可导出的记录，请重试' });
      }
    } finally {
      setExporting(false);
      setSelectMode(false);
      setSelectedIds(new Set());
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50">
        <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 顶部标题栏 */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-[13px] text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1.5"
          >
            ← 返回首页
          </button>
          <h1 className="text-xl font-bold text-slate-800">答题记录</h1>
          <span className="text-[11px] text-slate-400 tabular-nums ml-auto">{total} 条记录</span>
        </div>

        {/* 批量导出工具栏 */}
        {selectMode && (
          <div className="flex items-center gap-3 mb-4 px-3 py-2 bg-white/70 border border-slate-200/60 rounded-xl">
            <span className="text-[12px] text-slate-600">已选 {selectedIds.size} 条</span>
            <button
              onClick={() => setSelectedIds(records.length === selectedIds.size ? new Set() : new Set(records.map((r) => r.id)))}
              className="text-[12px] text-sky-500 hover:underline"
            >
              {records.length === selectedIds.size ? '取消全选' : '全选'}
            </button>
            <button
              onClick={() => { if (selectedIds.size) setExportOpen(true); }}
              disabled={!selectedIds.size || exporting}
              className="text-[12px] text-indigo-600 hover:underline disabled:opacity-40"
            >
              {exporting ? '导出中...' : '批量导出'}
            </button>
            <button
              onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
              className="text-[12px] text-slate-500 hover:underline ml-auto"
            >
              退出多选
            </button>
          </div>
        )}

        {/* 搜索框 */}
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索题库名或记录名..."
            className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white/80 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 transition-all"
          />
        </div>

        {/* 分类 tab */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {SYSTEM_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all ${
                activeSysTab === tab.key && !activeUserCategory
                  ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                  : 'bg-white/70 border border-slate-200/60 text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {/* 用户自定义分类 */}
          {ctx.categories
            .filter((c) => !c.system && c.id !== '__user_root')
            .map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleUserCategoryClick(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-all ${
                  activeUserCategory === cat.id
                    ? 'bg-gradient-to-r from-indigo-400 to-pink-400 text-white shadow-sm'
                    : 'bg-white/70 border border-slate-200/60 text-slate-500 hover:text-slate-700'
                }`}
              >
                📁 {cat.name}
              </button>
            ))}
          <button
            onClick={async () => {
              const name = await dialog.prompt({
                title: '新建分类',
                message: '输入新分类名称',
                placeholder: '例如：前端面试',
              });
              if (name?.trim()) {
                try {
                  await ctx.createCategory(name.trim(), null);
                } catch (err: any) {
                  await dialog.alert({ title: '创建失败', message: err?.message || '请重试' });
                }
              }
            }}
            className="px-2 py-1.5 rounded-lg text-[12px] text-sky-500 hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            + 新建分类
          </button>
        </div>

        {/* 排序 */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] text-slate-400">排序:</span>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            className="text-[12px] px-2.5 py-1.5 rounded-lg bg-white/80 border border-slate-200 text-slate-600 focus:outline-none focus:border-sky-400 cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={() => setSelectMode(true)} className="text-[12px] text-sky-500 hover:underline ml-auto">
            批量导出
          </button>
        </div>

        {/* 记录列表 */}
        {loadingRecords ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-sky-400 border-t-transparent rounded-full" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-lg mb-2">📭</p>
            <p className="text-sm">暂无答题记录</p>
            <button
              onClick={() => router.push('/')}
              className="mt-3 text-[12px] text-sky-500 hover:text-sky-600 underline"
            >
              去首页选题答题
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {records.map((r) => (
              <div
                key={r.id}
                className={`relative ${selectMode ? 'rounded-2xl cursor-pointer' : ''} ${selectMode && selectedIds.has(r.id) ? 'ring-2 ring-indigo-400' : ''}`}
              >
                {selectMode && (
                  <>
                    <button
                      type="button"
                      aria-label="选择该记录"
                      onClick={() => toggleSelect(r.id)}
                      className="absolute inset-0 z-10 w-full h-full rounded-2xl"
                    />
                    <span
                      className={`pointer-events-none absolute top-2 left-2 z-20 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[11px] ${selectedIds.has(r.id) ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-slate-300 text-transparent'}`}
                    >
                      ✓
                    </span>
                  </>
                )}
                <RecordCard
                  record={r}
                  onViewDetail={(id) => {
                    router.push(`/records?id=${id}`);
                    setDrawerOpen(true);
                  }}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5 mt-6">
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-[12px] font-medium transition-all ${
                    p === page
                      ? 'bg-sky-400 text-white shadow-sm'
                      : 'bg-white/70 border border-slate-200/60 text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <span className="text-[11px] text-slate-400 ml-2">共 {total} 条</span>
          </div>
        )}
      </div>

      {/* 详情抽屉 */}
      {token && (
        <RecordDetailDrawer
          resultId={selectedId}
          open={drawerOpen}
          onClose={handleCloseDrawer}
          token={token}
        />
      )}

      {/* 批量导出对话框 */}
      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onConfirm={handleExport}
      />
    </div>
  );
}
