'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import MarkdownView from '@/components/MarkdownView';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  questionId: string;
  questionContent: string;
  questionType: string;
  answer?: string;
  aiExplanation?: string;
}

const MAX_MESSAGES = 20; // 最多 10 轮对话

export default function AIFollowUp({
  questionId,
  questionContent,
  questionType,
  answer,
  aiExplanation,
}: Props) {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // 展开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !token) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    // 截断超长历史
    if (newMessages.length > MAX_MESSAGES) {
      newMessages.splice(0, newMessages.length - MAX_MESSAGES);
    }
    setMessages(newMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/followup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questionId,
          questionContent,
          questionType,
          answer,
          aiExplanation,
          conversationHistory: messages,
          newQuestion: text,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '追问失败');
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.content },
      ]);
    } catch (err: any) {
      setError(err?.message || '追问失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const retryLast = () => {
    if (messages.length === 0) return;
    // 找到最后一条用户消息
    const revIdx = [...messages].reverse().findIndex((m) => m.role === 'user');
    if (revIdx === -1) return;
    const actualIdx = messages.length - 1 - revIdx;
    const lastUserMsg = messages[actualIdx];
    // 回到该消息之前的状态
    setMessages(messages.slice(0, actualIdx));
    setInput(lastUserMsg.content);
    setError(null);
  };

  return (
    <div className="mt-2">
      {/* 入口按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1 px-3 py-1.5 text-[12px] rounded-lg transition-all ${
          isOpen
            ? 'bg-indigo-100 text-indigo-700'
            : 'bg-gradient-to-r from-indigo-400 to-purple-400 text-white hover:opacity-90'
        }`}
        type="button"
      >
        💬 追问
        {messages.length > 0 && !isOpen && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/25 text-[10px] leading-none">
            {messages.filter((m) => m.role === 'user').length}
          </span>
        )}
      </button>

      {/* 展开的对话面板 */}
      {isOpen && (
        <div className="mt-2 border border-indigo-100 rounded-xl overflow-hidden bg-white/60">
          {/* 对话区 */}
          <div className="max-h-64 overflow-y-auto px-3 py-2.5 space-y-2.5">
            {messages.length === 0 && !loading && (
              <div className="text-[12px] text-slate-400 text-center py-4">
                输入你的疑问，AI 会基于题目内容为你解答
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
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
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
              </div>
            ))}

            {/* loading 态 */}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 rounded-xl bg-slate-100 text-slate-700 rounded-bl-sm">
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
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="px-3 py-1.5 bg-rose-50 border-t border-rose-100 flex items-center justify-between">
              <span className="text-[11px] text-rose-600">{error}</span>
              <button
                onClick={retryLast}
                className="text-[11px] text-rose-600 hover:underline flex-shrink-0 ml-2"
                type="button"
              >
                重试
              </button>
            </div>
          )}

          {/* 输入区 */}
          <div className="flex items-end gap-2 px-3 py-2 border-t border-slate-100 bg-white/80">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入追问内容…"
              rows={1}
              disabled={loading}
              className="flex-1 resize-none px-3 py-1.5 text-[12.5px] bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-3 py-1.5 bg-indigo-500 text-white text-[12px] rounded-lg hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
              type="button"
            >
              发送
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
