import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromHeaders } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const ledger = await prisma.creditLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  console.log('[credits/history] FIX-APPLIED: returning', ledger.length, 'records');
  return NextResponse.json({ history: ledger, _fixVersion: 2 });
}