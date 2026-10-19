import { NextResponse } from 'next/server';
import {
  getReflection,
  upsertReflection,
  getAllReflections,
  getReflectionStats,
  getBangkokDate,
  getLogicalReflectionDate,
} from '@/lib/reflections_db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const todayStr = getBangkokDate();
    const logicalDate = getLogicalReflectionDate();
    const targetDate = dateParam || logicalDate;

    const reflection = getReflection(targetDate);
    const history = getAllReflections(60);
    const stats = getReflectionStats();

    return NextResponse.json({
      today: reflection,
      history,
      stats,
      todayStr,
      logicalDate,
      selectedDate: targetDate,
    });
  } catch (error) {
    console.error('API reflections GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { date, luck_text, finish_text, next_day_text } = body;

    const logicalDate = getLogicalReflectionDate();
    const targetDate = date || logicalDate;

    const updated = upsertReflection(targetDate, {
      luck_text,
      finish_text,
      next_day_text,
    });

    const stats = getReflectionStats();

    return NextResponse.json({
      success: true,
      reflection: updated,
      stats,
    });
  } catch (error) {
    console.error('API reflections POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
