/**
 * 混合 session 存储：HMAC 签名 token（抗重启） + 旧格式 Map 兼容（HMR 过渡）。
 *
 * 新 token 格式:
 *   base64url(JSON.stringify({payload, exp, iat})) + "." + base64url(HMAC-SHA256 sig)
 *   → 服务重启后密钥不变则 token 仍有效
 *
 * 旧 token 格式:
 *   crypto.randomBytes(32).toString('base64url')
 *   → 服务重启后 Map 清空 → 失效（仅通过 HMR 保留）
 *
 * 兼容策略:
 *   token 含 "."  → 新格式，走 HMAC 验证
 *   token 不含 "." → 旧格式，走 globalThis Map 查找
 */

import crypto from 'crypto';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

// ── 旧格式 Map（向后兼容）──
const MAP_KEY = '__homework_sessions__';

interface SessionEntry {
  payload: unknown;
  expiresAt: number;
}

type SessionMap = Map<string, SessionEntry>;

function getLegacyMap(): SessionMap {
  const g = globalThis as unknown as Record<string, SessionMap | undefined>;
  if (!g[MAP_KEY]) g[MAP_KEY] = new Map();
  return g[MAP_KEY]!;
}

// ── 吊销列表（新格式 token 用）──
const DENYLIST_KEY = '__homework_session_denylist__';

function getDenylist(): Set<string> {
  const g = globalThis as unknown as Record<string, Set<string> | undefined>;
  if (!g[DENYLIST_KEY]) g[DENYLIST_KEY] = new Set<string>();
  return g[DENYLIST_KEY]!;
}

// ── HMAC 签名 ──
function getSecret(): string {
  return process.env.JWT_SECRET ?? 'homework-ai-fallback-secret';
}

function sign(data: string): string {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

interface SignedPayload {
  payload: unknown;
  exp: number;
  iat: number;
}

// ── 公开 API ──

/** 创建新格式 HMAC 签名 token（始终生成新格式，旧格式不再产生）。 */
export function createSession<T>(payload: T, ttlMs: number = DEFAULT_TTL_MS): string {
  const now = Date.now();
  const envelope: SignedPayload = { payload, exp: now + ttlMs, iat: now };
  const body = Buffer.from(JSON.stringify(envelope), 'utf-8').toString('base64url');
  return `${body}.${sign(body)}`;
}

/** 验证 token。新格式走 HMAC，旧格式走 Map 兼容。 */
export function getSession<T = unknown>(token: string): T | null {
  if (!token) return null;

  const lastDot = token.lastIndexOf('.');

  if (lastDot > 0) {
    // ── 新格式：HMAC 签名验证 ──
    if (getDenylist().has(token)) {
      console.log('[sessionStore] HMAC token in denylist, rejected');
      return null;
    }

    const body = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);

    // 验证签名（timingSafeEqual 防时序攻击）
    const expectedSig = sign(body);
    if (
      sig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
    ) {
      console.log('[sessionStore] HMAC signature mismatch — sigLen=%d expectedLen=%d bodyLen=%d', sig.length, expectedSig.length, body.length);
      return null;
    }

    let envelope: SignedPayload;
    try {
      envelope = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    } catch (e) {
      console.log('[sessionStore] HMAC body JSON parse failed — bodyLen=%d err=%s', body.length, String(e));
      return null;
    }

    if (envelope.exp <= Date.now()) {
      console.log('[sessionStore] HMAC token expired — exp=%d now=%d diff=%dms', envelope.exp, Date.now(), envelope.exp - Date.now());
      return null;
    }
    return envelope.payload as T;
  }

  // ── 旧格式：Map 查找（向后兼容，HMR 保留；重启后 Map 清空自动失效）──
  const map = getLegacyMap();
  const entry = map.get(token);
  if (!entry) {
    console.log('[sessionStore] legacy token not found in Map — Map size=%d tokenLen=%d', map.size, token.length);
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    console.log('[sessionStore] legacy token expired');
    map.delete(token);
    return null;
  }
  return entry.payload as T;
}

/** 吊销 token。新格式加入 denylist，旧格式从 Map 删除。 */
export function destroySession(token: string): boolean {
  if (!token) return false;
  if (token.includes('.')) {
    getDenylist().add(token);
  } else {
    getLegacyMap().delete(token);
  }
  return true;
}

/** 清空所有 session（denylist + 旧 Map 全部清空）。 */
export function purgeAllSessions(): void {
  getDenylist().clear();
  getLegacyMap().clear();
}
