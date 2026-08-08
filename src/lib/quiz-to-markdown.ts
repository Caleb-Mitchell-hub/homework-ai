import type { Question } from '@/types';
import { getActualAnswer, getReferenceAnswer } from '@/lib/answer-sheet-helpers';

/** 题型中文标签 */
const TYPE_LABEL: Record<Question['type'], string> = {
  single: '单选题',
  multiple: '多选题',
  boolean: '判断题',
  fill: '填空题',
  essay: '简答题',
  code: '代码题',
  interview: '面试题',
};

/** 选项标签 A-Z */
function optionLetter(i: number): string {
  return String.fromCharCode(65 + i);
}

/**
 * 将文本渲染为 Markdown 段落。
 * 行内 `$...$` 和块级 `$$...$$` 均原样保留 —— LaTeX 公式本身即为
 * 合法的 Markdown 扩展语法，主流渲染器（Pandoc、MathJax、KaTeX、GitHub
 * Flavored Markdown 等）均可正确解析。
 */
function renderContent(text: string): string {
  if (!text) return '';
  return text;
}

/** 将单道题转为 Markdown。
 *
 *  结构：
 *    ### N. 题干内容
 *    [标签: 单选题]【简单】（5 分）
 *    （留空，下面是选项/填空/代码块）
 */
function questionToMarkdown(q: Question, index: number): string {
  const num = index + 1;
  const parts: string[] = [];

  // 题头：编号 + 题干
  parts.push(`### ${num}. ${renderContent(q.title)}`);
  parts.push('');

  // 元信息行：题型 + 难度 + 分值
  const meta: string[] = [];
  meta.push(`[标签: ${TYPE_LABEL[q.type] || q.type}]`);
  if (q.difficulty) meta.push(`【${q.difficulty}】`);
  if (q.score != null) meta.push(`（${q.score} 分）`);
  parts.push(meta.join(' '));
  parts.push('');

  switch (q.type) {
    case 'single':
    case 'multiple': {
      const opts = (q.options || [])
        .map((opt, i) => `${optionLetter(i)}. ${renderContent(opt)}`)
        .join('\n');
      parts.push(opts);
      break;
    }

    case 'boolean':
      parts.push('A. 正确');
      parts.push('B. 错误');
      break;

    case 'fill': {
      const blanks = q.blanks || 1;
      const blankText = Array.from({ length: blanks }, () => '____').join('、');
      parts.push(blankText);
      break;
    }

    case 'essay':
      parts.push('（简答题）');
      break;

    case 'code': {
      const lang = q.language || '';
      const code = q.code || '';
      parts.push(`\`\`\`${lang}`);
      parts.push(code);
      parts.push('```');
      break;
    }

    case 'interview': {
      parts.push('（面试题）');
      if (Array.isArray(q.subQuestions) && q.subQuestions.length > 0) {
        parts.push('');
        q.subQuestions.forEach((sub) => {
          parts.push(`- ${renderContent(sub)}`);
        });
      }
      break;
    }
  }

  return parts.join('\n');
}

/** 将单道题的答案转为 Markdown */
function answerToMarkdown(q: Question, index: number): string {
  const num = index + 1;
  const actual = getActualAnswer(q);
  const ref = getReferenceAnswer(q);
  const analysis = (q as any).analysis as string | undefined;

  let result = `${num}. ${actual || '（无答案）'}`;
  if (ref && ref !== actual) {
    result += `\n  参考: ${renderContent(ref)}`;
  }
  if (analysis && analysis.trim()) {
    result += `\n  解析: ${renderContent(analysis.trim())}`;
  }
  return result;
}

/**
 * 将题库数据转为 Markdown 字符串。
 * - 保留行内公式 `$...$`
 * - 块级公式 `$$...$$` 独立成段，方便 Markdown 渲染器识别
 * - 格式兼容 parser.ts 的可解析格式，支持重新导入
 */
export interface ExportExtras {
  /** questionId → AI 解析列表 */
  explanations?: Record<string, { questionId: string; content: string; createdAt?: string }[]>;
  /** questionId → 追问对话列表 */
  followups?: Record<string, { questionId: string; role: string; content: string; createdAt?: string }[]>;
  /** 报告内容 */
  report?: { knowledgePoints?: { tag: string; relatedQuestions: number[] }[]; advice?: string };
}

