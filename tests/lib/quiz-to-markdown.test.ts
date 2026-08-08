import { describe, it, expect } from 'vitest';
import { quizToMarkdown } from '@/lib/quiz-to-markdown';
import type { Question } from '@/types';

function makeQuiz(overrides?: { title?: string; questions?: Question[]; timeLimit?: number }) {
  return {
    title: overrides?.title ?? '测试题库',
    questions: overrides?.questions ?? [],
    timeLimit: overrides?.timeLimit,
    createdAt: '2026-07-23',
  };
}

describe('quizToMarkdown', () => {
  it('空题库只含标题和元信息', () => {
    const md = quizToMarkdown(makeQuiz({ title: '空题库' }));
    expect(md).toContain('# 空题库');
    expect(md).toContain('题目数量: 0 题');
    expect(md).not.toContain('一、选择题');
  });

  it('单选题含选项和答案', () => {
    const q: Question = {
      id: '1',
      type: 'single',
      title: '以下哪个是正确的？',
      options: ['选项A', '选项B', '选项C', '选项D'],
      answer: 'A',
      correctAnswer: 'A',
      difficulty: '简单',
      score: 5,
    };
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    expect(md).toContain('一、选择题');
    expect(md).toContain('### 1. 以下哪个是正确的？');
    expect(md).toContain('[标签: 单选题] 【简单】 （5 分）');
    expect(md).toContain('A. 选项A');
    expect(md).toContain('B. 选项B');
    expect(md).toContain('C. 选项C');
    expect(md).toContain('D. 选项D');
    expect(md).toContain('答案与解析');
    expect(md).toContain('选择题答案');
  });

  it('多选题', () => {
    const q: Question = {
      id: '2',
      type: 'multiple',
      title: '以下哪些是编程语言？',
      options: ['Python', 'Excel', 'Java', 'Photoshop'],
      answer: 'AC',
      correctAnswer: 'AC',
    };
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    expect(md).toContain('### 1. 以下哪些是编程语言？');
    expect(md).toContain('[标签: 多选题]');
    expect(md).toContain('1. AC');
  });

  it('判断题', () => {
    const q: Question = {
      id: '3',
      type: 'boolean',
      title: '地球是圆的',
      answer: 'true',
      correctAnswer: 'true',
    };
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    expect(md).toContain('### 1. 地球是圆的');
    expect(md).toContain('判断题');
    expect(md).toContain('[标签: 判断题]');
    expect(md).toContain('A. 正确');
    expect(md).toContain('B. 错误');
    expect(md).toContain('判断题答案');
  });

  it('填空题', () => {
    const q: Question = {
      id: '4',
      type: 'fill',
      title: 'Python 中定义函数的关键字是 ____',
      blanks: 1,
      answer: 'def',
      correctAnswer: 'def',
    };
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    expect(md).toContain('### 1. Python 中定义函数的关键字是 ____');
    expect(md).toContain('[标签: 填空题]');
    expect(md).toContain('____');
    expect(md).toContain('填空题答案');
  });

  it('简答题', () => {
    const q: Question = {
      id: '5',
      type: 'essay',
      title: '请简述 RESTful API 的设计原则',
      answer: '使用HTTP方法表示操作',
      referenceAnswer: '使用HTTP方法表示操作，资源用URL标识',
    };
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    expect(md).toContain('### 1. 请简述 RESTful API 的设计原则');
    expect(md).toContain('[标签: 简答题]');
    expect(md).toContain('简答题参考答案');
  });

  it('代码题含围栏', () => {
    const q: Question = {
      id: '6',
      type: 'code',
      title: '实现两数求和函数',
      code: 'def add(a, b):\n    return a + b',
      language: 'python',
      inputExample: '',
      outputExample: '',
      answer: '',
    };
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    expect(md).toContain('### 1. 实现两数求和函数');
    expect(md).toContain('[标签: 代码题]');
    expect(md).toContain('```python');
    expect(md).toContain('def add(a, b):');
    expect(md).toContain('代码题参考');
  });

  it('块级公式 $$...$$ 和行内公式 $...$ 原样保留', () => {
    const q: Question = {
      id: '7',
      type: 'single',
      title: '以下公式正确的是？\n\n$$\nE = mc^2\n$$',
      options: [
        '$$E = mc^2$$',
        '$$E = mc^3$$',
        '$$E = m^2c$$',
        '$$E = mc$$',
      ],
      answer: 'A',
      correctAnswer: 'A',
    };
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    // 块级公式保留
    expect(md).toContain('$$\nE = mc^2\n$$');
    // 行内 $$ 公式原样保留（主流 Markdown 渲染器均支持）
    expect(md).toContain('A. $$E = mc^2$$');
    expect(md).toContain('B. $$E = mc^3$$');
  });

  it('行内公式 $...$ 保持不变', () => {
    const q: Question = {
      id: '8',
      type: 'fill',
      title: '函数 $f(x)$ 的导数为 ____',
      blanks: 1,
      answer: "f'(x)",
      correctAnswer: "f'(x)",
    };
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    expect(md).toContain('$f(x)$');
  });

  it('多题库混合分组', () => {
    const questions: Question[] = [
      { id: 'a', type: 'single', title: '单选', options: ['A', 'B', 'C', 'D'], answer: 'A', correctAnswer: 'A' },
      { id: 'b', type: 'boolean', title: '判断', answer: 'true', correctAnswer: 'true' },
      { id: 'c', type: 'fill', title: '填空', blanks: 1, answer: 'x', correctAnswer: 'x' },
      { id: 'd', type: 'essay', title: '简答', answer: 'x', referenceAnswer: 'x' },
      { id: 'e', type: 'code', title: '代码', code: 'print(1)', language: 'python', inputExample: '', outputExample: '', answer: '' },
    ];
    const md = quizToMarkdown(makeQuiz({ questions }));
    // 各段出现
    expect(md).toContain('一、选择题');
    expect(md).toContain('二、判断题');
    expect(md).toContain('三、填空题');
    expect(md).toContain('四、简答题');
    expect(md).toContain('五、代码题');
    expect(md).toContain('答案与解析');
  });

  it('解析字段显示在答案区', () => {
    const q: Question = {
      id: '9',
      type: 'single',
      title: '题目',
      options: ['对', '错'],
      answer: 'A',
      correctAnswer: 'A',
      analysis: '因为所以',
    } as any;
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    expect(md).toContain('解析: 因为所以');
  });

  it('题头格式：编号后直接跟题干，不是题型标签', () => {
    const q: Question = {
      id: '10',
      type: 'single',
      title: '一元线性回归与多元线性回归的区别在于？',
      options: ['一个自变量 vs 多个', '用法不同', '原理不同', '目的不同'],
      answer: 'A',
      correctAnswer: 'A',
    };
    const md = quizToMarkdown(makeQuiz({ questions: [q] }));
    // 编号后跟题干，不是 [单选题]
    expect(md).toContain('### 1. 一元线性回归与多元线性回归的区别在于？');
    expect(md).not.toMatch(/### 1\. \[单选题\]/); // 不应该是 ### 1. [单选题]
    // 题型标签应在元信息行，不在题头
    expect(md).toMatch(/\[标签: 单选题\]/);
  });
});
