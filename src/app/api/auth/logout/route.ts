import { NextResponse } from 'next/server';
import { getTokenFromHeaders } from '@/lib/auth';
import { destroySession } from '@/lib/sessionStore';

export async function POST(request: Request) {
  const token = getTokenFromHeaders(request);
  if (token) destroySession(token);
  return NextResponse.json({ success: true });
}
