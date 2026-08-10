import type { Question } from '@/types';

type IdGen = () => string;
type Loose = Record<string, any>;

/** AI 可能返回中文 type 值，映射到英文字段 */
const TYPE_ALIASES: Record<string, string> = {
  '单选题': 'single',
  '单选': 'single',
  '选择题': 'single',
  '多选题': 'multiple',
  '多选': 'multiple',
  '判断题': 'boolean',
  '判断': 'boolean',
  '填空题': 'fill',
  '填空': 'fill',
  '简答题': 'essay',
  '简答': 'essay',
  '问答题': 'essay',
  '面试题': 'interview',
  '面试': 'interview',
  '编程题': 'code',
  '代码题': 'code',
  '代码': 'code',
};

/** 从题目结构中推测 type */
function inferType(r: Loose, resolvedType: string | null): string | null {
  // 有 options + correctAnswer 是字母 → single
  if (
    (Array.isArray(r.options) && r.options.length > 0) &&
    r.correctAnswer != null &&
    /^[A-D]$/i.test(String(r.correctAnswer))
  ) {
    return 'single';
  }
  // 有 options + correctAnswer 包含多个字母/逗号 → multiple
  if (
    (Array.isArray(r.options) && r.options.length > 0) &&
    r.correctAnswer != null &&
    /^[A-D,;]+$/i.test(String(r.correctAnswer)) &&
    String(r.correctAnswer).replace(/[,;]/g, '').length > 1
  ) {
    return 'multiple';
  }
  // correctAnswer 是 true/false → boolean
  if (r.correctAnswer === true || r.correctAnswer === false ||
      r.correctAnswer === 'true' || r.correctAnswer === 'false') {
    return 'boolean';
  }
  // 有 blanks 字段 → fill
  if (r.blanks != null) {
    return 'fill';
  }
  // 有 referenceAnswer → essay 或 interview
  if (typeof r.referenceAnswer === 'string' && r.referenceAnswer.length > 0) {
    return 'essay';
  }
  // 有 subQuestions → interview
  if (Array.isArray(r.subQuestions)) {
    return 'interview';
  }
  // 兜底：有 title 就当 essay
  if (typeof r.title === 'string' && r.title.trim().length > 0) {
    return 'essay';
  }
  return null;
}

function pickOptions(raw: any): string[] {
  if (Array.isArray(raw)) {
    // AI 返回 [{key,text}, ...] 时取 text
    return raw.map((o: any) => (typeof o === 'string' ? o : (o?.text ?? String(o ?? ''))));
  }
  return [];
}

function toAnswer(raw: any): string {
  if (Array.isArray(raw)) return raw.join(',');
  if (raw === true) return 'true';
  if (raw === false) return 'false';
  return raw == null ? '' : String(raw);
}

export function normalizeAIOutputToQuestions(
  rawArr: Loose[],
  idGen: IdGen
): Question[] {
  const out: Question[] = [];
  for (const r of rawArr ?? []) {
    const rawType = r.type;
    // 1. 先查中文别名映射
    let resolved: string | null = null;
    if (typeof rawType === 'string' && rawType) {
      const trimmed = rawType.trim();
      resolved = TYPE_ALIASES[trimmed] ?? TYPE_ALIASES[trimmed.toLowerCase()] ?? trimmed.toLowerCase();
    }
    // 2. 别名映射失败则从结构推测
    if (!resolved || !['single', 'multiple', 'boolean', 'fill', 'essay', 'code', 'interview'].includes(resolved)) {
      const inferred = inferType(r, resolved);
      if (inferred) {
        console.log('[normalize] type 推测: rawType=%s → inferred=%s', rawType, inferred);
        resolved = inferred;
      }
    }
    // 3. 最终不可识别则丢弃并记录
    if (!resolved || !['single', 'multiple', 'boolean', 'fill', 'essay', 'code', 'interview'].includes(resolved)) {
      console.warn('[normalize] 丢弃无法识别的题目: type=%s title=%s keys=%s', rawType, String(r.title ?? '').slice(0, 50), Object.keys(r).join(','));
      continue;
    }

    const code = String(r.code ?? '').trim();
    const language = String(r.language ?? (code ? 'plaintext' : ''));

    // AI 输出通常不包含 answer 字段,而是用 correctAnswer / referenceAnswer。
    // 这里把类型专属答案回填到 base.answer,保证 QuestionCard/AnswerSheet 能正确展示"正确答案"。
    let answerFromAI = String(r.answer ?? '');
    if (!answerFromAI) {
      switch (resolved) {
        case 'single':
        case 'multiple':
        case 'fill':
          answerFromAI = toAnswer(r.correctAnswer);
          break;
        case 'boolean':
          answerFromAI = r.correctAnswer === true || r.correctAnswer === 'true' ? 'true' : 'false';
          break;
        case 'essay':
        case 'interview':
          answerFromAI = String(r.referenceAnswer ?? '');
          break;
      }
    }

    const base = {
      id: idGen(),
      title: String(r.title ?? '').trim(),
      answer: answerFromAI,
      analysis: r.analysis ? String(r.analysis) : undefined,
      score: typeof r.score === 'number' ? r.score : undefined,
      ...(code ? { code, language } : {}),
    };
    switch (resolved) {
      case 'single':
        out.push({
          ...base,
          type: 'single',
          options: pickOptions(r.options),
          correctAnswer: toAnswer(r.correctAnswer),
        });
        break;
      case 'multiple':
        out.push({
          ...base,
          type: 'multiple',
          options: pickOptions(r.options),
          correctAnswer: toAnswer(r.correctAnswer),
        });
        break;
      case 'boolean':
        out.push({
          ...base,
          type: 'boolean',
          correctAnswer: r.correctAnswer === true || r.correctAnswer === 'true' ? 'true' : 'false',
        });
        break;
      case 'fill': {
        const blankCount = Number.isFinite(Number(r.blanks)) && Number(r.blanks) > 0 ? Number(r.blanks) : 1;
        out.push({
          ...base,
          type: 'fill',
          blanks: blankCount,
          correctAnswer: toAnswer(r.correctAnswer),
        });
        break;
      }
      case 'essay':
        out.push({
          ...base,
          type: 'essay',
          referenceAnswer: String(r.referenceAnswer ?? r.answer ?? ''),
        });
        break;
      case 'code':
        out.push({
          ...base,
          type: 'code',
          code: String(r.code ?? ''),
          language: String(r.language ?? 'plaintext'),
          inputExample: String(r.inputExample ?? ''),
          outputExample: String(r.outputExample ?? ''),
        });
        break;
      case 'interview':
        out.push({
          ...base,
          type: 'interview',
          referenceAnswer: String(r.referenceAnswer ?? r.answer ?? ''),
          subQuestions: Array.isArray(r.subQuestions)
            ? (r.subQuestions as unknown[]).map((s) => String(s))
            : undefined,
        });
        break;
    }
  }
  return out;
}

/**
 * 如果所有题目都是 essay 类型，自动转换为 interview 类型。
 * AI 解析和手动创建时都适用。
 */
export function autoConvertEssayToInterview(questions: Question[]): Question[] {
  if (questions.length === 0) return questions;
  if (questions.every((q) => q.type === 'essay')) {
    return questions.map((q) => ({
      ...q,
      type: 'interview' as const,
      referenceAnswer: (q as any).referenceAnswer ?? '',
      subQuestions: undefined,
    }));
  }
  return questions;
}