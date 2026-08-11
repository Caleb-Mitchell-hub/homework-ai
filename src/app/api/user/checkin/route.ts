import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromHeaders, updateUserActiveTime } from '@/lib/auth';
import { checkInToday, AlreadyCheckedInError } from '@/lib/credits/checkin';

export async function POST(request: NextRequest) {
  const token = getTokenFromHeaders(request);
  const payload = token ? verifyToken(token) : null;
  const userId = payload?.userId ?? null;
  if (!userId) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  updateUserActiveTime(userId);

  try {
    const result = await checkInToday(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof AlreadyCheckedInError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('[checkin] error:', err);
    return NextResponse.json({ error: '签到失败' }, { status: 500 });
  }
}
