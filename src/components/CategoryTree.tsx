'use client';

import { useState, useMemo, ReactNode } from 'react';
import {
  useCategories,
  CategoryNode,
  Category,
  CategoryId,
  USER_ROOT_ID,
} from '@/contexts/CategoryContext';
import { useDialog } from '@/components/DialogProvider';

/**
 * 折叠式分类树
 * - 顶部固定显示"我的题库"用户根
 * - 之后是若干系统分类
 * - 每个节点可展开/收起；右侧可创建/重命名/删除（系统节点禁用）
 * - 节点内联显示"已归入该分类的记录数"
 *
 * Props: children 由父组件传入一个回调以"渲染该分类下的记录"
 *        形式: (category) => ReactNode
 *        若返回 null 则不渲染（用于"我的题库"这种根汇总）
 */

interface Props {
  /** 选中的记录 id（用于在该记录所在的分类下显示） */
  activeResultId?: string | null;
  onResultClick?: (result: any) => void;
  /** 记录全集（含 status / score / totalScore / submittedAt 等） */
  results: any[];
  /** 批量归入模式：传入选中的记录 id 集合；点击分类行即归入 */
  batchSelectedIds?: Set<string>;
  onBatchAssign?: (categoryId: string | null) => void;
  /** 批量模式下点记录行的勾选回调 */
  onBatchToggleSelect?: (id: string) => void;
}

export default function CategoryTree({ activeResultId, onResultClick, results, batchSelectedIds, onBatchAssign, onBatchToggleSelect }: Props) {
  const ctx = useCategories();
  const dialog = useDialog();
  const tree = ctx.getNodeTree();
  const [renamingId, setRenamingId] = useState<CategoryId | null>(null);

  // 给每条记录补一个 _idx（按 results 列表的倒序编号）
  const indexed = useMemo(() => {
    return results.map((r, i) => ({ ...r, _idx: results.length - i }));
  }, [results]);

  // 给每个分类做一次结果计数（避免每行重复计算）
  const countByCategory = useMemo(() => {
    const map = new Map<CategoryId, number>();
    for (const r of indexed) {
      const cid = ctx.getResultCategory(r.id);
      if (cid) map.set(cid, (map.get(cid) || 0) + 1);
    }
    return map;
  }, [indexed, ctx.resultMap]);

  // 实际"分类 → 记录"的归集
  const recordsByCategory = useMemo(() => {
    const map = new Map<CategoryId, any[]>();
    for (const r of indexed) {
      const cid = ctx.getResultCategory(r.id);
      if (cid) {
        if (!map.has(cid)) map.set(cid, []);
        map.get(cid)!.push(r);
      }
    }
    return map;
  }, [indexed, ctx.resultMap]);

  // 把 Prisma 的 DateTime 字段(JSON 序列化后是 ISO 字符串)安全转成毫秒数
  const toMillis = (v: any): number => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  // 系统分类的"规则"过滤函数
  const recordsForSystem = (sysId: string) => {
    if (sysId === '__sys_recent') {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return indexed.filter((r) => r.status === 'submitted' && toMillis(r.submittedAt) >= cutoff);
    }
    if (sysId === '__sys_draft') {
      return indexed.filter((r) => r.status === 'draft');
    }
    if (sysId === '__sys_uncat') {
      return indexed.filter((r) => !ctx.getResultCategory(r.id));
    }
    if (sysId === '__sys_pending') {
      return indexed.filter((r) =>
        Array.isArray(r.results) && r.results.some((x: any) => x.autoGraded === false)
      );
    }
    return [];
  };

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          countOverride={node.system ? recordsForSystem(node.id).length : countByCategory.get(node.id) || 0}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          recordsByCategory={recordsByCategory}
          recordsForSystem={recordsForSystem}
          activeResultId={activeResultId}
          onResultClick={onResultClick}
          batchSelectedIds={batchSelectedIds}
          onBatchAssign={onBatchAssign}
          onBatchToggleSelect={onBatchToggleSelect}
        />
      ))}

      {/* 顶级"+ 新建分类"快捷入口 */}
      <button
        onClick={async () => {
          const name = await dialog.prompt({
            title: '新建顶级分类',
            message: '请输入分类名称',
            placeholder: '分类名',
          });
          if (name && name.trim()) ctx.createCategory(name.trim(), null);
        }}
        className="mt-1.5 ml-4 flex items-center gap-1 text-[10.5px] text-slate-300 hover:text-sky-500 transition-colors"
      >
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        新建顶级分类
      </button>
    </div>
  );
}

