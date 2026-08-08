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

export interface InterviewScoreResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestion: string;
  comment: string;
}

/**
 * 面试题 AI 打分 prompt（0-100 分制）
 * 要求输出 JSON: { score, strengths, weaknesses, suggestion, comment }
 */
export function buildInterviewGradingPrompt(opts: GradingPromptOpts): string {
  return [
    '你是一位资深面试官，请根据学生的回答与参考答案的匹配程度，给出 0-100 分的评分。',
    '',
    '【评分标准】',
    '• 90-100：回答全面、有深度、表达清晰，涵盖所有要点并有独到见解',
    '• 75-89：回答较完整，涵盖大部分要点，表达较清晰',
    '• 60-74：回答基本切题，但遗漏部分关键点或表达不够清晰',
    '• 40-59：回答部分相关，但遗漏较多要点或表达混乱',
    '• 20-39：回答勉强相关，几乎没有切中要点',
    '• 0-19：回答完全无关、只有"不知道"、或未作答',
    '',
    '【重要规则】',
    '如果学生的回答是"不知道"、"不会"、空白、或与题目完全无关的内容，直接判 0 分。',
    '',
    '【题目】',
    opts.questionContent,
    '',
    '【参考答案】',
    opts.referenceAnswer || '（无）',
    '',
    '【学生答案】',
    opts.userAnswer || '（未作答）',
    '',
    '【输出要求】',
    '严格输出 JSON 对象：',
    '{',
    '  "score": <0-100 的整数>,',
    '  "strengths": ["亮点1", "亮点2"],',
    '  "weaknesses": ["不足1", "不足2"],',
    '  "suggestion": "改进建议（50-150字）",',
    '  "comment": "综合评语 Markdown 格式（80-200字）"',
    '}',
  ].join('\n');
}