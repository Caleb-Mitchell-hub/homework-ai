/**
 * (user, quiz) 结果去重 —— 一个用户对同一份题库只保留一条记录。
 *
 * 选择策略:
 *  - 优先保留 draft(用户的"在做的草稿"),即使后来又有新的 submitted
 *  - 没有 draft 时,保留 submittedAt 最新的那条
 *  - 其他全部 drop(调用方应负责 delete)
 *
 * 这是修复"同一份题库出现 N 条记录"的核心逻辑:
 *  旧版 API 只看 status='draft',一旦草稿升级为 submitted,
 *  下一次提交就会又新插一行。新版按"一题一记录"约束,顺手清掉历史脏数据。
 */

export interface DedupInput {
  id: string;
  /** Prisma schema 里是 enum,但我们用 string 兼容(避免 TS 跨文件 narrow) */
  status: string;
  submittedAt: Date | string;
}

export interface DedupDecision<T extends DedupInput> {
  keep: T;
  drop: T[];
}

export function pickRecordToUpdate<T extends DedupInput>(
  records: T[]
): DedupDecision<T> | null {
  if (records.length === 0) return null;

  // 排序:draft 在前;同状态下 submittedAt 降序
  const sorted = [...records].sort((a, b) => {
    const aIsDraft = a.status === 'draft';
    const bIsDraft = b.status === 'draft';
    if (aIsDraft && !bIsDraft) return -1;
    if (!aIsDraft && bIsDraft) return 1;
    const at = new Date(a.submittedAt).getTime();
    const bt = new Date(b.submittedAt).getTime();
    return bt - at;
  });

  return {
    keep: sorted[0],
    drop: sorted.slice(1),
  };
}

// ============ 新版:草稿 upsert + 提交 insert 分离 ============

export interface DraftUpsertInput {
  userId: string;
  quizId: string;
  name: string;
  score: number;
  totalScore: number;
  /** JSON 序列化的 results 数组 */
  results: string;
}

/**
 * 草稿(draft)同 (userId, quizId) 只保留 1 份。
 * 返回结构化操作指示:调用方根据 operation 字段决定走 prisma.update 还是 prisma.create。
 * 调用方负责事务。
 */
export function buildDraftUpsertData(
  input: DraftUpsertInput,
  existingId: string | null
): { operation: 'update'; where: { id: string }; data: any }
     | { operation: 'create'; data: any } {
  if (existingId) {
    return {
      operation: 'update',
      where: { id: existingId },
      data: {
        name: input.name,
        score: input.score,
        totalScore: input.totalScore,
        results: input.results,
      },
    };
  }
  return {
    operation: 'create',
    data: {
      userId: input.userId,
      quizId: input.quizId,
      name: input.name,
      score: input.score,
      totalScore: input.totalScore,
      results: input.results,
      status: 'draft',
    },
  };
}

