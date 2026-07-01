import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';

export async function PATCH(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const targetId = body?.providerId;
  if (!targetId) return NextResponse.json({ error: '缺少 providerId' }, { status: 400 });

  const target = await prisma.aIProviderConfig.findUnique({ where: { id: targetId } });
  if (!target) return NextResponse.json({ error: 'provider not found' }, { status: 404 });

  // 事务原子切换
  await prisma.$transaction([
    prisma.aIProviderConfig.updateMany({ data: { isActive: false } }),
    prisma.aIProviderConfig.update({ where: { id: targetId }, data: { isActive: true } }),
  ]);

  return NextResponse.json({ ok: true, activeId: targetId });
}