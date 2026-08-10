import { NextResponse } from 'next/server';
import { PRESET_CATEGORIES, loadPresetCategories } from '@/lib/quizCategories';

export async function GET() {
  await loadPresetCategories();
  return NextResponse.json({
    presets: PRESET_CATEGORIES.map((c) => ({
      id: `preset:${c.key}`,
      key: c.key,
      text: c.text,
      emoji: c.emoji ?? '',
    })),
  });
}
