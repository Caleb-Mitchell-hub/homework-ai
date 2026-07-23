import { describe, it, expect } from 'vitest';
import { pickRecordToUpdate } from '@/lib/results-dedup';

const R = (over: Partial<{ id: string; status: 'draft' | 'submitted'; submittedAt: Date | string }>) => ({
  id: over.id ?? 'r',
  status: over.status ?? 'submitted',
  submittedAt: over.submittedAt ?? new Date('2026-07-23T00:00:00Z'),
});

describe('pickRecordToUpdate', () => {
  it('空列表返回 null (首次创建场景)', () => {
    expect(pickRecordToUpdate([])).toBeNull();
  });

  it('单条记录:既不删也不换', () => {
    const only = R({ id: 'a', status: 'submitted' });
    expect(pickRecordToUpdate([only])).toEqual({ keep: only, drop: [] });
  });

  it('多选一:draft 优先于 submitted(保留草稿语义)', () => {
    const draft = R({ id: 'd', status: 'draft', submittedAt: new Date('2026-07-20') });
    const submitted = R({ id: 's', status: 'submitted', submittedAt: new Date('2026-07-23') });
    // 即使 submitted 更新,也要保留 draft 让用户能继续编辑
    expect(pickRecordToUpdate([submitted, draft])).toEqual({ keep: draft, drop: [submitted] });
  });

  it('没有 draft 时:保留最新 submitted,删除旧的', () => {
    const old = R({ id: 'old', status: 'submitted', submittedAt: new Date('2026-07-21') });
    const latest = R({ id: 'latest', status: 'submitted', submittedAt: new Date('2026-07-23') });
    const middle = R({ id: 'mid', status: 'submitted', submittedAt: new Date('2026-07-22') });
    const result = pickRecordToUpdate([old, latest, middle]);
    expect(result?.keep).toBe(latest);
    expect(result?.drop.map((r) => r.id).sort()).toEqual(['mid', 'old']);
  });

  it('多个 draft 场景(异常数据):保留最新 draft,删除其他', () => {
    const d1 = R({ id: 'd1', status: 'draft', submittedAt: new Date('2026-07-20') });
    const d2 = R({ id: 'd2', status: 'draft', submittedAt: new Date('2026-07-22') });
    expect(pickRecordToUpdate([d1, d2])).toEqual({ keep: d2, drop: [d1] });
  });

  it('★ 关键 bug 场景:5 条 submitted → 只保留最新一条,删掉 4 条', () => {
    const records = [1, 2, 3, 4, 5].map((n) =>
      R({ id: `r${n}`, status: 'submitted', submittedAt: new Date(`2026-07-${20 + n}`) })
    );
    const result = pickRecordToUpdate(records);
    expect(result?.keep.id).toBe('r5');
    expect(result?.drop.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4']);
  });
});
