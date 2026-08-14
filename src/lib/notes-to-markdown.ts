import type { Note } from '@/types';

const TYPE_LABEL: Record<string, string> = { question: '题目笔记', answer: '答题笔记', ai_output: 'AI输出' };
const SOURCE_LABEL: Record<string, string> = { manual: '手动记录', ai_explain: 'AI解析', reference_answer: '标准答案', ai_report: 'AI报告' };

export function notesToMarkdown(notes: Note[]): string {
  const lines: string[] = [];
  lines.push('# 笔记导出');
  lines.push('');
  notes.forEach((n, i) => {
    if (i > 0) { lines.push(''); lines.push('---'); lines.push(''); }
    lines.push(`## ${n.title}`);
    lines.push('');
    const tags = [TYPE_LABEL[n.type] || n.type, SOURCE_LABEL[n.source] || n.source];
    lines.push(`> ${tags.join(' | ')}`);
    lines.push('');
    lines.push(n.content);
    lines.push('');
  });
  return lines.join('\n');
}
