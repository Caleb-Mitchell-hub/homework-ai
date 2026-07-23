import type { Question } from '@/types';

/**
 * 取得"客观答案":
 *  - 单选/多选/判断/填空:correctAnswer(如 "A" / "AC" / "true" / "foo")
 *  - 简答:referenceAnswer
 *  - 代码:code 的首行
 *
 * 注意:不要直接用 q.answer —— 在 AI 解析后的题库中,
 * q.answer 存的是解析/讲解文字,而非真正的答案。
 */
export function getActualAnswer(q: Question): string {
  switch (q.type) {
    case 'single':
    case 'multiple':
    case 'boolean':
    case 'fill':
      return String((q as any).correctAnswer ?? '').trim();
    case 'essay':
      return String((q as any).referenceAnswer ?? '').trim();
    case 'code': {
      const code = String((q as any).code ?? '').trim();
      const firstLine = code.split('\n').find((l) => l.trim()) ?? '';
      return firstLine;
    }
    default:
      return '';
  }
}

/**
 * 取得"参考/解析"区要展示的长文本:
 *  - 客观题:优先用 q.analysis,没有就回退到 q.answer(兼容旧数据)
 *  - 简答:referenceAnswer
 *  - 代码:code
 */
export function getReferenceAnswer(q: Question): string {
  switch (q.type) {
    case 'single':
    case 'multiple':
    case 'boolean':
    case 'fill': {
      const analysis = (q as any).analysis;
      if (typeof analysis === 'string' && analysis.trim()) return analysis;
      // 兜底:旧题库把答案存到 q.answer(且没有 analysis)
      return String((q as any).answer ?? '');
    }
    case 'essay':
      return String((q as any).referenceAnswer ?? (q as any).answer ?? '');
    case 'code':
      return String((q as any).code ?? '');
    default:
      return '';
  }
}

/**
 * 判断用户答案与参考答案是否一致(用于客观题显示 ✓/✗)
 * - 单选/判断:字符串归一比较
 * - 多选:忽略顺序后集合相等
 * - 填空:trim 比较,支持多个空(用 | 分隔)任一匹配
 * - 简答/代码:不做客观判定(undefined),由老师人工
 */
export function isCorrect(q: Question, userAnswer: string): boolean | undefined {
  if (!userAnswer) return false;
  const ref = getActualAnswer(q);
  if (!ref) return undefined;
  const normalize = (s: string) => String(s).trim().toLowerCase();
  switch (q.type) {
    case 'single':
    case 'boolean':
      return normalize(userAnswer) === normalize(ref);
    case 'multiple': {
      // 兼容两种写法: "AC" / "A,C" / "A C" / "A,C "
      // —— 一律拆成 A-Z 字母集合再比较,顺序无关
      const setNorm = (s: string) =>
        Array.from(new Set(s.toUpperCase().match(/[A-Z]/g) ?? [])).sort().join(',');
      return setNorm(userAnswer) === setNorm(ref);
    }
    case 'fill': {
      const refs = ref.split('|').map((x) => normalize(x));
      const u = normalize(userAnswer);
      return refs.includes(u);
    }
    case 'essay':
    case 'code':
    default:
      return undefined;
  }
}

/** 显示用的正确答案短文本(用于题头 "答: ...") */
export function formatCorrectAnswer(q: Question): string {
  if (q.type === 'essay') return '见详情';
  if (q.type === 'code') {
    const line = getActualAnswer(q);
    return line.length > 24 ? line.slice(0, 24) + '…' : line;
  }
  return getActualAnswer(q);
}
