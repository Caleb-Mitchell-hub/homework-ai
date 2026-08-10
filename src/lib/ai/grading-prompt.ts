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
    '请用 Markdown 写一段 120~300 字的评语，按以下模板结构输出：',
    '',
    '## 📊 答题评估',
    '一句话总评，**加粗**核心结论。例如：整体作答**思路清晰**，但在**异常处理**方面有所欠缺。',
    '',
    '## ✅ 正确亮点',
    '用 - 列表列举学生答得好的 1-3 个具体点，**加粗**正确术语。',
    '',
    '## ⚠️ 不足之处',
    '用 - 列表列举 1-3 个遗漏或错误的关键点，**加粗**问题关键词。',
    '',
    '## 💡 改进方向',
    '用 - 列表给出 1-3 条具体改进建议。如果题目涉及代码，必须用 ``` 代码块给出正确写法示例。',
    '',
    '严格输出为 JSON: { "comment": "<Markdown 文本>" }',
    '',
    '注意：如果 Markdown 文本中需要包含双引号，必须转义为 \\"，或改用书名号《》、单引号替代。确保输出是合法 JSON。',
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
    '严格输出 JSON 对象（注意：字符串值内若包含双引号必须转义为 \\"，例如：他说"很好" → 他说\\"很好\\"）：',
    '{',
    '  "score": <0-100 的整数>,',
    '  "strengths": ["亮点1", "亮点2"],',
    '  "weaknesses": ["不足1", "不足2"],',
    '  "suggestion": "改进建议 Markdown 格式（80-200字，要求：**加粗**关键词、`代码`标注术语、用 - 列表给出 2-4 条可操作建议）",',
    '  "comment": "综合评语 Markdown 格式（200-500字，必须严格按下方【评语模板】输出）",',
    '}',
    '',
    '【评语模板 — comment 字段必须照此结构输出】',
    '请严格按照以下 4 段结构编写 comment，每段用 ## 二级标题开头，标题中必须带 emoji：',
    '',
    '## 📊 整体评价',
    '用 2-4 句话概括：本题考察什么知识点、学生整体表现如何、得分档次说明。',
    '**关键术语必须加粗**，例如：本题考察**闭包原理**，学生回答**基本覆盖核心要点**，但在**边界情况处理**上存在遗漏。',
    '',
    '## ✅ 得分亮点',
    '用 - 列表逐条列出学生答得好的具体内容（2-4 条），每条中**加粗**关键术语。',
    '示例：',
    '- 对 **原型链** 的核心概念理解准确，能清晰描述 `__proto__` 与 `prototype` 的区别',
    '- 主动补充了 **ES6 Class 语法糖** 的底层原理，展现知识深度',
    '',
    '## ⚠️ 待改进点',
    '用 - 列表逐条指出不足或遗漏（2-4 条），每条中**加粗**问题关键词。',
    '示例：',
    '- 未提及 **事件循环** 中 `微任务` 与 `宏任务` 的执行优先级差异',
    '- 对 `Promise.all` 的**错误处理机制**描述有误，应使用 `.catch` 而非 `try-catch`',
    '',
    '## 💡 提升建议',
    '给出 2-4 条具体可操作的改进建议，用 - 列表。每条建议中：**加粗**行动关键词，`代码` 标注术语或 API 名。',
    '如果题目涉及代码，必须用 ``` 代码块给出正确示例或改进后的代码写法。',
    '示例：',
    '- 建议深入学习 **React Fiber 架构**，重点理解 `requestIdleCallback` 的调度机制',
    '- 练习手写 `Promise.all` 的 **polyfill 实现**，参考写法：',
    '```javascript',
    'Promise.myAll = function(promises) {',
    '  return new Promise((resolve, reject) => {',
    '    const results = [];',
    '    let count = 0;',
    '    promises.forEach((p, i) => Promise.resolve(p).then(v => {',
    '      results[i] = v;',
    '      count++;',
    '      if (count === promises.length) resolve(results);',
    '    }, reject));',
    '  });',
    '};',
    '```',
    '',
    '【强制规则】',
    '• comment 评语必须严格按上述 4 段结构输出，缺一不可',
    '• 每段标题必须带 emoji（📊/✅/⚠️/💡），标题用 ## 开头',
    '• **加粗** 必须大量使用：每个关键术语、每个核心结论都要加粗',
    '• `代码` 标注必须用于所有技术术语（API 名、方法名、语言关键字）',
    '• 涉及代码示例时，必须使用 ```语言名 代码块，指定正确的语言标识',
    '• JSON 中所有字符串值内的双引号 " 必须写成 \\"',
    '• 如果引用学生原话中包含引号，请改用书名号《》或单引号避免破坏 JSON',
    '• 确保输出是合法 JSON，可直接被 JSON.parse() 解析',
  ].join('\n');
}