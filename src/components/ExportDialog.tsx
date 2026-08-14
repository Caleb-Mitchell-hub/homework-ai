'use client';

import { useEffect, useState } from 'react';
import type { ExportSections } from '@/lib/result-to-markdown';
import { ALL_SECTIONS } from '@/lib/result-to-markdown';

const OPTIONS: { key: keyof ExportSections; label: string }[] = [
  { key: 'question', label: '题目（题干+选项）' },
  { key: 'userAnswer', label: '你的答案' },
  { key: 'correctAnswer', label: '正确答案' },
  { key: 'aiScore', label: 'AI 评分' },
  { key: 'aiExplain', label: 'AI 解析' },
  { key: 'notes', label: '笔记' },
  { key: 'followups', label: '追问记录' },
  { key: 'report', label: '答题报告' },
];

export default function ExportDialog({ open, onClose, onConfirm }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (sections: ExportSections) => void;
}) {
  const [sections, setSections] = useState<ExportSections>({ ...ALL_SECTIONS });

  useEffect(() => {
    if (open) setSections({ ...ALL_SECTIONS });
  }, [open]);

  if (!open) return null;

  const toggle = (key: keyof ExportSections) => setSections((s) => ({ ...s, [key]: !s[key] }));
  const allChecked = OPTIONS.every((o) => sections[o.key]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-slate-800 mb-1">导出内容</h3>
        <p className="text-xs text-slate-400 mb-4">勾选要包含的内容</p>
        <div className="space-y-2 mb-4">
          {OPTIONS.map((o) => (
            <label key={o.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={sections[o.key]} onChange={() => toggle(o.key)} className="accent-indigo-600" />
              {o.label}
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setSections(allChecked ? { question: false, userAnswer: false, correctAnswer: false, aiScore: false, aiExplain: false, notes: false, followups: false, report: false } : { ...ALL_SECTIONS })}
            className="text-xs text-indigo-600 hover:underline"
          >
            {allChecked ? '全不选' : '全选'}
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">取消</button>
          <button onClick={() => onConfirm(sections)} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">导出</button>
        </div>
      </div>
    </div>
  );
}
