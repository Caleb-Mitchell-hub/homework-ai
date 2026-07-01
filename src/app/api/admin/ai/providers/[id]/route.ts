import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { encryptApiKey, last4 } from '@/lib/ai/crypto';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (typeof body.name === 'string') updateData.name = body.name;
  if (typeof body.baseURL === 'string') updateData.baseURL = body.baseURL;
  if (typeof body.model === 'string') updateData.model = body.model;
  if (typeof body.visionModel === 'string' || body.visionModel === null) {
    updateData.visionModel = body.visionModel;
  }
  if (typeof body.supportsVision === 'boolean') updateData.supportsVision = body.supportsVision;
  if (typeof body.apiKey === 'string' && body.apiKey.length > 0) {
    updateData.apiKeyCipher = encryptApiKey(body.apiKey);
    updateData.apiKeyLast4 = last4(body.apiKey);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (body.isActive === true) {
      await tx.aIProviderConfig.updateMany({ data: { isActive: false } });
      updateData.isActive = true;
    } else if (body.isActive === false) {
      updateData.isActive = false;
    }
    return tx.aIProviderConfig.update({
      where: { id },
      data: updateData,
      select: {
        id: true, name: true, provider: true, baseURL: true,
        apiKeyLast4: true, model: true, visionModel: true,
        supportsVision: true, isActive: true,
        createdAt: true, updatedAt: true,
      },
    });
  });

  return NextResponse.json({ provider: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.aIProviderConfig.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (existing.isActive) {
    return NextResponse.json({ error: '请先切换激活厂商再删除' }, { status: 400 });
  }
  await prisma.aIProviderConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}