import { describe, it, expect } from 'vitest';
import {
  getActualAnswer,
  getReferenceAnswer,
  isCorrect,
  formatCorrectAnswer,
} from '@/lib/answer-sheet-helpers';
import type { Question } from '@/types';

describe('answer-sheet-helpers', () => {
  describe('getActualAnswer', () => {
    it('多选题从 correctAnswer 取答案,不用 answer 字段(answer 存的是解析)', () => {
      const q: Question = {
        id: 'q1',
        type: 'multiple',
        title: '下列关于线性回归的描述,正确的是?',
        options: ['A', 'B', 'C', 'D'],
        // 关键:answer 字段是解析文字,correctAnswer 才是真正的答案
        answer: 'B错,线性回归是回归算法,用于解决回归问题;D错,输入特征和目标之间可以是非线性关系,通过多项式扩展可以拟合非线性关系。',
        correctAnswer: 'AC',
      } as Question;

      expect(getActualAnswer(q)).toBe('AC');
    });

    it('单选题取 correctAnswer', () => {
      const q = {
        id: 'q1',
        type: 'single',
        title: 't',
        options: ['A', 'B'],
        answer: '解析文字',
        correctAnswer: 'A',
      } as unknown as Question;
      expect(getActualAnswer(q)).toBe('A');
    });

    it('判断题取 correctAnswer', () => {
      const q = {
        id: 'q1',
        type: 'boolean',
        title: 't',
        answer: '解析',
        correctAnswer: 'true',
      } as unknown as Question;
      expect(getActualAnswer(q)).toBe('true');
    });

    it('填空题取 correctAnswer', () => {
      const q = {
        id: 'q1',
        type: 'fill',
        title: 't',
        blanks: 1,
        answer: '解析',
        correctAnswer: 'foo',
      } as unknown as Question;
      expect(getActualAnswer(q)).toBe('foo');
    });

    it('简答题用 referenceAnswer', () => {
      const q = {
        id: 'q1',
        type: 'essay',
        title: 't',
        answer: '',
        referenceAnswer: '见详情',
      } as unknown as Question;
      expect(getActualAnswer(q)).toBe('见详情');
    });

    it('代码题取 code 的首行', () => {
      const q = {
        id: 'q1',
        type: 'code',
        title: 't',
        code: 'def f():\n  return 1',
        language: 'python',
        inputExample: '',
        outputExample: '',
        answer: '',
      } as unknown as Question;
      expect(getActualAnswer(q)).toBe('def f():');
    });
  });

  describe('getReferenceAnswer', () => {
    it('客观题优先用 analysis,没有则回退到 answer', () => {
      const withAnalysis = {
        id: 'q1',
        type: 'multiple',
        title: 't',
        options: ['A', 'B'],
        answer: 'B错...',
        correctAnswer: 'A',
        analysis: '详细解析',
      } as unknown as Question;
      expect(getReferenceAnswer(withAnalysis)).toBe('详细解析');

      const withoutAnalysis = {
        id: 'q1',
        type: 'multiple',
        title: 't',
        options: ['A', 'B'],
        answer: 'B错...',
        correctAnswer: 'A',
      } as unknown as Question;
      expect(getReferenceAnswer(withoutAnalysis)).toBe('B错...');
    });

    it('简答题用 referenceAnswer', () => {
      const q = {
        id: 'q1',
        type: 'essay',
        title: 't',
        answer: '解析',
        referenceAnswer: '标准答案',
      } as unknown as Question;
      expect(getReferenceAnswer(q)).toBe('标准答案');
    });

    it('代码题用 code', () => {
      const q = {
        id: 'q1',
        type: 'code',
        title: 't',
        code: 'print(1)',
        language: 'python',
        inputExample: '',
        outputExample: '',
        answer: '',
      } as unknown as Question;
      expect(getReferenceAnswer(q)).toBe('print(1)');
    });
  });

  describe('isCorrect (修复后的判定应该认 correctAnswer)', () => {
    it('多选题:用户答 AC,正确答案是 AC,应当判定正确', () => {
      const q = {
        id: 'q1',
        type: 'multiple',
        title: 't',
        options: ['A', 'B', 'C', 'D'],
        // 即使 answer 是解析文字,只要 correctAnswer 是 AC,用户答 AC 就应该判对
        answer: 'B错,线性回归是回归算法,用于解决回归问题;D错,输入特征和目标之间可以是非线性关系,通过多项式扩展可以拟合非线性关系。',
        correctAnswer: 'AC',
      } as unknown as Question;

      expect(isCorrect(q, 'AC')).toBe(true);
      expect(isCorrect(q, 'A,C')).toBe(true); // 顺序无关
      expect(isCorrect(q, 'CA')).toBe(true);
      expect(isCorrect(q, 'AD')).toBe(false);
    });

    it('单选题:用户答 A,正确答案是 A,应当判定正确', () => {
      const q = {
        id: 'q1',
        type: 'single',
        title: 't',
        options: ['A', 'B'],
        answer: '解析',
        correctAnswer: 'A',
      } as unknown as Question;
      expect(isCorrect(q, 'A')).toBe(true);
      expect(isCorrect(q, 'B')).toBe(false);
    });

    it('判断题:用户答 true,正确答案是 true,应当判定正确', () => {
      const q = {
        id: 'q1',
        type: 'boolean',
        title: 't',
        answer: '解析',
        correctAnswer: 'true',
      } as unknown as Question;
      expect(isCorrect(q, 'true')).toBe(true);
      expect(isCorrect(q, 'false')).toBe(false);
    });

    it('填空题:答案用 | 分隔多答案,任一匹配即正确', () => {
      const q = {
        id: 'q1',
        type: 'fill',
        title: 't',
        blanks: 1,
        answer: '解析',
        correctAnswer: 'foo|bar',
      } as unknown as Question;
      expect(isCorrect(q, 'foo')).toBe(true);
      expect(isCorrect(q, 'bar')).toBe(true);
      expect(isCorrect(q, 'baz')).toBe(false);
    });

    it('用户未作答返回 false', () => {
      const q = {
        id: 'q1',
        type: 'single',
        title: 't',
        options: ['A', 'B'],
        answer: '',
        correctAnswer: 'A',
      } as unknown as Question;
      expect(isCorrect(q, '')).toBe(false);
    });

    it('没有正确答案(空)时返回 undefined(主观题情形)', () => {
      const q = {
        id: 'q1',
        type: 'single',
        title: 't',
        options: ['A', 'B'],
        answer: '',
        correctAnswer: '',
      } as unknown as Question;
      expect(isCorrect(q, 'A')).toBeUndefined();
    });

    it('简答/代码题返回 undefined(交给老师人工批改)', () => {
      const essay = {
        id: 'q1',
        type: 'essay',
        title: 't',
        answer: '解析',
        referenceAnswer: '见详情',
      } as unknown as Question;
      expect(isCorrect(essay, '随便')).toBeUndefined();
    });
  });

  describe('formatCorrectAnswer (用于题头 "答: ..." 短文本)', () => {
    it('多选题应该显示 AC,不是解析文字', () => {
      const q = {
        id: 'q1',
        type: 'multiple',
        title: 't',
        options: ['A', 'B'],
        answer: 'B错,线性回归是回归算法...',
        correctAnswer: 'AC',
      } as unknown as Question;
      expect(formatCorrectAnswer(q)).toBe('AC');
    });

    it('代码题截取 code 首行', () => {
      const q = {
        id: 'q1',
        type: 'code',
        title: 't',
        code: 'def solve():\n    return 42',
        language: 'python',
        inputExample: '',
        outputExample: '',
        answer: '',
      } as unknown as Question;
      const out = formatCorrectAnswer(q);
      expect(out.startsWith('def solve():')).toBe(true);
    });
  });
});
