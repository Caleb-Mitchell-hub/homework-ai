'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/* ===================== 类型 ===================== */

interface AlertOptions {
  title?: string;
  message: string;
  confirmText?: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface PromptOptions {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}

type AlertState = {
  kind: 'alert';
  title: string;
  message: string;
  confirmText: string;
  resolve: () => void;
};

type ConfirmState = {
  kind: 'confirm';
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  resolve: (v: boolean) => void;
};

type PromptState = {
  kind: 'prompt';
  title: string;
  message: string;
  placeholder: string;
  defaultValue: string;
  confirmText: string;
  cancelText: string;
  resolve: (v: string | null) => void;
};

type DialogState = AlertState | ConfirmState | PromptState | { kind: 'none' };

export interface DialogApi {
  alert: (opts: AlertOptions | string) => Promise<void>;
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  prompt: (opts: PromptOptions | string) => Promise<string | null>;
}

/* ===================== Context ===================== */

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog 必须在 <DialogProvider> 内使用');
  }
  return ctx;
}

/* ===================== Provider ===================== */

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>({ kind: 'none' });
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const alert: DialogApi['alert'] = useCallback((opts) => {
    const o: AlertOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<void>((resolve) => {
      setState({
        kind: 'alert',
        title: o.title ?? '提示',
        message: o.message,
        confirmText: o.confirmText ?? '知道了',
        resolve,
      });
    });
  }, []);

  const confirm: DialogApi['confirm'] = useCallback((opts) => {
    const o: ConfirmOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setState({
        kind: 'confirm',
        title: o.title ?? '请确认',
        message: o.message,
        confirmText: o.confirmText ?? '确定',
        cancelText: o.cancelText ?? '取消',
        danger: !!o.danger,
        resolve,
      });
    });
  }, []);

  const prompt: DialogApi['prompt'] = useCallback((opts) => {
    const o: PromptOptions = typeof opts === 'string' ? { message: opts } : opts;
    return new Promise<string | null>((resolve) => {
      setInputValue(o.defaultValue ?? '');
      setState({
        kind: 'prompt',
        title: o.title ?? '请输入',
        message: o.message,
        placeholder: o.placeholder ?? '',
        defaultValue: o.defaultValue ?? '',
        confirmText: o.confirmText ?? '确定',
        cancelText: o.cancelText ?? '取消',
        resolve,
      });
    });
  }, []);

  // prompt 打开时自动 focus
  useEffect(() => {
    if (state.kind === 'prompt') {
      // 下一帧再 focus,等 input 挂载
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [state.kind]);

  // ESC 关闭(alert/confirm 当取消,prompt 当返回 null)
  useEffect(() => {
    if (state.kind === 'none') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (state.kind === 'alert') state.resolve();
        else if (state.kind === 'confirm') state.resolve(false);
        else if (state.kind === 'prompt') state.resolve(null);
        setState({ kind: 'none' });
      } else if (e.key === 'Enter' && state.kind === 'prompt') {
        e.preventDefault();
        state.resolve(inputValue);
        setState({ kind: 'none' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, inputValue]);

  const handleConfirm = () => {
    if (state.kind === 'alert') state.resolve();
    else if (state.kind === 'confirm') state.resolve(true);
    else if (state.kind === 'prompt') state.resolve(inputValue);
    setState({ kind: 'none' });
  };

  const handleCancel = () => {
    if (state.kind === 'alert') state.resolve();
    else if (state.kind === 'confirm') state.resolve(false);
    else if (state.kind === 'prompt') state.resolve(null);
    setState({ kind: 'none' });
  };

  /* ===================== 渲染 ===================== */

  const open = state.kind !== 'none';

  return (
    <DialogContext.Provider value={{ alert, confirm, prompt }}>
      {children}

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)' }}
          onClick={handleCancel}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl anim-stagger-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题 */}
            {state.title && (
              <h3 className="text-[18px] font-semibold text-slate-800 mb-2">
                {state.title}
              </h3>
            )}

            {/* 内容 */}
            {state.kind === 'prompt' ? (
              <div>
                <p className="text-[13.5px] text-slate-600 mb-3 leading-relaxed">
                  {state.message}
                </p>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={state.placeholder}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100 text-[14px]"
                />
              </div>
            ) : (
              <p className="text-[13.5px] text-slate-600 leading-relaxed">
                {state.message}
              </p>
            )}

            {/* 按钮 */}
            <div className="mt-5 flex gap-2.5">
              {state.kind === 'alert' ? (
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 text-[13.5px] text-white rounded-xl bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500 transition-all"
                >
                  {state.confirmText}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-2.5 text-[13.5px] text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    {state.kind === 'confirm' ? state.cancelText : state.cancelText}
                  </button>
                  <button
                    onClick={handleConfirm}
                    className={`flex-1 py-2.5 text-[13.5px] text-white rounded-xl transition-all ${
                      state.kind === 'confirm' && state.danger
                        ? 'bg-rose-500 hover:bg-rose-600'
                        : 'bg-gradient-to-r from-sky-400 to-emerald-400 hover:from-sky-500 hover:to-emerald-500'
                    }`}
                  >
                    {state.kind === 'confirm' ? state.confirmText : state.confirmText}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
