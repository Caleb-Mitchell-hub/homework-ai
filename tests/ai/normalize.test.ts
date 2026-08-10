import { describe, it, expect } from 'vitest';
import { normalizeAIOutputToQuestions } from '@/lib/ai/normalize';

const idGen = () => 'q' + Math.random().toString(36).slice(2, 8);

describe('normalizeAIOutputToQuestions', () => {
  it('maps single choice with correctAnswer "A"', () => {
    const out = normalizeAIOutputToQuestions(
      [{
        type: 'single',
        title: '哪一项?',
        options: [{ key: 'A', text: '甲' }, { key: 'B', text: '乙' }],
        correctAnswer: 'A',
        answer: '解析',
      }],
      idGen
    );
    expect(out[0].type).toBe('single');
    expect((out[0] as any).options).toEqual(['甲', '乙']);
    expect((out[0] as any).correctAnswer).toBe('A');
    expect(out[0].answer).toBe('解析');
  });

  it('maps multiple choice with correctAnswer ["A","C"]', () => {
    const out = normalizeAIOutputToQuestions(
      [{
        type: 'multiple',
        title: '多选',
        options: [{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }, { key: 'C', text: 'z' }],
        correctAnswer: ['A', 'C'],
        answer: '',
      }],
      idGen
    );
    expect((out[0] as any).correctAnswer).toBe('A,C');
  });

  it('maps boolean with string "true"', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'boolean', title: '判断', correctAnswer: 'true', answer: '' }],
      idGen
    );
    expect((out[0] as any).correctAnswer).toBe('true');
  });

  it('maps boolean with bool true', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'boolean', title: '判断', correctAnswer: true, answer: '' }],
      idGen
    );
    expect((out[0] as any).correctAnswer).toBe('true');
  });

  it('maps fill question with blanks default 1', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'fill', title: '填空', correctAnswer: '答案', answer: '' }],
      idGen
    );
    expect((out[0] as any).blanks).toBe(1);
    expect((out[0] as any).correctAnswer).toBe('答案');
  });

  it('maps code question with all fields', () => {
    const out = normalizeAIOutputToQuestions(
      [{
        type: 'code',
        title: '写函数',
        code: 'def f(): pass',
        language: 'python',
        inputExample: '1 2',
        outputExample: '3',
        answer: '略',
      }],
      idGen
    );
    expect(out[0].type).toBe('code');
    expect((out[0] as any).code).toBe('def f(): pass');
    expect((out[0] as any).language).toBe('python');
    expect((out[0] as any).inputExample).toBe('1 2');
    expect((out[0] as any).outputExample).toBe('3');
  });

  it('infers essay from unknown type that has a title', () => {
    const out = normalizeAIOutputToQuestions(
      [
        { type: 'single', title: '保留', correctAnswer: 'A', answer: '' },
        { type: 'weird', title: '会被推断为 essay', correctAnswer: '', answer: '' },
      ],
      idGen
    );
    // 第二个被推断为 essay（有 title 作为兜底）
    expect(out).toHaveLength(2);
    expect(out[1].type).toBe('essay');
  });

  it('drops truly unparseable item (no type, no title, nothing)', () => {
    const out = normalizeAIOutputToQuestions(
      [
        { type: 'single', title: '保留', correctAnswer: 'A', answer: '' },
        { foo: 'bar' },
      ],
      idGen
    );
    expect(out).toHaveLength(1);
  });

  it('maps Chinese type name 单选题 → single', () => {
    const out = normalizeAIOutputToQuestions(
      [{
        type: '单选题',
        title: '中文类型名测试',
        options: ['A选项', 'B选项', 'C选项', 'D选项'],
        correctAnswer: 'B',
        answer: '解析',
      }],
      idGen
    );
    expect(out[0].type).toBe('single');
    expect((out[0] as any).correctAnswer).toBe('B');
  });

  it('maps Chinese type names for all 6 types', () => {
    const cases: Array<{ inputType: string; expectedType: string }> = [
      { inputType: '单选题', expectedType: 'single' },
      { inputType: '多选题', expectedType: 'multiple' },
      { inputType: '判断题', expectedType: 'boolean' },
      { inputType: '填空题', expectedType: 'fill' },
      { inputType: '简答题', expectedType: 'essay' },
      { inputType: '面试题', expectedType: 'interview' },
    ];
    for (const { inputType, expectedType } of cases) {
      const out = normalizeAIOutputToQuestions(
        [{ type: inputType, title: 't', correctAnswer: 'x', answer: '', options: ['A', 'B'], blanks: 1, referenceAnswer: 'r' }],
        idGen
      );
      expect(out[0].type).toBe(expectedType);
    }
  });

  it('infers single from options + single-letter correctAnswer', () => {
    const out = normalizeAIOutputToQuestions(
      [{ title: '推断测试', options: ['A', 'B', 'C', 'D'], correctAnswer: 'C', answer: '' }],
      idGen
    );
    expect(out[0].type).toBe('single');
  });

  it('infers multiple from options + multi-letter correctAnswer', () => {
    const out = normalizeAIOutputToQuestions(
      [{ title: '多选推断', options: ['X', 'Y', 'Z'], correctAnswer: 'A,C', answer: '' }],
      idGen
    );
    expect(out[0].type).toBe('multiple');
  });

  it('assigns id to each question', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'single', title: 'x', correctAnswer: 'A', answer: '' }],
      idGen
    );
    expect(out[0].id).toBeTruthy();
  });

  it('defaults missing optional fields', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'single', title: 'x', correctAnswer: 'A', answer: '' }],
      idGen
    );
    expect(out[0].score).toBeUndefined();
    expect(out[0].analysis).toBeUndefined();
  });

  it('passes through analysis and score if present', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'single', title: 'x', correctAnswer: 'A', answer: '', analysis: '解析', score: 5 }],
      idGen
    );
    expect(out[0].analysis).toBe('解析');
    expect(out[0].score).toBe(5);
  });

  // ---- AI 生成场景：无 answer 字段时从 correctAnswer / referenceAnswer 回填 ----

  it('populates answer from correctAnswer when AI omits answer field (single)', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'single', title: '题', options: ['A', 'B'], correctAnswer: 'B' }],
      idGen
    );
    expect(out[0].answer).toBe('B');
  });

  it('populates answer from correctAnswer when AI omits answer field (multiple)', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'multiple', title: '题', options: ['A', 'B', 'C'], correctAnswer: ['A', 'C'] }],
      idGen
    );
    expect(out[0].answer).toBe('A,C');
  });

  it('populates answer from correctAnswer when AI omits answer field (boolean)', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'boolean', title: '题', correctAnswer: true }],
      idGen
    );
    expect(out[0].answer).toBe('true');
  });

  it('populates answer from referenceAnswer when AI omits answer field (essay)', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'essay', title: '题', referenceAnswer: '参考答案内容' }],
      idGen
    );
    expect(out[0].answer).toBe('参考答案内容');
  });

  it('does not overwrite explicit answer field when provided', () => {
    const out = normalizeAIOutputToQuestions(
      [{ type: 'single', title: '题', options: ['A'], correctAnswer: 'A', answer: '手动填的答案' }],
      idGen
    );
    expect(out[0].answer).toBe('手动填的答案');
  });
});