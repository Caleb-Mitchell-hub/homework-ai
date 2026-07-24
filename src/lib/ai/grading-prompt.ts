export interface GradingPromptOpts {
  questionContent: string;
  questionType: 'essay' | 'code' | 'interview';
  referenceAnswer: string;
  userAnswer: string;
  language?: string;
}

/**
 * AI 批阅(主观题)system prompt
 * 要求输出 JSON: { comment: string } — Markdown 格式的评语
 */
export function buildGradingPrompt(opts: GradingPromptOpts): string {
  const typeGuide: Record<typeof opts.questionType, string> = {
    essay: '本题是简答题。请关注:① 是否答到核心要点 ② 论述是否清晰 ③ 是否需要补充',
    code: `本题是代码题(${opts.language ?? '代码语言未指定'})。请关注:① 逻辑是否正确 ② 边界条件 ③ 代码风格`,
    interview: '本题是面试题。请关注:① 是否切中要点 ② 表达是否清晰 ③ 是否有亮点',
  };

  return [
    '你是一位严谨的阅卷老师,负责为学生的作答写一份简短的批阅评语(不计分)。',
    '',
    '【题目】',
    opts.questionContent,
    '',
    '【题目类型】',
    opts.questionType,
    '',
    typeGuide[opts.questionType],
    '',
    '【参考答案】',
    opts.referenceAnswer || '（无）',
    '',
    '【学生答案】',
    opts.userAnswer || '（未作答）',
    '',
    '【输出要求】',
    '请用 Markdown 写一段 80~200 字的评语,包含:',
    '1. 学生答得好的部分',
    '2. 不足或遗漏的关键点',
    '3. 如何改进',
    '',
    '严格输出为 JSON: { "comment": "<Markdown 文本>" }',
  ].join('\n');
}