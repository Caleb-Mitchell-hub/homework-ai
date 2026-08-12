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

/** 构建逐题详情的文本片段（两个子 prompt 共用） */
function buildQuestionDetails(opts: InterviewReportPromptOpts): string {
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
  ].join('\n');
}

/**
 * 子任务 A：掌握/薄弱领域分析（短输出、jsonMode 快速返回）
 * 只要求输出 { masteredAreas, weakAreas }，不含长文本
 */
export function buildMasteryAnalysisPrompt(opts: InterviewReportPromptOpts): string {
  return [
    '你是一位资深面试官。请基于以下面试答题数据和逐题 AI 评分，',
    '分析考生的掌握领域和薄弱领域。',
    '',
    buildQuestionDetails(opts),
    '',
    '【输出要求】',
    '严格输出 JSON 对象，无多余文字。注意：字符串值内的双引号必须转义为 \\"，引用原文请改用书名号《》或单引号，确保输出是合法 JSON：',
    '{',
    '  "masteredAreas": [',
    '    { "area": "已掌握的知识领域/技能", "detail": "具体表现描述（30-80字）" },',
    '    ... 2~4 个',
    '  ],',
    '  "weakAreas": [',
    '    { "area": "薄弱领域/技能", "detail": "详细描述不足之处，给出问题根源分析（50-120字）", "suggestion": "具体改进建议和学习路径（30-80字）" },',
    '    ... 3~6 个',
    '  ]',
    '}',
    '',
    '【强制规则】',
    '• masteredAreas 从得分 ≥70 的题目中提炼，weakAreas 从得分 <70 的题目中提炼',
    '• 每个 area 必须是具体的知识点/技能，不要写泛泛的"表现良好"',
    '• JSON 中所有字符串值内的双引号 " 必须写成 \\"',
    '• 确保输出是可被 JSON.parse() 直接解析的合法 JSON',
  ].join('\n');
}

/**
 * 子任务 B：综合评价 + 提升计划（纯 Markdown 流式输出，不做 JSON 包裹）
 * 前端实时渲染流式 Markdown，完成后用 ## 🎯 优先级排序 做分割
 */
