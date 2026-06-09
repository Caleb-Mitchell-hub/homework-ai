/**
 * 进程内 session 存储。
 *
 * 用 globalThis 持有 Map:
 *  - Next.js Turbopack HMR 重新执行模块代码时,globalThis 跨 HMR 保留 → 用户开发中刷新不会掉登录
 *  - dev server (npm run dev) 重启时,整个 Node 进程结束 → globalThis 消失 → 所有旧 token 失效 → 强制重新登录
 *
 * token 是 32 字节随机字符串(URL-safe base64),不可被客户端伪造(签名由服务端 Map 持有性保证)。
 */

import crypto from 'crypto';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

interface SessionEntry {
  payload: unknown;
  expiresAt: number;
}

type SessionMap = Map<string, SessionEntry>;

const GLOBAL_KEY = '__homework_sessions__';

function getMap(): SessionMap {
  const g = globalThis as unknown as Record<string, SessionMap | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map();
  }
  return g[GLOBAL_KEY]!;
}

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function gc(now: number) {
  const map = getMap();
  for (const [k, v] of map) {
    if (v.expiresAt <= now) map.delete(k);
  }
}

export function createSession<T>(payload: T, ttlMs: number = DEFAULT_TTL_MS): string {
  const map = getMap();
  gc(Date.now());
  const token = newToken();
  map.set(token, { payload, expiresAt: Date.now() + ttlMs });
  return token;
}

export function getSession<T = unknown>(token: string): T | null {
  if (!token) return null;
  const map = getMap();
  const entry = map.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(token);
    return null;
  }
  return entry.payload as T;
}

export function destroySession(token: string): boolean {
  return getMap().delete(token);
}

/** 测试 / 紧急用:清空所有 session(下次请求全部 401) */
export function purgeAllSessions(): void {
  getMap().clear();
}
