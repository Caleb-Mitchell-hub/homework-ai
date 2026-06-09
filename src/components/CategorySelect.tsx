'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useCategories, USER_ROOT_ID } from '@/contexts/CategoryContext';

interface Props {
  /** null = 未分类 */
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}

/**
 * 受控下拉选择器 —— 只展示「未分类」+ 「我的题库」下所有用户自定义分类(树形缩进)
 * 不展示系统分类(最近/草稿/未分类/待批改),因为那些是按 status 自动归类的
 * 支持在弹窗里"新建分类"快捷入口
 */
export default function CategorySelect({ value, onChange, placeholder = '未分类' }: Props) {
  const ctx = useCategories();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  // 点外部关闭
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // 选中项的展示名
  const current = value ? ctx.getById(value) : null;
  const label = current?.name ?? placeholder;

  // 递归展平"侧栏可看到"的所有用户分类(带 depth)
  //  - 顶级(parentId === null)中:跳过系统分类,跳过用户根 __user_root 本身
  //  - 递归子分类(已通过 ctx.getChildren 排序)
  // 这样和 CategoryTree 的展示口径完全一致:侧栏里能看到的,弹窗里都能选
  const userCategories = useMemo(() => {
    const acc: { id: string; name: string; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const c of ctx.getChildren(parentId)) {
        if (c.id === USER_ROOT_ID) continue; // 用户根本身不显示
        if (c.system) continue;                // 系统分类不显示
        acc.push({ id: c.id, name: c.name, depth });
        walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.categories]);

  return (
    <div className="relative" ref={wrapRef}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 hover:border-sky-400 focus:outline-none focus:ring-4 focus:ring-sky-100 text-sm transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <FolderIcon />
          <span className="truncate">{label}</span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
          {/* 未分类 */}
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
              setCreating(false);
            }}
            className={`w-full flex items-center text-left px-3 py-1.5 text-[12.5px] hover:bg-sky-50 transition-colors ${
              value === null ? 'bg-sky-50 text-sky-600 font-medium' : 'text-slate-600'
            }`}
          >
            <span className="inline-block w-3 mr-1.5" />
            未分类
          </button>

          {/* 分隔线(用户分类为空时隐藏) */}
          {userCategories.length > 0 && <div className="h-px bg-slate-100 my-1" />}

          {/* 用户自定义分类(树形缩进) */}
          {userCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.id);
                setOpen(false);
                setCreating(false);
              }}
              className={`w-full flex items-center text-left py-1.5 pr-3 text-[12.5px] hover:bg-sky-50 transition-colors ${
                value === c.id ? 'bg-sky-50 text-sky-600 font-medium' : 'text-slate-600'
              }`}
              style={{ paddingLeft: 12 + c.depth * 12 }}
            >
              <FolderIcon />
              <span className="truncate">{c.name}</span>
            </button>
          ))}

          {/* 分隔线 */}
          <div className="h-px bg-slate-100 my-1" />

          {/* 新建分类 */}
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full text-left px-3 py-1.5 text-[12.5px] text-sky-600 hover:bg-sky-50 transition-colors"
            >
              + 新建分类
            </button>
          ) : (
            <div className="px-3 py-1.5 flex gap-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    // 挂在顶级(parentId: null),跟侧栏「+ 新建顶级分类」语义一致
                    const c = ctx.createCategory(newName.trim(), null);
                    onChange(c.id);
                    setNewName('');
                    setCreating(false);
                    setOpen(false);
                  } else if (e.key === 'Escape') {
                    setCreating(false);
                    setNewName('');
                  }
                }}
                placeholder="分类名"
                className="flex-1 min-w-0 px-2 py-1 bg-slate-50 border border-sky-300 rounded text-[12px] outline-none focus:border-sky-400"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg
      className="w-3 h-3 text-slate-400 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${
        open ? 'rotate-180' : ''
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}
