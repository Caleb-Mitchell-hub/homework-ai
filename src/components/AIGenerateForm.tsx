'use client';

import { useState, useMemo } from 'react';
import { estimateGenerateCost } from '@/lib/credits/generate-cost';

interface TypeConfig {
  key: string;
  label: string;
}

const TYPES: TypeConfig[] = [
  { key: 'single', label: '单选题' },
  { key: 'multiple', label: '多选题' },
  { key: 'boolean', label: '判断题' },
  { key: 'fill', label: '填空题' },
  { key: 'essay', label: '简答题' },
  { key: 'interview', label: '面试题' },
];

interface Props {
  onGenerate: (topic: string, counts: Record<string, number>) => void;
  onCopyPrompt: (topic: string, counts: Record<string, number>) => void;
  disabled?: boolean;
}

export default function AIGenerateForm({
  onGenerate,
  onCopyPrompt,
  disabled,
}: Props) {
  const [topic, setTopic] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({
    single: 5,
    multiple: 3,
    boolean: 2,
    fill: 0,
    essay: 2,
    interview: 1,
  });

  const estimatedCost = useMemo(() => estimateGenerateCost(counts), [counts]);
  const allZero = useMemo(
    () => Object.values(counts).every((v) => v === 0),
    [counts],
  );
  const canGenerate = topic.trim().length > 0 && !allZero && !disabled;

  function updateCount(type: string, value: number) {
    setCounts((prev) => ({
      ...prev,
      [type]: Math.max(0, Math.min(50, value || 0)),
    }));
  }

  return (
    <div className="space-y-6">
      {/* 主题输入 */}
      <div>
        <label className="block text-[13px] font-medium text-slate-700 mb-2">
          主题/内容 <span className="text-rose-500">*</span>
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={
            '例如：计算机网络OSI七层模型相关面试题\n也可以粘贴一段文本让AI基于内容出题'
          }
          rows={4}
          maxLength={5000}
          className="w-full p-4 bg-white/80 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 text-sm resize-none"
        />
        <div className="text-[11px] text-slate-400 mt-1 text-right">
          {topic.length}/5000
        </div>
      </div>

      {/* 题型与数量 */}
      <div>
        <label className="block text-[13px] font-medium text-slate-700 mb-3">
          题型与数量
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TYPES.map((t) => (
            <div
              key={t.key}
              className="flex items-center gap-2 bg-white/70 border border-slate-200 rounded-xl px-3 py-2.5"
            >
              <span className="text-[13px] text-slate-600 flex-1">
                {t.label}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    updateCount(t.key, (counts[t.key] || 0) - 1)
                  }
                  className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={counts[t.key] || 0}
                  onChange={(e) =>
                    updateCount(t.key, parseInt(e.target.value) || 0)
                  }
                  className="w-10 text-center text-[13px] font-medium text-slate-700 bg-transparent border-none outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateCount(t.key, (counts[t.key] || 0) + 1)
                  }
                  className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm"
                >
                  +
                </button>
              </div>
              <span className="text-[11px] text-slate-400 w-4">题</span>
            </div>
          ))}
        </div>
        {allZero && (
          <p className="text-[11px] text-amber-500 mt-1.5">
            请至少选择一种题型并设置数量
          </p>
        )}
      </div>

      {/* 预估积分 + 操作按钮 */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <div className="text-[13px] text-slate-600">
          预估消耗：
          <span className="font-bold text-sky-600">
            ⚡ {estimatedCost} 积分
          </span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onCopyPrompt(topic, counts)}
            disabled={!canGenerate}
            className="px-4 py-2.5 text-[13px] bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            📋 复制提示词
          </button>
          <button
            type="button"
            onClick={() => onGenerate(topic, counts)}
            disabled={!canGenerate}
            className="px-6 py-2.5 text-[13px] bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-sky-200"
          >
            ✨ 生成题库
          </button>
        </div>
      </div>
    </div>
  );
}
