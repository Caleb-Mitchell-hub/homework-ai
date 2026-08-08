export interface InterviewQuestionResult {
  index: number;
  title: string;
  type: string;
  difficulty?: string;
  userAnswer: string;
  referenceAnswer: string;
  score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  suggestion: string;
}

export interface InterviewReportPromptOpts {
  quizTitle: string;
  totalScore: number; // AI 打分总和
  maxScore: number;   // 满分 (= 题数 × 100)
  questions: InterviewQuestionResult[];
  difficultyProfile?: string;
}

export function buildInterviewReportPrompt(opts: InterviewReportPromptOpts): string {
  const overallRate = opts.maxScore > 0
    ? Math.round((opts.totalScore / opts.maxScore) * 100)
    : 0;

  const questionLines = opts.questions
    .map(
      (q, i) =>
        `  ${i + 1}. [${q.score}/100分] ${q.title.slice(0, 200)}\n     ` +
        `学生答: ${(q.userAnswer || '(未作答)').slice(0, 300)}\n     ` +
        `参考答案: ${(q.referenceAnswer || '').slice(0, 300)}\n     ` +
        `亮点: ${q.strengths.join('; ') || '无'}\n     ` +
        `不足: ${q.weaknesses.join('; ') || '无'}`,
    )
    .join('\n');

  const scoreSummary = opts.questions
    .map((q) => `  第${q.index}题: ${q.score}/100`)
    .join('\n');

  return [
    '你是一位资深面试官和技术导师。请基于以下面试答题数据和逐题 AI 评分，',
    '给出一份深度的面试表现分析报告。',
    '',
    '【试卷名称】',
    opts.quizTitle,
    '',
    '【整体得分】',
    `${opts.totalScore} / ${opts.maxScore} (${overallRate}%)`,
    '',
    '【逐题得分】',
    scoreSummary,
    '',
    '【逐题详情】',
    questionLines,
    opts.difficultyProfile ? `\n难度分布: ${opts.difficultyProfile}` : '',
    '',
    '【输出要求】',
    '严格输出 JSON 对象，无多余文字：',
    '{',
    '  "overallScore": <0-100 的整数，综合评分>,',
    '  "overallComment": "200-300字整体评价 Markdown",',
    '  "masteredAreas": [',
    '    { "area": "已掌握的知识领域/技能", "detail": "具体表现描述" },',
    '    ... 2~4 个',
    '  ],',
    '  "weakAreas": [',
    '    { "area": "薄弱领域/技能", "detail": "详细描述不足之处，给出问题根源分析", "suggestion": "具体改进建议和学习路径" },',
    '    ... 3~6 个',
    '  ],',
    '  "improvementPlan": "400-600字 Markdown, 包含: ① 薄弱点优先级排序 ② 每个薄弱点的具体提升方案(含推荐学习资源/练习方向) ③ 分阶段提升路径(短期/中期/长期) ④ 面试技巧建议"',
    '}',
  ].join('\n');
}