export function quizToMarkdown(
  quiz: {
    title: string;
    questions: Question[];
    timeLimit?: number;
    createdAt?: string | Date;
  },
  extras?: ExportExtras,
): string {
  const lines: string[] = [];

  // 标题
  lines.push(`# ${quiz.title}`);
  lines.push('');

  // 元信息
  const metaParts: string[] = [];
  if (quiz.createdAt) {
    const d = typeof quiz.createdAt === 'string' ? quiz.createdAt : quiz.createdAt.toISOString();
    metaParts.push(`导出时间: ${d.slice(0, 10)}`);
  }
  metaParts.push(`题目数量: ${quiz.questions.length} 题`);
  if (quiz.timeLimit && quiz.timeLimit > 0) {
    metaParts.push(`答题时长: ${quiz.timeLimit} 分钟`);
  }
  lines.push(`> ${metaParts.join(' | ')}`);
  lines.push('');

  // 按题型分组
  const groups = groupQuestionsByType(quiz.questions);
  let sectionNum = 0;

  // ---- 选择题段（单选 + 多选）----
  const selectionQuestions = [
    ...(groups.single || []),
    ...(groups.multiple || []),
  ];
  if (selectionQuestions.length > 0) {
    sectionNum++;
    lines.push(`## ${toChineseNum(sectionNum)}、选择题`);
    lines.push('');
    for (const { q, originalIndex } of selectionQuestions) {
      lines.push(questionToMarkdown(q, originalIndex));
      lines.push('');
    }
  }

  // ---- 判断题段 ----
  if (groups.boolean && groups.boolean.length > 0) {
    sectionNum++;
    lines.push(`## ${toChineseNum(sectionNum)}、判断题`);
    lines.push('');
    for (const { q, originalIndex } of groups.boolean) {
      lines.push(questionToMarkdown(q, originalIndex));
      lines.push('');
    }
  }

  // ---- 填空题段 ----
  if (groups.fill && groups.fill.length > 0) {
    sectionNum++;
    lines.push(`## ${toChineseNum(sectionNum)}、填空题`);
    lines.push('');
    for (const { q, originalIndex } of groups.fill) {
      lines.push(questionToMarkdown(q, originalIndex));
      lines.push('');
    }
  }

  // ---- 简答题段 ----
  if (groups.essay && groups.essay.length > 0) {
    sectionNum++;
    lines.push(`## ${toChineseNum(sectionNum)}、简答题`);
    lines.push('');
    for (const { q, originalIndex } of groups.essay) {
      lines.push(questionToMarkdown(q, originalIndex));
      lines.push('');
    }
  }

  // ---- 面试题段 ----
  if (groups.interview && groups.interview.length > 0) {
    sectionNum++;
    lines.push(`## ${toChineseNum(sectionNum)}、面试题`);
    lines.push('');
    for (const { q, originalIndex } of groups.interview) {
      lines.push(questionToMarkdown(q, originalIndex));
      lines.push('');
    }
  }

  // ---- 代码题段 ----
  if (groups.code && groups.code.length > 0) {
    sectionNum++;
    lines.push(`## ${toChineseNum(sectionNum)}、代码题`);
    lines.push('');
    for (const { q, originalIndex } of groups.code) {
      lines.push(questionToMarkdown(q, originalIndex));
      lines.push('');
    }
  }

  // ---- 答案段 ----
  sectionNum++;
  lines.push(`## ${toChineseNum(sectionNum)}、答案与解析`);
  lines.push('');

  if (selectionQuestions.length > 0) {
    lines.push('### 选择题答案');
    lines.push('');
    for (const { q, originalIndex } of selectionQuestions) {
      lines.push(answerToMarkdown(q, originalIndex));
    }
    lines.push('');
  }

  if (groups.boolean && groups.boolean.length > 0) {
    lines.push('### 判断题答案');
    lines.push('');
    for (const { q, originalIndex } of groups.boolean) {
      lines.push(answerToMarkdown(q, originalIndex));
    }
    lines.push('');
  }

  if (groups.fill && groups.fill.length > 0) {
    lines.push('### 填空题答案');
    lines.push('');
    for (const { q, originalIndex } of groups.fill) {
      lines.push(answerToMarkdown(q, originalIndex));
    }
    lines.push('');
  }

  if (groups.essay && groups.essay.length > 0) {
    lines.push('### 简答题参考答案');
    lines.push('');
    for (const { q, originalIndex } of groups.essay) {
      lines.push(answerToMarkdown(q, originalIndex));
    }
    lines.push('');
  }

  if (groups.interview && groups.interview.length > 0) {
    lines.push('### 面试题参考答案');
    lines.push('');
    for (const { q, originalIndex } of groups.interview) {
      lines.push(answerToMarkdown(q, originalIndex));
    }
    lines.push('');
  }

  if (groups.code && groups.code.length > 0) {
    lines.push('### 代码题参考');
    lines.push('');
    for (const { q, originalIndex } of groups.code) {
      const ref = getReferenceAnswer(q);
      lines.push(`${originalIndex + 1}. ${ref || '（无参考代码）'}`);
    }
    lines.push('');
  }

  // ---- 附加内容: AI 解析 ----
  if (extras?.explanations) {
    const entries = Object.entries(extras.explanations);
    if (entries.length > 0) {
      sectionNum++;
      lines.push(`## ${toChineseNum(sectionNum)}、AI 解析`);
      lines.push('');
      let hasAny = false;
      for (const { q, originalIndex } of quiz.questions.map((q, i) => ({ q, originalIndex: i }))) {
        const expList = extras.explanations[q.id];
        if (!expList || expList.length === 0) continue;
        hasAny = true;
        const latest = expList[expList.length - 1];
        lines.push(`### ${originalIndex + 1}. ${q.title.slice(0, 80)}`);
        lines.push('');
        lines.push(latest.content);
        lines.push('');
      }
      if (!hasAny) {
        lines.push('（该题库暂无 AI 解析记录）');
        lines.push('');
      }
    }
  }

  // ---- 附加内容: 追问记录 ----
  if (extras?.followups) {
    const entries = Object.entries(extras.followups);
    if (entries.length > 0) {
      sectionNum++;
      lines.push(`## ${toChineseNum(sectionNum)}、追问记录`);
      lines.push('');
      let hasAny = false;
      for (const { q, originalIndex } of quiz.questions.map((q, i) => ({ q, originalIndex: i }))) {
        const conv = extras.followups[q.id];
        if (!conv || conv.length === 0) continue;
        hasAny = true;
        lines.push(`### ${originalIndex + 1}. ${q.title.slice(0, 80)}`);
        lines.push('');
        for (const msg of conv) {
          const who = msg.role === 'user' ? '**学生**' : '**AI**';
          lines.push(`${who}: ${msg.content}`);
          lines.push('');
        }
      }
      if (!hasAny) {
        lines.push('（该题库暂无追问记录）');
        lines.push('');
      }
    }
  }

  // ---- 附加内容: 答题报告 ----
  if (extras?.report) {
    sectionNum++;
    lines.push(`## ${toChineseNum(sectionNum)}、答题报告`);
    lines.push('');
    const rp = extras.report;
    if (rp.knowledgePoints && rp.knowledgePoints.length > 0) {
      lines.push('### 薄弱知识点');
      lines.push('');
      for (const kp of rp.knowledgePoints) {
        lines.push(`- **${kp.tag}** (相关题目: ${kp.relatedQuestions.join(', ')})`);
      }
      lines.push('');
    }
    if (rp.advice) {
      lines.push('### 学习建议');
      lines.push('');
      lines.push(rp.advice);
      lines.push('');
    }
    if (!rp.advice && (!rp.knowledgePoints || rp.knowledgePoints.length === 0)) {
      lines.push('（暂无报告数据，请先生成报告）');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---- helpers ----

interface GroupedQuestion {
  q: Question;
  originalIndex: number;
}

function groupQuestionsByType(questions: Question[]) {
  const groups: Record<string, GroupedQuestion[]> = {};
  questions.forEach((q, i) => {
    const key = q.type;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ q, originalIndex: i });
  });
  return groups;
}

/** 数字 → 中文数字（1-10） */
function toChineseNum(n: number): string {
  const map = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  return map[n - 1] || String(n);
}
