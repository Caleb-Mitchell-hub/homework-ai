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
    const base = {
      id: idGen(),
      title: String(r.title ?? '').trim(),
      answer: String(r.answer ?? ''),
      analysis: r.analysis ? String(r.analysis) : undefined,
      score: typeof r.score === 'number' ? r.score : undefined,
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
      default:
        // 未知类型,丢弃
        break;
    }
  }
  return out;
}