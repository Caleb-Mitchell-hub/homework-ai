import { Question, SingleQuestion, MultipleQuestion, BooleanQuestion, FillQuestion, EssayQuestion, CodeQuestion } from '@/types';
import { generateId } from './storage';

interface ParsedAnswer {
  section: string;
  questionNum: number;
  answer: string;
}

/**
 * 去除成对包裹的引号:
 *  - 反引号:`xxx` -> xxx (按词级成对拆,从左到右多次替换)
 *  - 单引号:'xxx' -> xxx (首尾成对的 ASCII 单引号)
 * 只拆成对,单边或不成对不处理,内文原样保留。
 * 例如:`'arr.shape'` -> arr.shape
 *      `'np.array'` -> np.array
 *      `arr.shape'` 不变
 *      下面关于 `arr.shape` 的说法 -> 下面关于 arr.shape 的说法
 */
function stripCodeQuotes(input: string): string {
  if (!input) return input;
  const bt = '`';
  const sq = "'";
  // 反引号:反复处理多对 (例如 `a` `b`)
  let prev: string;
  let s = input;
  do {
    prev = s;
    // 优先拆外层首尾成对(整串被反引号包裹的情况)
    if (s.length >= 2 && s.startsWith(bt) && s.endsWith(bt) && s.length > 2) {
      s = s.slice(1, -1);
      continue;
    }
    // 否则拆首个反引号块 `xxx` -> xxx
    const first = s.indexOf(bt);
    if (first === -1) break;
    const second = s.indexOf(bt, first + 1);
    if (second === -1) break;
    s = s.slice(0, first) + s.slice(first + 1, second) + s.slice(second + 1);
  } while (s !== prev);
  // 单引号:只处理首尾成对
  if (s.length >= 2 && s.startsWith(sq) && s.endsWith(sq)) {
    s = s.slice(1, -1);
  }
  return s;
}

function parseAnswerSection(content: string): ParsedAnswer[] {
  const answers: ParsedAnswer[] = [];
  const lines = content.split('\n');

  let currentSection = '';
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes('单选题答案') || trimmed.includes('选择题答案')) {
      currentSection = 'selection';
      continue;
    } else if (trimmed.includes('填空题答案')) {
      currentSection = 'fill';
      continue;
    } else if (trimmed.includes('简答题')) {
      currentSection = 'essay';
      continue;
    } else if (trimmed.includes('面试题')) {
      currentSection = 'interview';
      continue;
    }

    if (currentSection && /^[\d]+[.、]/.test(trimmed)) {
      // Handle both "1.B" and "1. B" formats
      // 注意: 对于非选择题答案,文本可能以大写字母开头(如 "Cookie"),
      // 此时 ([A-Z]+) 会误捕获首字母。所以仅 selection 区段优先取字母,
      // 其他区段始终拼接 match[2]+match[3] 还原完整答案。
      const match = trimmed.match(/^(\d+)[.、]\s*([A-Z]+)?\s*(.+)?/);
      if (match) {
        const answer =
          currentSection === 'selection'
            ? (match[2] || match[3]?.trim() || '')
            : ((match[2] ?? '') + (match[3] ?? '')).trim();
        answers.push({
          section: currentSection,
          questionNum: parseInt(match[1]),
          answer: answer
        });
      }
    }
  }

  return answers;
}

