'use client';

import { useState, useEffect } from 'react';
import { Quiz, QuizResult } from '@/types';
import AnswerSheet from '@/components/AnswerSheet';

/**
 * 答题记录详情 —— 纯"答案速查"视图
 * - 不显示分数、答对/答错、待批改统计
 * - 不显示正确/错误标签
 * - 不提供人工批改按钮
 * - 复用 AnswerSheet,保证"答题提交后"和"侧栏点开记录"看到的是同一份答案视图
 *
 * 之所以不删这个文件:Layout.tsx 还在 import;保持同名 shell,
 * 以后如果想加"导出 PDF"等额外功能,可以在 AnswerSheet 外面再包一层。
 */
export default function ResultCard({ quiz, result }: { quiz: Quiz; result: QuizResult }) {
  return (
    <div className="w-full">
      <div className="w-full px-4 py-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-[10.5px] tracking-[0.25em] uppercase text-sky-500/80 font-medium mb-2">
              Submitted
            </div>
            <h1
              className="text-[28px] leading-tight text-slate-800 mb-1.5"
              style={{ fontFamily: 'var(--font-serif), "Songti SC", serif', fontStyle: 'italic', fontWeight: 500 }}
            >
              答案速查
            </h1>
            <p className="text-slate-500 text-sm">
              {quiz.title} · 共 {quiz.questions.length} 题 · {result.name}
            </p>
          </div>
        </div>
      </div>

      <AnswerSheet quiz={quiz} result={result} />

      <div className="w-full px-4 pb-12 mt-6 text-center text-slate-400 text-xs">
        提交时间：
        {(() => {
          // 兼容 DateTime / ISO 字符串 / 数字
          const v: any = (result as any).submittedAt;
          const d =
            v instanceof Date
              ? v
              : typeof v === 'number'
              ? new Date(v)
              : new Date(v || Date.now());
          return d.toLocaleString('zh-CN');
        })()}
      </div>
    </div>
  );
}
