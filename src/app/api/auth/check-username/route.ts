import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * 注册时实时检查用户名是否可用,并给出 2 个系统建议名:
 *   1) 后缀追加数字 (xxx → xxx2 → xxx3 ...)
 *   2) 前缀追加数字 (xxx → 2xxx → 3xxx ...)
 *
 * GET /api/auth/check-username?username=xxx
 *   → { exists: boolean, suggestions: string[] }
 *
 * - 不需要登录态(注册前用)
 * - 长度 3~20 才查询(避免短输入的无效请求)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = (searchParams.get('username') || '').trim();

  if (username.length < 3 || username.length > 20) {
    return NextResponse.json({ exists: false, suggestions: [] });
  }

  const exists = !!(await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  }));

  if (!exists) {
    return NextResponse.json({ exists: false, suggestions: [] });
  }

  // 已存在 → 生成 2 个方向的推荐
  const suggestions: string[] = [];

  // 方向 1: 后缀加数字。截断原名以保持总长度 ≤ 20
  for (let n = 2; n < 1000 && suggestions.length < 1; n++) {
    const suffix = String(n);
    const base = username.slice(0, 20 - suffix.length);
    const candidate = base + suffix;
    if (candidate === username) continue;
    const taken = !!(await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } }));
    if (!taken) suggestions.push(candidate);
  }

  // 方向 2: 前缀加数字
  for (let n = 2; n < 1000 && suggestions.length < 2; n++) {
    const prefix = String(n);
    const candidate = (prefix + username).slice(0, 20);
    if (candidate === username) continue;
    if (suggestions.includes(candidate)) continue; // 极端情况(全数字/截断后撞方向1)
    const taken = !!(await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } }));
    if (!taken) suggestions.push(candidate);
  }

  return NextResponse.json({ exists: true, suggestions });
}
