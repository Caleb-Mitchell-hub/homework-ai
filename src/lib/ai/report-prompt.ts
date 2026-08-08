export interface WrongQuestion {
  index: number;
  title: string;
  type: string;
  difficulty?: string;
  userAnswer: string;
  correctAnswer: string;
}

export type DifficultyKey = '简单' | '中等' | '困难';

export interface ReportPromptOpts {
  quizTitle: string;
  score: number;
  totalScore: number;
  byType: Record<string, { total: number; correct: number; correctRate: number }>;
  byDifficulty: Record<string, { total: number; correct: number; correctRate: number }>;
  wrongQuestions: WrongQuestion[];
  difficultyProfile?: string; // 整套题难度分布概览
}

export function buildReportPrompt(opts: ReportPromptOpts): string {
  const typeLines =
    Object.entries(opts.byType)
      .map(
        ([t, s]) =>
          `  - ${t}: ${s.correct}/${s.total} (${Math.round(s.correctRate * 100)}%)`,
      )
      .join('\n') || '  （无）';

  const diffLines = Object.keys(opts.byDifficulty).length > 0
    ? Object.entries(opts.byDifficulty)
        .map(
          ([d, s]) =>
            `  - ${d}: ${s.correct}/${s.total} (${Math.round(s.correctRate * 100)}%)`,
        )
        .join('\n')
    : '  （无难度标记）';

  const wrongLines =
    opts.wrongQuestions.length > 0
      ? opts.wrongQuestions
          .map(
            (w, i) =>
              `  ${i + 1}. [${w.type}] 第 ${w.index} 题: ${w.title}\n     学生答: ${(w.userAnswer || '(未作答)').slice(0, 200)}\n     参考: ${(w.correctAnswer || '').slice(0, 200)}`,
          )
          .join('\n')
      : '  （无错题,满分）';

  const diffAdvice = opts.difficultyProfile
    ? `\n难度分布特征: ${opts.difficultyProfile}\n请根据此特征调整建议: 困难题多错 → 建议从基础概念补起; 简单题多错 → 建议加强审题和细心度。`
    : '';

  return [
    '你是一位资深学习顾问。请基于以下答题数据,给出深度知识点分析与个性化学习路径。',
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
    '【按难度正确率】',
    diffLines,
    diffAdvice,
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
    '  "advice": "300~500 字 Markdown 文本, 包含: ① 薄弱点分析(结合题型+难度) ② 学习优先级(从易到难排序) ③ 3~5 条具体行动建议(含推荐学习资源/练习方向) ④ 预期提升路径"',
    '}',
    '',
    '若无错题,knowledgePoints 给空数组,advice 给出保持性建议。',
  ].join('\n');
}