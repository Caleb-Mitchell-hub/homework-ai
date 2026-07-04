import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { decryptApiKey } from '@/lib/ai/crypto';
import { callChat } from '@/lib/ai/providers';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getTokenFromHeaders(req);
  if (!verifyAdminToken(token ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const provider = await prisma.aIProviderConfig.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const apiKey = decryptApiKey(provider.apiKeyCipher);
  const start = Date.now();

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 60_000); // 60s
    await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
      signal: ctl.signal,
    });
    clearTimeout(timer);
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - start,
      model: provider.model,
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - start,
      error: msg.slice(0, 200),
    }, { status: 502 });
  }
}
