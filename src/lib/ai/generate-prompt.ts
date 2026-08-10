export const ALLOWED_GENERATE_TYPES = [
  'single',
  'multiple',
  'boolean',
  'fill',
  'essay',
  'interview',
] as const;

const TYPE_LABELS: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  boolean: '判断题',
  fill: '填空题',
  essay: '简答题',
  interview: '面试题',
};

export function buildGenerateSystemPrompt(): string {
  return `你是一位专业的题库出题专家。根据用户提供的主题或内容，严格按照指定的题型和数量生成高质量题目。

出题规则：
- 单选题：必须包含 4 个选项，标注 correctAnswer（单个字母 A/B/C/D）
- 多选题：必须包含 4 个选项，correctAnswer 为多个字母如 "AC"
- 判断题：correctAnswer 为 "true" 或 "false"
- 填空题：blanks 为空格数，correctAnswer 为正确答案
- 简答题：需给出 referenceAnswer（参考答案要点）
- 面试题：需给出 referenceAnswer（参考答案要点），可选 subQuestions

质量要求：
- 难度分布：简单 30%、中等 50%、困难 20%
- 题目之间不能重复或相互暗示答案
- 题目表述清晰准确，无歧义
- 答案必须正确无误

请严格按以下 JSON 格式输出，不要包含任何其他文字：
{
  "questions": [
    {
      "type": "single",
      "title": "题目标题",
      "difficulty": "简单",
      "options": ["选项A","选项B","选项C","选项D"],
      "correctAnswer": "A"
    }
  ]
}`;
}

export function buildGenerateUserPrompt(
  topic: string,
  counts: Record<string, number>,
): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const lines: string[] = [];
  for (const type of ALLOWED_GENERATE_TYPES) {
    const count = counts[type] || 0;
    if (count > 0) {
      lines.push(`- ${TYPE_LABELS[type]}：${count} 题`);
    }
  }
  const zeroTypeLines = ALLOWED_GENERATE_TYPES.filter((t) => !counts[t])
    .map((t) => TYPE_LABELS[t])
    .join('、');

  return `【主题/内容】
${topic}

【题目要求】
请生成以下题型和数量（共计 ${total} 题）：
${lines.join('\n')}

${zeroTypeLines ? `以下题型不要生成：${zeroTypeLines}` : ''}
题目内容请围绕上述主题展开，确保覆盖核心知识点，难度递进合理。`;
}
