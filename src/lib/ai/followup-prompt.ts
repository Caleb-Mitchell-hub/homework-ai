/**
 * 追问 System Prompt。
 * 根据提供的题目上下文构建给 AI 的系统提示词。
 */
export function buildFollowUpPrompt(opts: {
  questionContent: string;
  questionType: string;
  answer?: string;
  aiExplanation?: string;
}): string {
  const parts: string[] = [
    '你是一位耐心的辅导老师。学生正在做一道题目，对某些内容不理解，需要你帮助解答。',
    '',
    '以下是题目的完整信息：',
    `- 题目类型：${opts.questionType}`,
    `- 题目内容：${opts.questionContent}`,
  ];

  if (opts.answer && opts.answer.trim()) {
    parts.push(`- 正确答案/参考答案：${opts.answer}`);
  }

  if (opts.aiExplanation && opts.aiExplanation.trim()) {
    parts.push(`- AI 解析（已有）：${opts.aiExplanation}`);
  }

  parts.push(
    '',
    '请基于以上信息，用简洁清晰的中文回答学生的追问。使用 markdown 格式。',
    '如果学生的追问与题目无关，请引导他们回到题目相关的讨论。',
  );

  return parts.join('\n');
}
