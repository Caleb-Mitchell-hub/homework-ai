import { prisma } from './prisma';
import bcrypt from 'bcryptjs';

let initialized = false;

export async function initAdmin(): Promise<void> {
  if (initialized) return;

  try {
    const adminCount = await prisma.admin.count();
    if (adminCount > 0) {
      initialized = true;
      return;
    }

    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        isGuest: false,
      },
    });

    await prisma.admin.create({
      data: {
        userId: user.id,
      },
    });

    initialized = true;
    console.log(`[init-admin] Default admin created: ${username}`);
  } catch (error) {
    console.error('[init-admin] Failed:', error);
  }
}