function parseSelectionQuestions(content: string, answerMap: Map<string, string>): Question[] {
  const questions: Question[] = [];
  const lines = content.split('\n');

  let currentNum = '';
  let currentTitle = '';
  let currentOptions: string[] = [];
  let state: 'idle' | 'title' | 'options' = 'idle';

  for (const line of lines) {
    const trimmed = line.trim();

    // 题目序号: 1. 1、1) 1.题目 等格式
    const numMatch = trimmed.match(/^(?:#{1,6}\s*)?(\d+)[.、)]\s*(.+)/);
    if (numMatch) {
      if (currentTitle && currentOptions.length > 0) {
        const answer = answerMap.get(`selection_${currentNum}`) || '';
        const q: SingleQuestion = {
          id: generateId(),
          type: 'single',
          title: stripCodeQuotes(currentTitle),
          options: currentOptions.slice(0, 4).map(stripCodeQuotes),
          answer: stripCodeQuotes(answer),
          correctAnswer: stripCodeQuotes(answer)
        };
        questions.push(q);
      }
      currentNum = numMatch[1];
      // Extract title - everything before the first "（"
      const fullTitle = numMatch[2];
      const titleEnd = fullTitle.indexOf('（');
      if (titleEnd > 0) {
        currentTitle = fullTitle.substring(0, titleEnd).trim();
      } else {
        currentTitle = fullTitle.trim();
      }
      currentOptions = [];
      state = 'options';
      continue;
    }

    if (state === 'options') {
      const optMatch = trimmed.match(/^[A-D][.、)]\s*(.+)/);
      if (optMatch) {
        currentOptions.push(optMatch[1].trim());
      } else if (trimmed === '' || trimmed.startsWith('答案')) {
        // 空行或答案行，跳过
      } else if (!/^[A-D]/.test(trimmed) && trimmed.length > 0) {
        state = 'idle';
      }
    }
  }

  if (currentTitle && currentOptions.length > 0) {
    const answer = answerMap.get(`selection_${currentNum}`) || '';
    const q: SingleQuestion = {
      id: generateId(),
      type: 'single',
      title: stripCodeQuotes(currentTitle),
      options: currentOptions.slice(0, 4).map(stripCodeQuotes),
      answer: stripCodeQuotes(answer),
      correctAnswer: stripCodeQuotes(answer)
    };
    questions.push(q);
  }

  return questions;
}

function parseFillQuestions(content: string, answerMap: Map<string, string>): Question[] {
  const questions: Question[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 题目序号: 1. 1、1) 等格式
    const match = trimmed.match(/^(?:#{1,6}\s*)?(\d+)[.、)]\s*(.+)/);
    if (match) {
      const num = match[1];
      const title = match[2].replace(/（.+?）/g, '____').trim();
      const answer = answerMap.get(`fill_${num}`) || '';

      if (title.includes('____')) {
        const blankCount = (title.match(/____/g) || []).length;
        const q: FillQuestion = {
          id: generateId(),
          type: 'fill',
          title: stripCodeQuotes(num + '. ' + title),
          blanks: blankCount,
          answer: stripCodeQuotes(answer),
          correctAnswer: stripCodeQuotes(answer)
        };
        questions.push(q);
      }
    }
  }

  return questions;
}

function parseEssayQuestions(content: string, answerMap: Map<string, string>): Question[] {
  const questions: Question[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 题目序号: 1. 1、1) 等格式
    const match = trimmed.match(/^(?:#{1,6}\s*)?(\d+)[.、)]\s*(.+)/);
    if (match) {
      const num = match[1];
      const title = match[2].trim();
      const answer = answerMap.get(`essay_${num}`) || '';

      const q: EssayQuestion = {
        id: generateId(),
        type: 'essay',
        title: stripCodeQuotes(num + '. ' + title),
        answer: stripCodeQuotes(answer),
        referenceAnswer: stripCodeQuotes(answer)
      };
      questions.push(q);
    }
  }

  return questions;
}

/**
 * 面试题解析
 *
 * 支持 markdown 格式:
 *   12. 主问题描述
 *       - 子问题 1
 *       - 子问题 2
 *
 *   面试题答案区 (在答案区段里):
 *   12. 参考答案文字...
 */
function parseInterviewQuestions(content: string, answerMap: Map<string, string>): Question[] {
  const questions: Question[] = [];
  const lines = content.split('\n');

  let currentNum: string | null = null;
  let currentTitle = '';
  let currentSubs: string[] = [];

  const flush = () => {
    if (!currentNum) return;
    const answer = answerMap.get(`interview_${currentNum}`) || '';
    questions.push({
      id: generateId(),
      type: 'interview',
      title: stripCodeQuotes(currentNum + '. ' + currentTitle.trim()),
      answer: stripCodeQuotes(answer),
      referenceAnswer: stripCodeQuotes(answer),
      subQuestions: currentSubs.length > 0 ? currentSubs.map(stripCodeQuotes) : undefined,
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const numMatch = trimmed.match(/^(?:#{1,6}\s*)?(\d+)[.、)]\s*(.+)/);
    if (numMatch) {
      flush();
      currentNum = numMatch[1];
      currentTitle = numMatch[2];
      currentSubs = [];
      continue;
    }

    // 子问题:以 - 或 • 开头 (面试题的子问题标记)
    const subMatch = trimmed.match(/^[-•]\s+(.+)/);
    if (subMatch && currentNum) {
      currentSubs.push(subMatch[1]);
    }
  }
  flush();
  return questions;
}

function parseCodeQuestions(content: string): Question[] {
  const questions: Question[] = [];
  const lines = content.split('\n');

  let currentTitle = '';
  let currentDesc: string[] = [];
  let inCode = false;
  let currentCode = '';
  let currentLang = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // 切题条件:
    //   1) `### N.` 数字开头(题区题千,例如 `### 1. 模拟题 1:xxx`)
    //   2) `### ... 参考答案` 且看起来像代码题:以「模拟题/变体题/综合案例」开头,或含「代码」字样
    //      (避免「### 简答题参考答案」「### 单选题答案」这种多模块标题被误切)
    const isNewQuestion =
      (trimmed.startsWith('### ') && /^\d+[.、\s]/.test(trimmed.replace('### ', ''))) ||
      (trimmed.startsWith('### ') && trimmed.includes('参考答案') && (
        /^(模拟题|变体题|综合案例|代码题|编程题)/.test(trimmed.replace(/^###\s*/, '')) ||
        trimmed.includes('代码') ||
        trimmed.includes('编程')
      ));

    if (isNewQuestion) {
      if (currentTitle) {
        const q: CodeQuestion = {
          id: generateId(),
          type: 'code',
          title: stripCodeQuotes(currentTitle),
          code: currentCode,
          language: currentLang,
          inputExample: '',
          outputExample: '',
          answer: ''
        };
        questions.push(q);
      }
      currentTitle = trimmed.replace('### ', '');
      currentDesc = [];
      currentCode = '';
      currentLang = '';
      inCode = false;
    } else if (trimmed.startsWith('```')) {
      if (inCode) {
        inCode = false;
      } else {
        inCode = true;
        currentLang = trimmed.replace('```', '') || 'python';
      }
    } else if (inCode) {
      currentCode += line + '\n';
    } else if (currentTitle) {
      currentDesc.push(trimmed);
    }
  }

  if (currentTitle) {
    const q: CodeQuestion = {
      id: generateId(),
      type: 'code',
      title: stripCodeQuotes(currentTitle),
      code: currentCode.trim(),
      language: currentLang,
      inputExample: '',
      outputExample: '',
      answer: ''
    };
    questions.push(q);
  }

  return questions;
}

/**
 * 解析「第N题：… / 第N题答案：…」中文编号格式（常见于面试题库）
 * 支持题目和答案交错或分块排列，支持多行题目文本。
 */
function parseChineseNumberedQA(content: string): Question[] {
  const questions: Question[] = [];
  const lines = content.split('\n');

  const questionMap = new Map<number, string>(); // num → question text
  const answerMap = new Map<number, string>();   // num → answer text

  type QState = 'idle' | 'in_question' | 'in_answer';
  let state: QState = 'idle';
  let currentNum = 0;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentNum <= 0 || currentLines.length === 0) return;
    const text = currentLines.join('\n').trim();
    if (!text) return;
    if (state === 'in_question') {
      // 如果同题号已有内容,追加(用换行拼接)
      const existing = questionMap.get(currentNum);
      questionMap.set(currentNum, existing ? existing + '\n' + text : text);
    } else if (state === 'in_answer') {
      const existing = answerMap.get(currentNum);
      answerMap.set(currentNum, existing ? existing + '\n' + text : text);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // 答案行:第N题答案：... (必须在题目行之前检测,因为「答案」是「题」的子串)
    const aMatch = trimmed.match(/^第(\d+)题答案[：:]\s*(.*)/);
    if (aMatch) {
      flush();
      state = 'in_answer';
      currentNum = parseInt(aMatch[1]);
      currentLines = aMatch[2] ? [aMatch[2]] : [];
      continue;
    }

    // 题目行:第N题：...
    const qMatch = trimmed.match(/^第(\d+)题[：:]\s*(.*)/);
    if (qMatch) {
      flush();
      state = 'in_question';
      currentNum = parseInt(qMatch[1]);
      currentLines = qMatch[2] ? [qMatch[2]] : [];
      continue;
    }

    // 其他行:追加到当前题目/答案
    if (state !== 'idle' && trimmed) {
      currentLines.push(trimmed);
    }
  }
  flush();

  // 配对生成题目(面试题类型)
  for (const [num, qText] of questionMap) {
    const answer = answerMap.get(num) || '';
    questions.push({
      id: generateId(),
      type: 'interview' as const,
      title: `${num}. ${qText}`,
      answer: stripCodeQuotes(answer),
      referenceAnswer: stripCodeQuotes(answer),
    });
  }

  return questions;
}

export function parseMarkdown(content: string): Question[] {
  const questions: Question[] = [];

  // ── 找出所有区段(## 或 # 标题行) ──
  // 支持格式:
  //   ## 一、单选题      (中文序号+、)
  //   ## 1、单选题      (阿拉伯数字+、)
  //   ## 1. 单选题      (阿拉伯数字+.)
  //   ## 单选题         (纯关键词,无序号)
  //   # 一、单选题      (一级标题)
  // 数字序号为可选项,仅当标题含题型关键词时才视为区段。
  type Section = { index: number; title: string; body: string };
  const sections: Section[] = [];
  const lines = content.split('\n');
  // 灵活的区段标题: #{1,2} 标题行 + 可选序号前缀 + 关键词
  // (?!\#) 确保 ### 不被误匹配为 #{1,2} 区段标题
  const sectionHeader = /^(?:#{1,2})(?!\#)\s*(?:[一二三四五六七八九十百千零\d]+[、.，,]\s*)?(.+)$/;
  const SECTION_KW = /选择题|单选题|填空题|简答题|面试题|代码题|答案|选择|填空|简答|面试|编程/;
  let current: Section | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const m2 = trimmed.match(sectionHeader);
    if (m2 && SECTION_KW.test(m2[1])) {
      if (current) sections.push(current);
      current = { index: sections.length, title: m2[1].trim(), body: '' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current) sections.push(current);

  // ── 无区段时的回退模式:把整个文档当题型内容解析 ──
  if (sections.length === 0) {
    // 尝试从全文检测题型关键词,创建虚拟区段
    const combined = content;
    if (/选择题|单选题|[A-D][.、)]/.test(combined) && /\d+[.、)]/.test(combined)) {
      questions.push(...parseSelectionQuestions(combined, new Map()));
    }
    if (/填空题|____/.test(combined)) {
      questions.push(...parseFillQuestions(combined, new Map()));
    }
    if (/简答题/.test(combined)) {
      questions.push(...parseEssayQuestions(combined, new Map()));
    }
    if (/面试题/.test(combined)) {
      questions.push(...parseInterviewQuestions(combined, new Map()));
    }
    // 第N题/第N题答案 中文编号格式(常见于面试题库)
    if (questions.length === 0 && /第\d+题/.test(combined)) {
      questions.push(...parseChineseNumberedQA(combined));
    }
    // 如果仍然没有解析出题目,尝试将全文作为默认题型(选择/简答)
    if (questions.length === 0 && /\d+[.、)]/.test(combined)) {
      // 有编号列表 → 先尝试选择题,失败则尝试简答题
      const sel = parseSelectionQuestions(combined, new Map());
      if (sel.length > 0) {
        questions.push(...sel);
      } else {
        questions.push(...parseEssayQuestions(combined, new Map()));
      }
    }
    return questions;
  }

  // ── 答案区:找到第一个标题里含「答案」字样的段 ──
  const answerSection = sections.find((s) => /答案/.test(s.title));
  let answerContent = '';
  if (answerSection) answerContent = answerSection.body;
  // 答案区之后的所有段(可能拆成「## 答案」「## 代码题答案」等)合并
  if (answerSection) {
    const after = sections.slice(answerSection.index + 1);
    for (const s of after) answerContent += '\n' + s.body;
  }

  const answerMap = new Map<string, string>();
  if (answerContent) {
    const parsedAnswers = parseAnswerSection(answerContent);
    for (const pa of parsedAnswers) {
      answerMap.set(`${pa.section}_${pa.questionNum}`, pa.answer);
    }
  }

  // ── 题型段:按「标题关键词」分配 ──
  for (const s of sections) {
    if (/选择题|单选题/.test(s.title)) {
      questions.push(...parseSelectionQuestions(s.body, answerMap));
    } else if (/填空题/.test(s.title)) {
      questions.push(...parseFillQuestions(s.body, answerMap));
    } else if (/简答题/.test(s.title)) {
      questions.push(...parseEssayQuestions(s.body, answerMap));
    } else if (/面试题/.test(s.title)) {
      questions.push(...parseInterviewQuestions(s.body, answerMap));
    }
  }

  // ★ 代码题从答案区里切
  if (answerSection) {
    questions.push(...parseCodeQuestions(answerContent));
  }

  return questions;
}

export function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)/m);
  if (match) return match[1].trim();
  const firstLine = content.split('\n')[0].trim();
  return firstLine.slice(0, 50) || '未命名测验';
}