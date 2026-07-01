import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromHeaders, verifyAdminToken } from '@/lib/admin-auth';
import { getSession } from '@/lib/sessionStore';
import { prisma } from '@/lib/prisma';
import { extractText } from '@/lib/extract';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = ['md', 'txt', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'];

function resolveUserId(req: NextRequest): string | null {
  const token = getTokenFromHeaders(req);
  if (!token) return null;
  const admin = verifyAdminToken(token);
  if (admin) return admin.userId;
  const user = getSession<{ userId: string }>(token);
  return user?.userId ?? null;
}

export async function POST(req: NextRequest) {
  const userId = resolveUserId(req);
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少文件' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `文件超过 10MB 限制 (实际 ${(file.size / 1024 / 1024).toFixed(2)}MB)` }, { status: 413 });
  }

  const filename = file.name;
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: `不支持的文件类型: .${ext}` }, { status: 415 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || '';

  // 图片需要 active provider
  let provider;
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    provider = await prisma.aIProviderConfig.findFirst({ where: { isActive: true } });
    if (!provider?.supportsVision) {
      return NextResponse.json({
        error: '当前激活厂商不支持图片识别,请在「AI 配置」中启用视觉模型',
      }, { status: 415 });
    }
  }

  try {
    const text = await extractText({ buffer: buf, mime, filename, provider });
    return NextResponse.json({
      text,
      fileName: filename,
      mime,
      size: file.size,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: `文档解析失败: ${String(err?.message ?? err).slice(0, 200)}`,
    }, { status: 500 });
  }
}
