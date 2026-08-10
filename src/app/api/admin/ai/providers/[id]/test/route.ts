import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { decryptApiKey } from '@/lib/ai/crypto';
import { callChat, callChatStream } from '@/lib/ai/providers';

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

  const results: {
    ping: { ok: boolean; latencyMs: number; error?: string };
    stream: { ok: boolean; latencyMs: number; error?: string };
    jsonMode?: { ok: boolean; latencyMs: number; error?: string };
  } = {
    ping: { ok: false, latencyMs: 0 },
    stream: { ok: false, latencyMs: 0 },
  };

  // 1. 基础连通性测试（非流式 ping）
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30_000);
    const t0 = Date.now();
    await callChat({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
      signal: ctl.signal,
    });
    clearTimeout(timer);
    results.ping = { ok: true, latencyMs: Date.now() - t0 };
  } catch (err: any) {
    results.ping = {
      ok: false,
      latencyMs: Date.now() - start,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }

  // 2. 流式连通性测试
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30_000);
    const t0 = Date.now();
    let gotChunk = false;
    for await (const chunk of callChatStream({
      baseURL: provider.baseURL,
      apiKey,
      model: provider.model,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
      signal: ctl.signal,
    })) {
      if (chunk.delta) gotChunk = true;
      if (chunk.done) break;
    }
    clearTimeout(timer);
    results.stream = { ok: gotChunk, latencyMs: Date.now() - t0 };
  } catch (err: any) {
    results.stream = {
      ok: false,
      latencyMs: Date.now() - start,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }

  // 3. jsonMode + stream 兼容性测试（如果 stream 正常才测）
  if (results.stream.ok) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 30_000);
      const t0 = Date.now();
      let gotChunk = false;
      for await (const chunk of callChatStream({
        baseURL: provider.baseURL,
        apiKey,
        model: provider.model,
        messages: [
          { role: 'system', content: '输出严格 JSON：{"ok":true}' },
          { role: 'user', content: '回复 {"ok":true}' },
        ],
        jsonMode: true,
        maxTokens: 32,
        signal: ctl.signal,
      })) {
        if (chunk.delta) gotChunk = true;
        if (chunk.done) break;
      }
      clearTimeout(timer);
      results.jsonMode = { ok: gotChunk, latencyMs: Date.now() - t0 };
    } catch (err: any) {
      results.jsonMode = {
        ok: false,
        latencyMs: Date.now() - start,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      };
    }
  }

  // 综合判断
  const overallOk = results.ping.ok && results.stream.ok;
  const warnings: string[] = [];
  if (!results.jsonMode || !results.jsonMode.ok) {
    warnings.push('jsonMode+stream 不兼容，AI 生成将回退到无 jsonMode 模式');
  }

  return NextResponse.json({
    ok: overallOk,
    latencyMs: Date.now() - start,
    model: provider.model,
    results,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
