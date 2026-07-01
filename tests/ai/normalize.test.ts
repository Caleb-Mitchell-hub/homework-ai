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

  it('drops unknown question type', () => {
    const out = normalizeAIOutputToQuestions(
      [
        { type: 'single', title: '保留', correctAnswer: 'A', answer: '' },
        { type: 'weird', title: '丢弃', correctAnswer: '', answer: '' },
      ],
      idGen
    );
    expect(out).toHaveLength(1);
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
});