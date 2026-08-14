/**
 * 主观题类型统一判定 + 总分重算。
 *
 * 背景：客观题（single/multiple/boolean/fill）由 checker 判分写入 results 的 correct 字段，
 * 主观题（interview/essay/code）无客观答案，由 AI 评分写入 interviewScore（0~100）。
 * 但历史上只有 interview/essay 被当作主观题，code 被遗漏，且 AI 评分后从不回写 score 字段，
 * 导致全主观题试卷的报告总分恒为 0。此处统一主观题集合并给出唯一的总分重算入口。
 */

/** 主观题类型：无客观正确答案，需 AI 评分或人工批改 */
export const SUBJECTIVE_TYPES: ReadonlySet<string> = new Set(['interview', 'essay', 'code']);

export function isSubjective(type: string): boolean {
  return SUBJECTIVE_TYPES.has(type);
}

/**
 * 根据 results 数组重算总分。
 *
 * 单题分值优先级：manualScore（0~1，人工批改）> interviewScore（0~100，AI 评分，/100 折算）> correct（0/1，客观题）。
 * 结果四舍五入为整数，匹配 QuizResult.score 的 Int 类型（无需迁移）。
 */
export function recalcTotalScore(items: any[]): number {
  let sum = 0;
  for (const it of items) {
    if (typeof it?.manualScore === 'number') sum += it.manualScore;
    else if (typeof it?.interviewScore === 'number') sum += it.interviewScore / 100;
    else if (it?.correct) sum += 1;
  }
  return Math.round(sum);
}
