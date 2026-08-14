import type { Question, Note, ResultItem } from '@/types';
import { getReferenceAnswer } from '@/lib/answer-sheet-helpers';

export type ExportSections = {
  question: boolean;
  userAnswer: boolean;
  correctAnswer: boolean;
  aiScore: boolean;
  aiExplain: boolean;
  notes: boolean;
  followups: boolean;
  report: boolean;
};

export const ALL_SECTIONS: ExportSections = {
  question: true, userAnswer: true, correctAnswer: true, aiScore: true,
  aiExplain: true, notes: true, followups: true, report: true,
};

/** 格式化正确答案：客观题输出"字母. 选项文本"，主观题输出参考答案/解析 */
function formatCorrectAnswer(q: Question): string {
  const options = (q as any).options as string[] | undefined;
  if (options?.length) {
    const letters = String((q as any).correctAnswer ?? '')
      .split(/[,，]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const parts = letters.map((L) => {
      const idx = L.charCodeAt(0) - 65;
      const text = options[idx];
      return text != null ? `${L}. ${text}` : L;
    });
    return parts.join('；') || '（无）';
  }
  return getReferenceAnswer(q) || '（无）';
}

type ExplanationRec = { content: string; createdAt: string };
type FollowupRec = { role: string; content: string; createdAt: string };

export function resultToMarkdown(opts: {
  result: { name: string; score: number; totalScore: number; submittedAt: string; items: ResultItem[] };
  quiz: { title: string; questions: Question[] };
  explanations: Record<string, ExplanationRec[]>;
  followups: Record<string, FollowupRec[]>;
  notes: Note[];
  report: { knowledgePoints?: { tag: string; relatedQuestions: number[] }[]; advice?: string } | null;
  sections: ExportSections;
}): string {
  const { result, quiz, explanations, followups, notes, report, sections } = opts;
  const lines: string[] = [];

  lines.push(`# ${result.name}`);
  lines.push('');
  const meta = [`得分 ${result.score}/${result.totalScore}`];
  if (result.submittedAt) meta.push(`提交时间 ${result.submittedAt.slice(0, 19).replace('T', ' ')}`);
  lines.push(`> ${meta.join(' | ')}`);
  lines.push('');

  quiz.questions.forEach((q, i) => {
    const item = result.items.find((it) => it.questionId === q.id);
    lines.push(`## ${i + 1}. ${q.title}`);
    lines.push('');

    if (sections.question && (q as any).options?.length) {
      lines.push('### 选项');
      lines.push('');
      (q as any).options.forEach((opt: string, idx: number) => {
        lines.push(`${String.fromCharCode(65 + idx)}. ${opt}`);
      });
      lines.push('');
    }

    if (sections.userAnswer) {
      lines.push('### 你的答案');
      lines.push('');
      lines.push(item?.userAnswer || '（未作答）');
      lines.push('');
    }

    if (sections.correctAnswer) {
      lines.push('### 正确答案');
      lines.push('');
      lines.push(formatCorrectAnswer(q));
      lines.push('');
    }

    if (sections.aiScore && typeof item?.interviewScore === 'number') {
      lines.push('### AI 评分');
      lines.push('');
      lines.push(`**${item.interviewScore}/100**`);
      const fb = item.interviewFeedback;
      if (fb?.strengths?.length) lines.push(`- 亮点：${fb.strengths.join('；')}`);
      if (fb?.weaknesses?.length) lines.push(`- 不足：${fb.weaknesses.join('；')}`);
      if (fb?.suggestion) lines.push(`- 建议：${fb.suggestion}`);
      lines.push('');
    }

    if (sections.aiExplain && explanations[q.id]?.length) {
      lines.push('### AI 解析');
      lines.push('');
      lines.push(explanations[q.id][explanations[q.id].length - 1].content);
      lines.push('');
    }

    if (sections.notes && notes.length) {
      const qNotes = notes.filter((n) => n.questionId === q.id);
      if (qNotes.length) {
        lines.push('### 笔记');
        lines.push('');
        qNotes.forEach((n) => lines.push(`- **${n.title}**：${n.content}`));
        lines.push('');
      }
    }

    if (sections.followups && followups[q.id]?.length) {
      lines.push('### 追问');
      lines.push('');
      followups[q.id].forEach((m) => lines.push(`${m.role === 'user' ? '**学生**' : '**AI**'}：${m.content}`));
      lines.push('');
    }
  });

  if (sections.report && report) {
    lines.push('## 答题报告');
    lines.push('');
    if (report.knowledgePoints?.length) {
      report.knowledgePoints.forEach((kp) => lines.push(`- **${kp.tag}**（相关题目 ${kp.relatedQuestions.join(', ')}）`));
      lines.push('');
    }
    if (report.advice) {
      lines.push(report.advice);
      lines.push('');
    }
  }

  return lines.join('\n');
}
