'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDialog } from '@/components/DialogProvider';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (mode: 'local' | 'ai') => void;
  aiAvailable: boolean;
}

export default function ParseChoiceDialog({ open, onClose, onSelect, aiAvailable }: Props) {
  const { user } = useAuth();
  const dialog = useDialog();
  const localButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus the local card so keyboard users can confirm quickly
    localButtonRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="parse-choice-title"
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="parse-choice-title" className="text-lg font-semibold text-slate-800 mb-1">选择解析方式</h2>
        <p className="text-[12px] text-slate-500 mb-5">选完后会自动开始解析并进入答题</p>

        <div className="grid grid-cols-2 gap-3">
          <button
            ref={localButtonRef}
            onClick={() => onSelect('local')}
            className="p-5 bg-gradient-to-br from-sky-50 to-emerald-50 border-2 border-sky-200 hover:border-sky-400 rounded-xl text-left transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">⚡</span>
              <span className="font-semibold text-slate-800">本地解析</span>
            </div>
            <p className="text-[12px] text-slate-600 mb-3">即时完成</p>
            <ul className="text-[11px] text-slate-500 space-y-1">
              <li>• 适合格式规范的 Markdown</li>
              <li>• 无需网络,无 API 成本</li>
              <li>• 代码题支持较弱</li>
            </ul>
          </button>

          <button
            onClick={async () => {
              if (!aiAvailable) return;
              if (user?.isGuest) {
                await dialog.alert({ title: '游客受限', message: '游客功能暂未开通，请登录使用 AI 解析' });
                return;
              }
              onSelect('ai');
            }}
            disabled={!aiAvailable}
            className={`p-5 border-2 rounded-xl text-left transition-all ${
              aiAvailable
                ? 'bg-gradient-to-br from-violet-50 to-pink-50 border-violet-200 hover:border-violet-400'
                : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">🧠</span>
              <span className="font-semibold text-slate-800">AI 解析</span>
            </div>
            <p className="text-[12px] text-slate-600 mb-3">
              {aiAvailable ? '预计 10-30 秒' : '未配置 AI 厂商'}
            </p>
            <ul className="text-[11px] text-slate-500 space-y-1">
              <li>• 适合代码题 / 复杂格式</li>
              <li>• 需调用 AI 厂商 API</li>
              <li>• 图片 OCR 必需</li>
            </ul>
            {!aiAvailable && (
              <p className="text-[11px] text-amber-600 mt-3">
                请管理员在「AI 配置」中设置激活厂商
              </p>
            )}
          </button>
        </div>

        <button
          onClick={onClose}
          className="mt-4 text-[12px] text-slate-500 hover:text-slate-800"
        >
          稍后再说
        </button>
      </div>
    </div>
  );
}