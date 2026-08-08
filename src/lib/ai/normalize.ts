import type { Question } from '@/types';

type IdGen = () => string;
type Loose = Record<string, any>;

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
    const type = r.type;
    const code = String(r.code ?? '').trim();
    const language = String(r.language ?? (code ? 'plaintext' : ''));
    const base = {
      id: idGen(),
      title: String(r.title ?? '').trim(),
      answer: String(r.answer ?? ''),
      analysis: r.analysis ? String(r.analysis) : undefined,
      score: typeof r.score === 'number' ? r.score : undefined,
      ...(code ? { code, language } : {}),
    };
    switch (type) {
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
      default:
        // 未知类型,丢弃
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