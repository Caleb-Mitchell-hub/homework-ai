'use client';

import type { Question } from '@/types';

const TYPE_LABELS: Record<string, string> = {
  single: '单选',
  multiple: '多选',
  boolean: '判断',
  fill: '填空',
  essay: '简答',
  interview: '面试',
};

const TYPE_COLORS: Record<string, string> = {
  single: 'bg-sky-100 text-sky-700',
  multiple: 'bg-blue-100 text-blue-700',
  boolean: 'bg-amber-100 text-amber-700',
  fill: 'bg-violet-100 text-violet-700',
  essay: 'bg-pink-100 text-pink-700',
  interview: 'bg-indigo-100 text-indigo-700',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  '简单': 'bg-emerald-100 text-emerald-700',
  '中等': 'bg-amber-100 text-amber-700',
  '困难': 'bg-rose-100 text-rose-700',
};

interface Props {
  questions: Question[];
  topic: string;
  timeLimit: number;
  onTimeLimitChange: (minutes: number) => void;
  onSave: () => void;
  onRegenerate: () => void;
  onCopyPrompt: () => void;
  saving: boolean;
}

export default function AIGeneratePreview({
  questions,
  topic,
  timeLimit,
  onTimeLimitChange,
  onSave,
  onRegenerate,
  onCopyPrompt,
  saving,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 text-lg">
                题目预览
              </h3>
              <p className="text-[12px] text-slate-500 mt-0.5">
                共 {questions.length} 题 · 主题:{' '}
                {topic.length > 30 ? topic.slice(0, 30) + '…' : topic}
              </p>
            </div>
            {/* 答题时限 */}
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-slate-500 whitespace-nowrap">
                答题时限
              </label>
              <select
                value={timeLimit}
                onChange={(e) => onTimeLimitChange(Number(e.target.value))}
                className="px-3 py-1.5 text-[13px] bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-sky-400"
              >
                <option value={0}>不限时</option>
                <option value={15}>15 分钟</option>
                <option value={30}>30 分钟</option>
                <option value={45}>45 分钟</option>
                <option value={60}>60 分钟</option>
                <option value={90}>90 分钟</option>
                <option value={120}>120 分钟</option>
              </select>
            </div>
          </div>
        </div>

        {/* Question list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {questions.map((q, i) => (
            <div
              key={q.id ?? i}
              className="bg-slate-50 border border-slate-200 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${TYPE_COLORS[q.type] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {TYPE_LABELS[q.type] ?? q.type}
                </span>
                {(q as any).difficulty && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${DIFFICULTY_COLORS[(q as any).difficulty] ?? ''}`}
                  >
                    {(q as any).difficulty}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-slate-700 leading-relaxed">
                {q.title}
              </p>
              {/* 选项（预览模式不显示正确答案） */}
              {(q.type === 'single' || q.type === 'multiple') &&
                Array.isArray((q as any).options) && (
                  <div className="mt-2 space-y-1">
                    {((q as any).options as string[]).map(
                      (opt: string, idx: number) => {
                        const letter = String.fromCharCode(65 + idx);
                        return (
                          <div
                            key={letter}
                            className="text-[12px] px-2 py-0.5 rounded text-slate-500"
                          >
                            {letter}. {opt}
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-slate-100 flex-shrink-0 flex items-center justify-between">
          <button
            onClick={onCopyPrompt}
            className="px-4 py-2.5 text-[13px] bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
          >
            📋 复制提示词
          </button>
          <div className="flex gap-3">
            <button
              onClick={onRegenerate}
              className="px-4 py-2.5 text-[13px] bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
            >
              重新生成
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-6 py-2.5 text-[13px] bg-gradient-to-r from-sky-400 to-emerald-400 text-white rounded-xl hover:from-sky-500 hover:to-emerald-500 disabled:opacity-50 transition-all shadow-md shadow-sky-200"
            >
              {saving ? '保存中…' : '确认保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
