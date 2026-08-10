import { NextResponse } from 'next/server';
import { verifyAdminToken, getTokenFromHeaders } from '@/lib/admin-auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const MAX_SIZE = 256 * 1024; // 256KB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];

export async function POST(request: Request) {
  const token = getTokenFromHeaders(request);
  if (!token) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const payload = verifyAdminToken(token);
  if (!payload) return NextResponse.json({ error: 'Token 无效' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: '仅支持 PNG、JPEG、GIF、SVG、WebP 格式' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '文件大小不能超过 256KB' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filename = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'category-icons');
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);

    const url = `/uploads/category-icons/${filename}`;
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    console.error('上传图标失败:', error);
    return NextResponse.json({ error: '上传失败' }, { status: 500 });
  }
}
