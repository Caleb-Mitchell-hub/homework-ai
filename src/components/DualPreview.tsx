'use client';

import { useState } from 'react';
import type { Question as QuestionType } from '@/types';

type Source = 'local' | 'ai';

export type DualAiState =
  | { status: 'idle' }
  | { status: 'loading'; elapsed: number }
  | { status: 'done'; questions: QuestionType[] }
  | { status: 'error'; message: string };

interface Props {
  /** 本地解析结果(已格式化好的题目) */
  localQuestions: QuestionType[];
  /** AI 解析状态机(父组件持有) */
  aiState: DualAiState;
  /** 点击 AI tab 且 idle 时触发 */
  onRequestAi: () => void;
  /** AI 失败时点击重试 */
  onRetryAi: () => void;
  /** 渲染题目(父组件复用现有题卡 UI) */
  renderQuestions: (qs: QuestionType[], source: Source) => React.ReactNode;
  localLabel?: string;
  aiLabel?: string;
}

export default function DualPreview({
  localQuestions, aiState, onRequestAi, onRetryAi,
  renderQuestions, localLabel = '本地解析', aiLabel = 'AI 解析',
}: Props) {
  const [source, setSource] = useState<Source>('local');

  // 切到 AI tab 时若 idle 则触发 fetch
  const selectSource = (s: Source) => {
    setSource(s);
    if (s === 'ai' && aiState.status === 'idle') {
      onRequestAi();
    }
  };

  const aiTabBadge = () => {
    switch (aiState.status) {
      case 'loading':
        return <span className="ml-1 text-violet-500">⏳ {aiState.elapsed}s</span>;
      case 'done':
        return <span className="ml-1 text-emerald-600">✓ {aiState.questions.length} 道</span>;
      case 'error':
        return <span className="ml-1 text-rose-500">⚠</span>;
      default:
        return null;
    }
  };

  return (
    <div>
      <div className="inline-flex p-1 bg-slate-100 rounded-lg text-[12px] mb-3">
        <button
          onClick={() => selectSource('local')}
          className={`px-3 py-1 rounded ${source === 'local' ? 'bg-white shadow text-slate-700 font-medium' : 'text-slate-500'}`}
        >
          {localLabel} · {localQuestions.length} 道
        </button>
        <button
          onClick={() => selectSource('ai')}
          className={`px-3 py-1 rounded ${source === 'ai' ? 'bg-white shadow text-slate-700 font-medium' : 'text-slate-500'}`}
        >
          {aiLabel}{aiTabBadge()}
        </button>
      </div>

      {source === 'local' ? (
        renderQuestions(localQuestions, 'local')
      ) : (
        <>
          {aiState.status === 'loading' && (
            <div className="p-6 text-center text-slate-400 text-sm">
              AI 解析中…{aiState.elapsed}s
            </div>
          )}
          {aiState.status === 'error' && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-[12px] text-rose-700 flex items-center justify-between">
              <span>AI 解析失败: {aiState.message}</span>
              <button onClick={onRetryAi} className="px-2 py-1 bg-rose-500 text-white rounded text-[11px]">
                重试
              </button>
            </div>
          )}
          {aiState.status === 'done' && renderQuestions(aiState.questions, 'ai')}
          {aiState.status === 'idle' && (
            <div className="p-6 text-center text-slate-400 text-sm">点击上方「AI 解析」开始</div>
          )}
        </>
      )}
    </div>
  );
}
