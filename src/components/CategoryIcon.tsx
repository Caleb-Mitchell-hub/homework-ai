'use client';

import React from 'react';

interface CategoryIconProps {
  emoji?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * 统一的分类图标组件。
 * - emoji 字符 → 直接渲染为文本
 * - 图片 URL（以 http 或 / 开头）→ 渲染为 <img>
 * - 空值 → 渲染默认图标 📘
 */
export default function CategoryIcon({ emoji, size = 'sm', className = '' }: CategoryIconProps) {
  if (!emoji) {
    return <span className={className}>📘</span>;
  }

  const isImageUrl = emoji.startsWith('http') || emoji.startsWith('/');

  if (isImageUrl) {
    const sizeClass =
      size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6';
    return (
      <img
        src={emoji}
        alt=""
        className={`${sizeClass} rounded object-cover inline-block align-middle ${className}`}
      />
    );
  }

  return <span className={className}>{emoji}</span>;
}

/**
 * 为 <option> 等只能包含纯文本的元素返回纯字符串。
 * 图片 URL → 默认图标 🖼️；emoji → 原样返回；空 → 📘
 */
export function getCategoryEmojiText(emoji?: string | null): string {
  if (!emoji) return '📘';
  if (emoji.startsWith('http') || emoji.startsWith('/')) return '🖼️';
  return emoji;
}
