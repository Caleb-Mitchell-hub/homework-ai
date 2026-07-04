import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const provider = await prisma.aIProviderConfig.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  return NextResponse.json({ available: !!provider });
}
