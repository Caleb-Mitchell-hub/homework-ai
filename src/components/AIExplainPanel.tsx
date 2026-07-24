'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import MarkdownView from '@/components/MarkdownView';

interface Props {
  questionId: string;
  questionContent: string;
  questionType: string;
  onNeedCredits: (required: number, balance: number) => void;
  /** AI 返回内容后回调，用于父组件捕获解析结果（如传给追问组件作为上下文） */
  onDone?: (content: string) => void;
}

export default function AIExplainPanel({ questionId, questionContent, questionType, onNeedCredits, onDone }: Props) {
  const { token } = useAuth();
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'done'; content: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  const ask = async () => {
    if (!token) return;
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ questionId, content: questionContent, type: questionType }),
      });
      const data = await res.json();
      if (res.status === 400 && data.required != null) {
        onNeedCredits(data.required, data.balance);
        setState({ status: 'idle' });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? '解析失败');
      if (data.content && onDone) {
        onDone(data.content);
      }
      setState({ status: 'done', content: data.content });
    } catch (err: any) {
      setState({ status: 'error', message: err?.message ?? '解析失败' });
    }
  };

  if (state.status === 'idle') {
    return (
      <button
        onClick={ask}
        className="px-3 py-1.5 bg-gradient-to-r from-violet-500 to-pink-500 text-white text-[12px] rounded-lg hover:opacity-90"
      >
        🧠 AI 解析此题
      </button>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-500">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
        AI 解析中…
      </div>
    );
  }

  if (state.status === 'done') {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="text-[11px] text-emerald-600 flex items-center gap-1">
          <span>✓</span>
          <span>AI 解析完成</span>
        </div>
        <div
          className="p-3 bg-violet-50/50 border border-violet-100 rounded-lg min-h-[40px]"
          data-testid="ai-explain-content"
        >
          {state.content.trim() ? (
            <MarkdownView content={state.content} />
          ) : (
            <div className="text-[12px] text-slate-400 italic">
              （AI 返回了空内容,请重新提问或联系管理员检查 AI 配置。）
            </div>
          )}
        </div>
      </div>
    );
  }

  // error
  const isNetwork =
    state.message.includes('fetch failed') ||
    state.message.includes('解析失败');
  return (
    <div className="mt-2 space-y-1.5">
      <div className="text-[11px] text-rose-600">
        {isNetwork
          ? '⚠️ AI 服务暂时不可达，请稍后重试。积分已自动退还。'
          : state.message}
      </div>
      <button onClick={ask} className="text-[11px] text-sky-600 hover:underline">重试</button>
    </div>
  );
}