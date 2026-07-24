export interface WrongQuestion {
  index: number;
  title: string;
  type: string;
  userAnswer: string;
  correctAnswer: string;
}

export interface ReportPromptOpts {
  quizTitle: string;
  score: number;
  totalScore: number;
  byType: Record<string, { total: number; correct: number; correctRate: number }>;
  wrongQuestions: WrongQuestion[];
}

export function buildReportPrompt(opts: ReportPromptOpts): string {
  const typeLines =
    Object.entries(opts.byType)
      .map(
        ([t, s]) =>
          `  - ${t}: ${s.correct}/${s.total} (${Math.round(s.correctRate * 100)}%)`,
      )
      .join('\n') || '  （无）';

  const wrongLines =
    opts.wrongQuestions.length > 0
      ? opts.wrongQuestions
          .map(
            (w, i) =>
              `  ${i + 1}. [${w.type}] 第 ${w.index} 题: ${w.title}\n     学生答: ${(w.userAnswer || '(未作答)').slice(0, 200)}\n     参考: ${(w.correctAnswer || '').slice(0, 200)}`,
          )
          .join('\n')
      : '  （无错题,满分）';

  return [
    '你是一位资深学习顾问。请基于以下答题数据,给出知识点分析与下一步学习建议。',
    '',
    '【试卷】',
    opts.quizTitle,
    '',
    '【本次得分】',
    `${opts.score} / ${opts.totalScore}`,
    '',
    '【按题型正确率】',
    typeLines,
    '',
    '【错题列表】',
    wrongLines,
    '',
    '【输出要求】',
    '严格输出 JSON,无多余文字:',
    '{',
    '  "knowledgePoints": [',
    '    { "tag": "知识点名", "relatedQuestions": [题号数组] },',
    '    ... 3~6 个',
    '  ],',
    '  "advice": "200~400 字 Markdown 文本,包含下一步应该学什么、学习路径建议、资源方向"',
    '}',
    '',
    '若无错题,knowledgePoints 给空数组,advice 给出保持性建议。',
  ].join('\n');
}