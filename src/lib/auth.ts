import { prisma } from './prisma';
import { createSession, getSession, destroySession } from './sessionStore';

export interface JWTPayload {
  userId: string;
  username: string;
  isGuest: boolean;
  professionId: string | null;
}

export function generateToken(payload: JWTPayload): string {
  return createSession(payload);
}

export function verifyToken(token: string): JWTPayload | null {
  return getSession<JWTPayload>(token);
}

export function getTokenFromHeaders(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

/** 从请求头提取客户端真实 IP（支持反向代理） */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '未知';
}

/** 记录用户登录日志 */
export async function recordLoginLog(
  userId: string,
  ip: string,
  userAgent: string | null,
  success: boolean,
): Promise<void> {
  try {
    const { prisma } = await import('./prisma');
    await prisma.loginLog.create({
      data: { userId, ip, userAgent, success },
    });
  } catch {
    // 日志记录失败不影响主流程
  }
}

export async function updateUserActiveTime(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
  } catch (error) {
    // 静默失败，不影响主流程
  }
}
