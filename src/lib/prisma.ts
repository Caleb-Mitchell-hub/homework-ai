import { PrismaClient } from '@prisma/client';
import './env'; // 启动校验 AI_KEY_ENCRYPTION_SECRET

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: ['error'],
});

// 远端 MySQL 在长 idle 后偶发 RST,通过应用层 retry 兜底
const RETRYABLE = new Set(['P1001', 'P1002', 'P1017', 'P2024']);
const MAX_RETRIES = 2;

prisma.$use(async (params, next) => {
  let lastErr: unknown;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await next(params);
    } catch (err: any) {
      lastErr = err;
      const code = err?.code;
      if (!RETRYABLE.has(code) || i === MAX_RETRIES) throw err;
      // 退避 50/150ms
      await new Promise((r) => setTimeout(r, 50 * Math.pow(3, i)));
    }
  }
  throw lastErr;
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;