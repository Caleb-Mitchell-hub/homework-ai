import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { encryptApiKey, last4 } from '@/lib/ai/crypto';

export async function GET(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const list = await prisma.aIProviderConfig.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true, name: true, provider: true, baseURL: true,
      apiKeyLast4: true, model: true, visionModel: true,
      supportsVision: true, isActive: true,
      createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json({ providers: list });
}

export async function POST(req: NextRequest) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.provider || !body?.baseURL || !body?.model || !body?.apiKey) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
  }

  const cipher = encryptApiKey(body.apiKey);
  const last4str = last4(body.apiKey);

  const created = await prisma.$transaction(async (tx) => {
    if (body.isActive) {
      await tx.aIProviderConfig.updateMany({ data: { isActive: false } });
    }
    return tx.aIProviderConfig.create({
      data: {
        name: body.name,
        provider: body.provider,
        baseURL: body.baseURL,
        apiKeyCipher: cipher,
        apiKeyLast4: last4str,
        model: body.model,
        visionModel: body.visionModel ?? null,
        supportsVision: !!body.supportsVision,
        isActive: !!body.isActive,
      },
      select: {
        id: true, name: true, provider: true, baseURL: true,
        apiKeyLast4: true, model: true, visionModel: true,
        supportsVision: true, isActive: true,
        createdAt: true, updatedAt: true,
      },
    });
  });

  return NextResponse.json({ provider: created }, { status: 201 });
}
