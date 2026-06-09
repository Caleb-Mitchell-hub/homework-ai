import { NextResponse } from 'next/server';
import { initAdmin } from '@/lib/init-admin';

let initialized = false;

export async function GET() {
  if (!initialized) {
    await initAdmin();
    initialized = true;
  }
  return NextResponse.json({ ok: true });
}
