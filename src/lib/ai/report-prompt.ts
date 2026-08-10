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
    '严格输出 JSON,无多余文字。注意：字符串值内的双引号必须转义为 \\"，引用原文请改用书名号《》或单引号，确保输出是合法 JSON:',
    '{',
    '  "knowledgePoints": [',
    '    { "tag": "知识点名", "relatedQuestions": [题号数组] },',
    '    ... 3~6 个',
    '  ],',
    '  "advice": "300~500 字 Markdown 文本，必须严格按下方模板输出"',
    '}',
    '',
    '【advice 模板 — 必须照此结构输出】',
    '## 📊 成绩总览',
    '用 1-2 句话概括得分情况与整体表现，**加粗**关键结论。',
    '',
    '## ⚠️ 薄弱点分析',
    '结合题型和难度维度，用 - 列表分析 2-4 个薄弱环节。每条**加粗**薄弱知识点名，`代码`标注题型/术语。',
    '示例：',
    '- **递归算法**（`代码题` / 困难）：对递归终止条件的判断不够准确，建议...',
    '',
    '## 🎯 学习优先级',
    '将薄弱点按从易到难、从基础到进阶排序，用 - 列表给出学习优先级，每条**加粗**知识点。',
    '',
    '## 📖 具体行动建议',
    '用 - 列表给出 3-5 条可执行的建议，每条包含：',
    '- **行动项**：具体学习内容，推荐具体资源名（如《XXX 教程》、LeetCode 题号、MDN 文档）',
    '- 涉及代码时用 ``` 代码块展示示例',
    '',
    '## 🗓️ 提升路径',
    '分两个阶段规划：',
    '- **短期（1-2周）**：集中攻克的核心内容',
    '- **中期（1-2月）**：系统性提升方向',
    '',
    '若无错题，knowledgePoints 给空数组，advice 给出保持性建议。',
  ].join('\n');
}