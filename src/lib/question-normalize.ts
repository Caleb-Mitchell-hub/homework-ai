import { Question, SingleQuestion, MultipleQuestion, BooleanQuestion, FillQuestion, EssayQuestion, CodeQuestion, InterviewQuestion } from '@/types';
import { generateId } from './storage';

/**
 * 题库格式归一化
 *
 * 后端 POST /api/admin/quizzes 接受两种入参格式:
 *  1. 全局格式 (parser.ts 输出的): type ∈ single/multiple/boolean/fill/essay/code,
 *     字段 title / options / correctAnswer / blanks / code / language / ...
 *  2. 管理员本地格式 (admin/quizzes/new 手动表单的): type 用 'judge' 不用 'boolean',
 *     字段 content / answer / analysis / score
 *
 * 本模块把 1 和 2 都映射到全局 Question 格式,保证存到 DB 后,
 * /quiz/[id] 的 QuestionCard + checker.ts 都能直接消费。
 *
 * - judge -> boolean (answer 归一为 'true'|'false')
 * - content -> title
 * - analysis / score 挂到 BaseQuestion 的可选字段上
 */

type AdminLocalType = 'single' | 'multiple' | 'judge' | 'fill' | 'essay' | 'code' | 'interview';
type AdminLocalQ = {
  id?: string;
  type: AdminLocalType;
  content: string;
  options?: string[];
  answer: string;
  analysis?: string;
  score?: number;
};

const TRUTHY = new Set(['true', '正确', '对', '是', '1', 't', 'y', 'yes']);

/** 启发式判断: 全局格式有 title 且 type 不含 'judge' */
export function isGlobalShape(q: any): q is Question {
  return (
    !!q &&
    typeof q === 'object' &&
    typeof q.title === 'string' &&
    typeof q.type === 'string' &&
    q.type !== 'judge'
  );
}

function pickAnnotations(q: AdminLocalQ): { analysis?: string; score?: number } {
  const out: { analysis?: string; score?: number } = {};
  if (typeof q.analysis === 'string' && q.analysis.trim()) {
    out.analysis = q.analysis.trim();
  }
  if (typeof q.score === 'number' && q.score > 0) {
    out.score = q.score;
  }
  return out;
}

function withAnnotations<T extends Question>(q: T, src: AdminLocalQ): T {
  const ann = pickAnnotations(src);
  if (Object.keys(ann).length === 0) return q;
  return { ...q, ...ann } as T;
}

/** admin 本地 Q → 全局 Q */
export function adminLocalToGlobal(q: AdminLocalQ): Question {
  const id = q.id?.trim() || generateId();
  const title = (q.content ?? '').trim();
  const answerRaw = (q.answer ?? '').trim();

  switch (q.type) {
    case 'single': {
      const correctAnswer = answerRaw.toUpperCase();
      const out: SingleQuestion = {
        id,
        type: 'single',
        title,
        options: Array.isArray(q.options) ? q.options : [],
        answer: correctAnswer,
        correctAnswer,
      };
      return withAnnotations(out, q);
    }
    case 'multiple': {
      const correctAnswer = answerRaw
        .toUpperCase()
        .split('')
        .filter((c) => /[A-Z]/.test(c))
        .sort()
        .join('');
      const out: MultipleQuestion = {
        id,
        type: 'multiple',
        title,
        options: Array.isArray(q.options) ? q.options : [],
        answer: correctAnswer,
        correctAnswer,
      };
      return withAnnotations(out, q);
    }
    case 'judge': {
      const norm = answerRaw.toLowerCase();
      const ans: 'true' | 'false' = TRUTHY.has(norm) ? 'true' : 'false';
      const out: BooleanQuestion = {
        id,
        type: 'boolean',
        title,
        answer: ans,
        correctAnswer: ans,
      };
      return withAnnotations(out, q);
    }
    case 'fill': {
      const blanks = (title.match(/_{2,}/g) || []).length || 1;
      const out: FillQuestion = {
        id,
        type: 'fill',
        title,
        blanks,
        answer: answerRaw,
        correctAnswer: answerRaw,
      };
      return withAnnotations(out, q);
    }
    case 'essay': {
      const out: EssayQuestion = {
        id,
        type: 'essay',
        title,
        answer: answerRaw,
        referenceAnswer: answerRaw,
      };
      return withAnnotations(out, q);
    }
    case 'code': {
      // admin 手动表单没有 code 块,answer 当作参考答案
      const out: CodeQuestion = {
        id,
        type: 'code',
        title,
        code: '',
        language: 'plaintext',
        inputExample: '',
        outputExample: '',
        answer: answerRaw,
      };
      return withAnnotations(out, q);
    }
    case 'interview': {
      const out: InterviewQuestion = {
        id,
        type: 'interview',
        title,
        answer: answerRaw,
        referenceAnswer: answerRaw,
      };
      return withAnnotations(out, q);
    }
  }
}

/** 给全局 Q 补 id (parser 通常已带, 兜底) */
function ensureId(q: Question): Question {
  if (q.id && typeof q.id === 'string') return q;
  return { ...q, id: generateId() } as Question;
}

/**
 * 接受混合格式数组, 全部映射为全局 Question 格式。
 * 不可识别的项会被跳过(避免坏数据污染)。
 */
export function normalizeQuestions(items: unknown): Question[] {
  if (!Array.isArray(items)) return [];
  const out: Question[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const q: any = raw;
    if (isGlobalShape(q)) {
      out.push(ensureId(q));
    } else if (typeof q.type === 'string' && typeof q.content === 'string') {
      // admin 本地格式
      try {
        out.push(adminLocalToGlobal(q as AdminLocalQ));
      } catch {
        // skip
      }
    }
    // else: 既不是全局也不是已知本地, 跳过
  }
  return out;
}
