import { createSession, getSession } from './sessionStore';

export interface AdminJWTPayload {
  adminId: string;
  userId: string;
  username: string;
  type: 'admin';
}

export function generateAdminToken(payload: Omit<AdminJWTPayload, 'type'>): string {
  return createSession({ ...payload, type: 'admin' });
}

export function verifyAdminToken(token: string): AdminJWTPayload | null {
  const payload = getSession<AdminJWTPayload>(token);
  if (!payload) return null;
  if (payload.type !== 'admin') return null;
  return payload;
}

export function getTokenFromHeaders(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}
