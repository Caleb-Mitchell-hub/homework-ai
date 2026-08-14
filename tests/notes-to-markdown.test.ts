// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { notesToMarkdown } from '@/lib/notes-to-markdown';

const note = {
  id: 'n1', userId: 'u1', type: 'answer', questionId: null, quizId: null, resultId: null,
  title: '我的笔记', content: '这是内容', source: 'manual', createdAt: 0, updatedAt: 0,
};

describe('notesToMarkdown', () => {
  it('包含标题与内容', () => {
    const md = notesToMarkdown([note as any]);
    expect(md).toContain('## 我的笔记');
    expect(md).toContain('这是内容');
  });

  it('多篇笔记之间用分隔线隔开', () => {
    const md = notesToMarkdown([note as any, { ...note, id: 'n2', title: '第二篇' } as any]);
    expect(md).toContain('---');
    expect(md).toContain('## 第二篇');
  });
});
