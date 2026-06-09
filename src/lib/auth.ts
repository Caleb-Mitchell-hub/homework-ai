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