export function buildImprovementAdvicePrompt(opts: InterviewReportPromptOpts): string {
  const overallRate = opts.maxScore > 0
    ? Math.round((opts.totalScore / opts.maxScore) * 100)
    : 0;

  return [
    '你是一位资深面试官和技术导师。请基于以下面试答题数据和逐题 AI 评分，',
    '给出一份深度的面试表现综合评价和提升计划。',
    '',
    '⚠️ 重要：请直接输出 Markdown 格式的纯文本，不要用 JSON 包裹，不要输出大括号、引号转义等 JSON 语法。',
    '',
    buildQuestionDetails(opts),
    '',
    `整体得分率: ${overallRate}% (${opts.totalScore}/${opts.maxScore})`,
    '',
    '【输出格式 — 严格按以下顺序输出纯 Markdown，不要用代码块包裹】',
    '',
    '## 📊 综合表现',
    '用 2-3 句话概述：总分水平、整体能力评估，**加粗**关键结论。',
    '',
    '## ✅ 优势领域',
    '用 - 列表列举 2-4 个掌握较好的方向，每条**加粗**领域名。',
    '示例：',
    '- **JavaScript 核心概念**：对闭包、原型链、事件循环的理解准确',
    '- **框架原理**：能深入解释 React Fiber 和 Vue 响应式系统',
    '',
    '## ⚠️ 薄弱环节',
    '用 - 列表列举 2-4 个需要加强的方向，每条**加粗**薄弱点名称。',
    '',
    '## 💡 学习建议',
    '用 - 列表给出 2-4 条优先级排序的行动建议，每条**加粗**关键词。',
    '',
    '## 🎯 优先级排序',
    '用 - 列表将薄弱点按紧急程度排序（3-5 条），说明排序理由。每条**加粗**薄弱点名称。',
    '',
    '## 📖 分项提升方案',
    '对每个薄弱点，用 ### 三级标题 + - 列表给出：',
    '### 薄弱点名称',
    '- **问题根源**：一句话分析原因',
    '- **推荐资源**：具体的学习资源名称或练习平台（如《JavaScript 高级程序设计》、LeetCode、MDN 文档）',
    '- **练习方向**：具体的练习题目类型或项目建议',
    '',
    '## 🗓️ 阶段规划',
    '分三个阶段，每个阶段用 - 列表给出具体目标和行动：',
    '- **短期（1-2周）**：具体可执行的任务',
    '- **中期（1-2月）**：需要持续投入的方向',
    '- **长期（3-6月）**：系统性提升目标',
    '',
    '## 🎤 面试技巧',
    '用 - 列表给出 3-5 条针对性的面试策略建议。每条**加粗**核心技巧名，`代码`标注专业术语。',
    '示例：',
    '- **STAR 法则**：回答行为面试题时，按 `情境 → 任务 → 行动 → 结果` 组织答案',
    '',
    '【强制规则】',
    '• 直接输出 Markdown，不要用 ```markdown 代码块包裹',
    '• **加粗** 必须大量使用：每个关键结论、领域名、行动词都加粗',
    '• `代码` 标注用于所有技术术语（框架名、API、工具名）',
    '• 严格按照上述标题顺序输出，不要跳过任何段落',
    '• ## 🎯 优先级排序 是提升计划部分的开头，此前为综合评价',
  ].join('\n');
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
    '严格输出 JSON 对象，无多余文字。注意：字符串值内的双引号必须转义为 \\"，引用原文请改用书名号《》或单引号，确保输出是合法 JSON：',
    '{',
    '  "overallScore": <0-100 的整数，综合评分>,',
    '  "overallComment": "整体评价 Markdown（200-350字，按下方模板输出）",',
    '  "masteredAreas": [',
    '    { "area": "已掌握的知识领域/技能", "detail": "具体表现描述" },',
    '    ... 2~4 个',
    '  ],',
    '  "weakAreas": [',
    '    { "area": "薄弱领域/技能", "detail": "详细描述不足之处，给出问题根源分析", "suggestion": "具体改进建议和学习路径" },',
    '    ... 3~6 个',
    '  ],',
    '  "improvementPlan": "提升计划 Markdown（400-700字，按下方模板输出）"',
    '}',
    '',
    '【overallComment 模板 — 必须照此结构】',
    '## 📊 综合表现',
    '用 2-3 句话概述：总分水平、整体能力评估，**加粗**关键结论。',
    '',
    '## ✅ 优势领域',
    '用 - 列表列举 2-4 个掌握较好的方向，每条**加粗**领域名。',
    '示例：',
    '- **JavaScript 核心概念**：对闭包、原型链、事件循环的理解准确',
    '- **框架原理**：能深入解释 React Fiber 和 Vue 响应式系统',
    '',
    '## ⚠️ 薄弱环节',
    '用 - 列表列举 2-4 个需要加强的方向，每条**加粗**薄弱点名称。',
    '',
    '## 💡 学习建议',
    '用 - 列表给出 2-4 条优先级排序的行动建议，每条**加粗**关键词。',
    '',
    '【improvementPlan 模板 — 必须照此结构】',
    '## 🎯 优先级排序',
    '用 - 列表将薄弱点按紧急程度排序（3-5 条），说明排序理由。每条**加粗**薄弱点名称。',
    '',
    '## 📖 分项提升方案',
    '对每个薄弱点，用 ### 三级标题 + - 列表给出：',
    '### 薄弱点名称',
    '- **问题根源**：一句话分析原因',
    '- **推荐资源**：具体的学习资源名称或练习平台（如《JavaScript 高级程序设计》、LeetCode、MDN 文档）',
    '- **练习方向**：具体的练习题目类型或项目建议',
    '',
    '## 🗓️ 阶段规划',
    '分三个阶段，每个阶段用 - 列表给出具体目标和行动：',
    '- **短期（1-2周）**：具体可执行的任务',
    '- **中期（1-2月）**：需要持续投入的方向',
    '- **长期（3-6月）**：系统性提升目标',
    '',
    '## 🎤 面试技巧',
    '用 - 列表给出 3-5 条针对性的面试策略建议。每条**加粗**核心技巧名，`代码`标注专业术语。',
    '示例：',
    '- **STAR 法则**：回答行为面试题时，按 `情境 → 任务 → 行动 → 结果` 组织答案',
    '',
    '【强制规则】',
    '• overallComment 和 improvementPlan 必须严格按模板的段数输出，每段标题带 emoji',
    '• **加粗** 必须大量使用：每个关键结论、领域名、行动词都加粗',
    '• `代码` 标注用于所有技术术语（框架名、API、工具名）',
    '• JSON 中所有字符串值内的双引号 " 必须写成 \\"',
    '• 确保输出是可被 JSON.parse() 直接解析的合法 JSON',
  ].join('\n');
}
