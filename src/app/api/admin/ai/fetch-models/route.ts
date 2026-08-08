import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/ai/crypto';
import '@/lib/ai/proxy'; // 确保全局 HTTP_PROXY 代理生效

/**
 * 解析 undici fetch 失败的底层错误码
 */
function classifyFetchError(err: any): string {
  // Node 22+ undici: cause.code
  const code: string =
    err?.cause?.code ??
    err?.cause?.syscall ??
    err?.code ??
    '';
  const msg: string = err?.message ?? String(err);
  // 把 code 拼进 message 方便排查
  if (msg.includes('fetch failed') && code) {
    return `fetch failed (${code})`;
  }
  return msg.slice(0, 300);
}

/**
 * POST /api/admin/ai/fetch-models
 *
 * 从厂商拉取可用模型列表。
 *
 * 两步策略:
 *   Step 1: 先对 /chat/completions 发一条最小 ping (max_tokens=1, 10s 超时)
 *           验证 baseURL + apiKey 的连通性。
 *   Step 2: 连通成功后再调 GET {baseURL}/models 拉模型列表。
 *
 * 输入:
 *   新建模式: { baseURL, apiKey }
 *   编辑模式: { providerId, baseURL?, apiKey? }
 *     - 缺失字段自动从 DB 补全
 */
export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromHeaders(req);
    if (!verifyAdminToken(token ?? '')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const providerId: string | undefined = body?.providerId;
    let baseURL = (body?.baseURL ?? '').trim().replace(/\/$/, '');
    let apiKey = (body?.apiKey ?? '').trim();

    // ---- 编辑模式: 从 DB 补全 ----
    if (providerId) {
      const stored = await prisma.aIProviderConfig.findUnique({
        where: { id: providerId },
        select: { baseURL: true, apiKeyCipher: true },
      });
      if (!stored) {
        return NextResponse.json({ error: '厂商不存在' }, { status: 404 });
      }
      if (!baseURL) baseURL = stored.baseURL.replace(/\/$/, '');
      if (!apiKey) {
        try {
          apiKey = decryptApiKey(stored.apiKeyCipher);
        } catch (e) {
          console.error('[fetch-models] decryptApiKey failed:', e);
          return NextResponse.json(
            { error: '密钥解密失败,请重新填写 API Key' },
            { status: 500 },
          );
        }
      }
    }

    if (!baseURL) {
      return NextResponse.json({ error: 'baseURL 必填' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'apiKey 必填' }, { status: 400 });
    }

    // =========================================================
    // Step 1: 连通性检查 — POST /chat/completions (10s 超时)
    // =========================================================
    console.log('[fetch-models] Step 1: ping', `${baseURL}/chat/completions`);
    const pingRes = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'ping',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch((err) => ({ _fetchError: err }));

    // 检查是否 fetch 本身失败
    if (pingRes && '_fetchError' in pingRes) {
      const detail = classifyFetchError(pingRes._fetchError);
      console.error('[fetch-models] ping fetch failed:', detail);
      return NextResponse.json(
        {
          error: `网络不通: ${detail}。请检查 Base URL 是否正确、是否需要配置代理(HTTP_PROXY 环境变量)`,
        },
        { status: 502 },
      );
    }

    // ping 的 HTTP 错误（比如 401 密钥错、404 路径错）
    //  但注意: 有些厂商即使密钥正确也会返回 404（model="ping" 不存在）
    //  所以我们只把 401/403 当作密钥错误
    const typedPingRes = pingRes as Response;
    if (typedPingRes.status === 401 || typedPingRes.status === 403) {
      const txt = await typedPingRes.text().catch(() => '').then((t) => t.slice(0, 300));
      return NextResponse.json(
        { error: `密钥无效 (${typedPingRes.status}): ${txt}` },
        { status: 502 },
      );
    }

    // 其他状态码（包括 200 / 404 / 400 / 500）都视为连通 ——
    //   404 = model "ping" 不存在但路径正确
    //   400 = 参数错误但端点可达
    //   200 = 罕见但表示完全通了
    console.log('[fetch-models] Step 1 ping result:', typedPingRes.status);

    // =========================================================
    // Step 2: 拉取模型列表 — GET /models (15s 超时)
    // =========================================================
    const modelsUrl = `${baseURL}/models`;
    console.log('[fetch-models] Step 2: list models', modelsUrl);

    const modelsRes = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    }).catch((err) => ({ _fetchError: err }));

    if (modelsRes && '_fetchError' in modelsRes) {
      const detail = classifyFetchError(modelsRes._fetchError);
      console.error('[fetch-models] models fetch failed:', detail);
      return NextResponse.json(
        {
          error: `网络连通(chat 端点可达),但 /models 端点连接失败: ${detail}。该厂商可能不支持列出模型 API,请手动输入模型名。`,
        },
        { status: 502 },
      );
    }

    const typedModelsRes = modelsRes as Response;

    if (!typedModelsRes.ok) {
      const errText = await typedModelsRes.text().catch(() => '').then((t) => t.slice(0, 500));
      console.error(`[fetch-models] upstream ${typedModelsRes.status}:`, errText);

      if (typedModelsRes.status === 404 || typedModelsRes.status === 405) {
        return NextResponse.json(
          { error: `该厂商不支持 /models 端点 (${typedModelsRes.status}),请手动输入模型名。` },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: `厂商返回 ${typedModelsRes.status}: ${errText}` },
        { status: 502 },
      );
    }

    const data = await typedModelsRes.json();

    // 标准 OpenAI /v1/models 响应: { object: "list", data: [{ id, ... }] }
    if (!Array.isArray(data?.data)) {
      return NextResponse.json(
        {
          error: `厂商返回了数据但格式不符合 OpenAI /models 规范。响应: ${JSON.stringify(data).slice(0, 200)}`,
        },
        { status: 502 },
      );
    }

    const models: { id: string; owned_by?: string }[] = data.data
      .filter((m: any) => typeof m?.id === 'string' && m.id.trim())
      .map((m: any) => ({ id: m.id as string, owned_by: m.owned_by as string | undefined }));

    if (models.length === 0) {
      return NextResponse.json({ error: '厂商未返回任何模型' }, { status: 502 });
    }

    // 按模型类型做简单分类标签
    const tagged = models.map((m) => {
      let tag: string | undefined;
      const id = m.id.toLowerCase();
      if (id.includes('vision') || id.includes('vl') || id.includes('video') || id.includes('gpt-4o'))
        tag = '视觉';
      if (id.includes('chat') || id.includes('reasoner') || id.includes('thinking'))
        tag = tag ? `${tag}/对话` : '对话';
      if (id.includes('embed')) tag = '嵌入';
      if (id.includes('tts') || id.includes('audio')) tag = '音频';
      return { id: m.id, tag };
    });

    // 排序：视觉优先 → 对话优先 → 字母序
    tagged.sort((a, b) => {
      const score = (t: typeof a) => {
        if (t.tag?.includes('视觉')) return 0;
        if (t.tag?.includes('对话')) return 1;
        return 2;
      };
      const diff = score(a) - score(b);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

    console.log(`[fetch-models] success: ${tagged.length} models`);
    return NextResponse.json({ models: tagged });
  } catch (err) {
    console.error('[fetch-models] unhandled error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `请求失败: ${msg.slice(0, 300)}` }, { status: 502 });
  }
}