interface NodeProps {
  node: CategoryNode;
  countOverride: number;
  renamingId: CategoryId | null;
  setRenamingId: (id: CategoryId | null) => void;
  recordsByCategory: Map<CategoryId, any[]>;
  recordsForSystem: (sysId: string) => any[];
  activeResultId?: string | null;
  onResultClick?: (result: any) => void;
  batchSelectedIds?: Set<string>;
  onBatchAssign?: (categoryId: string | null) => void;
  onBatchToggleSelect?: (id: string) => void;
}

function TreeNode({
  node,
  countOverride,
  renamingId,
  setRenamingId,
  recordsByCategory,
  recordsForSystem,
  activeResultId,
  onResultClick,
  batchSelectedIds,
  onBatchAssign,
  onBatchToggleSelect,
}: NodeProps) {
  const ctx = useCategories();
  const dialog = useDialog();
  const expanded = ctx.expanded.has(node.id);
  const isSystem = !!node.system;
  const isUserRoot = node.id === USER_ROOT_ID;
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const records = isSystem ? recordsForSystem(node.id) : recordsByCategory.get(node.id) || [];

  // 管理模式下(传入 batchSelectedIds 即为管理态)就显示复选框,与 selectedIds 是否为空无关
  // 之前用 size > 0 判定会导致刚点"管理"时 selectedIds 为空 → 复选框不显示 → 用户没法勾选
  const inBatch = batchSelectedIds !== undefined;

  return (
    <div>
      {/* 分类行 */}
      <div
        onClick={() => {
          if (inBatch && onBatchAssign) onBatchAssign(node.system ? null : node.id);
        }}
        className={`group relative flex items-center gap-1.5 pr-1 py-1 rounded-md transition-colors ${
          inBatch && !node.system
            ? 'hover:bg-sky-50/60 cursor-pointer'
            : 'hover:bg-white/50'
        }`}
        style={{ paddingLeft: 6 + node.depth * 10 }}
      >
        <button
          onClick={() => ctx.toggleExpand(node.id)}
          className="w-3.5 h-3.5 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-transform"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          title={expanded ? '收起' : '展开'}
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <span className="text-[11px] flex-shrink-0">
          {isSystem ? <SystemIcon id={node.id} /> : <FolderIcon />}
        </span>

        {renamingId === node.id ? (
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => {
              if (newName.trim()) ctx.renameCategory(node.id, newName.trim());
              setRenamingId(null);
              setNewName('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (newName.trim()) ctx.renameCategory(node.id, newName.trim());
                setRenamingId(null);
                setNewName('');
              } else if (e.key === 'Escape') {
                setRenamingId(null);
                setNewName('');
              }
            }}
            className="flex-1 min-w-0 text-[11.5px] bg-white/80 border border-sky-300 rounded px-1 py-0.5 outline-none"
          />
        ) : (
          <span
            className={`flex-1 min-w-0 truncate text-[11.5px] ${
              isSystem ? 'text-slate-500' : 'text-slate-700'
            } ${isUserRoot ? 'font-medium' : ''}`}
          >
            {node.name}
          </span>
        )}

        {/* 计数 */}
        <span className="text-[9.5px] text-slate-300 tabular-nums tracking-wider">
          {countOverride || ''}
        </span>

        {/* 操作按钮（仅非系统） */}
        {!isSystem && !inBatch && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAddOpen(true);
              }}
              className="w-4 h-4 rounded text-slate-400 hover:text-sky-500 hover:bg-sky-50 flex items-center justify-center"
              title="新建子分类"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              className="w-4 h-4 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
              title="更多"
            >
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="5" cy="12" r="1.4" />
                <circle cx="12" cy="12" r="1.4" />
                <circle cx="19" cy="12" r="1.4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 行内菜单（重命名 / 删除） */}
      {menuOpen && !isSystem && (
        <div
          className="ml-7 mb-1 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden text-[11px]"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <button
            onClick={() => {
              setMenuOpen(false);
              setNewName(node.name);
              setRenamingId(node.id);
            }}
            className="block w-full text-left px-2.5 py-1.5 hover:bg-slate-50 text-slate-600"
          >
            重命名
          </button>
          <button
            onClick={async () => {
              const ok = await dialog.confirm({
                title: '删除分类',
                message: `删除分类「${node.name}」及其子分类?其内记录将变为"未分类"`,
                confirmText: '删除',
                danger: true,
              });
              if (ok) ctx.deleteCategory(node.id);
              setMenuOpen(false);
            }}
            className="block w-full text-left px-2.5 py-1.5 hover:bg-rose-50 text-rose-500 border-t border-slate-100"
          >
            删除
          </button>
        </div>
      )}

      {/* 新建子分类输入 */}
      {addOpen && (
        <div
          className="flex items-center gap-1 my-1"
          style={{ paddingLeft: 6 + (node.depth + 1) * 10 }}
        >
          <FolderIcon />
          <input
            autoFocus
            placeholder="新分类名"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => {
              if (newName.trim()) ctx.createCategory(newName.trim(), node.id);
              setNewName('');
              setAddOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (newName.trim()) ctx.createCategory(newName.trim(), node.id);
                setNewName('');
                setAddOpen(false);
              } else if (e.key === 'Escape') {
                setNewName('');
                setAddOpen(false);
              }
            }}
            className="flex-1 min-w-0 text-[11px] bg-white/80 border border-sky-300 rounded px-1.5 py-0.5 outline-none"
          />
        </div>
      )}

      {/* 子分类（递归） */}
      {expanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              countOverride={child.system ? recordsForSystem(child.id).length : 0}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              recordsByCategory={recordsByCategory}
              recordsForSystem={recordsForSystem}
              activeResultId={activeResultId}
              onResultClick={onResultClick}
              batchSelectedIds={batchSelectedIds}
              onBatchAssign={onBatchAssign}
              onBatchToggleSelect={onBatchToggleSelect}
            />
          ))}
        </div>
      )}

      {/* 该分类下的记录 */}
      {expanded && records.length > 0 && (
        <div className="mt-0.5 mb-1.5">
          {records.map((r) => (
            <RecordRow
              key={r.id}
              result={r}
              depth={node.depth + 1}
              active={r.id === activeResultId}
              inBatch={inBatch}
              batchChecked={!!batchSelectedIds?.has(r.id)}
              onClick={() => {
                if (inBatch) onBatchToggleSelect?.(r.id);
                else onResultClick?.(r);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 子组件 ──────────────────────────────────────────────────────

function RecordRow({
  result,
  depth,
  active,
  onClick,
  inBatch,
  batchChecked,
}: {
  result: any;
  depth: number;
  active: boolean;
  onClick: () => void;
  inBatch: boolean;
  batchChecked: boolean;
}) {
  const isDraft = result.status === 'draft';
  const percentage =
    result.totalScore > 0 ? Math.round((result.score / result.totalScore) * 100) : 0;
  const percentageColor =
    percentage >= 80 ? 'text-emerald-500' : percentage >= 60 ? 'text-amber-500' : 'text-rose-500';

  return (
    <button
      onClick={onClick}
      className={`group w-full flex items-center gap-1.5 py-1.5 pr-1.5 rounded-md transition-colors text-left ${
        active ? 'bg-sky-50/70' : inBatch && batchChecked ? 'bg-sky-50/60' : 'hover:bg-white/60'
      }`}
      style={{ paddingLeft: 6 + depth * 10 + 14 }}
    >
      {inBatch ? (
        <div
          className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
            batchChecked ? 'bg-sky-400 border-sky-400' : 'border-slate-300 bg-white'
          }`}
        >
          {batchChecked && (
            <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      ) : (
        <span
          className="text-[9.5px] text-slate-300 tracking-wider w-6 flex-shrink-0 tabular-nums"
          style={{ fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic' }}
        >
          №{(result._idx ?? 0).toString().padStart(2, '0')}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate text-[11px] text-slate-700">
        {result.name || result.quizId?.slice(0, 8) || '未命名'}
      </span>
      {isDraft && (
        <span className="px-1 rounded text-[8.5px] bg-amber-100 text-amber-600 flex-shrink-0">
          草稿
        </span>
      )}
      {!isDraft && (
        <span className={`text-[10px] tabular-nums flex-shrink-0 ${percentageColor}`}>{percentage}%</span>
      )}
    </button>
  );
}

function FolderIcon() {
  return (
    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function SystemIcon({ id }: { id: string }) {
  const map: Record<string, ReactNode> = {
    __sys_recent: (
      <svg className="w-3 h-3 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path strokeWidth={1.8} strokeLinecap="round" d="M12 7v5l3 2" />
      </svg>
    ),
    __sys_draft: (
      <svg className="w-3 h-3 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" d="M11 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-6M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
    __sys_uncat: (
      <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 12h14M5 16h10" />
      </svg>
    ),
    __sys_pending: (
      <svg className="w-3 h-3 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };
  return <>{map[id] ?? <FolderIcon />}</>;
}
