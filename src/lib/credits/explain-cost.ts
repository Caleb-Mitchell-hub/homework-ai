export type Difficulty = '简单' | '中等' | '困难';

const COST: Record<Difficulty, number> = {
  '简单': 10,
  '中等': 15,
  '困难': 30,
};

export const EXPLAIN_COST_DEFAULT = 15;

export function getExplainCost(difficulty?: string | null): number {
  if (difficulty && difficulty in COST) {
    return COST[difficulty as Difficulty];
  }
  return EXPLAIN_COST_DEFAULT;
}