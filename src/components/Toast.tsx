'use client';

import { useState, useEffect } from 'react';

interface ToastProps {
  message: string;
  visible: boolean;
  onHide: () => void;
}

export default function Toast({ message, visible, onHide }: ToastProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onHide, 1000);
      return () => clearTimeout(timer);
    }
  }, [visible, onHide]);

  if (!visible) return null;

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-fade-in">
      <div className="px-6 py-3 bg-white/90 backdrop-blur text-slate-700 rounded-xl shadow-lg border border-slate-200/60">
        {message}
      </div>
    </div>
  );
}