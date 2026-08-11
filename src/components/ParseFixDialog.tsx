'use client';

import { useState, useRef, useEffect } from 'react';
import MarkdownView from '@/components/MarkdownView';
import type { ParsedQuestion } from '@/components/admin/QuizUploadPanel';

const TYPE_LABELS: Record<string, string> = {
  single: '单选',
  multiple: '多选',
  judge: '判断',
  boolean: '判断',
  fill: '填空',
  essay: '简答',
  code: '代码',
  interview: '面试',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  open: boolean;
  originalText: string;
  currentQuestions: ParsedQuestion[];
  onClose: () => void;
  onQuestionsUpdated: (questions: ParsedQuestion[]) => void;
}

const MAX_MESSAGES = 20;

export default function ParseFixDialog({
  open,
  originalText,
  currentQuestions,
  onClose,
  onQuestionsUpdated,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const completedRef = useRef(false);

  // 自动滚动聊天区
  useEffect(() => {
    const el = chatContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, streamingContent, loading]);

  // 展开时聚焦输入框
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    if (newMessages.length > MAX_MESSAGES) {
      newMessages.splice(0, newMessages.length - MAX_MESSAGES);
    }
    setMessages(newMessages);
    setInput('');
    setError(null);
    setStreamingContent('');
    setLoading(true);
    completedRef.current = false;

    const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

    try {
      const res = await fetch('/api/ai/parse-fix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          originalText,
          currentQuestions,
          userFeedback: text,
          conversationHistory: messages,
        }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      // 流式消费 SSE
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const data = line.replace(/^data: /, '').trim();
          try {
            const evt = JSON.parse(data);
            if (evt.type === 'delta') {
              setStreamingContent((prev) => prev + (evt.text ?? ''));
            } else if (evt.type === 'complete') {
              if (!completedRef.current) {
                completedRef.current = true;
                const summary =
                  evt.questionCount != null
                    ? `已修正，共 ${evt.questionCount} 题。你可以继续提出修改意见，或关闭此对话框。`
                    : '已修正。你可以继续提出修改意见，或关闭此对话框。';
                setMessages((prev) => [
                  ...prev,
                  { role: 'assistant', content: summary },
                ]);
                setStreamingContent('');
                onQuestionsUpdated(evt.questions ?? []);
              }
            } else if (evt.type === 'error') {
              if (!completedRef.current) {
                completedRef.current = true;
                setError(evt.message || '修正失败');
              }
            }
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || '修正失败，请稍后重试');
    } finally {
      setLoading(false);
      if (!completedRef.current) {
        setStreamingContent('');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="修正解析结果"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex-shrink-0 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-lg">
              ✏️ 修正解析结果
            </h3>
            <p className="text-[12px] text-slate-500 mt-0.5">
              描述解析中存在的问题，AI 会修正题目集
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
          >
            关闭
          </button>
        </div>

        {/* Body: two columns */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: question list */}
          <div className="w-[38%] border-r border-slate-100 overflow-y-auto p-4 space-y-2 flex-shrink-0">
            <h4 className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-2">
              当前题目 ({currentQuestions.length})
            </h4>
            {currentQuestions.map((q, i) => {
              const text =
                (q as any).content || (q as any).title || '';
              return (
                <div
                  key={i}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-bold text-slate-400 w-4">
                      {i + 1}
                    </span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-500">
                      {TYPE_LABELS[q.type] ?? q.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                    {text}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Right: chat */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            >
              {messages.length === 0 && !loading && (
                <div className="text-[13px] text-slate-400 text-center py-12">
                  请描述解析中存在的问题，例如：
                  <div className="mt-2 space-y-1 text-left max-w-sm mx-auto">
                    <div className="bg-slate-50 rounded-lg px-3 py-2 text-[12px] text-slate-500">
                      "第3题答案应该是B，原文写的是..."
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2 text-[12px] text-slate-500">
                      "漏了一道关于XXX的题，在原文第二段"
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2 text-[12px] text-slate-500">
                      "第5题应该是多选题而不是单选题"
                    </div>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-xl text-[12.5px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-500 text-white rounded-br-sm'
                        : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <MarkdownView content={msg.content} size="sm" />
                    ) : (
                      <span className="whitespace-pre-wrap">
                        {msg.content}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading / streaming */}
              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] px-3 py-2 rounded-xl bg-slate-100 text-slate-700 rounded-bl-sm">
                    {streamingContent ? (
                      <MarkdownView content={streamingContent} size="sm" />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: '0ms' }}
                        />
                        <span
                          className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        />
                        <span
                          className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Error + retry */}
            {error && (
              <div className="px-4 py-2 bg-rose-50 border-t border-rose-100 flex items-center justify-between flex-shrink-0">
                <span className="text-[12px] text-rose-600">{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="text-[12px] text-rose-600 hover:underline flex-shrink-0 ml-2"
                >
                  关闭
                </button>
              </div>
            )}

            {/* Input */}
            <div className="flex items-end gap-2 px-4 py-3 border-t border-slate-100 bg-white/80 flex-shrink-0">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="描述解析中存在的问题…"
                rows={2}
                disabled={loading}
                className="flex-1 resize-none px-3 py-2 text-[13px] bg-slate-50 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="px-5 py-2 bg-indigo-500 text-white text-[13px] rounded-xl hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
