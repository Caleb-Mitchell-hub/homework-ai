import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    aIProviderConfig: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { GET } from '@/app/api/ai/available/route';

describe('GET /api/ai/available', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns available=true when active provider exists', async () => {
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue({ id: 'p1' });
    const res = await GET();
    const data = await res.json();
    expect(data.available).toBe(true);
  });

  it('returns available=false when no active provider', async () => {
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue(null);
    const res = await GET();
    const data = await res.json();
    expect(data.available).toBe(false);
  });

  it('queries with isActive=true filter', async () => {
    (prisma.aIProviderConfig.findFirst as any).mockResolvedValue(null);
    await GET();
    expect(prisma.aIProviderConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    );
  });
});
