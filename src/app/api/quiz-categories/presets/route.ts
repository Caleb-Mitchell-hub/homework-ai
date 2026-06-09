import { NextResponse } from 'next/server';
import { PRESET_CATEGORIES } from '@/lib/quizCategories';

export async function GET() {
  // 匿名接口:不需要登录也能拿到预设列表(用于引导)
  return NextResponse.json({
    presets: PRESET_CATEGORIES.map((c) => ({
      id: `preset:${c.key}`,
      key: c.key,
      text: c.text,
      emoji: c.emoji ?? '',
    })),
  });
}
